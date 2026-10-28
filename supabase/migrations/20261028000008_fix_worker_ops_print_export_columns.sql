-- ============================================================================
-- Fix: worker_operations_print / worker_export_operations - guard milestone column access
-- ============================================================================
-- These functions reference milestone columns (delivered_at, shipped_at,
-- manufacturing_completed_at, sold_at) that were added in
-- 20261025000001_remove_operations_status_milestones.sql. This migration
-- updates both functions to safely check for column existence before access.
-- ============================================================================

-- 1. Fix worker_operations_print
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
          when to_jsonb(pp) ? 'delivered_at' and pp.delivered_at is not null then 'delivered'
          when to_jsonb(pp) ? 'shipped_at' and pp.shipped_at is not null then 'shipped'
          when to_jsonb(pp) ? 'manufacturing_completed_at' and pp.manufacturing_completed_at is not null then 'manufactured'
          when to_jsonb(pp) ? 'sold_at' and pp.sold_at is not null then 'sold'
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

-- 2. Fix worker_export_operations
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
          when to_jsonb(pp) ? 'delivered_at' and pp.delivered_at is not null then 'delivered'
          when to_jsonb(pp) ? 'shipped_at' and pp.shipped_at is not null then 'shipped'
          when to_jsonb(pp) ? 'manufacturing_completed_at' and pp.manufacturing_completed_at is not null then 'manufactured'
          when to_jsonb(pp) ? 'sold_at' and pp.sold_at is not null then 'sold'
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