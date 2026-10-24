-- ============================================================================
-- Worker Operations and Designers: safe reads and permission-checked writes
-- ============================================================================
--
-- Why this file exists
-- --------------------
-- `projects` carries both the private letter (`payload`) and the money
-- (`sale_price`, `estimated_cost`). RLS filters rows, not columns, so a worker
-- must NEVER be given SELECT on `projects`. The same is true of `sales_log`,
-- `template_pricing`, `wrapper_types` and `template_wrapper_options`.
--
-- Instead, every worker read goes through a `security definer` function that:
--
--   1. resolves the caller with `current_worker_id()` (live, active-only);
--   2. checks one exact permission with `worker_has_permission(...)`;
--   3. selects only the operational columns the screen needs;
--   4. returns JSON, so PostgREST cannot add columns behind our back.
--
-- Every write follows the same shape and is audited. The database trigger on
-- `physical_products` remains the authority on legal status transitions; these
-- functions only add friendly validation and a truthful actor.
--
-- No table in this file gains a worker RLS policy. That is deliberate.

-- ---------------------------------------------------------------------------
-- 1. Operations: the safe list
-- ---------------------------------------------------------------------------
create or replace function public.worker_operations_units(p_include_archived boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows jsonb;
begin
  if public.current_worker_id() is null then
    raise exception 'worker.inactive_or_unknown' using errcode = '42501';
  end if;
  if not public.worker_has_permission('operations.view') then
    raise exception 'worker.forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_json order by created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select
      pp.created_at,
      jsonb_build_object(
        'id', pp.id,
        'reference', pp.reference,
        'unit_index', pp.unit_index,
        'status', pp.status::text,
        'notes', pp.notes,
        'on_hold_reason', pp.on_hold_reason,
        'cancelled_reason', pp.cancelled_reason,
        'archived_at', pp.archived_at,
        'created_at', pp.created_at,
        'updated_at', pp.updated_at,
        'project_id', p.id,
        'project_reference', p.reference,
        'project_title', p.title,
        'public_id', p.public_id,
        'wrapper_type', p.wrapper_type,
        'template_slug', p.template_slug,
        'paid_at', p.paid_at,
        'message_active', p.message_active,
        'message_protected', coalesce((p.payload ->> 'passwordSet')::boolean, false),
        'designer_id', p.designer_id,
        'designer_name', d.name,
        'designer_code', d.code,
        'recipient_name', s.recipient_name,
        'customer_phone', s.phone,
        'tracking_code', s.tracking_code,
        'provider', s.provider,
        'address_line1', s.address_line1,
        'address_line2', s.address_line2,
        'city', s.city,
        'state_province', s.state_province,
        'postal_code', s.postal_code,
        'country', s.country,
        'special_instructions', s.special_instructions,
        'qr_target', p.public_token is not null and p.public_token <> '',
        'qr_ready', (
          coalesce(p.message_active, false)
          and coalesce((p.payload ->> 'passwordSet')::boolean, false) = false
          and p.public_token is not null
          and p.public_token <> ''
        )
      ) as row_json
    from public.physical_products pp
    join public.projects p on p.id = pp.project_id
    left join public.designers d on d.id = p.designer_id
    left join public.shipping s on s.project_id = p.id
    where p_include_archived or pp.archived_at is null
    order by pp.created_at desc
    limit 500
  ) units;

  return v_rows;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Operations: advance / hold / cancel one unit
