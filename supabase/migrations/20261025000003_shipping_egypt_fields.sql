-- ============================================================================
-- Shipping: add Egyptian address fields (district/governorate) while keeping
-- compatibility with existing fields
-- ============================================================================

alter table public.shipping
  add column if not exists governorate text,
  add column if not exists district text,
  add column if not exists recipient_phone_alt text;

-- Backfill governorate from state_province where present
update public.shipping
set governorate = coalesce(governorate, nullif(trim(state_province), ''))
where governorate is null and state_province is not null;

-- Ensure recipient_name defaults can be set via form; no constraint changes
comment on column public.shipping.governorate is 'Egyptian governorate (use state_province as fallback)';
comment on column public.shipping.district is 'District/neighborhood';
