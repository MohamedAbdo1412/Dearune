-- ============================================================================
-- Fix: worker_projects function missing FROM-clause entry for table "wt"
-- ============================================================================
--
-- Migration 20261025000007 recreated `worker_projects` with a subquery that
-- selects only `p.*` but the outer query references `wt.name`. This causes
-- "missing FROM-clause entry for table wt" at runtime.
--
-- This forward-only migration fixes the subquery to include `wt.name as wt_name`
-- so the outer query can reference it via `p.wt_name`.
-- ============================================================================

-- Fix worker_projects: include wrapper_types join in the subquery SELECT
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
    'wrapper_name', coalesce(p.wt_name, p.wrapper_type),
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
    select p.*, wt.name as wt_name
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