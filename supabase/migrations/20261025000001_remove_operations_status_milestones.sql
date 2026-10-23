-- ============================================================================
-- Operations: replace generic status with explicit milestone events
-- ============================================================================
--
-- Remove the 16-step generic Operations status. Add explicit milestone
-- timestamps to physical_products: sold_at, manufacturing_completed_at,
-- shipped_at, delivered_at. Archive remains. Preserve history as events.
-- Designer status is untouched.
-- ============================================================================

-- 1. Add milestone columns
alter table public.physical_products
  add column if not exists sold_at timestamptz,
  add column if not exists manufacturing_completed_at timestamptz,
  add column if not exists shipped_at timestamptz,
  add column if not exists delivered_at timestamptz;

-- 2. Backfill milestones from current status and project timestamps
do $$
declare
  r record;
begin
  for r in select pp.id, pp.status, pp.project_id, pp.updated_at, p.paid_at, p.manufactured_at, p.shipped_at, p.arrived_at
           from public.physical_products pp
           join public.projects p on p.id = pp.project_id
  loop
    -- sold_at from project paid_at
    update public.physical_products
    set sold_at = coalesce(sold_at, r.paid_at)
    where id = r.id;

    -- manufacturing completed
    if r.status::text in ('manufacturing','quality_control','qc_passed','ready_for_packaging','packed','ready_for_shipment','shipped','delivered')
       or r.manufactured_at is not null then
      update public.physical_products
      set manufacturing_completed_at = coalesce(manufacturing_completed_at, r.manufactured_at, r.updated_at)
      where id = r.id;
    end if;

    -- shipped
    if r.status::text in ('shipped','delivered') or r.shipped_at is not null then
      update public.physical_products
      set shipped_at = coalesce(shipped_at, r.shipped_at, r.updated_at)
      where id = r.id;
    end if;

    -- delivered
    if r.status::text = 'delivered' or r.arrived_at is not null then
      update public.physical_products
      set delivered_at = coalesce(delivered_at, r.arrived_at, r.updated_at)
      where id = r.id;
    end if;
  end loop;
end $$;

-- 3. Log milestone events for historical status (best effort)
insert into public.physical_product_events (physical_product_id, actor_type, action, detail, created_at)
select pp.id, 'system', 'operations.milestone_backfilled', 
       jsonb_build_object('from_status', pp.status::text, 'sold_at', pp.sold_at, 'manufacturing_completed_at', pp.manufacturing_completed_at, 'shipped_at', pp.shipped_at, 'delivered_at', pp.delivered_at),
       coalesce(pp.updated_at, now())
from public.physical_products pp
where not exists (select 1 from public.physical_product_events e where e.physical_product_id = pp.id and e.action = 'operations.milestone_backfilled');

-- 4. Drop guard trigger and function that enforce status graph
drop trigger if exists physical_products_guard on public.physical_products;
drop function if exists public.physical_products_guard();

-- 5. Drop the operations_units view first — it references pp.status, which
--    is dropped in the next step. It is recreated below without status.
drop view if exists public.operations_units;

-- 6. Remove status-related columns and index
drop index if exists public.physical_products_status_idx;
alter table public.physical_products drop column if exists status;
alter table public.physical_products drop column if exists on_hold_reason;
alter table public.physical_products drop column if exists cancelled_reason;

-- 7. Drop enum type if unused
do $$
begin
  drop type if exists public.physical_product_status;
exception when others then null;
end $$;

-- 8. Recreate ensure_physical_products without status parameter
create or replace function public.ensure_physical_products(
  p_project_id uuid,
  p_units integer default 1,
  p_actor uuid default null
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

  if v_wrapper is null or v_wrapper = 'digital' then
    return;
  end if;

  select count(*) into v_existing
  from public.physical_products where project_id = p_project_id;

  v_target := greatest(coalesce(p_units, 1), v_existing);

  for i in (v_existing + 1) .. v_target loop
    insert into public.physical_products (project_id, unit_index, created_by)
    values (p_project_id, i, p_actor)
    on conflict (project_id, unit_index) do nothing;
  end loop;

  return query
    select * from public.physical_products where project_id = p_project_id order by unit_index;
end;
$$;

revoke execute on function public.ensure_physical_products(uuid, integer, uuid) from public, anon, authenticated;

-- 9. Update operations_units view to remove status
create or replace view public.operations_units
with (security_invoker = true) as
select
  pp.id,
  pp.reference,
  pp.unit_index,
  pp.sold_at,
  pp.manufacturing_completed_at,
  pp.shipped_at,
  pp.delivered_at,
  pp.notes,
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
