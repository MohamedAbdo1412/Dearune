-- ============================================================================
-- Worker Operations / Designers parity: detail, timeline, print and export
-- ============================================================================
-- Forward-only. These functions add the read paths the Worker Dashboard needs
-- to match the admin workflows without ever granting a worker SELECT on
-- `projects`, `sales_log`, `template_pricing` or `wrapper_types`.
--
-- Every function resolves the caller with `current_worker_id()` (which is
-- active-only) and checks the exact live permission. Responses are built as
-- JSON with an explicit field list, so PostgREST cannot widen them.

-- ---------------------------------------------------------------------------
-- 1. One unit's timeline (Operations → detail panel)
-- ---------------------------------------------------------------------------
create or replace function public.worker_operation_events(p_product_id uuid)
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
  if not public.worker_has_permission('operations.view')
     or not public.worker_has_permission('operations.view_details') then
    raise exception 'worker.forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.physical_products where id = p_product_id) then
    raise exception 'operations.not_found' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'action', e.action,
    'actorType', e.actor_type,
    'detail', e.detail,
    'createdAt', e.created_at
  ) order by e.created_at asc), '[]'::jsonb)
  into v_rows
  from public.physical_product_events e
  where e.physical_product_id = p_product_id;

  return v_rows;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Print payload (Operations → print production papers)
-- ---------------------------------------------------------------------------
-- The public token is needed to print a verifiable QR, so this path is gated
-- by its own `operations.print` permission in addition to `operations.view`.
-- It returns only the fields the paper generator reads.
create or replace function public.worker_operations_print(p_product_ids uuid[] default null)
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
  if not public.worker_has_permission('operations.view')
     or not public.worker_has_permission('operations.print') then
    raise exception 'worker.forbidden' using errcode = '42501';
  end if;
  if p_product_ids is not null and coalesce(array_length(p_product_ids, 1), 0) > 200 then
    raise exception 'operations.selection_too_large' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(row_json order by created_at asc), '[]'::jsonb)
  into v_rows
  from (
    select
      pp.created_at,
      jsonb_build_object(
        'id', pp.id,
        'reference', pp.reference,
        'unit_index', pp.unit_index,
        'status', case
          when pp.delivered_at is not null then 'delivered'
          when pp.shipped_at is not null then 'shipped'
          when pp.manufacturing_completed_at is not null then 'manufactured'
          when pp.sold_at is not null then 'sold'
          else 'pending'
        end,
        'notes', pp.notes,
        'archived_at', pp.archived_at,
        'created_at', pp.created_at,
        'updated_at', pp.updated_at,
        'project_id', p.id,
        'project_reference', p.reference,
        'project_title', p.title,
        'public_id', p.public_id,
        'public_token', p.public_token,
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
    where p_product_ids is null or pp.id = any(p_product_ids)
    order by pp.created_at asc
    limit 200
  ) units;

  return v_rows;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Export payload (Operations → CSV)
-- ---------------------------------------------------------------------------
-- Same safe columns as the list (no public token), gated by `operations.export`
-- so a worker cannot download a wider dataset than the screen shows.
create or replace function public.worker_export_operations(p_include_archived boolean default false)
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
  if not public.worker_has_permission('operations.view')
     or not public.worker_has_permission('operations.export') then
    raise exception 'worker.forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_json order by created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select
      pp.created_at,
      jsonb_build_object(
        'reference', pp.reference,
        'unit_index', pp.unit_index,
        'status', case
          when pp.delivered_at is not null then 'delivered'
          when pp.shipped_at is not null then 'shipped'
          when pp.manufacturing_completed_at is not null then 'manufactured'
          when pp.sold_at is not null then 'sold'
          else 'pending'
        end,
        'archived_at', pp.archived_at,
        'created_at', pp.created_at,
        'updated_at', pp.updated_at,
        'project_reference', p.reference,
        'project_title', p.title,
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
        'notes', pp.notes
      ) as row_json
    from public.physical_products pp
    join public.projects p on p.id = pp.project_id
    left join public.designers d on d.id = p.designer_id
    left join public.shipping s on s.project_id = p.id
    where p_include_archived or pp.archived_at is null
    order by pp.created_at desc
    limit 5000
  ) units;

  return v_rows;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Designer detail (Designers → one designer page)
