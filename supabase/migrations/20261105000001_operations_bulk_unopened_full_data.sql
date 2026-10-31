-- ============================================================================
-- Operations round 2: recipient-open tracking, Full Data, manifest exports
-- ============================================================================
--
-- This migration adds THREE things and changes no existing meaning:
--
--   1. ONE authoritative recipient-open signal. `projects.first_activated_at`
--      is the studio switching a Dearune on — it is NOT the recipient opening
--      it, and treating it as an open is exactly the bug this fixes. The new
--      `recipient_opened_at` / `recipient_open_count` pair is written by
--      `record_recipient_open()` from inside the public reader only, and never
--      by a studio preview.
--
--   2. A Full Data projection (`ops_full_data`) with ONE row per Dearune. It is
--      a view over the same `projects` record — never a second order table and
--      never a join that multiplies a row per unit, refund or event.
--
--   3. A `direction` column on `shipment_manifests` so an exported workbook can
--      be recorded with the same traceability the importer already has, without
--      touching `shipping` (an export must never imply "shipped").
--
-- Everything is additive and idempotent: re-running the migration changes
-- nothing. The existing `ops_*` transition functions remain the only writers of
-- `projects.milestone`.

-- ---------------------------------------------------------------------------
-- 1. The recipient-open signal
-- ---------------------------------------------------------------------------
-- Two columns, one meaning each:
--
--   recipient_opened_at   the FIRST time the recipient's own reader rendered
--                         the letter. Never overwritten, never cleared.
--   recipient_open_count  how many times it has rendered for a recipient.
--
-- An open is recorded ONLY when `get_public_project_message` actually returns
-- the letter (available = true, correct token, not password-locked) AND the
-- caller is not a signed-in studio user. Generating a QR, activating a message,
-- publishing it, or opening it in the admin/designer preview are all different
-- facts and none of them writes these columns.
alter table public.projects
  add column if not exists recipient_opened_at timestamptz,
  add column if not exists recipient_open_count integer not null default 0;

comment on column public.projects.recipient_opened_at is
  'First time the RECIPIENT opened the public letter. Written only by record_recipient_open() from the public reader; studio previews never set it. Distinct from first_activated_at (the studio switching the message on).';
comment on column public.projects.recipient_open_count is
  'How many times the recipient reader rendered the letter. Preview/editor/publication are not opens.';

-- The Unopened Messages queue is "active message, never opened". A partial
-- index keeps that queue cheap no matter how many opened rows exist.
create index if not exists projects_unopened_message_idx
  on public.projects (created_at desc)
  where recipient_opened_at is null and message_active = true;

create index if not exists projects_recipient_opened_idx
  on public.projects (recipient_opened_at);

