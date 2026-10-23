-- ============================================================================
-- Ensure archived Dearune messages are visible in Designers context
-- ============================================================================

-- The projects table already stores archived_at. Admin/developer queries
-- that fetch Dearunes for a designer must include archived rows. The
-- frontend already does this; this migration ensures helper functions
-- don't accidentally filter them out.

-- Add helper to fetch designer messages including archived
create or replace function public.fetch_designer_messages(p_designer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_dearune_admin() then
    raise exception 'forbidden';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'reference', p.reference,
    'title', p.title,
    'status', p.status,
    'public_id', p.public_id,
    'wrapper_type', p.wrapper_type,
    'template_slug', p.template_slug,
    'submitted_at', p.submitted_at,
    'created_at', p.created_at,
    'updated_at', p.updated_at,
    'configured_at', p.configured_at,
    'paid_at', p.paid_at,
    'manufactured_at', p.manufactured_at,
    'shipped_at', p.shipped_at,
    'arrived_at', p.arrived_at,
    'archived_at', p.archived_at,
    'first_activated_at', p.first_activated_at,
    'message_active', p.message_active
  ) order by p.created_at desc), '[]'::jsonb)
  into v_result
  from public.projects p
  where p.designer_id = p_designer_id;

  return v_result;
end;
$$;

revoke execute on function public.fetch_designer_messages(uuid) from public, anon, authenticated;
grant execute on function public.fetch_designer_messages(uuid) to authenticated;
