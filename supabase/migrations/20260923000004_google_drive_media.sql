-- Google Drive media model
-- Replaces the R2 object-storage columns on message_media with Drive file records,
-- adds message activation + opening analytics, and refreshes the public RPC.

alter table public.message_media
  add column if not exists media_type text,
  add column if not exists drive_file_id text,
  add column if not exists mime_type text,
  add column if not exists original_filename text,
  add column if not exists sort_order integer not null default 0;

update public.message_media
  set media_type = kind
  where media_type is null and kind is not null;

update public.message_media
  set mime_type = content_type
  where mime_type is null and content_type is not null;

update public.message_media
  set original_filename = original_name
  where original_filename is null and original_name is not null;

update public.message_media
  set sort_order = position
  where sort_order = 0 and position is not null and position <> 0;

alter table public.message_media
  alter column media_type set not null,
  alter column drive_file_id set not null;

alter table public.message_media
  drop column if exists kind,
  drop column if exists bucket,
  drop column if exists r2_key,
  drop column if exists content_type,
  drop column if exists original_name,
  drop column if exists position;

alter table public.message_media
  add constraint message_media_media_type_check check (media_type in ('image', 'audio', 'video', 'file'));

create index if not exists message_media_drive_file_id_idx on public.message_media (drive_file_id);
create index if not exists message_media_sort_order_idx on public.message_media (message_id, sort_order);

-- Message activation + opening analytics
alter table public.messages
  add column if not exists message_active boolean not null default true,
  add column if not exists open_count integer not null default 0,
  add column if not exists first_opened_at timestamptz,
  add column if not exists drive_folders jsonb not null default '{}'::jsonb;

create index if not exists messages_message_active_idx on public.messages (message_active);

-- Allocate a collision-free public id (DL + 9 unambigous base62 chars)
create or replace function public.allocate_message_public_id()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  out_id text;
  charset constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  for attempt in 1..40 loop
    out_id := 'DL';
    for i in 1..9 loop
      out_id := out_id || substr(charset, 1 + floor(random() * length(charset))::int, 1);
    end loop;
    perform 1 from public.messages where public_id = out_id;
    if not found then
      return out_id;
    end if;
  end loop;
  raise exception 'Could not allocate a unique public id';
end;
$$;

revoke all on function public.allocate_message_public_id() from public, anon;
grant execute on function public.allocate_message_public_id() to authenticated;

-- Public message lookup. availability requires:
--   message_active AND published AND not cancelled AND (digital OR arrived).
-- p_bump increments open_count only on a genuine reader open (admin preview must not bump).
drop function if exists public.get_public_message(text);
drop function if exists public.get_public_message(text, boolean);

create function public.get_public_message(p_public_id text, p_bump boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  m public.messages%rowtype;
  available boolean;
  result jsonb;
begin
  select * into m from public.messages where public_id = p_public_id;
  if not found then
    return jsonb_build_object('found', false);
  end if;

  select
    case
      when m.published_at is null then false
      when m.message_active = false then false
      when o.cancelled_at is not null then false
      when o.wrapper_type = 'digital' then true
      when o.arrived_at is not null then true
      else false
    end into available
  from public.orders o
  where o.id = m.order_id;

  if available and p_bump then
    update public.messages
      set open_count = open_count + 1,
          first_opened_at = coalesce(first_opened_at, now())
    where id = m.id;
    m.open_count := m.open_count + 1;
    m.first_opened_at := coalesce(m.first_opened_at, now());
  end if;

  result := jsonb_build_object(
    'found', true,
    'available', available,
    'message_active', m.message_active,
    'open_count', m.open_count,
    'first_opened_at', m.first_opened_at,
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
          'media_type', mm.media_type,
          'mime_type', mm.mime_type,
          'original_filename', mm.original_filename,
          'size_bytes', mm.size_bytes,
          'drive_file_id', mm.drive_file_id,
          'sort_order', mm.sort_order
        ) order by mm.sort_order asc)
        from public.message_media mm
        where mm.message_id = m.id and mm.disabled_at is null
      ), '[]'::jsonb)
    );
  end if;

  return result;
end;
$$;

revoke all on function public.get_public_message(text, boolean) from public;
revoke all on function public.get_public_message(text, boolean) from anon;
revoke all on function public.get_public_message(text, boolean) from authenticated;

grant execute on function public.get_public_message(text, boolean) to anon;
grant execute on function public.get_public_message(text, boolean) to authenticated;