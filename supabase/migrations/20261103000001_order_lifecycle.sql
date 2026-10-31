-- ============================================================================
-- ONE ORDER, ONE IDENTITY, ONE MILESTONE
-- ============================================================================
--
-- Before this migration the same Dearune was described by three different
-- identifiers and two different stage machines:
--
--   Designer   DR-000021          projects.reference      (sequence + trigger)
--   Operations DR70700000011      physical_products.reference (sequence)
--   Sold as    SOL-DR70700000011  derived in the browser, stored nowhere
--
-- and the stage was *derived* independently in five places from the unit
-- timestamps, while the Designer screen derived its own stage from the project
-- timestamps. Two screens could therefore disagree about where an order was,
-- with no single column to point at.
--
-- This migration settles both questions:
--
--   1. IDENTITY — `projects.reference` is the canonical Dearune id and stays
--      the one the studio quotes. Every other identifier that has ever been
--      used (the physical unit id, the derived Sold As form, the sale ledger
--      reference) is recorded as an ALIAS in `order_references`, so searching
--      by any of them still finds the same record. Nothing is renamed or
--      rewritten; aliases are additive.
--
--   2. MILESTONE — `projects.milestone` is the one authoritative stage. It is
--      an enum on the Designer's own record, so Designer and Operations read
--      the same column. `physical_products` keeps its production stamps
--      (printing / manufacturing detail) but no longer owns a competing stage.
--
-- Every transition is a single transactional RPC (`ops_making_complete`,
-- `ops_ship`, `ops_deliver`, `ops_after_sale`) that moves the project
-- milestone, writes the matching stamps and appends the audit event in one
-- statement batch. A trigger refuses any backwards or skipping move, so a
-- half-finished operation cannot leave conflicting state behind.
--
-- Writes stay behind the `admin-operations` edge function (service role);
-- clients keep a read-only grant and the admin-only RLS policy.
--
-- Idempotent and non-destructive: every block is `if not exists`, every
-- backfill is `where ... is null`, and nothing is deleted.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The one authoritative milestone
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'dearune_milestone' and n.nspname = 'public'
  ) then
    create type public.dearune_milestone as enum (
      'making',     -- in production: printing, QR, assembly, QC
      'shipping',   -- made; waiting for a carrier and a manifest line
      'delivery',   -- handed to Bosta / Egypt Post; on its way
      'delivered',  -- the recipient has it
      'after_sale'  -- post-delivery handling (refund, complaint, correction)
    );
  end if;
end $$;

alter table public.projects
  add column if not exists milestone public.dearune_milestone,
  add column if not exists milestone_updated_at timestamptz,
  add column if not exists milestone_updated_by uuid references public.admin_users (id) on delete set null;

comment on column public.projects.milestone is
  'THE authoritative lifecycle stage of a Dearune. Owned by the Designer record, advanced only by the ops_* transition RPCs, read by every screen. NULL means not in production yet (digital, or unsold).';
comment on column public.projects.milestone_updated_at is
  'When milestone last changed. Written by the transition RPC, never by a client.';
comment on column public.projects.milestone_updated_by is
  'Which administrator performed the last transition.';

-- Backfill from the stamps the studio already trusts. Order matters: the
-- furthest stamp wins, so a shipped order never lands back in Making.
update public.projects
set milestone = (
      case
        when arrived_at is not null then 'delivered'
        when shipped_at is not null then 'delivery'
        when manufactured_at is not null then 'shipping'
        else 'making'
      end
    )::public.dearune_milestone,
    milestone_updated_at = coalesce(arrived_at, shipped_at, manufactured_at, paid_at, now())
where milestone is null
  and coalesce(wrapper_type, '') <> 'digital'
  and (
    paid_at is not null
    or exists (select 1 from public.physical_products pp where pp.project_id = projects.id)
  );

-- A physical unit can exist for a Dearune whose paid stamp was never written
-- (an older sale, or a call that failed part-way). The unit is the evidence.
update public.projects p
set milestone = 'making'::public.dearune_milestone,
    milestone_updated_at = coalesce(p.milestone_updated_at, now())
where p.milestone is null
  and exists (select 1 from public.physical_products pp where pp.project_id = p.id);

-- ---------------------------------------------------------------------------
-- 2. The milestone graph is enforced by the database, not by a screen
-- ---------------------------------------------------------------------------
-- Exactly one order: making → shipping → delivery → delivered → after_sale.
-- A no-op (same value) is allowed so a retried request is harmless; a
-- backwards or skipping move is refused even if a future caller bypasses the
-- edge function.
create or replace function public.projects_milestone_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order text[] := array['making', 'shipping', 'delivery', 'delivered', 'after_sale'];
  v_from  integer;
  v_to    integer;
