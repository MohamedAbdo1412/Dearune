-- ============================================================================
-- Fix: worker_qa_lookup - guard milestone column access
-- ============================================================================
-- The worker_qa_lookup function references milestone columns (delivered_at,
-- shipped_at, manufacturing_completed_at, sold_at) that were added in
-- 20261025000001_remove_operations_status_milestones.sql. This migration
-- updates the function to safely check for column existence before access.
-- ============================================================================

create or replace function public.worker_qa_lookup(
  p_public_id text,
  p_token text default ''
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker   uuid := public.current_worker_id();
  v_public   text := lower(btrim(coalesce(p_public_id, '')));
  v_token    text := lower(btrim(coalesce(p_token, '')));
  v_project  public.projects%rowtype;
  v_verified boolean;
  v_units    jsonb;
  v_shipping jsonb;
  v_designer jsonb;
  v_template jsonb;
  v_events   jsonb;
  v_unit_events jsonb;
begin
  if v_worker is null then
    raise exception 'worker.inactive_or_unknown' using errcode = '42501';
  end if;
  if not public.worker_has_permission('qa.view') then
    raise exception 'worker.forbidden' using errcode = '42501';
  end if;
  if v_public !~ '^[0-9a-f]{16,64}$' then
    raise exception 'qa.invalid_public_id' using errcode = '22023';
  end if;
  if v_token <> '' and v_token !~ '^[0-9a-f]{16,128}$' then
    raise exception 'qa.invalid_token' using errcode = '22023';
  end if;

  select * into v_project from public.projects where public_id = v_public;
  if not found then
    raise exception 'qa.not_found' using errcode = 'P0002';
  end if;

  if v_token = '' then
    v_verified := null;
  else
    if v_token <> lower(coalesce(v_project.public_token, '')) then
      raise exception 'qa.token_mismatch' using errcode = '55000';
    end if;
    v_verified := true;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
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
    'updated_at', pp.updated_at
  ) order by pp.unit_index), '[]'::jsonb)
  into v_units
  from public.physical_products pp
  where pp.project_id = v_project.id;

  select to_jsonb(s) - 'label_media' into v_shipping
  from public.shipping s
  where s.project_id = v_project.id
  limit 1;

  select jsonb_build_object('id', d.id, 'name', d.name, 'code', d.code)
  into v_designer
  from public.designers d
  where d.id = v_project.designer_id;

  select jsonb_build_object('name', t.name, 'slug', t.slug)
  into v_template
  from public.templates t
  where t.slug = v_project.template_slug;

  select coalesce(jsonb_agg(jsonb_build_object(
    'action', e.action,
    'actorType', e.actor_type,
    'createdAt', e.created_at
  ) order by e.created_at), '[]'::jsonb)
  into v_events
  from public.project_events e
  where e.project_id = v_project.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'action', e.action,
    'actorType', e.actor_type,
    'createdAt', e.created_at
  ) order by e.created_at), '[]'::jsonb)
  into v_unit_events
  from public.physical_product_events e
  join public.physical_products pp on pp.id = e.physical_product_id
  where pp.project_id = v_project.id;

  return jsonb_build_object(
    'publicId', v_project.public_id,
    'tokenVerified', v_verified,
    'verified', coalesce(v_verified, false),
    'project', jsonb_build_object(
      'id', v_project.id,
      'reference', v_project.reference,
      'title', v_project.title,
      'status', v_project.status,
      'public_id', v_project.public_id,
      'wrapper_type', v_project.wrapper_type,
      'template_slug', v_project.template_slug,
      'template_version', v_project.template_version,
      'configured_at', v_project.configured_at,
      'submitted_at', v_project.submitted_at,
      'created_at', v_project.created_at,
      'updated_at', v_project.updated_at,
      'paid_at', v_project.paid_at,
      'manufactured_at', v_project.manufactured_at,
      'shipped_at', v_project.shipped_at,
      'arrived_at', v_project.arrived_at,
      'archived_at', v_project.archived_at,
      'first_activated_at', v_project.first_activated_at,
      'message_active', v_project.message_active,
      'message_protected', coalesce((v_project.payload ->> 'passwordSet')::boolean, false)
    ),
    'designer', v_designer,
    'template', v_template,
    'shipping', v_shipping,
    'units', v_units,
    'events', v_events,
    'unitEvents', v_unit_events
  );
end;
$$;