-- ---------------------------------------------------------------------------
-- Returns the directory row plus the safe project list and recent project
-- activity. No sale price, cost, profit or letter payload is present.
create or replace function public.worker_designer_detail(p_designer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_designer jsonb;
  v_projects jsonb;
  v_events   jsonb;
begin
  if public.current_worker_id() is null then
    raise exception 'worker.inactive_or_unknown' using errcode = '42501';
  end if;
  if not public.worker_has_permission('designers.view')
     or not public.worker_has_permission('designers.view_details') then
    raise exception 'worker.forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', d.id,
    'name', d.name,
    'code', d.code,
    'revokedAt', d.revoked_at,
    'lastLoginAt', d.last_login_at,
    'createdAt', d.created_at,
    'updatedAt', d.updated_at,
    'projectCount', (select count(*)::integer from public.projects p where p.designer_id = d.id),
    'unpaidProjectCount', (
      select count(*)::integer from public.projects p
      where p.designer_id = d.id
        and p.paid_at is null
        and p.archived_at is null
    ),
    'inStudioCount', (
      select count(*)::integer from public.projects p
      where p.designer_id = d.id
        and p.paid_at is not null
        and p.arrived_at is null
        and p.wrapper_type <> 'digital'
        and p.archived_at is null
    )
  )
  into v_designer
  from public.designers d
  where d.id = p_designer_id;

  if v_designer is null then
    raise exception 'designer.not_found' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', recent.id,
    'reference', recent.reference,
    'title', recent.title,
    'status', recent.status,
    'template_slug', recent.template_slug,
    'wrapper_type', recent.wrapper_type,
    'public_id', recent.public_id,
    'configured_at', recent.configured_at,
    'submitted_at', recent.submitted_at,
    'created_at', recent.created_at,
    'updated_at', recent.updated_at,
    'manufactured_at', recent.manufactured_at,
    'shipped_at', recent.shipped_at,
    'arrived_at', recent.arrived_at,
    'archived_at', recent.archived_at,
    'first_activated_at', recent.first_activated_at,
    'message_active', recent.message_active
  ) order by recent.created_at desc), '[]'::jsonb)
  into v_projects
  from (
    select p.id, p.reference, p.title, p.status, p.template_slug, p.wrapper_type,
           p.public_id, p.configured_at, p.submitted_at, p.created_at, p.updated_at,
           p.manufactured_at, p.shipped_at, p.arrived_at, p.archived_at,
           p.first_activated_at, p.message_active
    from public.projects p
    where p.designer_id = p_designer_id
    order by p.created_at desc
    limit 300
  ) recent;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'projectId', e.project_id,
    'action', e.action,
    'actorType', e.actor_type,
    'createdAt', e.created_at
  ) order by e.created_at desc), '[]'::jsonb)
  into v_events
  from (
    select e.*
    from public.project_events e
    join public.projects p on p.id = e.project_id
    where p.designer_id = p_designer_id
    order by e.created_at desc
    limit 100
  ) e;

  return jsonb_build_object(
    'designer', v_designer,
    'projects', v_projects,
    'events', v_events
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Designers offered in the Operations assignment dialog
-- ---------------------------------------------------------------------------
-- Assigning a unit is an Operations capability. It must not require the
-- separate `designers.view` directory permission just to populate a picker,
-- so this returns only the minimum identity fields to the assign action.
create or replace function public.worker_assignable_designers()
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
  if not public.worker_has_permission('operations.view')
     or not (
       public.worker_has_permission('operations.edit')
       or public.worker_has_permission('operations.assign')
     ) then
    raise exception 'worker.forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'name', d.name,
    'code', d.code
  ) order by d.name asc), '[]'::jsonb)
  into v_rows
  from public.designers d
  where d.revoked_at is null;

  return v_rows;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Shipping manifest export (Designers → Shipping CSV)
-- ---------------------------------------------------------------------------
-- The admin's Designers screen exports delivery details, never money. The same
-- safe fields are assembled here, gated by the separate `designers.export`
-- capability. Template and wrapper are returned as their stable keys; the
-- worker has no catalog/pricing read.
create or replace function public.worker_export_shipments()
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
  if not public.worker_has_permission('designers.view')
     or not public.worker_has_permission('designers.export') then
    raise exception 'worker.forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_json order by created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select
      p.created_at,
      jsonb_build_object(
        'reference', coalesce(p.reference, p.id::text),
        'title', p.title,
        'template_slug', p.template_slug,
        'wrapper_type', p.wrapper_type,
        'paid_at', p.paid_at,
        'manufactured_at', p.manufactured_at,
        'shipped_at', p.shipped_at,
        'arrived_at', p.arrived_at,
        'archived_at', p.archived_at,
        'message_active', p.message_active,
        'recipient_name', s.recipient_name,
        'address_line1', s.address_line1,
        'address_line2', s.address_line2,
        'city', s.city,
        'state_province', s.state_province,
        'postal_code', s.postal_code,
        'country', s.country,
        'phone', s.phone,
        'special_instructions', s.special_instructions,
        'tracking_code', s.tracking_code
      ) as row_json
    from public.projects p
    join public.shipping s on s.project_id = p.id
    order by p.created_at desc
    limit 5000
  ) shipments;

  return v_rows;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Privileges
-- ---------------------------------------------------------------------------
revoke all on function public.worker_operation_events(uuid) from public, anon, authenticated;
revoke all on function public.worker_operations_print(uuid[]) from public, anon, authenticated;
revoke all on function public.worker_export_operations(boolean) from public, anon, authenticated;
revoke all on function public.worker_designer_detail(uuid) from public, anon, authenticated;
revoke all on function public.worker_assignable_designers() from public, anon, authenticated;
revoke all on function public.worker_export_shipments() from public, anon, authenticated;

grant execute on function public.worker_operation_events(uuid) to authenticated;
grant execute on function public.worker_operations_print(uuid[]) to authenticated;
grant execute on function public.worker_export_operations(boolean) to authenticated;
grant execute on function public.worker_designer_detail(uuid) to authenticated;
grant execute on function public.worker_assignable_designers() to authenticated;
grant execute on function public.worker_export_shipments() to authenticated;