begin
  if new.milestone is distinct from old.milestone then
    if new.milestone is null then
      raise exception 'milestone.required: a Dearune in the workshop cannot lose its milestone'
        using errcode = '22023';
    end if;

    v_from := coalesce(array_position(v_order, old.milestone::text), 0);
    v_to := array_position(v_order, new.milestone::text);

    if v_to <> v_from + 1 then
      raise exception 'milestone.transition_denied: cannot move % -> %',
        coalesce(old.milestone::text, '(none)'), new.milestone::text
        using errcode = 'P0001';
    end if;

    new.milestone_updated_at := coalesce(new.milestone_updated_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists projects_milestone_guard on public.projects;
create trigger projects_milestone_guard before update on public.projects
  for each row execute function public.projects_milestone_guard();

-- ---------------------------------------------------------------------------
-- 3. order_references — one record, every identifier it has ever had
-- ---------------------------------------------------------------------------
-- `projects.reference` stays the canonical id. The physical unit id
-- (DR + 11 digits), its derived Sold As form (SOL-…) and the sale ledger
-- reference (DR-S-…) are recorded beside it. A value is globally unique, so
-- "which order is this?" always has exactly one answer, and searching a
-- historical reference can never land on two records.
create table if not exists public.order_references (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.projects (id) on delete cascade,
  physical_product_id uuid references public.physical_products (id) on delete cascade,
  kind                text not null check (kind in ('canonical', 'unit', 'sold', 'sale', 'legacy')),
  value               text not null check (length(btrim(value)) > 0),
  note                text,
  created_at          timestamptz not null default now(),

  constraint order_references_value_uq unique (value)
);

comment on table public.order_references is
  'Every identifier of a Dearune: canonical (projects.reference), unit (physical_products.reference), sold (SOL-…), sale ledger (DR-S-…) and imported legacy references. Additive only — historical identifiers are never destroyed.';

create index if not exists order_references_project_idx
  on public.order_references (project_id);
create index if not exists order_references_unit_idx
  on public.order_references (physical_product_id);

-- Backfill, idempotent: `on conflict (value) do nothing` means a re-run adds
-- nothing and two conflicting identities are left for a human to resolve
-- rather than being silently merged.
insert into public.order_references (project_id, kind, value)
select p.id, 'canonical', p.reference
from public.projects p
where p.reference is not null and btrim(p.reference) <> ''
on conflict (value) do nothing;

insert into public.order_references (project_id, physical_product_id, kind, value)
select pp.project_id, pp.id, 'unit', pp.reference
from public.physical_products pp
where btrim(pp.reference) <> ''
on conflict (value) do nothing;

insert into public.order_references (project_id, physical_product_id, kind, value)
select pp.project_id, pp.id, 'sold', 'SOL-' || pp.reference
from public.physical_products pp
where btrim(pp.reference) <> ''
on conflict (value) do nothing;

insert into public.order_references (project_id, kind, value)
select sl.project_id, 'sale', sl.sale_reference
from public.sales_log sl
where sl.project_id is not null
  and btrim(sl.sale_reference) <> ''
on conflict (value) do nothing;

-- Triggers keep the registry complete for records created AFTER this
-- migration. A project always registers its canonical id; a unit always
-- registers its own id and the derived Sold As form. Additive only: a missing
-- alias is added, an existing one is left alone.
create or replace function public.order_reference_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reference is not null and btrim(new.reference) <> '' then
    insert into public.order_references (project_id, kind, value)
    values (new.id, 'canonical', new.reference)
    on conflict (value) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists order_reference_project on public.projects;
create trigger order_reference_project after insert on public.projects
  for each row execute function public.order_reference_project();

create or replace function public.order_reference_unit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reference is not null and btrim(new.reference) <> '' then
    insert into public.order_references (project_id, physical_product_id, kind, value)
    values (new.project_id, new.id, 'unit', new.reference)
    on conflict (value) do nothing;

    insert into public.order_references (project_id, physical_product_id, kind, value)
    values (new.project_id, new.id, 'sold', 'SOL-' || new.reference)
    on conflict (value) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists order_reference_unit on public.physical_products;
create trigger order_reference_unit after insert on public.physical_products
  for each row execute function public.order_reference_unit();

create or replace function public.order_reference_sale()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.project_id is not null and btrim(coalesce(new.sale_reference, '')) <> '' then
    insert into public.order_references (project_id, kind, value)
    values (new.project_id, 'sale', new.sale_reference)
    on conflict (value) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists order_reference_sale on public.sales_log;
create trigger order_reference_sale after insert on public.sales_log
  for each row execute function public.order_reference_sale();


-- `shipping` was already one row per project with tracking as free text and
-- no notion of who carried the parcel. It stays the shipment record; this
-- adds the carrier vocabulary, the manifest link and the operator/timestamp
-- pair. The address columns are not duplicated — they already live here and
-- the manifest maps into them.
alter table public.shipping
  add column if not exists carrier text,
  add column if not exists carrier_reference text,
  add column if not exists manifest_id uuid,
  add column if not exists shipment_state text,
  add column if not exists shipped_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists shipped_by uuid references public.admin_users (id) on delete set null,
  add column if not exists delivered_by uuid references public.admin_users (id) on delete set null;

comment on column public.shipping.carrier is
  'The carrier that actually took the parcel: bosta | egypt_post. Persisted permanently as part of the shipment history.';
comment on column public.shipping.carrier_reference is
  'The carrier-facing reference (Egypt Post Post_Id / Bosta shipment id) when it differs from the human tracking code.';
comment on column public.shipping.shipment_state is
  'awaiting_shipment | shipped | delivered. Mirrors the order milestone for this specific shipment.';
comment on column public.shipping.shipped_by is
  'Administrator who confirmed the hand-off. Audit only — never edited by a screen.';

alter table public.shipping drop constraint if exists shipping_carrier_ck;
alter table public.shipping add constraint shipping_carrier_ck
  check (carrier is null or carrier in ('bosta', 'egypt_post'));

alter table public.shipping drop constraint if exists shipping_state_ck;
alter table public.shipping add constraint shipping_state_ck
  check (shipment_state is null or shipment_state in ('awaiting_shipment', 'shipped', 'delivered'));

create index if not exists shipping_carrier_idx on public.shipping (carrier);
create index if not exists shipping_tracking_idx on public.shipping (tracking_code);
create index if not exists shipping_manifest_idx on public.shipping (manifest_id);

-- Classify what the free-text provider column already says. Conservative:
-- anything unrecognised stays NULL so a human decides, never a guess.
update public.shipping
set carrier = case
    when lower(btrim(provider)) in ('bosta', 'bosta egypt', 'bosta.com') then 'bosta'
    when lower(btrim(provider)) in ('egypt post', 'egyptpost', 'egypt_post', 'post') then 'egypt_post'
    else null
  end
where carrier is null
  and provider is not null;

-- Derive the shipment state from what the stamps say, forward-only.
update public.shipping s
set shipment_state = case
      when p.arrived_at is not null then 'delivered'
      when p.shipped_at is not null then 'shipped'
      when s.tracking_code is not null or s.carrier is not null then 'awaiting_shipment'
      else null
    end,
    shipped_at = coalesce(s.shipped_at, p.shipped_at),
    delivered_at = coalesce(s.delivered_at, p.arrived_at)
from public.projects p
where p.id = s.project_id
  and s.shipment_state is null;

create table if not exists public.shipment_manifests (
  id           uuid primary key default gen_random_uuid(),
  carrier      text not null check (carrier in ('bosta', 'egypt_post')),
  filename     text,
  sheet_name   text,
  row_count    integer not null default 0 check (row_count >= 0),
  imported_by  uuid references public.admin_users (id) on delete set null,
  imported_at  timestamptz not null default now(),
  -- The original workbook rows, exactly as parsed. Never rewritten, so an
  -- import can always be audited or replayed against the carrier's own file.
  snapshot     jsonb not null default '[]'::jsonb,
  notes        text
);

comment on table public.shipment_manifests is
  'One row per imported carrier manifest. `snapshot` keeps the parsed source rows forever so a shipment can be traced back to the document that created it.';

create index if not exists shipment_manifests_carrier_idx
  on public.shipment_manifests (carrier, imported_at desc);

alter table public.shipping drop constraint if exists shipping_manifest_fk;
alter table public.shipping add constraint shipping_manifest_fk
  foreign key (manifest_id) references public.shipment_manifests (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 5. Refunds: recorded, never invented
-- ---------------------------------------------------------------------------
-- There is no payment provider integration in this codebase, so a refund is a
-- RECORD of money returned, not an API call. `manual` is explicit and the UI
-- must never claim the provider moved money. The row still carries who did it,
-- when, why, how much and under which method/reference — which is what an
-- audit needs.
create table if not exists public.refunds (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.projects (id) on delete cascade,
  physical_product_id uuid references public.physical_products (id) on delete set null,
  amount              numeric(12, 2) not null check (amount > 0),
  currency            text not null default 'EGP',
  reason              text not null check (length(btrim(reason)) >= 3),
  status              text not null default 'manual'
                        check (status in ('pending', 'completed', 'failed', 'manual')),
  method              text check (method in ('cash', 'bank_transfer', 'card', 'wallet', 'other')),
  reference           text,
  manual              boolean not null default true,
  idempotency_key     text,
  requested_by        uuid references public.admin_users (id) on delete set null,
  decided_by          uuid references public.admin_users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  completed_at        timestamptz,

  -- A retried request carrying the same key can never create a second refund.
  constraint refunds_idempotency_uq unique (project_id, idempotency_key)
);

comment on table public.refunds is
  'Administrative refund ledger. `manual = true` means the studio recorded the money itself; no payment provider was called.';

create index if not exists refunds_project_idx on public.refunds (project_id, created_at desc);
create index if not exists refunds_status_idx on public.refunds (status, created_at desc);

drop trigger if exists refunds_set_updated_at on public.refunds;
create trigger refunds_set_updated_at before update on public.refunds
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. The single transition mechanism
-- ---------------------------------------------------------------------------
-- `ops_move_milestone` is the ONLY writer of `projects.milestone`. It locks the
-- project row, refuses anything that is not the next step, stamps the
-- matching production timestamp and appends the audit event — one transaction,
-- so a failure cannot leave the milestone and the stamps disagreeing.
create or replace function public.ops_move_milestone(
  p_project_id uuid,
  p_to         text,
  p_actor      uuid,
  p_reason     text default null,
  p_at         timestamptz default null
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project  public.projects;
  v_order    text[] := array['making', 'shipping', 'delivery', 'delivered', 'after_sale'];
  v_from     text;
  v_to       text := nullif(btrim(p_to), '');
  v_from_ix  integer;
  v_to_ix    integer;
  v_now      timestamptz := coalesce(p_at, now());
begin
  select * into v_project
  from public.projects
  where id = p_project_id
  for update;

  if not found then
    raise exception 'order.not_found: no Dearune with id %', p_project_id using errcode = 'P0002';
  end if;

  if v_to is null or not (v_to = any (v_order)) then
    raise exception 'order.unknown_milestone: %', coalesce(p_to, '(null)') using errcode = '22023';
  end if;

  v_from := v_project.milestone::text;
  if v_from is not distinct from v_to then
    return v_project;                       -- already there: a retry is a no-op
  end if;

  v_from_ix := coalesce(array_position(v_order, v_from), 0);
  v_to_ix := array_position(v_order, v_to);
  if v_to_ix <> v_from_ix + 1 then
    raise exception 'order.transition_denied: cannot move % -> %',
      coalesce(v_from, '(none)'), v_to using errcode = 'P0001';
  end if;

  -- `projects_stage_order_check` (20260925000001) requires paid_at before
  -- manufactured_at, manufactured before shipped, shipped before arrived. The
  -- stamps below satisfy that from the milestone itself, but a cost-free move
  -- out of Making would still fail without the sale stamp. Say so plainly
  -- rather than surfacing a raw constraint violation.
  if v_to = 'shipping' and v_project.paid_at is null then
    raise exception 'order.not_paid: record the sale (Paid) before finishing Making'
      using errcode = 'P0001';
  end if;

  update public.projects
  set milestone = v_to::public.dearune_milestone,
      milestone_updated_by = p_actor,
      milestone_updated_at = v_now,
      manufactured_at = case when v_to in ('shipping', 'delivery', 'delivered', 'after_sale')
                             then coalesce(manufactured_at, v_now) else manufactured_at end,
      shipped_at      = case when v_to in ('delivery', 'delivered', 'after_sale')
                             then coalesce(shipped_at, v_now) else shipped_at end,
      arrived_at      = case when v_to in ('delivered', 'after_sale')
                             then coalesce(arrived_at, v_now) else arrived_at end
  where id = p_project_id
  returning * into v_project;

  insert into public.project_events (project_id, actor_type, actor_id, action, detail, created_at)
  values (
    p_project_id,
    'admin',
    p_actor,
    'order.milestone',
    jsonb_build_object('from', v_from, 'to', v_to, 'reason', p_reason, 'at', v_now),
    v_now
  );

  return v_project;
end;
$$;

-- Forward-only walker, used by the legacy Designer stamps (Made / Shipped /
-- Arrived) so those screens move the SAME milestone instead of only writing a
-- timestamp. It never moves backwards and never skips the audit trail: each
-- step goes through `ops_move_milestone`, so every hop is recorded.
create or replace function public.ops_advance_to(
  p_project_id uuid,
  p_to         text,
  p_actor      uuid,
  p_reason     text default null
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order  text[] := array['making', 'shipping', 'delivery', 'delivered', 'after_sale'];
  v_target integer;
  v_step   integer;
  v_now    timestamptz := now();
  v_proj   public.projects;
begin
  select * into v_proj from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'order.not_found: no Dearune with id %', p_project_id using errcode = 'P0002';
  end if;

  -- A project that has not entered the workshop has nothing to advance.
  if v_proj.milestone is null then
    return v_proj;
  end if;

  v_target := array_position(v_order, nullif(btrim(p_to), ''));
  if v_target is null then
    raise exception 'order.unknown_milestone: %', coalesce(p_to, '(null)') using errcode = '22023';
  end if;

  for v_step in (coalesce(array_position(v_order, v_proj.milestone::text), 0) + 1) .. v_target loop
    v_proj := public.ops_move_milestone(p_project_id, v_order[v_step], p_actor, p_reason, v_now);
  end loop;

  return v_proj;
end;
$$;

-- Enter the workshop. A paid physical Dearune has not started production until
-- this runs; it is idempotent and refuses to touch an order already in flight.
-- This is the only writer of the FIRST milestone, so no screen can invent it.
create or replace function public.ops_start_work_order(
  p_project_id uuid,
  p_actor      uuid default null
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.projects;
  v_wrapper text;
  v_now     timestamptz := now();
begin
  select * into v_project from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'order.not_found: no Dearune with id %', p_project_id using errcode = 'P0002';
  end if;

  if v_project.milestone is not null then
    return v_project;                       -- already in the workshop
  end if;

  v_wrapper := coalesce(v_project.wrapper_type, '');
  if v_wrapper = 'digital' then
    return v_project;                       -- nothing physical to make
  end if;

  if v_project.paid_at is null then
    raise exception 'order.not_paid: record the sale (Paid) before opening Making' using errcode = 'P0001';
  end if;

  update public.projects
  set milestone = 'making'::public.dearune_milestone,
      milestone_updated_at = v_now,
      milestone_updated_by = p_actor
  where id = p_project_id
  returning * into v_project;

  insert into public.project_events (project_id, actor_type, actor_id, action, detail, created_at)
  values (p_project_id, 'admin', p_actor, 'order.milestone',
          jsonb_build_object('from', null, 'to', 'making', 'reason', 'Entered Making', 'at', v_now), v_now);

  return v_project;
end;
$$;

-- Making complete ⇒ Shipping. Idempotent: pressing it twice (or in two tabs)
-- records one transition, because the second call finds the milestone already
-- past Making.
create or replace function public.ops_making_complete(
  p_project_id uuid,
  p_actor      uuid,
  p_reason     text default null
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.projects;
  v_units   integer;
  v_now     timestamptz := now();
begin
  select * into v_project from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'order.not_found: no Dearune with id %', p_project_id using errcode = 'P0002';
  end if;

  if v_project.milestone is null then
    raise exception 'order.not_in_production: this Dearune has not entered Making' using errcode = 'P0001';
  end if;

  if v_project.milestone::text <> 'making' then
    return v_project;                       -- already archived from Making
  end if;

  select count(*) into v_units from public.physical_products where project_id = p_project_id;
  if v_units = 0 then
    raise exception 'order.no_units: open the Operations record before finishing Making' using errcode = 'P0001';
  end if;

  update public.physical_products
  set manufacturing_completed_at = coalesce(manufacturing_completed_at, v_now)
  where project_id = p_project_id;

  insert into public.physical_product_events (physical_product_id, actor_type, actor_id, action, detail, created_at)
  select pp.id, 'admin', p_actor, 'operations.making_completed',
         jsonb_build_object('at', v_now, 'reason', p_reason), v_now
  from public.physical_products pp
  where pp.project_id = p_project_id
    and not exists (
      select 1 from public.physical_product_events e
      where e.physical_product_id = pp.id and e.action = 'operations.making_completed'
    );

  return public.ops_move_milestone(
    p_project_id, 'shipping', p_actor,
    coalesce(nullif(btrim(p_reason), ''), 'Making complete'), v_now
  );
end;
$$;

-- Save the carrier choice without shipping yet. This is the only place the
-- shipment's carrier can be set before hand-off, so "which company" is always
-- an explicit, persisted decision.
create or replace function public.ops_save_shipment(
  p_project_id  uuid,
  p_carrier     text,
  p_tracking    text default null,
  p_manifest_id uuid default null,
  p_actor       uuid default null
)
returns public.shipping
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project  public.projects;
  v_carrier  text := nullif(btrim(p_carrier), '');
  v_tracking text := nullif(btrim(p_tracking), '');
  v_ship     public.shipping;
  v_has      boolean;
begin
  select * into v_project from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'order.not_found: no Dearune with id %', p_project_id using errcode = 'P0002';
  end if;

  if v_carrier is null or v_carrier not in ('bosta', 'egypt_post') then
    raise exception 'shipping.carrier_required: choose Bosta or Egypt Post' using errcode = '22023';
  end if;

  if v_project.milestone is null then
    raise exception 'order.not_in_production: this Dearune has not entered Making' using errcode = 'P0001';
  end if;

  select * into v_ship from public.shipping where project_id = p_project_id for update;
  v_has := found;

  if v_has then
    if v_ship.shipped_at is not null then
      raise exception 'shipping.already_shipped: this order was already handed to % — the carrier cannot be changed',
        v_ship.carrier using errcode = 'P0001';
    end if;
    update public.shipping
    set carrier = v_carrier,
        tracking_code = coalesce(v_tracking, tracking_code),
        manifest_id = coalesce(p_manifest_id, manifest_id),
        shipment_state = 'awaiting_shipment'
    where id = v_ship.id
    returning * into v_ship;
  else
    insert into public.shipping (project_id, carrier, tracking_code, manifest_id, shipment_state)
    values (p_project_id, v_carrier, v_tracking, p_manifest_id, 'awaiting_shipment')
    returning * into v_ship;
  end if;

  insert into public.project_events (project_id, actor_type, actor_id, action, detail, created_at)
  values (p_project_id, 'admin', p_actor, 'order.shipment.saved',
          jsonb_build_object('carrier', v_carrier, 'tracking', v_tracking, 'manifest_id', p_manifest_id), now());

  return v_ship;
end;
$$;

-- Ship ⇒ Delivery. Shipping and "archive the shipping queue" are the SAME
-- operation; there is no second action. A double click is a no-op when the
-- carrier and tracking already match, and a hard error when they do not (that
-- is a genuine conflict, never a silent overwrite).
create or replace function public.ops_ship(
  p_project_id  uuid,
  p_carrier     text,
  p_tracking    text,
  p_manifest_id uuid default null,
  p_actor       uuid default null,
  p_at          timestamptz default null
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project  public.projects;
  v_carrier  text := nullif(btrim(p_carrier), '');
  v_tracking text := nullif(btrim(p_tracking), '');
  v_ship     public.shipping;
  v_has      boolean;
  v_now      timestamptz := coalesce(p_at, now());
begin
  select * into v_project from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'order.not_found: no Dearune with id %', p_project_id using errcode = 'P0002';
  end if;

  if v_carrier is null or v_carrier not in ('bosta', 'egypt_post') then
    raise exception 'shipping.carrier_required: choose Bosta or Egypt Post before marking shipped' using errcode = '22023';
  end if;
  if v_tracking is null then
    raise exception 'shipping.tracking_required: a tracking number or carrier reference is required' using errcode = '22023';
  end if;

  select * into v_ship from public.shipping where project_id = p_project_id for update;
  v_has := found;

  if v_has and v_ship.shipped_at is not null then
    if v_ship.carrier is distinct from v_carrier or v_ship.tracking_code is distinct from v_tracking then
      raise exception 'shipping.conflict: this order is already shipped as % / %',
        coalesce(v_ship.carrier, '?'), coalesce(v_ship.tracking_code, '?') using errcode = 'P0001';
    end if;
    return v_project;                       -- idempotent: nothing new to record
  end if;

  if v_project.milestone::text <> 'shipping' then
    raise exception 'order.transition_denied: finish Making before shipping (now %)',
      coalesce(v_project.milestone::text, '(none)') using errcode = 'P0001';
  end if;

  if v_has then
    update public.shipping
    set carrier = v_carrier,
        tracking_code = v_tracking,
        manifest_id = coalesce(p_manifest_id, manifest_id),
        shipment_state = 'shipped',
        shipped_at = v_now,
        shipped_by = p_actor
    where id = v_ship.id;
  else
    insert into public.shipping (
      project_id, carrier, tracking_code, manifest_id, shipment_state, shipped_at, shipped_by
    ) values (
      p_project_id, v_carrier, v_tracking, p_manifest_id, 'shipped', v_now, p_actor
    );
  end if;

  update public.physical_products
  set shipped_at = coalesce(shipped_at, v_now)
  where project_id = p_project_id;

  insert into public.physical_product_events (physical_product_id, actor_type, actor_id, action, detail, created_at)
  select pp.id, 'admin', p_actor, 'operations.shipped',
         jsonb_build_object('carrier', v_carrier, 'tracking', v_tracking, 'at', v_now), v_now
  from public.physical_products pp
  where pp.project_id = p_project_id;

  return public.ops_move_milestone(
    p_project_id, 'delivery', p_actor,
    'Handed to ' || v_carrier, v_now
  );
end;
$$;

-- Deliver ⇒ Delivered. A state change, not an archive: the row stays in
-- Delivery and its colour is driven by `milestone = 'delivered'`.
create or replace function public.ops_deliver(
  p_project_id uuid,
  p_actor      uuid,
  p_at         timestamptz default null,
  p_reason     text default null
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.projects;
  v_now     timestamptz := coalesce(p_at, now());
begin
  select * into v_project from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'order.not_found: no Dearune with id %', p_project_id using errcode = 'P0002';
  end if;

  if v_project.milestone::text in ('delivered', 'after_sale') then
    update public.shipping
    set delivered_at = coalesce(delivered_at, v_now),
        delivered_by = coalesce(delivered_by, p_actor),
        shipment_state = 'delivered'
    where project_id = p_project_id and delivered_at is null;
    return v_project;                       -- already delivered: idempotent
  end if;

  if v_project.milestone::text <> 'delivery' then
    raise exception 'order.transition_denied: only a shipped order can be marked delivered (now %)',
      coalesce(v_project.milestone::text, '(none)') using errcode = 'P0001';
  end if;

  update public.shipping
  set delivered_at = coalesce(delivered_at, v_now),
      delivered_by = coalesce(delivered_by, p_actor),
      shipment_state = 'delivered'
  where project_id = p_project_id;

  update public.physical_products
  set delivered_at = coalesce(delivered_at, v_now)
  where project_id = p_project_id;

  insert into public.physical_product_events (physical_product_id, actor_type, actor_id, action, detail, created_at)
  select pp.id, 'admin', p_actor, 'operations.delivered', jsonb_build_object('at', v_now), v_now
  from public.physical_products pp
  where pp.project_id = p_project_id
    and not exists (
      select 1 from public.physical_product_events e
      where e.physical_product_id = pp.id and e.action = 'operations.delivered'
    );

  return public.ops_move_milestone(
    p_project_id, 'delivered', p_actor,
    coalesce(nullif(btrim(p_reason), ''), 'Delivery confirmed'), v_now
  );
end;
$$;

-- Delivered ⇒ After-Sale. The order stays the same record; only the stage
-- moves, so refunds/complaints hang off the same canonical id.
create or replace function public.ops_after_sale(
  p_project_id uuid,
  p_actor      uuid,
  p_reason     text default null
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.projects;
begin
  select * into v_project from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'order.not_found: no Dearune with id %', p_project_id using errcode = 'P0002';
  end if;

  if v_project.milestone::text = 'after_sale' then
    return v_project;
  end if;

  if v_project.milestone::text <> 'delivered' then
    raise exception 'order.transition_denied: only a delivered order can move to After-Sale (now %)',
      coalesce(v_project.milestone::text, '(none)') using errcode = 'P0001';
  end if;

  return public.ops_move_milestone(
    p_project_id, 'after_sale', p_actor,
    coalesce(nullif(btrim(p_reason), ''), 'Post-delivery handling'), now()
  );
end;
$$;

-- Record a refund. There is no payment provider here, so the row is a manual
-- record with an explicit `manual` flag; the UI must never claim otherwise.
-- Amount, reason, duplicate key and over-refund are all checked here so no
-- screen can bypass them.
create or replace function public.ops_record_refund(
  p_project_id      uuid,
  p_amount          numeric,
  p_reason          text,
  p_status          text default 'manual',
  p_method          text default null,
  p_reference       text default null,
  p_actor           uuid default null,
  p_idempotency_key text default null,
  p_product_id      uuid default null
)
returns public.refunds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project  public.projects;
  v_refund   public.refunds;
  v_status   text := coalesce(nullif(btrim(p_status), ''), 'manual');
  v_reason   text := nullif(btrim(p_reason), '');
  v_already  numeric;
  v_ceiling  numeric;
begin
  select * into v_project from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'order.not_found: no Dearune with id %', p_project_id using errcode = 'P0002';
  end if;

  if v_project.milestone::text not in ('delivered', 'after_sale') then
    raise exception 'refund.not_delivered: only a delivered order can be refunded (now %)',
      coalesce(v_project.milestone::text, '(none)') using errcode = 'P0001';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'refund.amount_invalid: a refund must be greater than zero' using errcode = '22023';
  end if;
  if v_reason is null or length(v_reason) < 3 then
    raise exception 'refund.reason_required: a reason is required' using errcode = '22023';
  end if;
  if v_status not in ('pending', 'completed', 'failed', 'manual') then
    raise exception 'refund.status_invalid: %', v_status using errcode = '22023';
  end if;

  if p_idempotency_key is not null then
    select * into v_refund
    from public.refunds
    where project_id = p_project_id and idempotency_key = p_idempotency_key;
    if found then
      return v_refund;                    -- retry of the same request
    end if;
  end if;

  v_ceiling := v_project.sale_price;
  select coalesce(sum(amount), 0) into v_already
  from public.refunds
  where project_id = p_project_id
    and status in ('completed', 'manual');

  if v_ceiling is not null and (v_already + p_amount) > v_ceiling + 0.005 then
    raise exception 'refund.exceeds_sale: % already refunded of % — this % would exceed the sale',
      v_already, v_ceiling, p_amount using errcode = 'P0001';
  end if;

  insert into public.refunds (
    project_id, physical_product_id, amount, currency, reason, status,
    method, reference, manual, idempotency_key, requested_by, decided_by,
    completed_at
  ) values (
    p_project_id, p_product_id, p_amount, coalesce(v_project.currency, 'EGP'), v_reason, v_status,
    nullif(btrim(coalesce(p_method, '')), ''), nullif(btrim(coalesce(p_reference, '')), ''),
    true, p_idempotency_key, p_actor, p_actor,
    case when v_status in ('completed', 'manual') then now() else null end
  )
  returning * into v_refund;

  insert into public.project_events (project_id, actor_type, actor_id, action, detail, created_at)
  values (p_project_id, 'admin', p_actor, 'order.refund.recorded',
          jsonb_build_object(
            'refund_id', v_refund.id, 'amount', v_refund.amount, 'status', v_refund.status,
            'method', v_refund.method, 'reference', v_refund.reference, 'reason', v_reason,
            'manual', true
          ), now());

  return v_refund;
end;
$$;

-- A manifest is stored as an immutable snapshot; the per-order associations
-- are then written by `ops_ship`, one transaction per order, so one bad row
-- cannot roll back the whole import.
create or replace function public.ops_create_manifest(
  p_carrier  text,
  p_filename text,
  p_sheet    text,
  p_rows     jsonb,
  p_actor    uuid default null
)
returns public.shipment_manifests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_carrier text := nullif(btrim(p_carrier), '');
  v_manifest public.shipment_manifests;
begin
  if v_carrier is null or v_carrier not in ('bosta', 'egypt_post') then
    raise exception 'manifest.carrier_required: choose Bosta or Egypt Post' using errcode = '22023';
  end if;

  insert into public.shipment_manifests (carrier, filename, sheet_name, row_count, imported_by, snapshot)
  values (
    v_carrier,
    nullif(btrim(coalesce(p_filename, '')), ''),
    nullif(btrim(coalesce(p_sheet, '')), ''),
    coalesce(jsonb_array_length(coalesce(p_rows, '[]'::jsonb)), 0),
    p_actor,
    coalesce(p_rows, '[]'::jsonb)
  )
  returning * into v_manifest;

  return v_manifest;
end;
$$;

-- Backend-only: no client role may call a transition directly.
revoke execute on function public.ops_move_milestone(uuid, text, uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.ops_advance_to(uuid, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.ops_start_work_order(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.ops_making_complete(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.ops_save_shipment(uuid, text, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.ops_ship(uuid, text, text, uuid, uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.ops_deliver(uuid, uuid, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.ops_after_sale(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.ops_record_refund(uuid, numeric, text, text, text, text, uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.ops_create_manifest(text, text, text, jsonb, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. RLS: admins read; only the service role writes
-- ---------------------------------------------------------------------------
alter table public.order_references enable row level security;
alter table public.shipment_manifests enable row level security;
alter table public.refunds enable row level security;

revoke all on public.order_references from anon, authenticated;
revoke all on public.shipment_manifests from anon, authenticated;
revoke all on public.refunds from anon, authenticated;

grant select on public.order_references to authenticated;
grant select on public.shipment_manifests to authenticated;
grant select on public.refunds to authenticated;

drop policy if exists admins_read_order_references on public.order_references;
create policy "admins_read_order_references" on public.order_references
  for select to authenticated using (public.is_dearune_admin());

drop policy if exists admins_read_shipment_manifests on public.shipment_manifests;
create policy "admins_read_shipment_manifests" on public.shipment_manifests
  for select to authenticated using (public.is_dearune_admin());

drop policy if exists admins_read_refunds on public.refunds;
create policy "admins_read_refunds" on public.refunds
  for select to authenticated using (public.is_dearune_admin());

-- ---------------------------------------------------------------------------
-- 8. Indexes the Operations screens actually filter on
-- ---------------------------------------------------------------------------
create index if not exists projects_milestone_idx
  on public.projects (milestone, created_at desc);

-- ---------------------------------------------------------------------------
-- 9. One row per order — the four subsections are filters on this view
-- ---------------------------------------------------------------------------
-- The order is the Dearune (a `projects` row), never a copy of it. Making,
-- Shipping, Delivery and After-Sale are four windows onto this one view, which
-- is why moving an order between them moves a column instead of an entire row.
create or replace view public.ops_orders
with (security_invoker = true) as
select
  p.id                        as project_id,
  p.reference                 as canonical_id,
  p.title,
  p.public_id,
  p.public_token,
  p.wrapper_type,
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
  (p.public_token is not null and p.public_token <> '') as qr_target,
  (
    coalesce(p.message_active, false)
    and coalesce((p.payload ->> 'passwordSet')::boolean, false) = false
    and p.public_token is not null
    and p.public_token <> ''
  ) as qr_ready
from public.projects p
left join public.designers d on d.id = p.designer_id
left join public.shipping s on s.project_id = p.id
where p.milestone is not null;

comment on view public.ops_orders is
  'One row per Dearune in the workshop. The four Operations subsections are milestone filters on this view — never separate copies of an order.';

revoke all on public.ops_orders from anon;
grant select on public.ops_orders to authenticated;

-- Counts per subsection, used by the navigation badges. One cheap aggregate
-- instead of four full list reads.
create or replace view public.ops_milestone_counts
with (security_invoker = true) as
select
  p.milestone::text as milestone,
  count(*)::integer as total
from public.projects p
where p.milestone is not null
group by 1;

revoke all on public.ops_milestone_counts from anon;
grant select on public.ops_milestone_counts to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Dry-run / reconciliation report
-- ---------------------------------------------------------------------------
-- Read-only. Lists every project with the identifiers it owns, the milestone
-- it stores, the milestone its stamps imply, and whether the two disagree.
-- Anything flagged here is a record the migration refused to guess about.
create or replace view public.ops_identity_report
with (security_invoker = true) as
select
  x.project_id,
  x.canonical_id,
  x.unit_ids,
  x.sold_ids,
  x.unit_count,
  x.shipping_rows,
  x.stored_milestone,
  x.derived_milestone,
  (x.stored_milestone is not null and x.stored_milestone is distinct from x.derived_milestone) as milestone_mismatch,
  (x.unit_count = 0 and x.stored_milestone is not null) as missing_units,
  (x.canonical_id is null or btrim(x.canonical_id) = '') as missing_canonical_id
from (
  select
    p.id as project_id,
    p.reference as canonical_id,
    coalesce(array_agg(distinct pp.reference) filter (where pp.reference is not null), array[]::text[]) as unit_ids,
    coalesce(array_agg(distinct 'SOL-' || pp.reference) filter (where pp.reference is not null), array[]::text[]) as sold_ids,
    count(distinct pp.id)::integer as unit_count,
    (select count(*)::integer from public.shipping s where s.project_id = p.id) as shipping_rows,
    p.milestone::text as stored_milestone,
    case
      when p.arrived_at is not null then 'delivered'
      when p.shipped_at is not null then 'delivery'
      when p.manufactured_at is not null then 'shipping'
      when p.paid_at is not null then 'making'
      else null
    end as derived_milestone
  from public.projects p
  left join public.physical_products pp on pp.project_id = p.id
  group by p.id
) x;

revoke all on public.ops_identity_report from anon;
grant select on public.ops_identity_report to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Keep the legacy unit view readable, and tell it the same truth
-- ---------------------------------------------------------------------------
-- `operations_units` still backs the printing screens. Its columns are
-- unchanged; `milestone` is appended so a caller can read the authoritative
-- stage from the same row it already fetches.
create or replace view public.operations_units
with (security_invoker = true) as
select
  pp.id,
  pp.reference,
  pp.unit_index,
  pp.sold_at,
  pp.manufacturing_completed_at,
  pp.shipped_at,
  pp.delivered_at,
  pp.notes,
  pp.archived_at,
  pp.created_at,
  pp.updated_at,
  p.id                 as project_id,
  p.reference          as project_reference,
  p.title              as project_title,
  p.public_id,
  p.public_token,
  p.wrapper_type,
  p.template_slug,
  p.paid_at,
  p.message_active,
  coalesce((p.payload ->> 'passwordSet')::boolean, false) as message_protected,
  p.designer_id,
  d.name               as designer_name,
  d.code               as designer_code,
  s.recipient_name,
  s.phone              as customer_phone,
  s.tracking_code,
  s.provider,
  s.address_line1,
  s.address_line2,
  s.city,
  s.state_province,
  s.postal_code,
  s.country,
  s.special_instructions,
  (p.public_token is not null and p.public_token <> '') as qr_target,
  (
    coalesce(p.message_active, false)
    and coalesce((p.payload ->> 'passwordSet')::boolean, false) = false
    and p.public_token is not null
    and p.public_token <> ''
  ) as qr_ready,
  p.milestone::text    as milestone
from public.physical_products pp
join public.projects p on p.id = pp.project_id
left join public.designers d on d.id = p.designer_id
left join public.shipping s on s.project_id = p.id;

revoke all on public.operations_units from anon;
grant select on public.operations_units to authenticated;

-- ---------------------------------------------------------------------------
-- 12. Announce what this run did, without changing anything else
-- ---------------------------------------------------------------------------
do $$
declare
  v_orders    integer;
  v_units     integer;
  v_aliases   integer;
  v_mismatch  integer;
  v_no_units  integer;
begin
  select count(*) into v_orders from public.projects where milestone is not null;
  select count(*) into v_units from public.physical_products;
  select count(*) into v_aliases from public.order_references;
  select count(*) into v_mismatch from public.ops_identity_report where milestone_mismatch;
  select count(*) into v_no_units from public.ops_identity_report where missing_units;

  raise notice 'order lifecycle: % orders in the workshop, % physical units, % identifiers registered',
    v_orders, v_units, v_aliases;
  raise notice 'order lifecycle: % record(s) with a milestone that disagrees with their stamps, % order(s) with no unit — see ops_identity_report',
    v_mismatch, v_no_units;
end $$;