-- ---------------------------------------------------------------------------
-- The `physical_products_guard` trigger still decides whether the move is
-- legal. We validate the input shape and reasons first so the workshop sees a
-- sentence rather than a raw exception.
create or replace function public.worker_set_operation_status(
  p_product_id uuid,
  p_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker  uuid := public.current_worker_id();
  v_product public.physical_products%rowtype;
  v_project public.projects%rowtype;
  v_from    text;
  v_reason  text := btrim(coalesce(p_reason, ''));
  v_stamp   text;
  v_result  jsonb;
begin
  if v_worker is null then
    raise exception 'worker.inactive_or_unknown' using errcode = '42501';
  end if;
  if not public.worker_has_permission('operations.view')
     or not public.worker_has_permission('operations.update_status') then
    raise exception 'worker.forbidden' using errcode = '42501';
  end if;
  if p_status is null or p_status not in (
    'pending_verification', 'information_verified', 'ready_to_print', 'printing',
    'printed', 'qr_verified', 'manufacturing', 'quality_control', 'qc_passed',
    'ready_for_packaging', 'packed', 'ready_for_shipment', 'shipped',
    'delivered', 'on_hold', 'cancelled'
  ) then
    raise exception 'operations.unknown_status' using errcode = '22023';
  end if;

  select * into v_product
  from public.physical_products
  where id = p_product_id
  for update;
  if not found then
    raise exception 'operations.not_found' using errcode = 'P0002';
  end if;
  if v_product.archived_at is not null then
    raise exception 'operations.archived_frozen' using errcode = '55000';
  end if;

  v_from := v_product.status::text;
  if v_from = p_status then
    return jsonb_build_object('unchanged', true, 'unit', to_jsonb(v_product));
  end if;
  if p_status in ('on_hold', 'cancelled') and v_reason = '' then
    raise exception 'operations.reason_required' using errcode = '22023';
  end if;

  -- The trigger rejects an illegal transition and aborts this statement, so
  -- neither the event nor the audit row is written for a refused move.
  update public.physical_products
  set status = p_status::public.physical_product_status,
      on_hold_reason = case
        when p_status = 'on_hold' then v_reason
        when v_from = 'on_hold' then null
        else on_hold_reason
      end,
      cancelled_reason = case
        when p_status = 'cancelled' then v_reason
        else cancelled_reason
      end
  where id = p_product_id;

  insert into public.physical_product_events (physical_product_id, actor_type, actor_id, action, detail)
  values (
    p_product_id, 'worker', v_worker, 'operations.status',
    jsonb_build_object('from', v_from, 'to', p_status, 'reason', nullif(v_reason, ''))
  );

  -- Bridge the detailed workshop step to the Dearune's own coarse stamp, but
  -- only forward and only when the Dearune's precondition already holds. This
  -- mirrors the admin Operations function without ever touching money.
  select * into v_project from public.projects where id = v_product.project_id;
  v_stamp := case
    when p_status in ('manufacturing', 'quality_control', 'qc_passed', 'ready_for_packaging', 'packed', 'ready_for_shipment')
      then 'manufactured_at'
    when p_status = 'shipped' then 'shipped_at'
    when p_status = 'delivered' then 'arrived_at'
    else null
  end;

  if v_stamp = 'manufactured_at' and v_project.paid_at is not null and v_project.manufactured_at is null then
    update public.projects set manufactured_at = now() where id = v_project.id and manufactured_at is null;
    insert into public.project_events (project_id, actor_type, actor_id, action, detail)
    values (v_project.id, 'worker', v_worker, 'project.manufactured', jsonb_build_object('source', 'operations'));
  elsif v_stamp = 'shipped_at' and v_project.manufactured_at is not null and v_project.shipped_at is null then
    update public.projects set shipped_at = now() where id = v_project.id and shipped_at is null;
    insert into public.project_events (project_id, actor_type, actor_id, action, detail)
    values (v_project.id, 'worker', v_worker, 'project.shipped', jsonb_build_object('source', 'operations'));
  elsif v_stamp = 'arrived_at' and v_project.shipped_at is not null and v_project.arrived_at is null then
    update public.projects set arrived_at = now() where id = v_project.id and arrived_at is null;
    insert into public.project_events (project_id, actor_type, actor_id, action, detail)
    values (v_project.id, 'worker', v_worker, 'project.arrived', jsonb_build_object('source', 'operations'));
  end if;

  perform public.record_admin_audit(
    v_worker, 'worker', 'worker.operation.status', 'physical_product', p_product_id::text,
    jsonb_build_object('project_id', v_product.project_id, 'from', v_from, 'to', p_status, 'reason', nullif(v_reason, ''))
  );

  select to_jsonb(p) into v_result
  from public.physical_products p
  where p.id = p_product_id;
  return jsonb_build_object('unchanged', false, 'unit', v_result);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Operations: notes and hold/cancel reasons
-- ---------------------------------------------------------------------------
create or replace function public.worker_update_operation(
  p_product_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker  uuid := public.current_worker_id();
  v_product public.physical_products%rowtype;
  v_notes   text := btrim(coalesce(p_notes, ''));
begin
  if v_worker is null then
    raise exception 'worker.inactive_or_unknown' using errcode = '42501';
  end if;
  if not public.worker_has_permission('operations.view')
     or not public.worker_has_permission('operations.edit') then
    raise exception 'worker.forbidden' using errcode = '42501';
  end if;
  if char_length(v_notes) > 2000 then
    raise exception 'operations.notes_too_long' using errcode = '22001';
  end if;

  select * into v_product
  from public.physical_products
  where id = p_product_id
  for update;
  if not found then
    raise exception 'operations.not_found' using errcode = 'P0002';
  end if;
  if v_product.archived_at is not null then
    raise exception 'operations.archived_frozen' using errcode = '55000';
  end if;

  update public.physical_products
  set notes = nullif(v_notes, '')
  where id = p_product_id;

  insert into public.physical_product_events (physical_product_id, actor_type, actor_id, action, detail)
  values (p_product_id, 'worker', v_worker, 'operations.updated', jsonb_build_object('fields', jsonb_build_array('notes')));

  perform public.record_admin_audit(
    v_worker, 'worker', 'worker.operation.updated', 'physical_product', p_product_id::text,
    jsonb_build_object('project_id', v_product.project_id)
  );

  return jsonb_build_object(
    'id', p_product_id,
    'notes', nullif(v_notes, '')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Operations: archive / restore
-- ---------------------------------------------------------------------------
create or replace function public.worker_archive_operations(
  p_product_ids uuid[],
  p_archive boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker uuid := public.current_worker_id();
  v_ids    uuid[];
  v_count  integer := 0;
begin
  if v_worker is null then
    raise exception 'worker.inactive_or_unknown' using errcode = '42501';
  end if;
  if not public.worker_has_permission('operations.view')
     or not public.worker_has_permission('operations.manage') then
    raise exception 'worker.forbidden' using errcode = '42501';
  end if;
  if p_product_ids is null or array_length(p_product_ids, 1) is null then
    raise exception 'operations.selection_required' using errcode = '22023';
  end if;
  if array_length(p_product_ids, 1) > 200 then
    raise exception 'operations.selection_too_large' using errcode = '22023';
  end if;

  with changed as (
    update public.physical_products
    set archived_at = case when p_archive then now() else null end
    where id = any(p_product_ids)
      and case
        when p_archive then archived_at is null
        else archived_at is not null
      end
    returning id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) into v_ids from changed;

  v_count := coalesce(array_length(v_ids, 1), 0);
  if v_count > 0 then
    insert into public.physical_product_events (physical_product_id, actor_type, actor_id, action, detail)
    select id, 'worker', v_worker,
           case when p_archive then 'operations.archived' else 'operations.restored' end,
           '{}'::jsonb
    from unnest(v_ids) as id;

    perform public.record_admin_audit(
      v_worker, 'worker',
      case when p_archive then 'worker.operation.archived' else 'worker.operation.restored' end,
      'physical_product', null,
      jsonb_build_object('count', v_count, 'ids', to_jsonb(v_ids))
    );
  end if;

  return jsonb_build_object('count', v_count, 'ids', to_jsonb(v_ids));
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Operations: the phone printed on the paper
-- ---------------------------------------------------------------------------
create or replace function public.worker_update_operation_contact(
  p_project_id uuid,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker uuid := public.current_worker_id();
  v_phone  text := btrim(coalesce(p_phone, ''));
  v_row    public.shipping%rowtype;
begin
  if v_worker is null then
    raise exception 'worker.inactive_or_unknown' using errcode = '42501';
  end if;
  if not public.worker_has_permission('operations.view')
     or not public.worker_has_permission('operations.edit') then
    raise exception 'worker.forbidden' using errcode = '42501';
  end if;
  if char_length(v_phone) > 30 then
    raise exception 'operations.phone_too_long' using errcode = '22001';
  end if;
  if not exists (select 1 from public.projects where id = p_project_id) then
    raise exception 'project.not_found' using errcode = 'P0002';
  end if;

  select * into v_row from public.shipping where project_id = p_project_id limit 1;
  if found then
    update public.shipping set phone = nullif(v_phone, '') where id = v_row.id;
  else
    insert into public.shipping (project_id, phone) values (p_project_id, nullif(v_phone, ''))
    returning * into v_row;
  end if;

  insert into public.project_events (project_id, actor_type, actor_id, action, detail)
  values (p_project_id, 'worker', v_worker, 'project.contact', jsonb_build_object('field', 'phone'));

  perform public.record_admin_audit(
    v_worker, 'worker', 'worker.operation.contact', 'project', p_project_id::text,
    jsonb_build_object('field', 'phone')
  );

  return jsonb_build_object('projectId', p_project_id, 'phone', nullif(v_phone, ''));
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Operations: attach a different designer to a unit
-- ---------------------------------------------------------------------------
create or replace function public.worker_update_operation_designer(
  p_project_id uuid,
  p_designer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker   uuid := public.current_worker_id();
  v_designer public.designers%rowtype;
begin
  if v_worker is null then
    raise exception 'worker.inactive_or_unknown' using errcode = '42501';
  end if;
  if not public.worker_has_permission('operations.view')
     or not public.worker_has_permission('operations.edit') then
    raise exception 'worker.forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.projects where id = p_project_id) then
    raise exception 'project.not_found' using errcode = 'P0002';
  end if;
  select * into v_designer from public.designers where id = p_designer_id;
  if not found then
    raise exception 'designer.not_found' using errcode = 'P0002';
  end if;

  update public.projects set designer_id = p_designer_id where id = p_project_id;

  insert into public.project_events (project_id, actor_type, actor_id, action, detail)
  values (p_project_id, 'worker', v_worker, 'project.designer', jsonb_build_object('designer_id', p_designer_id));

  perform public.record_admin_audit(
    v_worker, 'worker', 'worker.operation.designer', 'project', p_project_id::text,
    jsonb_build_object('designer_id', p_designer_id)
  );

  return jsonb_build_object('projectId', p_project_id, 'designerId', v_designer.id, 'name', v_designer.name, 'code', v_designer.code);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Operations: open the units for a Dearune
-- ---------------------------------------------------------------------------
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
  -- trusted caller. `created_by` stays null because the column references
  -- admin_users and a worker is not an admin.
  for v_row in
    select * from public.ensure_physical_products(p_project_id, v_units, null)
  loop
    if v_row.status::text = 'pending_verification'
       and not exists (
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
      'status', v_row.status::text
    ));
  end loop;

  perform public.record_admin_audit(
    v_worker, 'worker', 'worker.operation.units_opened', 'project', p_project_id::text,
    jsonb_build_object('units_requested', v_units)
  );

  return jsonb_build_object('units', v_rows);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Designers: the safe directory
-- ---------------------------------------------------------------------------
create or replace function public.worker_designers()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows jsonb;
begin
  if public.current_worker_id() is null then
    raise exception 'worker.inactive_or_unknown' using errcode = '42501';
  end if;
  if not public.worker_has_permission('designers.view') then
    raise exception 'worker.forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'name', d.name,
    'code', d.code,
    'revokedAt', d.revoked_at,
    'lastLoginAt', d.last_login_at,
    'createdAt', d.created_at,
    'updatedAt', d.updated_at,
    'projectCount', (
      select count(*)::integer from public.projects p where p.designer_id = d.id
    ),
    'activeProjectCount', (
      select count(*)::integer from public.projects p
      where p.designer_id = d.id and p.status = 'submitted'
    )
  ) order by d.created_at desc), '[]'::jsonb)
  into v_rows
  from public.designers d;

  return v_rows;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Designers: their Dearunes, without money or the private letter
-- ---------------------------------------------------------------------------
create or replace function public.worker_projects(p_designer_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows jsonb;
begin
  if public.current_worker_id() is null then
    raise exception 'worker.inactive_or_unknown' using errcode = '42501';
  end if;
  if not public.worker_has_permission('designers.view') then
    raise exception 'worker.forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'reference', p.reference,
    'designer_id', p.designer_id,
    'template_slug', p.template_slug,
    'template_version', p.template_version,
    'title', p.title,
    'status', p.status,
    'public_id', p.public_id,
    'wrapper_type', p.wrapper_type,
    'configured_at', p.configured_at,
    'submitted_at', p.submitted_at,
    'created_at', p.created_at,
    'updated_at', p.updated_at,
    'manufactured_at', p.manufactured_at,
    'shipped_at', p.shipped_at,
    'arrived_at', p.arrived_at,
    'archived_at', p.archived_at,
    'first_activated_at', p.first_activated_at,
    'message_active', p.message_active
  ) order by p.created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select *
    from public.projects
    where p_designer_id is null or designer_id = p_designer_id
    order by created_at desc
    limit 300
  ) p;

  return v_rows;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.worker_operations_units(boolean) from public, anon, authenticated;
revoke all on function public.worker_set_operation_status(uuid, text, text) from public, anon, authenticated;
revoke all on function public.worker_update_operation(uuid, text) from public, anon, authenticated;
revoke all on function public.worker_archive_operations(uuid[], boolean) from public, anon, authenticated;
revoke all on function public.worker_update_operation_contact(uuid, text) from public, anon, authenticated;
revoke all on function public.worker_update_operation_designer(uuid, uuid) from public, anon, authenticated;
revoke all on function public.worker_ensure_operations(uuid, integer) from public, anon, authenticated;
revoke all on function public.worker_designers() from public, anon, authenticated;
revoke all on function public.worker_projects(uuid) from public, anon, authenticated;

grant execute on function public.worker_operations_units(boolean) to authenticated;
grant execute on function public.worker_set_operation_status(uuid, text, text) to authenticated;
grant execute on function public.worker_update_operation(uuid, text) to authenticated;
grant execute on function public.worker_archive_operations(uuid[], boolean) to authenticated;
grant execute on function public.worker_update_operation_contact(uuid, text) to authenticated;
grant execute on function public.worker_update_operation_designer(uuid, uuid) to authenticated;
grant execute on function public.worker_ensure_operations(uuid, integer) to authenticated;
grant execute on function public.worker_designers() to authenticated;
grant execute on function public.worker_projects(uuid) to authenticated;
