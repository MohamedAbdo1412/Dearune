-- ============================================================================
-- ONE ORDER MODEL: seven milestones, one identity, one QR answer
-- ============================================================================
--
-- `20261103000001_order_lifecycle.sql` gave the studio a single order record
-- (`projects`), a single milestone column and a single transition mechanism for
-- the *production* half of the lifecycle (making → shipping → delivery →
-- delivered → after_sale). It deliberately left three gaps open:
--
--   1. IDENTITY — a Dearune that was sold still had TWO identities in the
--      registry: the canonical `DR-000021` that every screen quotes, and a
--      Sold As form *derived from the physical unit* (`SOL-DR70700000011`).
--      Two unrelated numbers for one order.
--
--   2. MILESTONE — there was no stage before Making. "Configured" and "Sold"
--      were guessed in the browser from `paid_at`, so the Designer screen and
--      the Operations screen could disagree about an order that had been paid
--      but not yet opened. `NULL` meant both "not sold" and "no answer".
--
--   3. QR — the readiness rule (`message_active and not passwordSet and
--      token present`) was copy-pasted into four SQL functions and again into
--      JavaScript. Nothing named *why* a QR was blocked, and the print gate
--      treated "will not open" as a warning.
--
-- This migration closes all three, forward-only:
--
--   configured → sold → making → shipping → delivery → delivered → after_sale
--
-- Every stage is written by ONE function (`ops_move_milestone`) and refused by
-- ONE trigger; every screen reads ONE column (`projects.milestone`); every QR
-- question is answered by ONE function (`order_qr_state`). Nothing is deleted,
-- no identifier is rewritten, and every backfill is `where ... is null` or
-- forward-only.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. One milestone graph, enforced by the database
-- ---------------------------------------------------------------------------
-- The enum values `configured` and `sold` were added by their own migrations
-- (20261104000001 / 20261104000002) because PostgreSQL cannot use a new enum
-- value in the transaction that adds it.
--
-- The trigger is rewritten BEFORE any backfill so the backfills below are
-- judged by the rules that will govern every future write:
--
--   * `NULL → anything` is initialisation, and is allowed (it can only happen
--     during this migration, before the column becomes NOT NULL).
--   * the same value is a no-op, so a retried request is harmless.
--   * a transaction-local override (`dearune.milestone_override = 'on'`) is
--     honoured for the reconciliation RPCs only — it is never set by a screen.
--   * a physical order must move exactly one step forward.
--   * a digital Dearune never enters Making/Shipping/Delivery: it goes
--     `sold → delivered` when its message is opened.
create or replace function public.projects_milestone_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order    text[] := array[
    'configured', 'sold', 'making', 'shipping', 'delivery', 'delivered', 'after_sale'
  ];
  v_from     integer;
  v_to       integer;
  v_digital  boolean;
  v_override boolean;
begin
  if new.milestone is distinct from old.milestone then
    v_override := coalesce(current_setting('dearune.milestone_override', true), '') = 'on';
    if v_override then
      new.milestone_updated_at := coalesce(new.milestone_updated_at, now());
      return new;
    end if;

    if new.milestone is null then
      raise exception 'milestone.required: a Dearune always has a milestone'
        using errcode = '22023';
    end if;

    v_from := array_position(v_order, old.milestone::text);
    v_to   := array_position(v_order, new.milestone::text);

    if v_to is null then
      raise exception 'milestone.unknown: %', new.milestone::text using errcode = '22023';
    end if;

    -- Initialisation: the row never had a milestone before this migration.
    if v_from is null then
      new.milestone_updated_at := coalesce(new.milestone_updated_at, now());
      return new;
    end if;

    v_digital := coalesce(new.wrapper_type, '') = 'digital';

    if v_digital then
      if new.milestone::text in ('making', 'shipping', 'delivery') then
        raise exception 'milestone.digital_production: a digital Dearune has no % stage',
          new.milestone::text using errcode = 'P0001';
      end if;
      if v_to < v_from then
        raise exception 'milestone.transition_denied: cannot move % -> %',
          old.milestone::text, new.milestone::text using errcode = 'P0001';
      end if;
    elsif v_to <> v_from + 1 then
      raise exception 'milestone.transition_denied: cannot move % -> %',
        old.milestone::text, new.milestone::text using errcode = 'P0001';
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
-- 2. Backfill: the stage is derived once, here, and never again by a screen
-- ---------------------------------------------------------------------------
-- Only NULL rows are filled, so a value written by the previous lifecycle
-- migration is never overwritten. Digital Dearunes were deliberately left NULL
-- before; they get their real stage now.
update public.projects
set milestone = (
      case
        when coalesce(wrapper_type, '') = 'digital' and message_active and paid_at is not null
          then 'delivered'
        when arrived_at is not null then 'delivered'
        when shipped_at is not null then 'delivery'
        when manufactured_at is not null then 'shipping'
        when paid_at is not null then 'sold'
        else 'configured'
      end
    )::public.dearune_milestone,
    milestone_updated_at = coalesce(milestone_updated_at, now())
where milestone is null;

-- Forward-only reconciliation. If a stamp says the order went further than the
-- stored milestone (a legacy caller wrote `manufactured_at` without the
-- transition function), the FURTHEST stamp wins. It never moves an order
-- backwards, and the transaction-local override is what lets a multi-step
-- catch-up pass the one-step guard.
do $$
declare
  v_order text[] := array[
    'configured', 'sold', 'making', 'shipping', 'delivery', 'delivered', 'after_sale'
  ];
  v_moved integer := 0;
begin
  perform set_config('dearune.milestone_override', 'on', false);

  with ranked as (
    select
      p.id,
      array_position(v_order, p.milestone::text) as stored_rank,
      array_position(
        v_order,
        case
          when coalesce(p.wrapper_type, '') = 'digital' then
            case
              when p.message_active and p.paid_at is not null then 'delivered'
              when p.paid_at is not null then 'sold'
              else 'configured'
            end
          when p.arrived_at is not null then 'delivered'
          when p.shipped_at is not null then 'delivery'
          when p.manufactured_at is not null then 'shipping'
          when p.paid_at is not null then 'sold'
          else 'configured'
        end
      ) as derived_rank,
      case
        when coalesce(p.wrapper_type, '') = 'digital' then
          case
            when p.message_active and p.paid_at is not null then 'delivered'
            when p.paid_at is not null then 'sold'
            else 'configured'
          end
        when p.arrived_at is not null then 'delivered'
        when p.shipped_at is not null then 'delivery'
        when p.manufactured_at is not null then 'shipping'
        when p.paid_at is not null then 'sold'
        else 'configured'
      end as derived
    from public.projects p
  )
  update public.projects p
  set milestone = ranked.derived::public.dearune_milestone,
      milestone_updated_at = coalesce(p.milestone_updated_at, now())
  from ranked
  where ranked.id = p.id
    and ranked.derived_rank > coalesce(ranked.stored_rank, 0);

  get diagnostics v_moved = row_count;

  perform set_config('dearune.milestone_override', '', false);

  raise notice 'unified order model: reconciled % order(s) to the furthest stamped stage', v_moved;
end $$;

-- The project milestone is the authority; the per-unit timestamps are the
-- production detail behind it. Fill the detail forward so a unit can never
-- claim to be behind the order it belongs to. Digital Dearunes have no units.
update public.physical_products pp
set sold_at = coalesce(pp.sold_at, p.paid_at),
    manufacturing_completed_at = case
      when p.milestone >= 'shipping'::public.dearune_milestone
        then coalesce(pp.manufacturing_completed_at, p.manufactured_at, p.milestone_updated_at)
      else pp.manufacturing_completed_at
    end,
    shipped_at = case
      when p.milestone >= 'delivery'::public.dearune_milestone
        then coalesce(pp.shipped_at, p.shipped_at, p.milestone_updated_at)
      else pp.shipped_at
    end,
    delivered_at = case
      when p.milestone >= 'delivered'::public.dearune_milestone
        then coalesce(pp.delivered_at, p.arrived_at, p.milestone_updated_at)
      else pp.delivered_at
    end
from public.projects p
where p.id = pp.project_id
  and coalesce(p.wrapper_type, '') <> 'digital';

-- Now the column can carry the promise: a Dearune always has a stage, and a
-- new Dearune starts at `configured` rather than at "no answer".
alter table public.projects alter column milestone set default 'configured';
alter table public.projects alter column milestone set not null;

comment on column public.projects.milestone is
  'THE authoritative lifecycle stage of a Dearune: configured → sold → making → shipping → delivery → delivered → after_sale. Never NULL, written only by the ops_* transition functions, read by every dashboard.';
