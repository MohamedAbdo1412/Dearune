-- ============================================================================
-- Worker Operations reads: rebuilt for the milestone schema
-- ============================================================================
--
-- Migration 20261025000001 removed the generic Operations `status` column
-- (and `on_hold_reason` / `cancelled_reason`) from `physical_products` and
-- replaced them with explicit milestones (`sold_at`,
-- `manufacturing_completed_at`, `shipped_at`, `delivered_at`).
--
-- The worker read functions below still selected the dropped columns, so any
-- worker screen that calls them errors against the current schema:
--
--   * `worker_operations_units` — the Worker Operations list (called on load)
--   * `worker_operations_print` — the Worker print payload
--   * `worker_export_operations` — the Worker operations CSV export
--
-- This forward-only migration recreates them against the current schema:
-- status is derived from the milestone timestamps, no money or letter
-- payload is ever returned, and the public token appears only in the
-- dedicated print payload (gated by its own `operations.print` permission).
-- A `wrapper_name` lookup joins the catalog so the worker UIs display the
-- wrapper's actual name instead of a raw key.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Operations: the safe list (milestones, not status)
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
        'status', case
          when pp.delivered_at is not null then 'delivered'
          when pp.shipped_at is not null then 'shipped'
          when pp.manufacturing_completed_at is not null then 'manufactured'
          when pp.sold_at is not null then 'sold'
          else 'pending'
        end,
        'sold_at', pp.sold_at,
        'manufacturing_completed_at', pp.manufacturing_completed_at,
        'shipped_at', pp.shipped_at,
        'delivered_at', pp.delivered_at,
        'notes', pp.notes,
        'archived_at', pp.archived_at,
        'created_at', pp.created_at,
        'updated_at', pp.updated_at,
        'project_id', p.id,
        'project_reference', p.reference,
        'project_title', p.title,
        'public_id', p.public_id,
        'wrapper_type', p.wrapper_type,
        'wrapper_name', coalesce(wt.name, p.wrapper_type),
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
    left join public.wrapper_types wt on wt.key = p.wrapper_type
    left join public.designers d on d.id = p.designer_id
    left join public.shipping s on s.project_id = p.id
    where p_include_archived or pp.archived_at is null
    order by pp.created_at desc
    limit 500
  ) units;

  return v_rows;
end;
$$;

grant execute on function public.worker_operations_units(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Print payload (public token included, print permission gated)
-- ---------------------------------------------------------------------------
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
        'sold_at', pp.sold_at,
        'manufacturing_completed_at', pp.manufacturing_completed_at,
        'shipped_at', pp.shipped_at,
        'delivered_at', pp.delivered_at,
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
        'wrapper_name', coalesce(wt.name, p.wrapper_type),
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
    left join public.wrapper_types wt on wt.key = p.wrapper_type
    left join public.designers d on d.id = p.designer_id
    left join public.shipping s on s.project_id = p.id
    where p_product_ids is null or pp.id = any(p_product_ids)
    order by pp.created_at asc
    limit 200
  ) units;

  return v_rows;
end;
$$;

grant execute on function public.worker_operations_print(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Export payload (safe columns only, no token)
-- ---------------------------------------------------------------------------
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
        'sold_at', pp.sold_at,
        'manufacturing_completed_at', pp.manufacturing_completed_at,
        'shipped_at', pp.shipped_at,
        'delivered_at', pp.delivered_at,
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

grant execute on function public.worker_export_operations(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Clean up the ambiguous function overload
-- ---------------------------------------------------------------------------
--
-- Migration 20261025000001 recreated `ensure_physical_products` without its
-- `status` parameter but never dropped the old four-argument overload. A
-- three-argument call like `ensure_physical_products($1, $2, null)` is now
-- ambiguous, which breaks every caller that goes through the defaulted
-- signature. Drop the old overload outright — units are never created with
-- a status anymore, so nothing valid depended on it.
drop function if exists public.ensure_physical_products(uuid, integer, uuid, public.physical_product_status);

-- ---------------------------------------------------------------------------
-- 4. Designers: their Dearunes, with the wrapper's actual name
-- ---------------------------------------------------------------------------
-- `worker_projects` (20261023000002) returned `wrapper_type` only. The worker
-- detail screen displays the wrapper's name, so resolve it through the
-- catalog here instead of making the screen guess from a raw key.
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
    'wrapper_name', coalesce(wt.name, p.wrapper_type),
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
    select p.*
    from public.projects p
    left join public.wrapper_types wt on wt.key = p.wrapper_type
    where p_designer_id is null or p.designer_id = p_designer_id
    order by p.created_at desc
    limit 300
  ) p;

  return v_rows;
end;
$$;

grant execute on function public.worker_projects(uuid) to authenticated;
