-- Wrapper catalog: one table of wrappers, one table of which templates
-- offer them, at which price.
--
-- Until now "how a Dearune is sent" was a bare text enum duplicated across
-- five places (`template_pricing.wrapper_type`, `orders.wrapper_type`,
-- `projects.wrapper_type`, `sales_log.wrapper_type` and the hardcoded
-- `WRAPPER_TYPES` list in the frontend/edge functions) with pricing rows
-- carrying both the wrapper identity and its price.
--
-- This migration introduces the catalog as the source of truth:
--
--   wrapper_types            one row per way of sending (digital, open
--                            letter, sealed letter, open card, and any new
--                            wrapper an admin adds) with its localized
--                            copy, photo, base price and cost.
--   template_wrapper_options which wrappers a template offers, plus a
--                            per-template price/cost override. An OPTION
--                            ROW EXISTING (and enabled) is what "offered"
--                            means; a missing row = not offered.
--
-- `template_pricing` is left untouched as the frozen legacy table: the
-- backfill copies every legacy price/cost into an override, so every
-- existing template/wrapper pair keeps selling at exactly the price it
-- sells at today. Resolution order everywhere in the app is:
--
--   option price_override  →  wrapper base_price  →  legacy template_pricing
--
-- Money is NOT written here by hand: the admin UI and the `admin-dearunes`
-- edge function both resolve prices through that one order, so there is a
-- single price calculation, not one per screen.

-- ---------------------------------------------------------------------------
-- 1. Wrapper catalog
-- ---------------------------------------------------------------------------
create table if not exists public.wrapper_types (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]{0,29}$'),
  name text not null,
  name_ar text not null default '',
  description text not null default '',
  description_ar text not null default '',
  -- Storage path inside the private `designer-drafts` bucket (for photos
  -- uploaded through `designer-media`, namespace `wrappers/<key>/…`) or an
  -- absolute URL for anything hosted elsewhere.
  image_url text not null default '',
  active boolean not null default true,
  base_price numeric(10, 2) not null default 0 check (base_price >= 0),
  production_cost numeric(10, 2) not null default 0 check (production_cost >= 0),
  display_order integer not null default 0,
  estimated_production_days integer not null default 7,
  sku text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wrapper_types_active_order_idx
  on public.wrapper_types (active, display_order);

create table if not exists public.template_wrapper_options (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates (id) on delete cascade,
  wrapper_id uuid not null references public.wrapper_types (id) on delete cascade,
  -- A disabled option row still exists so a Dearune already using it can
  -- resolve its historical price; it simply stops being offered to new
  -- books in `WrapperSelectionStage`.
  enabled boolean not null default true,
  price_override numeric(10, 2) check (price_override is null or price_override >= 0),
  cost_override numeric(10, 2) check (cost_override is null or cost_override >= 0),
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, wrapper_id)
);
create index if not exists template_wrapper_options_template_idx
  on public.template_wrapper_options (template_id, display_order);
create index if not exists template_wrapper_options_wrapper_idx
  on public.template_wrapper_options (wrapper_id);

-- ---------------------------------------------------------------------------
-- 2. RLS: admins read + manage from the browser; designers reach the
--    catalog only through Edge Functions (service role bypasses RLS).
-- ---------------------------------------------------------------------------
alter table public.wrapper_types enable row level security;
alter table public.template_wrapper_options enable row level security;

create policy "admins_read_wrapper_types" on public.wrapper_types
  for select to authenticated using (public.is_dearune_admin());
create policy "admins_write_wrapper_types" on public.wrapper_types
  for all to authenticated using (public.is_dearune_admin()) with check (public.is_dearune_admin());

create policy "admins_read_template_wrapper_options" on public.template_wrapper_options
  for select to authenticated using (public.is_dearune_admin());
create policy "admins_write_template_wrapper_options" on public.template_wrapper_options
  for all to authenticated using (public.is_dearune_admin()) with check (public.is_dearune_admin());

create trigger wrapper_types_set_updated_at before update on public.wrapper_types
  for each row execute function public.set_updated_at();
create trigger template_wrapper_options_set_updated_at before update on public.template_wrapper_options
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Backfill: the four legacy enum values become catalog rows, and every
--    legacy pricing row becomes an option row carrying the SAME price and
--    cost as an override, so no price changes by a single piaster.
-- ---------------------------------------------------------------------------
insert into public.wrapper_types
  (key, name, name_ar, description, description_ar, image_url, active,
   base_price, production_cost, display_order, estimated_production_days)
values
  ('digital', 'Digital only', 'رقمي فقط',
   'The letter lives online — opened from its private link.',
   'الرسالة تبقى رقمية، وتفتح من رابطها الخاص.',
   '', true, 9.00, 0.00, 10, 0),
  ('open_letter', 'Open letter', 'رسالة مفتوحة',
   'A printed letter, opened by hand and read by anyone it reaches.',
   'رسالة مطبوعة تُفتح يدويًا ويقرؤها كل من يصل إليه.',
   '', true, 14.00, 3.00, 20, 5),
  ('sealed_letter', 'Sealed letter', 'رسالة مختومة',
   'A printed letter kept sealed and unopened until the right hands.',
   'رسالة مطبوعة تبقى مختومة حتى تصل إلى أصحابها.',
   '', true, 22.00, 5.50, 30, 7),
  ('open_card', 'Open card', 'بطاقة مفتوحة',
   'A keepsake card, printed and open to hold a few lasting words.',
   'بطاقة تذكارية مطبوعة تُفتح لتحمل كلمات تبقى.',
   '', true, 12.00, 2.70, 40, 5)
on conflict (key) do nothing;

insert into public.template_wrapper_options
  (template_id, wrapper_id, enabled, price_override, cost_override, display_order)
select
  tp.template_id,
  w.id,
  true,
  tp.price,
  tp.cost,
  w.display_order
from public.template_pricing tp
join public.wrapper_types w on w.key = tp.wrapper_type
on conflict (template_id, wrapper_id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Future wrappers must be storable on a Dearune: the old check pinned
--    `projects.wrapper_type` to the four legacy keys. Keys are validated
--    against the catalog by the Edge Functions; the column keeps a shape
--    check so a stray value can never land in the ledger.
-- ---------------------------------------------------------------------------
alter table public.projects
  drop constraint if exists projects_wrapper_type_check;
alter table public.projects
  add constraint projects_wrapper_type_check
  check (wrapper_type is null or wrapper_type ~ '^[a-z][a-z0-9_]{0,29}$');