comment on column public.projects.milestone_updated_by is
  'Administrator who performed the last transition. NULL when the last actor was a worker — see project_events for the full trail.';
comment on column public.projects.status is
  'DEPRECATED since 20261104000003. Historical duplicate of milestone/archived_at; no screen reads or writes it. Kept only so the Create Dearune insert keeps its documented default.';

-- ---------------------------------------------------------------------------
-- 3. Identity: the Sold ID is derived from the CANONICAL id, not the unit
-- ---------------------------------------------------------------------------
-- Before this migration the Sold As form was `SOL-` + the physical unit id
-- (`SOL-DR70700000011`). That made the sold identifier depend on a production
-- artifact, so one Dearune with two units had no single sold identifier at all.
--
-- The Sold ID becomes `SOL-` + the canonical digits (`DR-000021` →
-- `SOL-000021`): one sold order, one sold id, derived from the id the studio
-- already quotes. Existing values are NOT deleted — they are reclassified as
-- `legacy` aliases, so an old manifest or a printed receipt still resolves.
update public.order_references
set kind = 'legacy',
    note = coalesce(note, 'Sold As form derived from the physical unit id; superseded by SOL-<canonical digits> in 20261104000003')
where kind = 'sold'
  and value !~ '^SOL-[0-9]{6}$';

insert into public.order_references (project_id, kind, value)
select p.id, 'sold', 'SOL-' || substring(p.reference from 4)
from public.projects p
where p.reference ~ '^DR-[0-9]{6}$'
on conflict (value) do nothing;

-- If the canonical sold id already existed under another kind (an imported
-- legacy row), promote it now that the project owns it.
update public.order_references r
set kind = 'sold'
from public.projects p
where r.project_id = p.id
  and p.reference ~ '^DR-[0-9]{6}$'
  and r.value = 'SOL-' || substring(p.reference from 4)
  and r.kind <> 'sold'
  and not exists (
    select 1 from public.order_references x
    where x.project_id = p.id and x.kind = 'sold'
  );

-- Exactly one Sold ID per sold order.
create unique index if not exists order_references_one_sold_per_project
  on public.order_references (project_id)
  where kind = 'sold';

-- A project registers its canonical id AND its canonical Sold ID. A unit
-- registers only its own id — production detail must not mint an order id.
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

  if new.reference ~ '^DR-[0-9]{6}$' then
    insert into public.order_references (project_id, kind, value)
    values (new.id, 'sold', 'SOL-' || substring(new.reference from 4))
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
  end if;
  return new;
end;
$$;

drop trigger if exists order_reference_unit on public.physical_products;
create trigger order_reference_unit after insert on public.physical_products
  for each row execute function public.order_reference_unit();

-- ---------------------------------------------------------------------------
-- 4. One QR answer
-- ---------------------------------------------------------------------------
-- Four separate implementations of the same rule is how two screens end up
-- disagreeing. This is now the only implementation. The four states are the
-- four questions a workshop actually asks:
--
--   destination  Do we have a public id AND a token to put in a QR?
--   activated    Is the letter switched on?
--   openable     Will scanning it open the letter right now?
--   blocked_reason  If not, exactly which of the three is missing.
--
-- "Printed" is deliberately NOT a database state: printing happens in the
-- browser (qrPaper.js) and leaving a stale `printed` flag behind is how the
-- last system lied about a QR that had never been produced.
-- A named row type, not jsonb, so every caller reads `q.openable` instead of
-- trusting a string key. `to_jsonb(...)` still gives the JSON the worker
-- functions return, so there is exactly one calculation either way.
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'order_qr_status'
  ) then
    create type public.order_qr_status as (
      destination    boolean,
      activated      boolean,
      openable       boolean,
      blocked_reason text
    );
  end if;
end $$;

create or replace function public.order_qr_state(
  p_public_id      text,
  p_public_token   text,
  p_message_active boolean,
  p_password_set   boolean
)
returns public.order_qr_status
language sql
immutable
as $$
  select row(
    coalesce(btrim(p_public_id), '') <> ''
      and coalesce(btrim(p_public_token), '') <> '',
    coalesce(p_message_active, false),
    coalesce(btrim(p_public_id), '') <> ''
      and coalesce(btrim(p_public_token), '') <> ''
      and coalesce(p_message_active, false)
      and not coalesce(p_password_set, false),
    case
      when coalesce(btrim(p_public_id), '') = '' or coalesce(btrim(p_public_token), '') = ''
        then 'missing_destination'
      when not coalesce(p_message_active, false) then 'not_activated'
      when coalesce(p_password_set, false) then 'password_protected'
      else null
    end
  )::public.order_qr_status;
$$;

comment on function public.order_qr_state(text, text, boolean, boolean) is
  'The ONE QR readiness answer. destination = id+token exist; activated = letter is on; openable = scanning opens it now; blocked_reason names the first thing missing.';

-- A named carrier is a fact (`bosta` | `egypt_post`), a provider string is
-- free text typed by a human. Worker shipment actions ask this classifier once
-- instead of growing a second copy of the carrier vocabulary.
create or replace function public.shipping_carrier(p_provider text)
returns text
language sql
immutable
as $$
  select case
    when lower(btrim(coalesce(p_provider, ''))) in ('bosta', 'bosta egypt', 'bosta.com') then 'bosta'
    when lower(btrim(coalesce(p_provider, ''))) in ('egypt post', 'egyptpost', 'egypt_post', 'post') then 'egypt_post'
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- 5. The single transition mechanism (rewritten for seven stages)
-- ---------------------------------------------------------------------------
-- These signatures change: every one gains `p_actor_type` so a worker action is
-- recorded as a worker in `project_events` while `projects.milestone_updated_by`
-- (a foreign key to `admin_users`) is only written for an administrator.
-- The old overloads are dropped first: a defaulted argument would otherwise
-- make `ops_making_complete(uuid, uuid, text)` ambiguous.
drop function if exists public.ops_move_milestone(uuid, text, uuid, text, timestamptz);
drop function if exists public.ops_advance_to(uuid, text, uuid, text);
drop function if exists public.ops_start_work_order(uuid, uuid);
drop function if exists public.ops_making_complete(uuid, uuid, text);
drop function if exists public.ops_ship(uuid, text, text, uuid, uuid, timestamptz);
drop function if exists public.ops_deliver(uuid, uuid, timestamptz, text);
drop function if exists public.ops_after_sale(uuid, uuid, text);

