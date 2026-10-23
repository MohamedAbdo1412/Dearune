-- Forward-only: allow workers with operations.assign to change designer
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
  v_worker uuid := public.current_worker_id();
  v_designer public.designers%rowtype;
begin
  if v_worker is null then
    raise exception 'worker.inactive_or_unknown' using errcode = '42501';
  end if;
  if not public.worker_has_permission('operations.view')
     or not (public.worker_has_permission('operations.edit') or public.worker_has_permission('operations.assign')) then
    raise exception 'worker.forbidden' using errcode = '42501';
  end if;
  if p_designer_id is null then
    raise exception 'designer.required' using errcode = '22023';
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

  return jsonb_build_object('projectId', p_project_id, 'designerId', p_designer_id);
end;
$$;

revoke all on function public.worker_update_operation_designer(uuid, uuid) from public, anon, authenticated;
grant execute on function public.worker_update_operation_designer(uuid, uuid) to authenticated;
