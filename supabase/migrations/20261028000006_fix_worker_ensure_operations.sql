-- ============================================================================
-- Fix: worker_ensure_operations - remove dropped status column references
-- ============================================================================
-- The original function referenced v_row.status which was dropped in
-- 20261025000001_remove_operations_status_milestones.sql. This migration
-- updates the function to use milestone timestamps instead.
-- ============================================================================

create or replace function public.worker_ensure_operations(
  p_project_id uuid,
  p_units integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker  uuid := public.current_worker_id();
  v_wrapper text;
  v_units   integer := coalesce(p_units, 1);
  v_row     public.physical_products%rowtype;
  v_rows    jsonb := '[]'::jsonb;
begin
  if v_worker is null then
    raise exception 'worker.inactive_or_unknown' using errcode = '42501';
  end if;
  if not public.worker_has_permission('operations.view')
     or not (
       public.worker_has_permission('operations.create')
       or public.worker_has_permission('operations.manage')
     ) then
    raise exception 'worker.forbidden' using errcode = '42501';
  end if;
  if v_units < 1 or v_units > 20 then
    raise exception 'operations.units_out_of_range' using errcode = '22023';
  end if;

  select wrapper_type into v_wrapper from public.projects where id = p_project_id;
  if not found then
    raise exception 'project.not_found' using errcode = 'P0002';
  end if;
  if v_wrapper is null or v_wrapper = 'digital' then
    raise exception 'operations.not_physical' using errcode = '22023';
  end if;

  -- The existing allocator is the only code allowed to mint a canonical
  -- physical id. It is revoked from API roles; this definer function is a
  -- trusted caller.
  for v_row in
    select * from public.ensure_physical_products(p_project_id, v_units, null)
  loop
    if not exists (
      select 1 from public.physical_product_events e
      where e.physical_product_id = v_row.id and e.action = 'operations.opened'
    ) then
      insert into public.physical_product_events (physical_product_id, actor_type, actor_id, action, detail)
      values (v_row.id, 'worker', v_worker, 'operations.opened', jsonb_build_object('unit_index', v_row.unit_index));
    end if;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'id', v_row.id,
      'reference', v_row.reference,
      'unit_index', v_row.unit_index,
      'sold_at', v_row.sold_at,
      'manufacturing_completed_at', v_row.manufacturing_completed_at,
      'shipped_at', v_row.shipped_at,
      'delivered_at', v_row.delivered_at
    ));
  end loop;

  perform public.record_admin_audit(
    v_worker, 'worker', 'worker.operation.units_opened', 'project', p_project_id::text,
    jsonb_build_object('units_requested', v_units)
  );

  return jsonb_build_object('units', v_rows);
end;
$$;