create or replace function public.ops_move_milestone(
  p_project_id uuid,
  p_to         text,
  p_actor      uuid,
  p_reason     text default null,
  p_at         timestamptz default null,
  p_actor_type text default 'admin'
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order      text[] := array[
    'configured', 'sold', 'making', 'shipping', 'delivery', 'delivered', 'after_sale'
  ];
  v_project    public.projects;
  v_from       text;
  v_to         text := nullif(btrim(p_to), '');
  v_from_ix    integer;
  v_to_ix      integer;
  v_now        timestamptz := coalesce(p_at, now());
  v_actor_type text := coalesce(nullif(btrim(p_actor_type), ''), 'admin');
  v_digital    boolean;
  v_is_admin   boolean;
begin
  if v_actor_type not in ('admin', 'worker', 'system') then
    raise exception 'order.unknown_actor: %', v_actor_type using errcode = '22023';
  end if;

  select * into v_project from public.projects where id = p_project_id for update;
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

  v_from_ix  := coalesce(array_position(v_order, v_from), 0);
  v_to_ix    := array_position(v_order, v_to);
  v_digital  := coalesce(v_project.wrapper_type, '') = 'digital';
  v_is_admin := v_actor_type = 'admin';

  if v_to in ('sold', 'making') and v_project.paid_at is null then
    raise exception 'order.not_paid: record the sale (Paid) before moving this Dearune to %', v_to
      using errcode = 'P0001';
  end if;

  if v_digital then
    if v_to in ('making', 'shipping', 'delivery') then
      raise exception 'order.transition_denied: a digital Dearune has no % stage', v_to
        using errcode = 'P0001';
    end if;
    if v_to_ix < v_from_ix then
      raise exception 'order.transition_denied: cannot move % -> %', v_from, v_to using errcode = 'P0001';
    end if;
  elsif v_to_ix <> v_from_ix + 1 then
    raise exception 'order.transition_denied: cannot move % -> %', coalesce(v_from, '(none)'), v_to
      using errcode = 'P0001';
  end if;

  -- `projects_stage_order_check` (20260925000001) requires paid_at before
  -- manufactured_at, manufactured before shipped, shipped before arrived. The
  -- stamps below satisfy it from the milestone itself, and are skipped for a
  -- digital Dearune (which never carries a parcel).
  update public.projects
  set milestone = v_to::public.dearune_milestone,
      milestone_updated_by = case when v_is_admin then p_actor else milestone_updated_by end,
      milestone_updated_at = v_now,
      manufactured_at = case
        when not v_digital and v_to in ('shipping', 'delivery', 'delivered', 'after_sale')
          then coalesce(manufactured_at, v_now) else manufactured_at end,
      shipped_at = case
        when not v_digital and v_to in ('delivery', 'delivered', 'after_sale')
          then coalesce(shipped_at, v_now) else shipped_at end,
      arrived_at = case
        when not v_digital and v_to in ('delivered', 'after_sale')
          then coalesce(arrived_at, v_now) else arrived_at end
  where id = p_project_id
  returning * into v_project;

  -- Mirror the order stage onto its units, forward only. Coalesce never
  -- rewrites a stamp that already exists, so two units of one Dearune can
  -- never disagree with the order they belong to.
  if not v_digital then
    update public.physical_products
    set sold_at = case when v_to_ix >= array_position(v_order, 'sold')
                       then coalesce(sold_at, v_project.paid_at, v_now) else sold_at end,
        manufacturing_completed_at = case when v_to_ix >= array_position(v_order, 'shipping')
                       then coalesce(manufacturing_completed_at, v_now) else manufacturing_completed_at end,
        shipped_at = case when v_to_ix >= array_position(v_order, 'delivery')
                       then coalesce(shipped_at, v_now) else shipped_at end,
        delivered_at = case when v_to_ix >= array_position(v_order, 'delivered')
                       then coalesce(delivered_at, v_now) else delivered_at end
    where project_id = p_project_id;
  end if;

  insert into public.project_events (project_id, actor_type, actor_id, action, detail, created_at)
  values (
    p_project_id,
    v_actor_type,
    p_actor,
    'order.milestone',
    jsonb_build_object('from', v_from, 'to', v_to, 'reason', p_reason, 'at', v_now),
    v_now
  );

  return v_project;
end;
$$;

-- Forward-only walker. Used by the Designer stamps, the worker actions and
-- `ops_start_work_order` so every hop goes through the audit trail. A target at
-- or behind the current stage is a no-op, never a backwards move.
create or replace function public.ops_advance_to(
  p_project_id uuid,
  p_to         text,
  p_actor      uuid,
  p_reason     text default null,
  p_actor_type text default 'admin'
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order      text[] := array[
    'configured', 'sold', 'making', 'shipping', 'delivery', 'delivered', 'after_sale'
  ];
  v_target     integer;
  v_current    integer;
  v_step       integer;
  v_now        timestamptz := now();
  v_proj       public.projects;
  v_digital    boolean;
begin
  select * into v_proj from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'order.not_found: no Dearune with id %', p_project_id using errcode = 'P0002';
  end if;

  v_target := array_position(v_order, nullif(btrim(p_to), ''));
  if v_target is null then
    raise exception 'order.unknown_milestone: %', coalesce(p_to, '(null)') using errcode = '22023';
  end if;

  v_current := coalesce(array_position(v_order, v_proj.milestone::text), 0);
  if v_target <= v_current then
    return v_proj;                          -- nothing to do, and never backwards
  end if;

  v_digital := coalesce(v_proj.wrapper_type, '') = 'digital';

  for v_step in (v_current + 1) .. v_target loop
    if v_digital and v_order[v_step] in ('making', 'shipping', 'delivery') then
      continue;                             -- digital has no production stages
    end if;
    v_proj := public.ops_move_milestone(p_project_id, v_order[v_step], p_actor, p_reason, v_now, p_actor_type);
  end loop;

  return v_proj;
end;
$$;

-- Enter production. A paid physical Dearune is `sold`; opening its Operations
-- record is a real transition (`sold → making`), not a screen-local guess.
create or replace function public.ops_start_work_order(
  p_project_id uuid,
  p_actor      uuid default null,
  p_actor_type text default 'admin'
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

  if coalesce(v_project.wrapper_type, '') = 'digital' then
    -- Nothing physical to make. A paid digital Dearune is sold; it becomes
    -- delivered when its message is opened, never through this function.
    return public.ops_advance_to(p_project_id, 'sold', p_actor, 'Sale recorded', p_actor_type);
  end if;

  if v_project.paid_at is null then
    raise exception 'order.not_paid: record the sale (Paid) before opening Making' using errcode = 'P0001';
  end if;

  return public.ops_advance_to(p_project_id, 'making', p_actor, 'Entered Making', p_actor_type);
end;
$$;

-- Making complete ⇒ Shipping. Idempotent: pressing it twice records one
-- transition, because the second call finds the order already past Making.
create or replace function public.ops_making_complete(
  p_project_id uuid,
  p_actor      uuid,
  p_reason     text default null,
  p_actor_type text default 'admin'
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

  if coalesce(v_project.wrapper_type, '') = 'digital' then
    raise exception 'order.digital: a digital Dearune has no Making stage' using errcode = 'P0001';
  end if;

  if v_project.milestone::text in ('shipping', 'delivery', 'delivered', 'after_sale') then
    return v_project;                       -- already past Making
  end if;

  if v_project.milestone::text not in ('sold', 'making') then
    raise exception 'order.not_in_production: this Dearune has not entered Making (now %)',
      v_project.milestone::text using errcode = 'P0001';
  end if;

  select count(*) into v_units from public.physical_products where project_id = p_project_id;
  if v_units = 0 then
    raise exception 'order.no_units: open the Operations record before finishing Making' using errcode = 'P0001';
  end if;

  update public.physical_products
  set manufacturing_completed_at = coalesce(manufacturing_completed_at, v_now)
  where project_id = p_project_id;

  insert into public.physical_product_events (physical_product_id, actor_type, actor_id, action, detail, created_at)
  select pp.id, case when p_actor_type = 'worker' then 'worker' else 'admin' end, p_actor,
         'operations.making_completed',
         jsonb_build_object('at', v_now, 'reason', p_reason), v_now
  from public.physical_products pp
  where pp.project_id = p_project_id
    and not exists (
      select 1 from public.physical_product_events e
      where e.physical_product_id = pp.id and e.action = 'operations.making_completed'
    );

  return public.ops_advance_to(
    p_project_id, 'shipping', p_actor,
    coalesce(nullif(btrim(p_reason), ''), 'Making complete'), p_actor_type
  );
end;
$$;

-- Save the carrier choice without shipping yet.
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

  if v_project.milestone::text in ('configured', 'sold') then
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

-- Ship ⇒ Delivery. Shipping and "leave the Shipping queue" are the SAME
-- operation. A double click with the same carrier/tracking is a no-op; a
-- different carrier is a hard conflict, never a silent overwrite.
create or replace function public.ops_ship(
  p_project_id  uuid,
  p_carrier     text,
  p_tracking    text,
  p_manifest_id uuid default null,
  p_actor       uuid default null,
  p_at          timestamptz default null,
  p_actor_type  text default 'admin'
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project    public.projects;
  v_carrier    text := nullif(btrim(p_carrier), '');
  v_tracking   text := nullif(btrim(p_tracking), '');
  v_ship       public.shipping;
  v_has        boolean;
  v_now        timestamptz := coalesce(p_at, now());
  v_actor_type text := coalesce(nullif(btrim(p_actor_type), ''), 'admin');
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

  if v_project.milestone::text in ('delivery', 'delivered', 'after_sale') then
    return v_project;                       -- already shipped, nothing to redo
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
        shipped_by = case when v_actor_type = 'admin' then p_actor else shipped_by end
    where id = v_ship.id;
  else
    insert into public.shipping (
      project_id, carrier, tracking_code, manifest_id, shipment_state, shipped_at, shipped_by
    ) values (
      p_project_id, v_carrier, v_tracking, p_manifest_id, 'shipped', v_now,
      case when v_actor_type = 'admin' then p_actor else null end
    );
  end if;

  insert into public.physical_product_events (physical_product_id, actor_type, actor_id, action, detail, created_at)
  select pp.id, case when v_actor_type = 'worker' then 'worker' else 'admin' end, p_actor,
         'operations.shipped',
         jsonb_build_object('carrier', v_carrier, 'tracking', v_tracking, 'at', v_now), v_now
  from public.physical_products pp
  where pp.project_id = p_project_id
    and not exists (
      select 1 from public.physical_product_events e
      where e.physical_product_id = pp.id and e.action = 'operations.shipped'
    );

  return public.ops_move_milestone(
    p_project_id, 'delivery', p_actor,
    'Handed to ' || v_carrier, v_now, v_actor_type
  );
end;
$$;

-- Deliver ⇒ Delivered. A state change, not an archive.
create or replace function public.ops_deliver(
  p_project_id uuid,
  p_actor      uuid,
  p_at         timestamptz default null,
  p_reason     text default null,
  p_actor_type text default 'admin'
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project    public.projects;
  v_now        timestamptz := coalesce(p_at, now());
  v_actor_type text := coalesce(nullif(btrim(p_actor_type), ''), 'admin');
  v_is_admin   boolean := v_actor_type = 'admin';
begin
  select * into v_project from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'order.not_found: no Dearune with id %', p_project_id using errcode = 'P0002';
  end if;

  if v_project.milestone::text in ('delivered', 'after_sale') then
    update public.shipping
    set delivered_at = coalesce(delivered_at, v_now),
        delivered_by = coalesce(delivered_by, case when v_is_admin then p_actor else null end),
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
      delivered_by = coalesce(delivered_by, case when v_is_admin then p_actor else null end),
      shipment_state = 'delivered'
  where project_id = p_project_id;

  insert into public.physical_product_events (physical_product_id, actor_type, actor_id, action, detail, created_at)
  select pp.id, case when v_actor_type = 'worker' then 'worker' else 'admin' end, p_actor,
         'operations.delivered', jsonb_build_object('at', v_now), v_now
  from public.physical_products pp
  where pp.project_id = p_project_id
    and not exists (
      select 1 from public.physical_product_events e
      where e.physical_product_id = pp.id and e.action = 'operations.delivered'
    );

  return public.ops_move_milestone(
    p_project_id, 'delivered', p_actor,
    coalesce(nullif(btrim(p_reason), ''), 'Delivery confirmed'), v_now, v_actor_type
  );
end;
$$;

-- Delivered ⇒ After-Sale.
create or replace function public.ops_after_sale(
  p_project_id uuid,
  p_actor      uuid,
  p_reason     text default null,
  p_actor_type text default 'admin'
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
    coalesce(nullif(btrim(p_reason), ''), 'Post-delivery handling'), now(), p_actor_type
  );
end;
$$;

-- Maintenance-only backward correction. This is the ONLY way down the graph.
-- It clears the stamps that belong to the stages being undone, in one UPDATE so
-- `projects_stage_order_check` never sees an inconsistent row, and it appends
-- `order.milestone.reverted` rather than editing history.
create or replace function public.ops_revert_milestone(
  p_project_id uuid,
  p_to         text,
  p_actor      uuid,
  p_reason     text default null,
  p_actor_type text default 'admin'
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order      text[] := array[
    'configured', 'sold', 'making', 'shipping', 'delivery', 'delivered', 'after_sale'
  ];
  v_project    public.projects;
  v_to         text := nullif(btrim(p_to), '');
  v_from       text;
  v_from_ix    integer;
  v_to_ix      integer;
  v_now        timestamptz := now();
  v_actor_type text := coalesce(nullif(btrim(p_actor_type), ''), 'admin');
begin
  select * into v_project from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'order.not_found: no Dearune with id %', p_project_id using errcode = 'P0002';
  end if;

  if v_to is null or not (v_to = any (v_order)) then
    raise exception 'order.unknown_milestone: %', coalesce(p_to, '(null)') using errcode = '22023';
  end if;

  if v_to = v_project.milestone::text then
    return v_project;                       -- nothing to revert
  end if;

  v_from    := v_project.milestone::text;
  v_from_ix := coalesce(array_position(v_order, v_from), 1);
  v_to_ix   := array_position(v_order, v_to);

  if v_to_ix >= v_from_ix then
    raise exception 'order.revert_denied: % is not behind % — use the forward action',
      v_to, v_project.milestone::text using errcode = 'P0001';
  end if;

  if v_to_ix < array_position(v_order, 'sold') and v_project.paid_at is not null then
    raise exception 'order.revert_denied: reverse the sale before returning this Dearune to %', v_to
      using errcode = 'P0001';
  end if;

  perform set_config('dearune.milestone_override', 'on', true);

  update public.projects
  set milestone = v_to::public.dearune_milestone,
      milestone_updated_at = v_now,
      milestone_updated_by = case when v_actor_type = 'admin' then p_actor else milestone_updated_by end,
      manufactured_at = case
        when v_to_ix < array_position(v_order, 'shipping') then null else manufactured_at end,
      shipped_at = case
        when v_to_ix < array_position(v_order, 'delivery') then null else shipped_at end,
      arrived_at = case
        when v_to_ix < array_position(v_order, 'delivered') then null else arrived_at end
  where id = p_project_id
  returning * into v_project;

  perform set_config('dearune.milestone_override', '', true);

  update public.physical_products
  set manufacturing_completed_at = case
        when v_to_ix < array_position(v_order, 'shipping') then null else manufacturing_completed_at end,
      shipped_at = case
        when v_to_ix < array_position(v_order, 'delivery') then null else shipped_at end,
      delivered_at = case
        when v_to_ix < array_position(v_order, 'delivered') then null else delivered_at end
  where project_id = p_project_id;

  update public.shipping s
  set shipment_state = case
        when v_to_ix < array_position(v_order, 'delivery')
          then case when s.tracking_code is not null or s.carrier is not null
                    then 'awaiting_shipment' else null end
        when v_to_ix < array_position(v_order, 'delivered') then 'shipped'
        else s.shipment_state end,
      shipped_at = case
        when v_to_ix < array_position(v_order, 'delivery') then null else s.shipped_at end,
      delivered_at = case
        when v_to_ix < array_position(v_order, 'delivered') then null else s.delivered_at end
  where s.project_id = p_project_id;

  insert into public.project_events (project_id, actor_type, actor_id, action, detail, created_at)
  values (
    p_project_id,
    case when v_actor_type = 'worker' then 'worker' else 'admin' end,
    p_actor,
    'order.milestone.reverted',
    jsonb_build_object(
      'from', v_from,
      'to', v_to,
      'reason', p_reason,
      'at', v_now
    ),
    v_now
  );

  return v_project;
end;
$$;

-- Record a refund (unchanged contract; the stage names it accepts are the seven
-- new ones via the `delivered` / `after_sale` check below).
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

-- Backend only: no client role may call a transition directly.
revoke execute on function public.ops_move_milestone(uuid, text, uuid, text, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.ops_advance_to(uuid, text, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.ops_start_work_order(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.ops_making_complete(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.ops_save_shipment(uuid, text, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.ops_ship(uuid, text, text, uuid, uuid, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.ops_deliver(uuid, uuid, timestamptz, text, text) from public, anon, authenticated;
revoke execute on function public.ops_after_sale(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.ops_revert_milestone(uuid, text, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.ops_record_refund(uuid, numeric, text, text, text, text, uuid, text, uuid) from public, anon, authenticated;

grant execute on function public.ops_move_milestone(uuid, text, uuid, text, timestamptz, text) to service_role;
grant execute on function public.ops_advance_to(uuid, text, uuid, text, text) to service_role;
grant execute on function public.ops_start_work_order(uuid, uuid, text) to service_role;
grant execute on function public.ops_making_complete(uuid, uuid, text, text) to service_role;
grant execute on function public.ops_save_shipment(uuid, text, text, uuid, uuid) to service_role;
grant execute on function public.ops_ship(uuid, text, text, uuid, uuid, timestamptz, text) to service_role;
grant execute on function public.ops_deliver(uuid, uuid, timestamptz, text, text) to service_role;
grant execute on function public.ops_after_sale(uuid, uuid, text, text) to service_role;
grant execute on function public.ops_revert_milestone(uuid, text, uuid, text, text) to service_role;
grant execute on function public.ops_record_refund(uuid, numeric, text, text, text, text, uuid, text, uuid) to service_role;
grant execute on function public.order_qr_state(text, text, boolean, boolean) to authenticated, service_role;
grant execute on function public.shipping_carrier(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. The order view: one row, one milestone, one QR answer
-- ---------------------------------------------------------------------------
-- Columns are renamed (`qr_target`/`qr_ready` → the four named QR facts), so the
-- view is dropped and recreated rather than replaced. Nothing else depends on
-- it, and the select grant is restored immediately.
drop view if exists public.ops_orders;

create view public.ops_orders
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
  q.blocked_reason            as qr_blocked_reason
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
  'One row per sold Dearune. Making/Shipping/Delivery/After-Sale are milestone filters on this view — never separate copies of an order.';

revoke all on public.ops_orders from anon;
grant select on public.ops_orders to authenticated;

-- Counts per subsection, used by the navigation badges. Same predicate as the
-- view above so the badges can never disagree with the lists.
create or replace view public.ops_milestone_counts
with (security_invoker = true) as
select
  p.milestone::text as milestone,
  count(*)::integer as total
from public.projects p
where p.milestone >= 'sold'::public.dearune_milestone
group by 1;

revoke all on public.ops_milestone_counts from anon;
grant select on public.ops_milestone_counts to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Dry-run / reconciliation report
-- ---------------------------------------------------------------------------
-- Read-only, and now covers every project (including the ones not yet sold).
-- Anything flagged here is a record the migration refused to guess about.
drop view if exists public.ops_identity_report;

create view public.ops_identity_report
with (security_invoker = true) as
select
  x.project_id,
  x.canonical_id,
  x.sold_id,
  x.unit_ids,
  x.unit_count,
  x.is_digital,
  x.shipping_rows,
  x.stored_milestone,
  x.derived_milestone,
  (x.stored_milestone is distinct from x.derived_milestone) as milestone_mismatch,
  (x.unit_count = 0 and not x.is_digital and x.stored_milestone >= 'sold') as missing_units,
  (x.canonical_id is null or btrim(x.canonical_id) = '') as missing_canonical_id,
  (x.sold_id is null) as missing_sold_id,
  x.qr_openable
from (
  select
    p.id as project_id,
    p.reference as canonical_id,
    (select r.value from public.order_references r where r.project_id = p.id and r.kind = 'sold' order by r.created_at limit 1) as sold_id,
    coalesce(array_agg(distinct pp.reference) filter (where pp.reference is not null), array[]::text[]) as unit_ids,
    count(distinct pp.id)::integer as unit_count,
    (coalesce((select wt.kind from public.wrapper_types wt where wt.key = p.wrapper_type), p.wrapper_type) = 'digital') as is_digital,
    (select count(*)::integer from public.shipping s where s.project_id = p.id) as shipping_rows,
    p.milestone::text as stored_milestone,
    case
      when coalesce((select wt.kind from public.wrapper_types wt where wt.key = p.wrapper_type), p.wrapper_type) = 'digital' then
        case
          when p.message_active and p.paid_at is not null then 'delivered'
          when p.paid_at is not null then 'sold'
          else 'configured'
        end
      when p.arrived_at is not null then 'delivered'
      when p.shipped_at is not null then 'delivery'
      when p.manufactured_at is not null then 'shipping'
      when p.paid_at is not null then 'sold'
      else 'configured'
    end as derived_milestone,
    (
      public.order_qr_state(
        p.public_id, p.public_token, p.message_active,
        coalesce((p.payload ->> 'passwordSet')::boolean, false)
      )
    ).openable as qr_openable
  from public.projects p
  left join public.physical_products pp on pp.project_id = p.id
  group by p.id
) x;

revoke all on public.ops_identity_report from anon;
grant select on public.ops_identity_report to authenticated;

-- ---------------------------------------------------------------------------
-- 8. The unit view the printing screens read
-- ---------------------------------------------------------------------------
-- Same truth as `ops_orders`: the order milestone, the canonical Sold ID and
-- the single QR answer. Renamed columns mean this view is replaced, not
-- altered.
drop view if exists public.operations_units;

create view public.operations_units
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
  (
    select r.value from public.order_references r
    where r.project_id = p.id and r.kind = 'sold'
    order by r.created_at
    limit 1
  )                    as sold_id,
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
  s.carrier,
  s.carrier_reference,
  s.address_line1,
  s.address_line2,
  s.city,
  s.state_province,
  s.postal_code,
  s.country,
  s.special_instructions,
  q.destination        as qr_destination,
  q.activated          as qr_activated,
  q.openable           as qr_openable,
  q.blocked_reason     as qr_blocked_reason,
  p.milestone::text    as milestone
from public.physical_products pp
join public.projects p on p.id = pp.project_id
left join public.designers d on d.id = p.designer_id
left join public.shipping s on s.project_id = p.id
cross join lateral public.order_qr_state(
  p.public_id,
  p.public_token,
  p.message_active,
  coalesce((p.payload ->> 'passwordSet')::boolean, false)
) q;

revoke all on public.operations_units from anon;
grant select on public.operations_units to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Worker reads: same records, same milestone, same QR answer
-- ---------------------------------------------------------------------------
-- A worker can never SELECT `projects` (it holds the letter and the money), so
-- these SECURITY DEFINER functions are the only way the Worker Dashboard sees
-- the order. They now return `projects.milestone` instead of deriving a stage
-- from unit timestamps, and the sold/base identifiers come from the registry.
create or replace function public.worker_operations_units(p_include_archived boolean default false)
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
  if not public.worker_has_permission('operations.view') then
    raise exception 'worker.forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_json order by created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select
      pp.created_at,
      jsonb_build_object(
        'id', pp.id,
        'reference', pp.reference,
        'unit_index', pp.unit_index,
        'sold_at', pp.sold_at,
        'manufacturing_completed_at', pp.manufacturing_completed_at,
        'shipped_at', pp.shipped_at,
        'delivered_at', pp.delivered_at,
        'notes', pp.notes,
        'archived_at', pp.archived_at,
        'created_at', pp.created_at,
        'updated_at', pp.updated_at,
        'project_id', p.id,
        'project_reference', p.reference,
        'sold_id', (
          select r.value from public.order_references r
          where r.project_id = p.id and r.kind = 'sold'
          order by r.created_at limit 1
        ),
        'milestone', p.milestone::text,
        'project_title', p.title,
        'public_id', p.public_id,
        'wrapper_type', p.wrapper_type,
        'wrapper_name', coalesce(wt.name, p.wrapper_type),
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
        'carrier', s.carrier,
        'address_line1', s.address_line1,
        'address_line2', s.address_line2,
        'city', s.city,
        'state_province', s.state_province,
        'postal_code', s.postal_code,
        'country', s.country,
        'special_instructions', s.special_instructions,
        'qr_destination', q.destination,
        'qr_activated', q.activated,
        'qr_openable', q.openable,
        'qr_blocked_reason', q.blocked_reason
      ) as row_json
    from public.physical_products pp
    join public.projects p on p.id = pp.project_id
    left join public.wrapper_types wt on wt.key = p.wrapper_type
    left join public.designers d on d.id = p.designer_id
    left join public.shipping s on s.project_id = p.id
    cross join lateral public.order_qr_state(
      p.public_id, p.public_token, p.message_active,
      coalesce((p.payload ->> 'passwordSet')::boolean, false)
    ) q
    where p_include_archived or pp.archived_at is null
    order by pp.created_at desc
    limit 500
  ) units;

  return v_rows;
end;
$$;

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
        'sold_at', pp.sold_at,
        'manufacturing_completed_at', pp.manufacturing_completed_at,
        'shipped_at', pp.shipped_at,
        'delivered_at', pp.delivered_at,
        'notes', pp.notes,
        'archived_at', pp.archived_at,
        'created_at', pp.created_at,
        'updated_at', pp.updated_at,
        'project_id', p.id,
        'project_reference', p.reference,
        'sold_id', (
          select r.value from public.order_references r
          where r.project_id = p.id and r.kind = 'sold'
          order by r.created_at limit 1
        ),
        'milestone', p.milestone::text,
        'project_title', p.title,
        'public_id', p.public_id,
        'public_token', p.public_token,
        'wrapper_type', p.wrapper_type,
        'wrapper_name', coalesce(wt.name, p.wrapper_type),
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
        'carrier', s.carrier,
        'address_line1', s.address_line1,
        'address_line2', s.address_line2,
        'city', s.city,
        'state_province', s.state_province,
        'postal_code', s.postal_code,
        'country', s.country,
        'special_instructions', s.special_instructions,
        'qr_destination', q.destination,
        'qr_activated', q.activated,
        'qr_openable', q.openable,
        'qr_blocked_reason', q.blocked_reason
      ) as row_json
    from public.physical_products pp
    join public.projects p on p.id = pp.project_id
    left join public.wrapper_types wt on wt.key = p.wrapper_type
    left join public.designers d on d.id = p.designer_id
    left join public.shipping s on s.project_id = p.id
    cross join lateral public.order_qr_state(
      p.public_id, p.public_token, p.message_active,
      coalesce((p.payload ->> 'passwordSet')::boolean, false)
    ) q
    where p_product_ids is null or pp.id = any(p_product_ids)
    order by pp.created_at asc
    limit 200
  ) units;

  return v_rows;
end;
$$;

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
        'project_reference', p.reference,
        'sold_id', (
          select r.value from public.order_references r
          where r.project_id = p.id and r.kind = 'sold'
          order by r.created_at limit 1
        ),
        'milestone', p.milestone::text,
        'sold_at', pp.sold_at,
        'manufacturing_completed_at', pp.manufacturing_completed_at,
        'shipped_at', pp.shipped_at,
        'delivered_at', pp.delivered_at,
        'archived_at', pp.archived_at,
        'created_at', pp.created_at,
        'updated_at', pp.updated_at,
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

-- The QA scan: one Dearune, its units, its shipment and its timeline. The
-- project carries the authoritative milestone now (`status` was a duplicate).
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
  v_qr       jsonb;
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

  v_qr := to_jsonb(public.order_qr_state(
    v_project.public_id,
    v_project.public_token,
    v_project.message_active,
    coalesce((v_project.payload ->> 'passwordSet')::boolean, false)
  ));

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pp.id,
    'reference', pp.reference,
    'unit_index', pp.unit_index,
    'sold_at', pp.sold_at,
    'manufacturing_completed_at', pp.manufacturing_completed_at,
    'shipped_at', pp.shipped_at,
    'delivered_at', pp.delivered_at,
    'notes', pp.notes,
    'archived_at', pp.archived_at,
    'created_at', pp.created_at,
    'updated_at', pp.updated_at,
    -- The unit's stage is the ORDER's one milestone, and its QR answer is the
    -- same one the admin and worker lists use.
    'milestone', v_project.milestone::text,
    'sold_id', (
      select r.value from public.order_references r
      where r.project_id = v_project.id and r.kind = 'sold'
      order by r.created_at limit 1
    ),
    'qr_destination', (v_qr ->> 'destination')::boolean,
    'qr_activated', (v_qr ->> 'activated')::boolean,
    'qr_openable', (v_qr ->> 'openable')::boolean,
    'qr_blocked_reason', v_qr ->> 'blocked_reason'
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
      'sold_id', (
        select r.value from public.order_references r
        where r.project_id = v_project.id and r.kind = 'sold'
        order by r.created_at limit 1
      ),
      'title', v_project.title,
      'milestone', v_project.milestone::text,
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
      'message_protected', coalesce((v_project.payload ->> 'passwordSet')::boolean, false),
      'qr_destination', v_qr ->> 'destination',
      'qr_activated', v_qr ->> 'activated',
      'qr_openable', v_qr ->> 'openable',
      'qr_blocked_reason', v_qr ->> 'blocked_reason'
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

-- Designers: the directory. "Active" means not archived — `projects.status`
-- was a second copy of the same fact.
create or replace function public.worker_designers()
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
    'id', d.id,
    'name', d.name,
    'code', d.code,
    'revokedAt', d.revoked_at,
    'lastLoginAt', d.last_login_at,
    'createdAt', d.created_at,
    'updatedAt', d.updated_at,
    'projectCount', (
      select count(*)::integer from public.projects p where p.designer_id = d.id
    ),
    'activeProjectCount', (
      select count(*)::integer from public.projects p
      where p.designer_id = d.id and p.archived_at is null
    )
  ) order by d.created_at desc), '[]'::jsonb)
  into v_rows
  from public.designers d;

  return v_rows;
end;
$$;

-- Designers: their Dearunes. `status` is replaced by the authoritative
-- `milestone`; the Sold ID comes from the registry.
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
    'sold_id', p.sold_id,
    'designer_id', p.designer_id,
    'template_slug', p.template_slug,
    'template_version', p.template_version,
    'title', p.title,
    'milestone', p.milestone::text,
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
    select p.*, wt.name as wt_name,
      (
        select r.value from public.order_references r
        where r.project_id = p.id and r.kind = 'sold'
        order by r.created_at limit 1
      ) as sold_id
    from public.projects p
    left join public.wrapper_types wt on wt.key = p.wrapper_type
    where p_designer_id is null or p.designer_id = p_designer_id
    order by p.created_at desc
    limit 300
  ) p;

  return v_rows;
end;
$$;

-- One designer, their Dearunes and their recent timeline.
create or replace function public.worker_designer_detail(p_designer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_designer jsonb;
  v_projects jsonb;
  v_events   jsonb;
begin
  if public.current_worker_id() is null then
    raise exception 'worker.inactive_or_unknown' using errcode = '42501';
  end if;
  if not public.worker_has_permission('designers.view')
     or not public.worker_has_permission('designers.view_details') then
    raise exception 'worker.forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', d.id,
    'name', d.name,
    'code', d.code,
    'revokedAt', d.revoked_at,
    'lastLoginAt', d.last_login_at,
    'createdAt', d.created_at,
    'updatedAt', d.updated_at,
    'projectCount', (select count(*)::integer from public.projects p where p.designer_id = d.id),
    'unpaidProjectCount', (
      select count(*)::integer from public.projects p
      where p.designer_id = d.id
        and p.paid_at is null
        and p.archived_at is null
    ),
    'inStudioCount', (
      select count(*)::integer from public.projects p
      where p.designer_id = d.id
        and p.milestone in ('making', 'shipping', 'delivery')
        and p.archived_at is null
    )
  )
  into v_designer
  from public.designers d
  where d.id = p_designer_id;

  if v_designer is null then
    raise exception 'designer.not_found' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', recent.id,
    'reference', recent.reference,
    'sold_id', recent.sold_id,
    'title', recent.title,
    'milestone', recent.milestone::text,
    'template_slug', recent.template_slug,
    'wrapper_type', recent.wrapper_type,
    'public_id', recent.public_id,
    'configured_at', recent.configured_at,
    'submitted_at', recent.submitted_at,
    'created_at', recent.created_at,
    'updated_at', recent.updated_at,
    'manufactured_at', recent.manufactured_at,
    'shipped_at', recent.shipped_at,
    'arrived_at', recent.arrived_at,
    'archived_at', recent.archived_at,
    'first_activated_at', recent.first_activated_at,
    'message_active', recent.message_active
  ) order by recent.created_at desc), '[]'::jsonb)
  into v_projects
  from (
    select p.*,
      (
        select r.value from public.order_references r
        where r.project_id = p.id and r.kind = 'sold'
        order by r.created_at limit 1
      ) as sold_id
    from public.projects p
    where p.designer_id = p_designer_id
    order by p.created_at desc
    limit 300
  ) recent;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'projectId', e.project_id,
    'action', e.action,
    'actorType', e.actor_type,
    'createdAt', e.created_at
  ) order by e.created_at desc), '[]'::jsonb)
  into v_events
  from (
    select e.*
    from public.project_events e
    join public.projects p on p.id = e.project_id
    where p.designer_id = p_designer_id
    order by e.created_at desc
    limit 100
  ) e;

  return jsonb_build_object(
    'designer', v_designer,
    'projects', v_projects,
    'events', v_events
  );
end;
$$;

-- One Dearune for the worker detail sheet. Same milestone, same QR answer, no
-- money and no letter.
create or replace function public.worker_dearune_detail(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_worker_id uuid;
  v_project   record;
  v_designer  record;
  v_shipping  record;
  v_units     jsonb;
  v_events    jsonb;
  v_wrapper   record;
  v_template  record;
  v_qr        jsonb;
  result      jsonb;
begin
  v_worker_id := public.current_worker_id();
  if v_worker_id is null then
    raise exception 'worker.unauthenticated';
  end if;
  if not public.worker_has_permission('designers.view') and not public.worker_has_permission('operations.view') then
    raise exception 'worker.forbidden';
  end if;

  select * into v_project from public.projects where id = p_project_id;
  if not found then
    raise exception 'dearune.not_found';
  end if;

  select * into v_designer from public.designers where id = v_project.designer_id;
  select * into v_shipping from public.shipping where project_id = p_project_id;
  select * into v_wrapper from public.wrapper_types where key = v_project.wrapper_type;
  select * into v_template from public.templates where slug = v_project.template_slug;

  v_qr := to_jsonb(public.order_qr_state(
    v_project.public_id,
    v_project.public_token,
    v_project.message_active,
    coalesce((v_project.payload ->> 'passwordSet')::boolean, false)
  ));

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pp.id,
    'reference', pp.reference,
    'unit_index', pp.unit_index,
    'sold_at', pp.sold_at,
    'manufacturing_completed_at', pp.manufacturing_completed_at,
    'shipped_at', pp.shipped_at,
    'delivered_at', pp.delivered_at,
    'notes', pp.notes,
    'archived_at', pp.archived_at,
    'created_at', pp.created_at,
    'updated_at', pp.updated_at,
    -- The unit's stage is the ORDER's one milestone, and its QR answer is the
    -- same one the admin and worker lists use.
    'milestone', v_project.milestone::text,
    'sold_id', (
      select r.value from public.order_references r
      where r.project_id = v_project.id and r.kind = 'sold'
      order by r.created_at limit 1
    ),
    'qr_destination', (v_qr ->> 'destination')::boolean,
    'qr_activated', (v_qr ->> 'activated')::boolean,
    'qr_openable', (v_qr ->> 'openable')::boolean,
    'qr_blocked_reason', v_qr ->> 'blocked_reason'
  ) order by pp.unit_index), '[]'::jsonb)
  into v_units
  from public.physical_products pp
  where pp.project_id = p_project_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', pe.id,
    'physical_product_id', pe.physical_product_id,
    'action', pe.action,
    'detail', pe.detail,
    'created_at', pe.created_at
  ) order by pe.created_at desc), '[]'::jsonb)
  into v_events
  from public.physical_product_events pe
  join public.physical_products pp on pp.id = pe.physical_product_id
  where pp.project_id = p_project_id;

  result := jsonb_build_object(
    'project', jsonb_build_object(
      'id', v_project.id,
      'reference', v_project.reference,
      'sold_id', (
        select r.value from public.order_references r
        where r.project_id = v_project.id and r.kind = 'sold'
        order by r.created_at limit 1
      ),
      'title', v_project.title,
      'public_id', v_project.public_id,
      'milestone', v_project.milestone::text,
      'wrapper_type', v_project.wrapper_type,
      'wrapper_name', coalesce(v_wrapper.name, v_project.wrapper_type),
      'wrapper_kind', coalesce(v_wrapper.kind, case when v_project.wrapper_type = 'digital' then 'digital' else 'physical' end),
      'template_slug', v_project.template_slug,
      'template_name', v_template.name,
      'paid_at', v_project.paid_at,
      'manufactured_at', v_project.manufactured_at,
      'shipped_at', v_project.shipped_at,
      'arrived_at', v_project.arrived_at,
      'archived_at', v_project.archived_at,
      'message_active', v_project.message_active,
      'submitted_at', v_project.submitted_at,
      'created_at', v_project.created_at,
      'updated_at', v_project.updated_at,
      'qr_destination', v_qr ->> 'destination',
      'qr_activated', v_qr ->> 'activated',
      'qr_openable', v_qr ->> 'openable',
      'qr_blocked_reason', v_qr ->> 'blocked_reason',
      'sale_price', null,
      'estimated_cost', null
    ),
    'designer', case when v_designer.id is not null then jsonb_build_object(
      'id', v_designer.id,
      'name', v_designer.name,
      'code', v_designer.code
    ) else null end,
    'shipping', case when v_shipping.id is not null then jsonb_build_object(
      'recipient_name', v_shipping.recipient_name,
      'phone', v_shipping.phone,
      'address_line1', v_shipping.address_line1,
      'address_line2', v_shipping.address_line2,
      'city', v_shipping.city,
      'state_province', v_shipping.state_province,
      'governorate', v_shipping.governorate,
      'district', v_shipping.district,
      'postal_code', v_shipping.postal_code,
      'country', v_shipping.country,
      'special_instructions', v_shipping.special_instructions,
      'tracking_code', v_shipping.tracking_code,
      'provider', v_shipping.provider,
      'carrier', v_shipping.carrier
    ) else null end,
    'units', v_units,
    'events', v_events
  );

  return result;