-- The one writer of the recipient-open fact. `p_is_studio` is computed by the
-- caller (a signed-in studio user is a preview, not a recipient), so the rule
-- lives in one place and can be tested without a live JWT.
create or replace function public.record_recipient_open(
  p_public_id  text,
  p_is_studio  boolean default false,
  p_at         timestamptz default null
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.projects;
  v_now     timestamptz := coalesce(p_at, now());
  v_first   boolean;
begin
  if p_is_studio then
    -- An administrator previewing the letter is not a recipient open. Return
    -- the row untouched so callers can still read the current state.
    select * into v_project from public.projects where public_id = p_public_id;
    if not found then
      raise exception 'order.not_found: no Dearune with public id %', p_public_id using errcode = 'P0002';
    end if;
    return v_project;
  end if;

  select * into v_project from public.projects where public_id = p_public_id for update;
  if not found then
    raise exception 'order.not_found: no Dearune with public id %', p_public_id using errcode = 'P0002';
  end if;

  v_first := v_project.recipient_opened_at is null;

  update public.projects
  set recipient_opened_at  = coalesce(recipient_opened_at, v_now),
      recipient_open_count = recipient_open_count + 1
  where id = v_project.id
  returning * into v_project;

  -- Audit the open on the same timeline every other transition uses. The actor
  -- is the recipient (`customer`), never an administrator.
  insert into public.project_events (project_id, actor_type, actor_id, action, detail, created_at)
  values (
    v_project.id,
    'customer',
    null,
    'message.opened',
    jsonb_build_object(
      'public_id', v_project.public_id,
      'first', v_first,
      'open_count', v_project.recipient_open_count,
      'at', v_now
    ),
    v_now
  );

  return v_project;
end;
$$;

-- Backend only: an anonymous client must never be able to invent an open. The
-- public reader reaches it through the SECURITY DEFINER function below.
revoke execute on function public.record_recipient_open(text, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.record_recipient_open(text, boolean, timestamptz) to service_role;

-- Re-declare the public reader so a real recipient read records the open. The
-- `p_password` argument stays accepted for API compatibility exactly as before.
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
  v_studio boolean;
begin
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

  -- A signed-in studio user is previewing. `auth.uid()` is null for the
  -- anonymous recipient reader, which is the only reader that counts.
  v_studio := auth.uid() is not null;
  perform public.record_recipient_open(p_public_id, v_studio);

  result := result || jsonb_build_object(
    'template_slug', p.template_slug,
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
    'order', jsonb_build_object(
      'recipient_name', coalesce(p.title, ''),
      'occasion', '',
      'event_date', null,
      'wrapper_type', p.wrapper_type,
      'template_name', coalesce((select t.name from public.templates t where t.slug = p.template_slug), '')
    ),
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

-- ---------------------------------------------------------------------------
-- 2. Shipment manifests: an export is not an import
-- ---------------------------------------------------------------------------
-- The importer records the carrier's own file. An exported workbook is the
-- studio's own file and needs the same audit trail, but it must never mark a
-- parcel shipped. `direction` keeps the two apart; existing rows are imports.
alter table public.shipment_manifests
  add column if not exists direction text not null default 'import';

alter table public.shipment_manifests
  drop constraint if exists shipment_manifests_direction_ck;
alter table public.shipment_manifests
  add constraint shipment_manifests_direction_ck
  check (direction in ('import', 'export'));

comment on column public.shipment_manifests.direction is
  'import = a carrier file read into the studio. export = a workbook the studio generated (Egypt Post / Bosta). An export never implies shipped.';

create index if not exists shipment_manifests_direction_idx
  on public.shipment_manifests (direction, imported_at desc);

-- Drop the dependent view first so we can recreate ops_orders
drop view if exists public.ops_full_data;

-- ---------------------------------------------------------------------------
-- 3. Operations view: the message facts the queue needs
-- ---------------------------------------------------------------------------
-- `create or replace view` may append columns at the end, so the view keeps its
-- existing contract and gains three facts. No column is renamed or dropped.
create or replace view public.ops_orders
with (security_invoker = true) as
select
  p.id                        as project_id,
  p.reference                 as canonical_id,
  (
    select r.value from public.order_references r
    where r.project_id = p.id and r.kind = 'sold'
    order by r.created_at
    limit 1
  )                           as sold_id,
  p.title,
  p.public_id,
  p.public_token,
  p.wrapper_type,
  (
    coalesce(
      (select wt.kind from public.wrapper_types wt where wt.key = p.wrapper_type),
      p.wrapper_type
    ) = 'digital'
  )                           as is_digital,
  p.template_slug,
  p.sale_price,
  p.currency,
  p.created_at,
  p.milestone::text           as milestone,
  p.milestone_updated_at,
  p.milestone_updated_by,
  p.paid_at,
  p.manufactured_at,
  p.shipped_at,
  p.arrived_at,
  p.archived_at,
  p.message_active,
  coalesce((p.payload ->> 'passwordSet')::boolean, false) as message_protected,
  p.designer_id,
  d.name                      as designer_name,
  d.code                      as designer_code,
  s.id                        as shipping_id,
  s.recipient_name,
  s.phone                     as customer_phone,
  s.recipient_phone_alt,
  s.carrier,
  s.carrier_reference,
  s.tracking_code,
  s.manifest_id,
  s.shipment_state,
  s.shipment_state            as shipment_status,
  s.shipped_at                as shipment_shipped_at,
  s.delivered_at              as shipment_delivered_at,
  s.address_line1,
  s.address_line2,
  s.city,
  s.state_province,
  s.governorate,
  s.district,
  s.postal_code,
  s.country,
  s.special_instructions,
  (select count(*) from public.physical_products pp where pp.project_id = p.id) as unit_count,
  (select min(pp.reference) from public.physical_products pp where pp.project_id = p.id) as unit_reference,
  (select string_agg(r.value, ' ' order by r.value) from public.order_references r where r.project_id = p.id) as search_references,
  (select coalesce(sum(rf.amount), 0) from public.refunds rf where rf.project_id = p.id and rf.status in ('completed', 'manual')) as refunded_amount,
  (select count(*) from public.refunds rf where rf.project_id = p.id) as refund_count,
  q.destination               as qr_destination,
  q.activated                 as qr_activated,
  q.openable                  as qr_openable,
  q.blocked_reason            as qr_blocked_reason,
  p.first_activated_at        as message_activated_at,
  p.recipient_opened_at,
  p.recipient_open_count
from public.projects p
left join public.designers d on d.id = p.designer_id
left join public.shipping s on s.project_id = p.id
cross join lateral public.order_qr_state(
  p.public_id,
  p.public_token,
  p.message_active,
  coalesce((p.payload ->> 'passwordSet')::boolean, false)
) q
where p.milestone >= 'sold'::public.dearune_milestone;

comment on view public.ops_orders is
  'One row per sold Dearune. Making/Shipping/Delivery/After-Sale/Unopened Messages are milestone and message filters on this view — never separate copies of an order.';

revoke all on public.ops_orders from anon;
grant select on public.ops_orders to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Full Data: every administrative column, still one row per order
-- ---------------------------------------------------------------------------
-- `ops_full_data` is a PROJECTION, not a second record. Every column is read
-- from the same `projects` row the rest of Operations uses; aggregate facts
-- (units, refunds, last event) are scalar subqueries so a Dearune with three
-- units and two refunds is still ONE row.
--
-- Secrets are deliberately absent: no `public_token`, no payload, no password
-- material. `public_id` is an identifier, not a credential.
create or replace view public.ops_full_data
with (security_invoker = true) as
select
  o.project_id,
  o.canonical_id,
  o.sold_id,
  o.unit_reference,
  o.search_references,
  o.title,
  o.wrapper_type,
  o.template_slug,
  (select t.name from public.templates t where t.slug = o.template_slug) as template_name,
  o.is_digital,
  o.unit_count,
  o.currency,
  o.sale_price,
  (select p.estimated_cost from public.projects p where p.id = o.project_id) as estimated_cost,
  o.recipient_name,
  o.customer_phone,
  o.recipient_phone_alt,
  o.address_line1,
  o.address_line2,
  o.city,
  o.state_province,
  o.governorate,
  o.district,
  o.postal_code,
  o.country,
  o.special_instructions,
  o.designer_id,
  o.designer_name,
  o.designer_code,
  o.message_active,
  o.message_protected,
  o.message_activated_at,
  o.recipient_opened_at,
  o.recipient_open_count,
  o.milestone,
  o.milestone_updated_at,
  (select au.display_name from public.admin_users au where au.id = o.milestone_updated_by) as milestone_updated_by_name,
  o.paid_at,
  o.manufactured_at,
  o.shipped_at,
  o.arrived_at,
  o.archived_at,
  o.created_at,
  (select p.updated_at from public.projects p where p.id = o.project_id) as updated_at,
  (select p.submitted_at from public.projects p where p.id = o.project_id) as submitted_at,
  (select p.configured_at from public.projects p where p.id = o.project_id) as configured_at,
  (select p.policy_version from public.projects p where p.id = o.project_id) as policy_version,
  (select p.template_version from public.projects p where p.id = o.project_id) as template_version,
  (select max(e.created_at) from public.project_events e where e.project_id = o.project_id) as last_event_at,
  (select e.action from public.project_events e
     where e.project_id = o.project_id
     order by e.created_at desc limit 1) as last_event_action,
  o.refunded_amount,
  o.refund_count,
  o.qr_destination,
  o.qr_activated,
  o.qr_openable,
  o.qr_blocked_reason,
  o.carrier,
  o.carrier_reference,
  o.tracking_code,
  o.manifest_id,
  (select m.filename from public.shipment_manifests m where m.id = o.manifest_id) as manifest_filename,
  o.shipment_state,
  o.shipment_shipped_at,
  o.shipment_delivered_at
from public.ops_orders o;

comment on view public.ops_full_data is
  'Administrative projection of ONE Dearune per row. Aggregates are scalar subqueries (no fan-out) and secrets (public_token, payload) are never exposed.';

revoke all on public.ops_full_data from anon;
grant select on public.ops_full_data to authenticated;

-- Sorting and filtering Full Data must not fall back to a sequential scan.
create index if not exists projects_canonical_sort_idx on public.projects (reference);
create index if not exists projects_milestone_created_idx on public.projects (milestone, created_at desc);
create index if not exists projects_paid_at_idx on public.projects (paid_at desc);
create index if not exists projects_archived_idx on public.projects (archived_at);
create index if not exists project_events_project_recent_idx on public.project_events (project_id, created_at desc);
