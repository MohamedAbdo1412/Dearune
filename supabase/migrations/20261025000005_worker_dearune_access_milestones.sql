-- ============================================================================
-- Worker: per-record Dearune access and milestone actions
-- ============================================================================

-- Function to get a single Dearune detail for workers (safe fields)
create or replace function public.worker_dearune_detail(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_worker_id uuid;
  v_project record;
  v_designer record;
  v_shipping record;
  v_units jsonb;
  v_events jsonb;
  v_wrapper record;
  v_template record;
  result jsonb;
begin
  v_worker_id := public.current_worker_id();
  if v_worker_id is null then
    raise exception 'worker.unauthenticated';
  end if;
  if not public.worker_has_permission(v_worker_id, 'designers.view') and not public.worker_has_permission(v_worker_id, 'operations.view') then
    raise exception 'worker.forbidden';
  end if;

  select * into v_project from public.projects where id = p_project_id;
  if not found then
    raise exception 'dearune.not_found';
  end if;

  -- Check if worker can access this designer/project (basic check - operations.view allows access)
  select * into v_designer from public.designers where id = v_project.designer_id;
  select * into v_shipping from public.shipping where project_id = p_project_id;
  select * into v_wrapper from public.wrapper_types where key = v_project.wrapper_type;
  select * into v_template from public.templates where slug = v_project.template_slug;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pp.id,
    'reference', pp.reference,
    'unit_index', pp.unit_index,
    'sold_at', pp.sold_at,
    'manufacturing_completed_at', pp.manufacturing_completed_at,
    'shipped_at', pp.shipped_at,
    'delivered_at', pp.delivered_at,
    'notes', pp.notes,
    'archived_at', pp.archived_at,
    'created_at', pp.created_at,
    'updated_at', pp.updated_at
  ) order by pp.unit_index), '[]'::jsonb)
  into v_units
  from public.physical_products pp
  where pp.project_id = p_project_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pe.id,
    'physical_product_id', pe.physical_product_id,
    'action', pe.action,
    'detail', pe.detail,
    'created_at', pe.created_at
  ) order by pe.created_at desc), '[]'::jsonb)
  into v_events
  from public.physical_product_events pe
  join public.physical_products pp on pp.id = pe.physical_product_id
  where pp.project_id = p_project_id;

  result := jsonb_build_object(
    'project', jsonb_build_object(
      'id', v_project.id,
      'reference', v_project.reference,
      'title', v_project.title,
      'public_id', v_project.public_id,
      'status', v_project.status,
      'wrapper_type', v_project.wrapper_type,
      'wrapper_name', coalesce(v_wrapper.name, v_project.wrapper_type),
      'wrapper_kind', coalesce(v_wrapper.kind, case when v_project.wrapper_type = 'digital' then 'digital' else 'physical' end),
      'template_slug', v_project.template_slug,
      'template_name', v_template.name,
      'paid_at', v_project.paid_at,
      'manufactured_at', v_project.manufactured_at,
      'shipped_at', v_project.shipped_at,
      'arrived_at', v_project.arrived_at,
      'archived_at', v_project.archived_at,
      'message_active', v_project.message_active,
      'submitted_at', v_project.submitted_at,
      'created_at', v_project.created_at,
      'updated_at', v_project.updated_at,
      'sale_price', null,
      'estimated_cost', null
    ),
    'designer', case when v_designer.id is not null then jsonb_build_object(
      'id', v_designer.id,
      'name', v_designer.name,
      'code', v_designer.code
    ) else null end,
    'shipping', case when v_shipping.id is not null then jsonb_build_object(
      'recipient_name', v_shipping.recipient_name,
      'phone', v_shipping.phone,
      'address_line1', v_shipping.address_line1,
      'address_line2', v_shipping.address_line2,
      'city', v_shipping.city,
      'state_province', v_shipping.state_province,
      'governorate', v_shipping.governorate,
      'district', v_shipping.district,
      'postal_code', v_shipping.postal_code,
      'country', v_shipping.country,
      'special_instructions', v_shipping.special_instructions,
      'tracking_code', v_shipping.tracking_code,
      'provider', v_shipping.provider
    ) else null end,
    'units', v_units,
    'events', v_events
  );

  return result;
