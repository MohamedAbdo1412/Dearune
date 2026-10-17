-- ============================================================================
-- Operations: the production line for physical Dearunes
-- ============================================================================
--
-- Until now one Dearune = one row and the "made / shipped / arrived" stamps
-- were the entire production vocabulary. That is not enough for a workshop
-- that has to know *which bottle*, print its paper, verify its QR, assemble
-- it, QC it and hand it to Bosta.
--
-- This migration adds ONE new concept: the physical product. A Dearune that
-- is physical gets exactly one row per unit, and that row owns the one and
-- only canonical business identifier of a unit:
--
--     DR70700897645      (literal "DR" + exactly 11 decimal digits)
--
-- Rules the schema itself guarantees:
--   * the id is allocated by a DB sequence (no client ever invents one),
--   * the format is enforced by a CHECK, so no other prefix/length can exist,
--   * uniqueness is enforced by a UNIQUE constraint,
--   * the sequence is monotonic, so two workers cannot collide (and the
--     edge function still retries on 23505 as a second line of defence),
--   * an id is never regenerated and never reused: rows are archived, not
--     deleted.
--
-- Nothing here changes `projects.reference` (the legacy DR-000001 Dearune
-- reference that `sales_log` and the public UI already depend on). Those two
-- identifiers describe two different things and must stay independent.
--
-- Writes are NOT granted to clients. RLS is read-only for admins, exactly
-- like `projects` / `sales_log` / `project_events`: every change goes through
-- the `admin-operations` edge function so the transition rules live in one
-- place, server-side.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The canonical identifier allocator
-- ---------------------------------------------------------------------------
-- 707_000_000_01 is a 11-digit number, so the first unit minted reads
-- DR70700000001 — the same shape the studio already prints on its papers.
create sequence if not exists public.physical_product_ref_seq
  start with 70700000001;

