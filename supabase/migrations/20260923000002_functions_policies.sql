create or replace function public.is_dearune_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users au where au.id = auth.uid()
  );
$$;

create or replace function public.is_maintenance_on()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce((select a.maintenance_mode from public.app_settings a where a.id = 1), false)
$$;

create or replace function public.order_stage(order_row public.orders)
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select case
    when order_row.deleted_at is not null then 'deleted'
    when order_row.cancelled_at is not null then 'cancelled'
    when order_row.wrapper_type = 'digital' then
      case
        when exists (select 1 from public.messages m where m.order_id = order_row.id and m.published_at is not null) then 'delivered'
        when order_row.paid_at is not null then 'in-production'
        else 'pending'
      end
    else
      case
        when order_row.arrived_at is not null then 'delivered'
        when order_row.shipped_at is not null then 'shipped'
        when order_row.manufactured_at is not null then 'manufactured'
        when order_row.paid_at is not null then 'in-production'
        else 'pending'
      end
  end
$$;

drop function if exists public.get_public_message(text);

create function public.get_public_message(p_public_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m public.messages%rowtype;
  result jsonb;
  rec record;
  available boolean;
begin
  select * into m from public.messages where public_id = p_public_id;
  if not found then
    return jsonb_build_object('found', false);
  end if;

  select
    case
      when m.published_at is null then false
      when o.cancelled_at is not null then false
      when o.wrapper_type = 'digital' then true
      when o.arrived_at is not null then true
      else false
    end into available
  from public.orders o
  where o.id = m.order_id;

  result := jsonb_build_object(
    'found', true,
    'available', available,
    'public_id', m.public_id,
    'headline', m.headline,
    'body', m.body,
    'signature', m.signature,
    'font_family', m.font_family,
    'layout', m.layout,
    'order', (
      select jsonb_build_object(
        'recipient_name', o.recipient_name,
        'occasion', o.occasion,
        'event_date', o.event_date,
        'wrapper_type', o.wrapper_type,
        'template_name', t.name
      )
      from public.orders o
      join public.templates t on t.id = o.template_id
      where o.id = m.order_id
    )
  );

  if available then
    result := result || jsonb_build_object(
      'media', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', mm.id,
          'kind', mm.kind,
          'r2_key', mm.r2_key,
          'content_type', mm.content_type,
          'original_name', mm.original_name,
          'position', mm.position
        ) order by mm.position asc)
        from public.message_media mm
        where mm.message_id = m.id and mm.disabled_at is null
      ), '[]'::jsonb)
    );
  end if;

  return result;
end;
$$;

revoke all on function public.get_public_message(text) from public;
revoke all on function public.get_public_message(text) from anon;
revoke all on function public.get_public_message(text) from authenticated;

grant execute on function public.is_dearune_admin() to authenticated;
grant execute on function public.is_maintenance_on() to authenticated;

create policy "admin_users_admin_all" on public.admin_users
  for all to authenticated using (public.is_dearune_admin());

create policy "admins_manage_designers" on public.designers
  for all to authenticated using (public.is_dearune_admin());

create policy "admins_read_templates" on public.templates
  for select to authenticated using (public.is_dearune_admin());
create policy "admins_write_templates" on public.templates
  for insert to authenticated with check (public.is_dearune_admin());
create policy "admins_update_templates" on public.templates
  for update to authenticated using (public.is_dearune_admin());

create policy "admins_read_pricing" on public.template_pricing
  for select to authenticated using (public.is_dearune_admin());
create policy "admins_write_pricing" on public.template_pricing
  for all to authenticated using (public.is_dearune_admin()) with check (public.is_dearune_admin());

create policy "admins_read_orders" on public.orders
  for select to authenticated using (public.is_dearune_admin());
create policy "admins_write_orders" on public.orders
  for all to authenticated using (public.is_dearune_admin()) with check (public.is_dearune_admin());

create policy "admins_read_messages" on public.messages
  for select to authenticated using (public.is_dearune_admin());
create policy "admins_write_messages" on public.messages
  for all to authenticated using (public.is_dearune_admin()) with check (public.is_dearune_admin());

create policy "admins_read_media" on public.message_media
  for select to authenticated using (public.is_dearune_admin());
create policy "admins_write_media" on public.message_media
  for all to authenticated using (public.is_dearune_admin()) with check (public.is_dearune_admin());

create policy "admins_read_shipping" on public.shipping
  for select to authenticated using (public.is_dearune_admin());
create policy "admins_write_shipping" on public.shipping
  for all to authenticated using (public.is_dearune_admin()) with check (public.is_dearune_admin());

create policy "admins_read_settings" on public.app_settings
  for select to authenticated using (public.is_dearune_admin());
create policy "admins_update_settings" on public.app_settings
  for update to authenticated using (public.is_dearune_admin());

create policy "admins_read_events" on public.order_events
  for select to authenticated using (public.is_dearune_admin());
create policy "admins_write_events" on public.order_events
  for insert to authenticated with check (public.is_dearune_admin());

create trigger designers_set_updated_at before update on public.designers
  for each row execute function public.set_updated_at();

create trigger templates_set_updated_at before update on public.templates
  for each row execute function public.set_updated_at();

create trigger template_pricing_set_updated_at before update on public.template_pricing
  for each row execute function public.set_updated_at();

create trigger orders_set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

create trigger messages_set_updated_at before update on public.messages
  for each row execute function public.set_updated_at();

create trigger shipping_set_updated_at before update on public.shipping
  for each row execute function public.set_updated_at();

create trigger app_settings_set_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();