end;
$$;

revoke execute on function public.worker_dearune_detail(uuid) from public, anon, authenticated;
grant execute on function public.worker_dearune_detail(uuid) to authenticated;

-- Mark manufactured milestone
create or replace function public.worker_mark_dearune_manufactured(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_id uuid;
  v_project record;
  v_wrapper text;
  v_units_updated integer := 0;
begin
  v_worker_id := public.current_worker_id();
  if v_worker_id is null then raise exception 'worker.unauthenticated'; end if;
  if not public.worker_has_permission(v_worker_id, 'operations.mark_manufactured') then raise exception 'worker.forbidden'; end if;

  select * into v_project from public.projects where id = p_project_id;
  if not found then raise exception 'dearune.not_found'; end if;
  if v_project.archived_at is not null then raise exception 'dearune.archived'; end if;
  if v_project.paid_at is null then raise exception 'dearune.not_sold'; end if;

  select wrapper_type into v_wrapper from public.projects where id = p_project_id;
  if v_wrapper = 'digital' then raise exception 'dearune.digital'; end if;

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

revoke execute on function public.worker_mark_dearune_manufactured(uuid) from public, anon, authenticated;
grant execute on function public.worker_mark_dearune_manufactured(uuid) to authenticated;

-- Mark shipped milestone
create or replace function public.worker_mark_dearune_shipped(p_project_id uuid, p_tracking_code text default null, p_provider text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_id uuid;
  v_project record;
  v_wrapper text;
  v_units_updated integer := 0;
begin
  v_worker_id := public.current_worker_id();
  if v_worker_id is null then raise exception 'worker.unauthenticated'; end if;
  if not public.worker_has_permission(v_worker_id, 'operations.mark_shipped') then raise exception 'worker.forbidden'; end if;

  select * into v_project from public.projects where id = p_project_id;
  if not found then raise exception 'dearune.not_found'; end if;
  if v_project.archived_at is not null then raise exception 'dearune.archived'; end if;
  if v_project.paid_at is null then raise exception 'dearune.not_sold'; end if;

  select wrapper_type into v_wrapper from public.projects where id = p_project_id;
  if v_wrapper = 'digital' then raise exception 'dearune.digital'; end if;

  if v_project.manufactured_at is null then raise exception 'dearune.not_manufactured'; end if;

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
    on conflict (project_id) do update set
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

revoke execute on function public.worker_mark_dearune_shipped(uuid, text, text) from public, anon, authenticated;
grant execute on function public.worker_mark_dearune_shipped(uuid, text, text) to authenticated;

-- Mark delivered milestone
create or replace function public.worker_mark_dearune_delivered(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_id uuid;
  v_project record;
  v_wrapper text;
  v_units_updated integer := 0;
begin
  v_worker_id := public.current_worker_id();
  if v_worker_id is null then raise exception 'worker.unauthenticated'; end if;
  if not public.worker_has_permission(v_worker_id, 'operations.mark_delivered') then raise exception 'worker.forbidden'; end if;

  select * into v_project from public.projects where id = p_project_id;
  if not found then raise exception 'dearune.not_found'; end if;
  if v_project.archived_at is not null then raise exception 'dearune.archived'; end if;
  if v_project.paid_at is null then raise exception 'dearune.not_sold'; end if;

  select wrapper_type into v_wrapper from public.projects where id = p_project_id;
  if v_wrapper = 'digital' then raise exception 'dearune.digital'; end if;

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

revoke execute on function public.worker_mark_dearune_delivered(uuid) from public, anon, authenticated;
grant execute on function public.worker_mark_dearune_delivered(uuid) to authenticated;