-- ---------------------------------------------------------------------------
-- 2. The manufacturing status vocabulary (ordered)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'physical_product_status' and n.nspname = 'public') then
    create type public.physical_product_status as enum (
      'pending_verification',     --  1 the unit exists; nothing has been checked
      'information_verified',     --  2 the customer/order details are confirmed
      'ready_to_print',           --  3 the QR paper is queued for the printer
      'printing',                 --  4 the paper is on the printer
      'printed',                  --  5 the paper is off the printer
      'qr_verified',              --  6 the printed QR scans to the right letter
      'manufacturing',            --  7 the letter is inside, the bottle is built
      'quality_control',          --  8 QC is looking at the finished unit
      'qc_passed',                --  9 QC signed the unit off
      'ready_for_packaging',      -- 10 ready to be packed for the courier
      'packed',                   -- 11 inside its box
      'ready_for_shipment',       -- 12 addressed and waiting for Bosta
      'shipped',                  -- 13 handed to Bosta
      'delivered',                -- 14 the customer has it
      'on_hold',                  -- stopped, with a reason
      'cancelled'                 -- will never be made; terminal
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. physical_products — one row per physical unit
-- ---------------------------------------------------------------------------
create table if not exists public.physical_products (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects (id) on delete cascade,
  -- 1-based position inside the Dearune. quantity > 1 means N units, each
  -- with its own id, status and paper.
  unit_index       integer not null default 1,
  -- THE canonical identifier. Allocated here, never by a client.
  reference        text not null default ('DR' || lpad(nextval('public.physical_product_ref_seq')::text, 11, '0')),
  status           public.physical_product_status not null default 'pending_verification',
  on_hold_reason   text,
  cancelled_reason text,
  notes            text,
  created_by       uuid references public.admin_users (id) on delete set null,
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint physical_products_reference_uq unique (reference),
  constraint physical_products_project_unit_uq unique (project_id, unit_index),
  constraint physical_products_reference_format_ck
    check (reference ~ '^DR[0-9]{11}$'),
  constraint physical_products_unit_index_ck check (unit_index >= 1)
);

comment on column public.physical_products.reference is
  'Canonical physical-product id: literal DR + exactly 11 digits. Allocated by the database, never reused and never regenerated.';
comment on column public.physical_products.project_id is
  'The Dearune this physical unit belongs to. Deleting the Dearune deletes its units (no orphan IDs).';
comment on column public.physical_products.unit_index is
  '1-based unit number inside the Dearune, so a quantity > 1 becomes N independent Operations records.';

-- ---------------------------------------------------------------------------
-- 4. physical_product_events — the per-unit timeline
-- ---------------------------------------------------------------------------
create table if not exists public.physical_product_events (
  id                  uuid primary key default gen_random_uuid(),
  physical_product_id uuid not null references public.physical_products (id) on delete cascade,
  actor_type          text not null check (actor_type in ('admin', 'designer', 'system', 'customer')),
  actor_id            uuid,
  action              text not null,
  detail              jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. Indexes: the default Operations view is active-only, newest first.
-- ---------------------------------------------------------------------------
create index if not exists physical_products_project_idx
  on public.physical_products (project_id, unit_index);
create index if not exists physical_products_created_idx
  on public.physical_products (created_at desc);
create index if not exists physical_products_status_idx
  on public.physical_products (status);
create index if not exists physical_products_updated_idx
  on public.physical_products (updated_at desc);
create index if not exists physical_products_active_idx
  on public.physical_products (archived_at, created_at desc);
create index if not exists physical_product_events_product_idx
  on public.physical_product_events (physical_product_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 6. updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists physical_products_set_updated_at on public.physical_products;
create trigger physical_products_set_updated_at before update on public.physical_products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 7. Backend-only enforcement of the status graph
-- ---------------------------------------------------------------------------
-- The frontend may ask for any status; the database decides whether it is a
-- legal move. `on_hold` and `cancelled` can be entered from anywhere (that is
-- the whole point of an escape hatch), `on_hold` can be resumed, and
-- `delivered` / `cancelled` are terminal. Archived rows are frozen.
create or replace function public.physical_products_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed text[];
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if old.archived_at is not null then
      raise exception 'operations.archived_frozen: this unit is archived, bring it back before changing its status';
    end if;

    v_allowed := case old.status::text
      when 'pending_verification' then array['information_verified', 'on_hold', 'cancelled']
      when 'information_verified' then array['ready_to_print', 'on_hold', 'cancelled']
      when 'ready_to_print'       then array['printing', 'on_hold', 'cancelled']
      when 'printing'             then array['printed', 'on_hold', 'cancelled']
      when 'printed'              then array['qr_verified', 'on_hold', 'cancelled']
      when 'qr_verified'          then array['manufacturing', 'on_hold', 'cancelled']
      when 'manufacturing'        then array['quality_control', 'on_hold', 'cancelled']
      when 'quality_control'      then array['qc_passed', 'on_hold', 'cancelled']
      when 'qc_passed'            then array['ready_for_packaging', 'on_hold', 'cancelled']
      when 'ready_for_packaging'  then array['packed', 'on_hold', 'cancelled']
      when 'packed'               then array['ready_for_shipment', 'on_hold', 'cancelled']
      when 'ready_for_shipment'   then array['shipped', 'on_hold', 'cancelled']
      when 'shipped'              then array['delivered', 'on_hold', 'cancelled']
      when 'on_hold'              then array['pending_verification', 'information_verified', 'ready_to_print',
                                             'printing', 'printed', 'qr_verified', 'manufacturing',
                                             'quality_control', 'qc_passed', 'ready_for_packaging',
                                             'packed', 'ready_for_shipment', 'shipped', 'delivered', 'cancelled']
      when 'delivered'            then array[]::text[]
      when 'cancelled'            then array[]::text[]
      else array[]::text[]
    end;

    if not (new.status::text = any (v_allowed)) then
      raise exception 'operations.status.transition_denied: cannot move % -> %',
        old.status::text, new.status::text;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists physical_products_guard on public.physical_products;
create trigger physical_products_guard before update on public.physical_products
  for each row execute function public.physical_products_guard();

-- ---------------------------------------------------------------------------
-- 8. Creating units: one function, idempotent, used by the sale path and by
--    Operations itself. It can only ever ADD units — an existing unit keeps
--    its id, its status and its history forever.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_physical_products(
  p_project_id uuid,
  p_units integer default 1,
  p_actor uuid default null,
  p_status public.physical_product_status default null
)
returns setof public.physical_products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wrapper  text;
  v_existing integer := 0;
  v_target   integer;
  i          integer;
begin
  select wrapper_type into v_wrapper from public.projects where id = p_project_id;
  if not found then
    return;
  end if;

  -- A digital Dearune has nothing physical to manufacture.
  if v_wrapper is null or v_wrapper = 'digital' then
    return;
  end if;

  select count(*) into v_existing
  from public.physical_products where project_id = p_project_id;

  -- Never shrink: units are archived, never deleted.
  v_target := greatest(coalesce(p_units, 1), v_existing);

  for i in (v_existing + 1) .. v_target loop
    insert into public.physical_products (project_id, unit_index, created_by, status)
    values (p_project_id, i, p_actor, coalesce(p_status, 'pending_verification'))
    on conflict (project_id, unit_index) do nothing;
  end loop;

  return query
    select * from public.physical_products where project_id = p_project_id order by unit_index;
end;
$$;

-- Only the backend may create units: no client can mint a canonical id.
revoke execute on function public.ensure_physical_products(uuid, integer, uuid, public.physical_product_status)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. Backfill: every already-sold physical Dearune gets its unit row.
--    Forward-only, idempotent (a re-run finds nothing to add) and safe on
--    concurrent deploys: the unique (project_id, unit_index) index decides who
--    wins, and the sequence still hands every winner a unique id.
-- ---------------------------------------------------------------------------
do $$
declare
  r       record;
  v_status public.physical_product_status;
begin
  for r in
    select p.id, p.wrapper_type, p.manufactured_at, p.shipped_at, p.arrived_at
    from public.projects p
    where p.paid_at is not null
      and (p.wrapper_type is null or p.wrapper_type <> 'digital')
    order by p.created_at
  loop
    v_status := case
      when r.arrived_at     is not null then 'delivered'::public.physical_product_status
      when r.shipped_at     is not null then 'shipped'::public.physical_product_status
      when r.manufactured_at is not null then 'manufacturing'::public.physical_product_status
      else 'pending_verification'::public.physical_product_status
    end;

    -- One unit. A Dearune never carried a quantity in the data model, so the
    -- backfill records exactly what was sold; the studio can add more units
    -- from Operations if it ever built more.
    perform public.ensure_physical_products(r.id, 1, null, v_status);

    insert into public.physical_product_events (physical_product_id, actor_type, action, detail)
    select id, 'system', 'operations.backfilled', jsonb_build_object('from_project_status', v_status::text)
    from public.physical_products
    where project_id = r.id
      and not exists (
        select 1 from public.physical_product_events e
        where e.physical_product_id = physical_products.id and e.action = 'operations.backfilled'
      );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 10. A Dearune's own public token — the destination the printed QR opens
-- ---------------------------------------------------------------------------
-- The QR on a paper must open THAT customer's letter, so every Dearune needs
-- a second, unguessable token that the public reader can verify. `public_id`
-- stays the readable handle; `public_token` is the capability that proves the
-- scanner may read it.
alter table public.projects
  add column if not exists public_token text;

update public.projects
  set public_token = encode(gen_random_bytes(16), 'hex')
  where public_token is null or public_token = '';

alter table public.projects
  alter column public_token set default encode(gen_random_bytes(16), 'hex');

create unique index if not exists projects_public_token_key
  on public.projects (public_token);

-- ---------------------------------------------------------------------------
-- 11. The public reader for Dearunes
-- ---------------------------------------------------------------------------
-- Additive: nothing in the legacy orders/messages path changes. This returns
-- the letter ONLY when it is switched on, the caller presents the unit's own
-- token, and the letter is not password-protected — it never leaks the body,
-- the greeting, the signature or the media otherwise.
--
-- The shape is deliberately the SAME one `get_public_message` returns, so the
-- existing `/message/:publicId` reader renders a designer Dearune and a legacy
-- order message with one component and no second template.
create or replace function public.get_public_project_message(
  p_public_id text,
  p_token text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p       public.projects%rowtype;
  payload jsonb;
  available boolean;
  result  jsonb;
begin
  select * into p from public.projects where public_id = p_public_id;
  if not found then
    return jsonb_build_object('found', false);
  end if;

  payload := coalesce(p.payload, '{}'::jsonb);
  -- NOTE: a password-protected letter is deliberately NOT published here.
  -- (There is no password prompt in the public reader yet, so publishing it
  -- would silently strip the protection the designer asked for.)
  available := coalesce(p.message_active, false)
    and coalesce((payload->>'passwordSet')::boolean, false) = false
    and p.public_token is not null
    and p.public_token <> ''
    and p.public_token = coalesce(nullif(p_token, ''), '');

  result := jsonb_build_object(
    'found', true,
    'available', available,
    'public_id', p.public_id,
    'source', 'project',
    'language', coalesce(payload->>'language', 'en')
  );

  if not available then
    return result;
  end if;

  result := result || jsonb_build_object(
    'headline', coalesce(payload->>'greeting', ''),
    'body', coalesce(payload->>'body', ''),
    'signature', coalesce(payload->>'senderName', ''),
    'font_family', '',
    'layout', '',
    -- The legacy reader prints a recipient line; a project keeps the
    -- recipient in its own title, so it is handed over the same way.
    'order', jsonb_build_object(
      'recipient_name', coalesce(p.title, ''),
      'occasion', '',
      'event_date', null,
      'wrapper_type', p.wrapper_type,
      'template_name', coalesce((select t.name from public.templates t where t.slug = p.template_slug), '')
    ),
    -- `path` is a private-bucket object path: the reader turns it into a URL
    -- through `project-media`, which re-checks this same token, so the raw
    -- path alone can never be used to fetch anything.
    'media', (
      select coalesce(jsonb_agg(item), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'id', ph->>'path',
          'media_type', case when coalesce(ph->>'mimeType', '') like 'image/%' then 'image' else 'file' end,
          'original_filename', coalesce(ph->>'originalName', ''),
          'path', ph->>'path'
        ) as item
        from jsonb_array_elements(coalesce(payload->'photos', '[]'::jsonb)) ph
        where ph->>'path' is not null
        union all
        select jsonb_build_object(
          'id', payload->'audio'->>'path',
          'media_type', 'audio',
          'original_filename', coalesce(payload->'audio'->>'originalName', ''),
          'path', payload->'audio'->>'path'
        )
        where payload->'audio'->>'path' is not null
      ) rows
    )
  );

  return result;
end;
$$;

revoke execute on function public.get_public_project_message(text, text) from public, anon;
grant  execute on function public.get_public_project_message(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 12. RLS: admins read, nobody else touches, no client writes
-- ---------------------------------------------------------------------------
alter table public.physical_products enable row level security;
alter table public.physical_product_events enable row level security;

revoke insert, update, delete, truncate on public.physical_products from anon, authenticated;
revoke insert, update, delete, truncate on public.physical_product_events from anon, authenticated;

grant select on public.physical_products to authenticated;
grant select on public.physical_product_events to authenticated;

drop policy if exists admins_read_physical_products on public.physical_products;
create policy "admins_read_physical_products" on public.physical_products
  for select to authenticated using (public.is_dearune_admin());

drop policy if exists admins_read_physical_product_events on public.physical_product_events;
create policy "admins_read_physical_product_events" on public.physical_product_events
  for select to authenticated using (public.is_dearune_admin());

-- The list view below reads `designers` and `shipping` as well. Supabase's own
-- default privileges already hand those to `authenticated` (that is how the
-- Designer screen reads `designers` today), and both tables already carry
-- admin-only RLS policies — so stating the grant here costs nothing and keeps
-- the view working on a project whose defaults differ. Rows stay filtered by
-- those policies; this only names the privilege the view depends on.
grant select on public.designers to authenticated;
grant select on public.shipping to authenticated;

-- ---------------------------------------------------------------------------
-- 13. The Operations list, joined once
-- ---------------------------------------------------------------------------
-- A workshop screen needs the unit, its Dearune, its designer and its
-- delivery contact in one cheap read. Doing that join in the browser would
-- mean shipping every `payload` (the private letter) to the client — so the
-- join lives here and exposes only what the screen shows, plus the two
-- booleans that decide whether a printed QR can open:
--
--   qr_target    the Dearune carries a public token at all
--   qr_ready     the letter is switched on, protected by nothing, and has a
--                token — i.e. scanning the paper will actually open it.
--
-- `security_invoker` keeps the underlying RLS policies in force, so this view
-- is exactly as private as `projects` itself.
create or replace view public.operations_units
with (security_invoker = true) as
select
  pp.id,
  pp.reference,
  pp.unit_index,
  pp.status::text      as status,
  pp.notes,
  pp.on_hold_reason,
  pp.cancelled_reason,
  pp.archived_at,
  pp.created_at,
  pp.updated_at,
  p.id                 as project_id,
  p.reference          as project_reference,
  p.title              as project_title,
  p.public_id,
  p.public_token,
  p.wrapper_type,
  p.template_slug,
  p.paid_at,
  p.message_active,
  coalesce((p.payload ->> 'passwordSet')::boolean, false) as message_protected,
  p.designer_id,
  d.name               as designer_name,
  d.code               as designer_code,
  s.recipient_name,
  s.phone              as customer_phone,
  s.tracking_code,
  s.provider,
  s.address_line1,
  s.address_line2,
  s.city,
  s.state_province,
  s.postal_code,
  s.country,
  s.special_instructions,
  (p.public_token is not null and p.public_token <> '') as qr_target,
  (
    coalesce(p.message_active, false)
    and coalesce((p.payload ->> 'passwordSet')::boolean, false) = false
    and p.public_token is not null
    and p.public_token <> ''
  ) as qr_ready
from public.physical_products pp
join public.projects p on p.id = pp.project_id
left join public.designers d on d.id = p.designer_id
left join public.shipping s on s.project_id = p.id;

revoke all on public.operations_units from anon;
grant select on public.operations_units to authenticated;

