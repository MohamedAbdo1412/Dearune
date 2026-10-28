-- ============================================================================
-- Fix: Worker milestone RPCs - ON CONFLICT, maintenance mode, shipping address
-- ============================================================================
-- This migration fixes three issues in the worker milestone RPCs:
-- 1. worker_mark_dearune_shipped: ON CONFLICT clause to match partial unique index
-- 2. All three milestone RPCs: enforce maintenance mode from app_settings
-- 3. worker_mark_dearune_shipped: enforce shipping address completeness
-- ============================================================================

-- 1. Fix worker_mark_dearune_manufactured - add maintenance mode check
create or replace function public.worker_mark_dearune_manufactured(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_id uuid;
  v_project record;
  v_wrapper_kind text;
  v_units_updated integer := 0;
  v_maintenance boolean;
begin
  v_worker_id := public.current_worker_id();
  if v_worker_id is null then raise exception 'worker.unauthenticated'; end if;
  if not public.worker_has_permission('operations.mark_manufactured') then raise exception 'worker.forbidden'; end if;

  -- Check maintenance mode
  select maintenance_mode into v_maintenance from public.app_settings where id = 1;
  if v_maintenance then raise exception 'maintenance_mode'; end if;

  select * into v_project from public.projects where id = p_project_id;
  if not found then raise exception 'dearune.not_found'; end if;
  if v_project.archived_at is not null then raise exception 'dearune.archived'; end if;
  if v_project.paid_at is null then raise exception 'dearune.not_sold'; end if;

  select coalesce(wt.kind, case when v_project.wrapper_type = 'digital' then 'digital' else 'physical' end)
    into v_wrapper_kind
    from public.wrapper_types wt
   where wt.key = v_project.wrapper_type;
  if v_wrapper_kind = 'digital' then raise exception 'dearune.digital'; end if;

  update public.physical_products
  set manufacturing_completed_at = coalesce(manufacturing_completed_at, now()), updated_at = now()
  where project_id = p_project_id and manufacturing_completed_at is null;
  get diagnostics v_units_updated = row_count;

  if v_project.manufactured_at is null then
    update public.projects set manufactured_at = now(), updated_at = now() where id = p_project_id;
  end if;

  insert into public.physical_product_events (physical_product_id, actor_type, action, detail)
  select id, 'system', 'operations.milestone.manufactured', jsonb_build_object('worker_id', v_worker_id)
  from public.physical_products where project_id = p_project_id;

  insert into public.worker_audit_logs (worker_id, action, entity_type, entity_id, metadata)
  values (v_worker_id, 'operations.mark_manufactured', 'project', p_project_id, jsonb_build_object('units_updated', v_units_updated));

  return jsonb_build_object('ok', true, 'units_updated', v_units_updated);
end;
$$;

-- 2. Fix worker_mark_dearune_shipped - ON CONFLICT, maintenance mode, shipping address
create or replace function public.worker_mark_dearune_shipped(p_project_id uuid, p_tracking_code text default null, p_provider text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_id uuid;
  v_project record;
  v_shipping record;
  v_wrapper_kind text;
  v_units_updated integer := 0;
  v_maintenance boolean;
  v_address_complete boolean;
begin
  v_worker_id := public.current_worker_id();
  if v_worker_id is null then raise exception 'worker.unauthenticated'; end if;
  if not public.worker_has_permission('operations.mark_shipped') then raise exception 'worker.forbidden'; end if;

  -- Check maintenance mode
  select maintenance_mode into v_maintenance from public.app_settings where id = 1;
  if v_maintenance then raise exception 'maintenance_mode'; end if;

  select * into v_project from public.projects where id = p_project_id;
  if not found then raise exception 'dearune.not_found'; end if;
  if v_project.archived_at is not null then raise exception 'dearune.archived'; end if;
  if v_project.paid_at is null then raise exception 'dearune.not_sold'; end if;

  select coalesce(wt.kind, case when v_project.wrapper_type = 'digital' then 'digital' else 'physical' end)
    into v_wrapper_kind
    from public.wrapper_types wt
   where wt.key = v_project.wrapper_type;
  if v_wrapper_kind = 'digital' then raise exception 'dearune.digital'; end if;

  if v_project.manufactured_at is null then raise exception 'dearune.not_manufactured'; end if;

  -- Check shipping address completeness
  select * into v_shipping from public.shipping where project_id = p_project_id;
  if not found then
    raise exception 'shipping_address_missing';
  end if;
  v_address_complete := v_shipping.recipient_name is not null
    and v_shipping.address_line1 is not null
    and v_shipping.city is not null
    and v_shipping.country is not null;
  if not v_address_complete then
    raise exception 'shipping_address_incomplete';
  end if;

  update public.physical_products
  set shipped_at = coalesce(shipped_at, now()), updated_at = now()
  where project_id = p_project_id and shipped_at is null;
  get diagnostics v_units_updated = row_count;

  if v_project.shipped_at is null then
    update public.projects set shipped_at = now(), updated_at = now() where id = p_project_id;
  end if;

  if p_tracking_code is not null and trim(p_tracking_code) <> '' then
    insert into public.shipping (project_id, tracking_code, provider)
    values (p_project_id, trim(p_tracking_code), nullif(trim(coalesce(p_provider,'')), ''))
    on conflict (project_id) where project_id is not null do update set
      tracking_code = coalesce(excluded.tracking_code, shipping.tracking_code),
      provider = coalesce(excluded.provider, shipping.provider),
      updated_at = now();
  end if;

  insert into public.physical_product_events (physical_product_id, actor_type, action, detail)
  select id, 'system', 'operations.milestone.shipped', jsonb_build_object('worker_id', v_worker_id, 'tracking_code', p_tracking_code)
  from public.physical_products where project_id = p_project_id;

  insert into public.worker_audit_logs (worker_id, action, entity_type, entity_id, metadata)
  values (v_worker_id, 'operations.mark_shipped', 'project', p_project_id, jsonb_build_object('units_updated', v_units_updated));

  return jsonb_build_object('ok', true, 'units_updated', v_units_updated);
end;
$$;

-- 3. Fix worker_mark_dearune_delivered - add maintenance mode check
create or replace function public.worker_mark_dearune_delivered(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_id uuid;
  v_project record;
  v_wrapper_kind text;
  v_units_updated integer := 0;
  v_maintenance boolean;
begin
  v_worker_id := public.current_worker_id();
  if v_worker_id is null then raise exception 'worker.unauthenticated'; end if;
  if not public.worker_has_permission('operations.mark_delivered') then raise exception 'worker.forbidden'; end if;

  -- Check maintenance mode
  select maintenance_mode into v_maintenance from public.app_settings where id = 1;
  if v_maintenance then raise exception 'maintenance_mode'; end if;

  select * into v_project from public.projects where id = p_project_id;
  if not found then raise exception 'dearune.not_found'; end if;
  if v_project.archived_at is not null then raise exception 'dearune.archived'; end if;
  if v_project.paid_at is null then raise exception 'dearune.not_sold'; end if;

  select coalesce(wt.kind, case when v_project.wrapper_type = 'digital' then 'digital' else 'physical' end)
    into v_wrapper_kind
    from public.wrapper_types wt
   where wt.key = v_project.wrapper_type;
  if v_wrapper_kind = 'digital' then raise exception 'dearune.digital'; end if;

  if v_project.shipped_at is null then raise exception 'dearune.not_shipped'; end if;

  update public.physical_products
  set delivered_at = coalesce(delivered_at, now()), updated_at = now()
  where project_id = p_project_id and delivered_at is null;
  get diagnostics v_units_updated = row_count;

  if v_project.arrived_at is null then
    update public.projects set arrived_at = now(), updated_at = now() where id = p_project_id;
  end if;

  insert into public.physical_product_events (physical_product_id, actor_type, action, detail)
  select id, 'system', 'operations.milestone.delivered', jsonb_build_object('worker_id', v_worker_id)
  from public.physical_products where project_id = p_project_id;

  insert into public.worker_audit_logs (worker_id, action, entity_type, entity_id, metadata)
  values (v_worker_id, 'operations.mark_delivered', 'project', p_project_id, jsonb_build_object('units_updated', v_units_updated));

  return jsonb_build_object('ok', true, 'units_updated', v_units_updated);
end;
$$;