end;
$$;

-- Opening the Operations record for a Dearune. Returns the same milestone the
-- cabinet reads.
create or replace function public.worker_ensure_operations(
  p_project_id uuid,
  p_units integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker  uuid := public.current_worker_id();
  v_wrapper text;
  v_units   integer := coalesce(p_units, 1);
  v_row     public.physical_products%rowtype;
  v_rows    jsonb := '[]'::jsonb;
  v_project public.projects;
begin
  if v_worker is null then
    raise exception 'worker.inactive_or_unknown' using errcode = '42501';
  end if;
  if not public.worker_has_permission('operations.view')
     or not (
       public.worker_has_permission('operations.create')
       or public.worker_has_permission('operations.manage')
     ) then
    raise exception 'worker.forbidden' using errcode = '42501';
  end if;
  if v_units < 1 or v_units > 20 then
    raise exception 'operations.units_out_of_range' using errcode = '22023';
  end if;

  select wrapper_type into v_wrapper from public.projects where id = p_project_id;
  if not found then
    raise exception 'project.not_found' using errcode = 'P0002';
  end if;
  if v_wrapper is null or v_wrapper = 'digital' then
    raise exception 'operations.not_physical' using errcode = '22023';
  end if;

  -- One transition mechanism: opening the record is what enters Making.
  v_project := public.ops_start_work_order(p_project_id, v_worker, 'worker');

  for v_row in
    select * from public.ensure_physical_products(p_project_id, v_units, null)
  loop
    if not exists (
      select 1 from public.physical_product_events e
      where e.physical_product_id = v_row.id and e.action = 'operations.opened'
    ) then
      insert into public.physical_product_events (physical_product_id, actor_type, actor_id, action, detail)
      values (v_row.id, 'worker', v_worker, 'operations.opened', jsonb_build_object('unit_index', v_row.unit_index));
    end if;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'id', v_row.id,
      'reference', v_row.reference,
      'unit_index', v_row.unit_index,
      'sold_at', v_row.sold_at,
      'manufacturing_completed_at', v_row.manufacturing_completed_at,
      'shipped_at', v_row.shipped_at,
      'delivered_at', v_row.delivered_at
    ));
  end loop;

  perform public.record_admin_audit(
    v_worker, 'worker', 'worker.operation.units_opened', 'project', p_project_id::text,
    jsonb_build_object('units_requested', v_units)
  );

  return jsonb_build_object('units', v_rows, 'milestone', v_project.milestone::text);
