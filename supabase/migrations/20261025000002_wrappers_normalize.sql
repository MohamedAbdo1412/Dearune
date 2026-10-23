-- ============================================================================
-- Wrappers: add explicit type (kind), ensure names editable, no key overrides
-- ============================================================================

-- Add kind column
alter table public.wrapper_types
  add column if not exists kind text check (kind in ('digital','physical'));

-- Set kinds for known keys
update public.wrapper_types set kind = 'digital' where lower(key) = 'digital';
update public.wrapper_types set kind = 'physical' where kind is null;

alter table public.wrapper_types alter column kind set default 'physical';
update public.wrapper_types set kind = 'physical' where kind is null;
alter table public.wrapper_types alter column kind set not null;

-- Ensure all legacy wrapper keys exist as editable rows
insert into public.wrapper_types (key, name, name_ar, description, description_ar, image_url, active, base_price, production_cost, display_order, estimated_production_days, kind)
values
  ('digital', 'Digital only', 'رقمي فقط', 'The letter lives online.', 'الرسالة تبقى أونلاين.', '', true, 9.00, 0.00, 10, 0, 'digital'),
  ('open_letter', 'Open letter', 'رسالة مفتوحة', 'A printed letter, opened by hand.', 'رسالة مطبوعة تفتح باليد.', '', true, 14.00, 3.00, 20, 5, 'physical'),
  ('sealed_letter', 'Sealed letter', 'رسالة مختومة', 'A printed letter kept sealed until the right hands.', 'رسالة مطبوعة مختومة حتى تصل ليد المستلم.', '', true, 16.00, 4.00, 30, 5, 'physical'),
  ('open_card', 'Open card', 'بطاقة مفتوحة', 'A card-style Dearune.', 'بطاقة مفتوحة.', '', true, 12.00, 2.50, 40, 3, 'physical')
on conflict (key) do update set
  kind = coalesce(wrapper_types.kind, excluded.kind);

-- Relax projects wrapper_type constraint to allow any active wrapper key
do $$
begin
  alter table public.projects drop constraint if exists projects_wrapper_type_check;
exception when others then null;
end $$;

alter table public.projects
  add constraint projects_wrapper_type_check check (wrapper_type is null or length(wrapper_type) > 0);
