-- ---------------------------------------------------------------------------
-- The External Link To Dearune paper — the destination its printed QR opens
-- ---------------------------------------------------------------------------
-- The QR itself is unchanged (see `qrContent` / `publicMessageUrl`): every
-- printed code still opens Dearune's own resolver at /message/:publicId?token=…
-- so no physical unit can ever be turned into a link to an arbitrary URL, and
-- no already-printed card has to be replaced.
--
-- This migration only teaches the EXISTING project resolver to hand the saved
-- destination back to the public reader. `payload.destinationUrl` is written
-- once, at submission, by `designer-projects` after the same validation the
-- preview used (absolute http/https, no credentials, no private host). A row
-- without a destination still resolves exactly as before, and every other
-- paper's payload is returned untouched.
--
-- Nothing about the reader's availability rules changes: a project is still
-- only published when it is active, its own public token matches, and it is
-- not password-protected (publishing a locked letter here would silently strip
-- the lock the designer asked for).
--
-- The third argument `p_password` is accepted for API compatibility with the
-- reader (it has always passed it); it is intentionally not used to open a
-- password-protected project yet.

-- The previous signature took two arguments. Replace it rather than keeping
-- both: with a defaulted third argument, two overloads would make a two-arg
-- call ambiguous.
drop function if exists public.get_public_project_message(text, text);

create or replace function public.get_public_project_message(
  p_public_id text,
  p_token text default '',
  p_password text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p       public.projects%rowtype;
  payload jsonb;
  available boolean;
  result  jsonb;
begin
  -- `p_password` is accepted for API compatibility only; see the note above.
  perform p_password;

  select * into p from public.projects where public_id = p_public_id;
  if not found then
    return jsonb_build_object('found', false);
  end if;

  payload := coalesce(p.payload, '{}'::jsonb);
  available := coalesce(p.message_active, false)
    and coalesce((payload->>'passwordSet')::boolean, false) = false
    and p.public_token is not null
    and p.public_token <> ''
    and p.public_token = coalesce(nullif(p_token, ''), '');

  result := jsonb_build_object(
    'found', true,
    'available', available,
    'public_id', p.public_id,
    'source', 'project',
    'language', coalesce(payload->>'language', 'en')
  );

  if not available then
    return result;
  end if;

  result := result || jsonb_build_object(
    -- The reader needs the paper to know whether this is a letter to draw or
    -- a destination to forward to.
    'template_slug', p.template_slug,
    -- Only an `external-link` project has a destination, and only a printable
    -- one is ever returned: absolute http(s), short enough to print. The value
    -- comes from the SAVED row — never from anything supplied at scan time.
    'destination', case
      when p.template_slug = 'external-link'
        and coalesce(payload->>'destinationUrl', '') ~* '^https?://'
        and length(payload->>'destinationUrl') <= 2048
      then payload->>'destinationUrl'
      else null
    end,
    'headline', coalesce(payload->>'greeting', ''),
    'body', coalesce(payload->>'body', ''),
    'signature', coalesce(payload->>'senderName', ''),
    'font_family', '',
    'layout', '',
    -- The legacy reader prints a recipient line; a project keeps the
    -- recipient in its own title, so it is handed over the same way.
    'order', jsonb_build_object(
      'recipient_name', coalesce(p.title, ''),
      'occasion', '',
      'event_date', null,
      'wrapper_type', p.wrapper_type,
      'template_name', coalesce((select t.name from public.templates t where t.slug = p.template_slug), '')
    ),
    -- `path` is a private-bucket object path: the reader turns it into a URL
    -- through `project-media`, which re-checks this same token, so the raw
    -- path alone can never be used to fetch anything.
    'media', (
      select coalesce(jsonb_agg(item), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'id', ph->>'path',
          'media_type', case when coalesce(ph->>'mimeType', '') like 'image/%' then 'image' else 'file' end,
          'original_filename', coalesce(ph->>'originalName', ''),
          'path', ph->>'path'
        ) as item
        from jsonb_array_elements(coalesce(payload->'photos', '[]'::jsonb)) ph
        where ph->>'path' is not null
        union all
        select jsonb_build_object(
          'id', payload->'audio'->>'path',
          'media_type', 'audio',
          'original_filename', coalesce(payload->'audio'->>'originalName', ''),
          'path', payload->'audio'->>'path'
        )
        where payload->'audio'->>'path' is not null
      ) rows
    )
  );

  return result;
end;
$$;

revoke execute on function public.get_public_project_message(text, text, text) from public, anon;
grant  execute on function public.get_public_project_message(text, text, text) to anon, authenticated;