end;
$$;

-- Worker milestone actions now DELEGATE to the one transition mechanism. They
-- keep their own permission check, maintenance gate and audit row; they no
-- longer write `projects`/`physical_products` stamps themselves.
create or replace function public.worker_mark_dearune_manufactured(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_id uuid := public.current_worker_id();
  v_project   public.projects;
  v_units     integer := 0;
  v_maintenance boolean;
begin
  if v_worker_id is null then raise exception 'worker.unauthenticated'; end if;
  if not public.worker_has_permission('operations.mark_manufactured') then raise exception 'worker.forbidden'; end if;

  select maintenance_mode into v_maintenance from public.app_settings where id = 1;
  if v_maintenance then raise exception 'maintenance_mode'; end if;

  select * into v_project from public.projects where id = p_project_id;
  if not found then raise exception 'dearune.not_found'; end if;
  if v_project.archived_at is not null then raise exception 'dearune.archived'; end if;
  if v_project.paid_at is null then raise exception 'dearune.not_sold'; end if;
  if coalesce(v_project.wrapper_type, '') = 'digital' then raise exception 'dearune.digital'; end if;

  v_project := public.ops_making_complete(p_project_id, v_worker_id, 'Made by worker', 'worker');

  select count(*)::integer into v_units from public.physical_products where project_id = p_project_id;

  insert into public.worker_audit_logs (worker_id, action, entity_type, entity_id, metadata)
  values (v_worker_id, 'operations.mark_manufactured', 'project', p_project_id,
          jsonb_build_object('units', v_units, 'milestone', v_project.milestone::text));

  return jsonb_build_object('ok', true, 'units_updated', v_units, 'milestone', v_project.milestone::text);
end;
$$;

create or replace function public.worker_mark_dearune_shipped(
  p_project_id uuid,
  p_tracking_code text default null,
  p_provider text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_id   uuid := public.current_worker_id();
  v_project     public.projects;
  v_shipping    public.shipping;
  v_tracking    text := nullif(btrim(coalesce(p_tracking_code, '')), '');
  v_carrier     text;
  v_units       integer := 0;
  v_maintenance boolean;
begin
  if v_worker_id is null then raise exception 'worker.unauthenticated'; end if;
  if not public.worker_has_permission('operations.mark_shipped') then raise exception 'worker.forbidden'; end if;

  select maintenance_mode into v_maintenance from public.app_settings where id = 1;
  if v_maintenance then raise exception 'maintenance_mode'; end if;

  select * into v_project from public.projects where id = p_project_id;
  if not found then raise exception 'dearune.not_found'; end if;
  if v_project.archived_at is not null then raise exception 'dearune.archived'; end if;
  if v_project.paid_at is null then raise exception 'dearune.not_sold'; end if;
  if coalesce(v_project.wrapper_type, '') = 'digital' then raise exception 'dearune.digital'; end if;

  if v_project.milestone::text in ('configured', 'sold', 'making') then
    raise exception 'dearune.not_manufactured';
  end if;

  -- The address the courier needs must exist before a parcel is declared
  -- shipped.
  select * into v_shipping from public.shipping where project_id = p_project_id;
  if not found then raise exception 'shipping_address_missing'; end if;
  if v_shipping.recipient_name is null
     or v_shipping.address_line1 is null
     or v_shipping.city is null
     or v_shipping.country is null then
    raise exception 'shipping_address_incomplete';
  end if;

  -- One carrier vocabulary: the same classifier the rest of the system uses.
  v_carrier := coalesce(public.shipping_carrier(p_provider), v_shipping.carrier);
  if v_carrier is null then
    raise exception 'shipping.carrier_required';
  end if;
  if v_tracking is null then
    raise exception 'shipping.tracking_required';
  end if;

  v_project := public.ops_ship(p_project_id, v_carrier, v_tracking, null, v_worker_id, null, 'worker');

  select count(*)::integer into v_units from public.physical_products where project_id = p_project_id;

  insert into public.worker_audit_logs (worker_id, action, entity_type, entity_id, metadata)
  values (v_worker_id, 'operations.mark_shipped', 'project', p_project_id,
          jsonb_build_object('units', v_units, 'carrier', v_carrier, 'tracking', v_tracking,
                             'milestone', v_project.milestone::text));

  return jsonb_build_object('ok', true, 'units_updated', v_units, 'milestone', v_project.milestone::text);
end;
$$;

create or replace function public.worker_mark_dearune_delivered(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_id uuid := public.current_worker_id();
  v_project   public.projects;
  v_units     integer := 0;
  v_maintenance boolean;
begin
  if v_worker_id is null then raise exception 'worker.unauthenticated'; end if;
  if not public.worker_has_permission('operations.mark_delivered') then raise exception 'worker.forbidden'; end if;

  select maintenance_mode into v_maintenance from public.app_settings where id = 1;
  if v_maintenance then raise exception 'maintenance_mode'; end if;

  select * into v_project from public.projects where id = p_project_id;
  if not found then raise exception 'dearune.not_found'; end if;
  if v_project.archived_at is not null then raise exception 'dearune.archived'; end if;
  if v_project.paid_at is null then raise exception 'dearune.not_sold'; end if;
  if coalesce(v_project.wrapper_type, '') = 'digital' then raise exception 'dearune.digital'; end if;
  if v_project.milestone::text in ('configured', 'sold', 'making', 'shipping') then
    raise exception 'dearune.not_shipped';
  end if;

  v_project := public.ops_deliver(p_project_id, v_worker_id, null, 'Delivered by worker', 'worker');

  select count(*)::integer into v_units from public.physical_products where project_id = p_project_id;

  insert into public.worker_audit_logs (worker_id, action, entity_type, entity_id, metadata)
  values (v_worker_id, 'operations.mark_delivered', 'project', p_project_id,
          jsonb_build_object('units', v_units, 'milestone', v_project.milestone::text));

  return jsonb_build_object('ok', true, 'units_updated', v_units, 'milestone', v_project.milestone::text);
end;
$$;

-- Shipping export for the Designers screen: the same milestone and identifiers.
create or replace function public.worker_export_shipments()
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
  if not public.worker_has_permission('designers.view')
     or not public.worker_has_permission('designers.export') then
    raise exception 'worker.forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_json order by created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select
      p.created_at,
      jsonb_build_object(
        'reference', coalesce(p.reference, p.id::text),
        'sold_id', (
          select r.value from public.order_references r
          where r.project_id = p.id and r.kind = 'sold'
          order by r.created_at limit 1
        ),
        'milestone', p.milestone::text,
        'title', p.title,
        'template_slug', p.template_slug,
        'wrapper_type', p.wrapper_type,
        'paid_at', p.paid_at,
        'manufactured_at', p.manufactured_at,
        'shipped_at', p.shipped_at,
        'arrived_at', p.arrived_at,
        'archived_at', p.archived_at,
        'message_active', p.message_active,
        'recipient_name', s.recipient_name,
        'address_line1', s.address_line1,
        'address_line2', s.address_line2,
        'city', s.city,
        'state_province', s.state_province,
        'postal_code', s.postal_code,
        'country', s.country,
        'phone', s.phone,
        'special_instructions', s.special_instructions,
        'carrier', s.carrier,
        'carrier_reference', s.carrier_reference,
        'tracking_code', s.tracking_code
      ) as row_json
    from public.projects p
    join public.shipping s on s.project_id = p.id
    order by p.created_at desc
    limit 5000
  ) shipments;

  return v_rows;
end;
$$;

-- Dead since `physical_products.status` was dropped: it referenced a column
-- that no longer exists and was still granted to clients.
drop function if exists public.worker_set_operation_status(uuid, text, text);

-- ---------------------------------------------------------------------------
-- 10. Privileges for every function touched above
-- ---------------------------------------------------------------------------
revoke execute on function public.worker_operations_units(boolean) from public, anon, authenticated;
revoke execute on function public.worker_operations_print(uuid[]) from public, anon, authenticated;
revoke execute on function public.worker_export_operations(boolean) from public, anon, authenticated;
revoke execute on function public.worker_qa_lookup(text, text) from public, anon, authenticated;
revoke execute on function public.worker_designers() from public, anon, authenticated;
revoke execute on function public.worker_projects(uuid) from public, anon, authenticated;
revoke execute on function public.worker_designer_detail(uuid) from public, anon, authenticated;
revoke execute on function public.worker_dearune_detail(uuid) from public, anon, authenticated;
revoke execute on function public.worker_ensure_operations(uuid, integer) from public, anon, authenticated;
revoke execute on function public.worker_mark_dearune_manufactured(uuid) from public, anon, authenticated;
revoke execute on function public.worker_mark_dearune_shipped(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.worker_mark_dearune_delivered(uuid) from public, anon, authenticated;
revoke execute on function public.worker_export_shipments() from public, anon, authenticated;

grant execute on function public.worker_operations_units(boolean) to authenticated;
grant execute on function public.worker_operations_print(uuid[]) to authenticated;
grant execute on function public.worker_export_operations(boolean) to authenticated;
grant execute on function public.worker_qa_lookup(text, text) to authenticated;
grant execute on function public.worker_designers() to authenticated;
grant execute on function public.worker_projects(uuid) to authenticated;
grant execute on function public.worker_designer_detail(uuid) to authenticated;
grant execute on function public.worker_dearune_detail(uuid) to authenticated;
grant execute on function public.worker_ensure_operations(uuid, integer) to authenticated;
grant execute on function public.worker_mark_dearune_manufactured(uuid) to authenticated;
grant execute on function public.worker_mark_dearune_shipped(uuid, text, text) to authenticated;
grant execute on function public.worker_mark_dearune_delivered(uuid) to authenticated;
grant execute on function public.worker_export_shipments() to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Announce what this run did, without changing anything else
-- ---------------------------------------------------------------------------
do $$
declare
  v_orders     integer;
  v_units      integer;
  v_aliases    integer;
  v_mismatch   integer;
  v_no_units   integer;
  v_no_sold    integer;
  v_qr_blocked integer;
begin
  select count(*) into v_orders from public.projects where milestone >= 'sold'::public.dearune_milestone;
  select count(*) into v_units from public.physical_products;
  select count(*) into v_aliases from public.order_references;
  select count(*) into v_mismatch from public.ops_identity_report where milestone_mismatch;
  select count(*) into v_no_units from public.ops_identity_report where missing_units;
  select count(*) into v_no_sold from public.ops_identity_report where missing_sold_id;
  select count(*) into v_qr_blocked from public.ops_orders where not qr_openable;

  raise notice 'unified order model: % sold order(s), % physical unit(s), % identifier(s) registered',
    v_orders, v_units, v_aliases;
  raise notice 'unified order model: % milestone mismatch(es), % order(s) with no unit, % order(s) with no Sold ID',
    v_mismatch, v_no_units, v_no_sold;
  raise notice 'unified order model: % sold order(s) whose QR will not open — see ops_identity_report / qr_blocked_reason',
    v_qr_blocked;
end $$;
