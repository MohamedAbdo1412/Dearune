-- Designer operations: one Dearune = one project, one immutable sale ledger.
--
-- Until now two record models coexisted:
--
--   * `orders` (+ `messages`, `shipping`, `order_events`) — created by the
--     admin "New sale" flow, used by the separate Sales/Sells screens.
--   * `projects` — created when a designer hands a book over through Create
--     Dearune (`designer-projects` POST). This is the Dearune the studio
--     actually wrote.
--
-- This migration makes `projects` THE Dearune record the admin operates on,
-- gives it the operational timestamps a sale needs (paid/made/shipped/
-- arrived, wrapper, price snapshot), and introduces `sales_log` — the
-- immutable money ledger. Nothing is deleted: every legacy order that was
-- ever paid is carried into the ledger once, with its own reference and its
-- own currency, so history survives the merge.
--
-- Rules enforced here (the edge function enforces them again with friendly
-- messages; the database is the backstop):
--   * one ACTIVE sale per project   → partial unique index
--   * a sale's money never changes  → update guard trigger
--   * a sale is never deleted       → delete guard trigger (void instead)
--   * stage order                   → check constraint on projects
--   * admin reads only              → RLS select policies; all writes go
--                                      through Edge Functions (service role)

-- ---------------------------------------------------------------------------
-- Sequences (human-readable references)
-- ---------------------------------------------------------------------------
create sequence if not exists public.project_reference_seq;
create sequence if not exists public.sale_reference_seq;

-- ---------------------------------------------------------------------------
-- 1. Projects: operational columns
-- ---------------------------------------------------------------------------
alter table public.projects
  add column if not exists reference       text,
  add column if not exists configured_at   timestamptz,
  add column if not exists wrapper_type    text,
  add column if not exists sale_price      numeric(10, 2),
  add column if not exists estimated_cost  numeric(10, 2),
  add column if not exists currency        text not null default 'EGP',
  add column if not exists paid_at         timestamptz,
  add column if not exists manufactured_at timestamptz,
  add column if not exists shipped_at      timestamptz,
  add column if not exists arrived_at      timestamptz,
  add column if not exists archived_at     timestamptz;

alter table public.projects
  drop constraint if exists projects_wrapper_type_check;
alter table public.projects
  add constraint projects_wrapper_type_check
  check (wrapper_type is null or wrapper_type in ('digital', 'open_letter', 'sealed_letter', 'open_card'));

alter table public.projects
  drop constraint if exists projects_stage_order_check;
alter table public.projects
  add constraint projects_stage_order_check
  check (
    (manufactured_at is null or paid_at is not null)
    and (shipped_at is null or manufactured_at is not null)
    and (arrived_at is null or shipped_at is not null)
    and (paid_at is null or sale_price is not null)
  );

-- A Dearune is "configured" the moment the designer hands it over.
update public.projects set configured_at = submitted_at where configured_at is null;
alter table public.projects alter column configured_at set default now();

-- Dearunes submitted BEFORE this migration have no reference yet. Mint them
-- straight from the sequence so numbers and sequence stay aligned (the
-- trigger below only runs on new inserts). Idempotent: a re-run finds no
-- empty reference and changes nothing.
do $$
declare
  r record;
begin
  for r in
    select id
    from public.projects
    where reference is null or reference = ''
    order by created_at, id
  loop
    update public.projects
      set reference = 'DR-' || lpad(nextval('public.project_reference_seq')::text, 6, '0')
      where id = r.id;
  end loop;
end $$;

-- Reference + configured_at are minted server-side on insert, so a submission
-- through Create Dearune gets them without the client asking.
create or replace function public.assign_project_reference()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.reference is null or new.reference = '' then
    new.reference := 'DR-' || lpad(nextval('public.project_reference_seq')::text, 6, '0');
  end if;
  if new.configured_at is null then
    new.configured_at := coalesce(new.submitted_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists projects_assign_reference on public.projects;
create trigger projects_assign_reference before insert on public.projects
  for each row execute function public.assign_project_reference();

create unique index if not exists projects_reference_key on public.projects (reference);

-- ---------------------------------------------------------------------------
-- 2. Shipping: a shipping row belongs to an order OR to a project
-- ---------------------------------------------------------------------------
alter table public.shipping
  add column if not exists project_id uuid references public.projects (id) on delete cascade;

alter table public.shipping alter column order_id drop not null;
alter table public.shipping alter column address_line1 drop not null;
alter table public.shipping alter column city drop not null;
alter table public.shipping alter column postal_code drop not null;
alter table public.shipping alter column country drop not null;

alter table public.shipping drop constraint if exists shipping_owner_check;
alter table public.shipping add constraint shipping_owner_check
  check (order_id is not null or project_id is not null);

create unique index if not exists shipping_project_id_key on public.shipping (project_id)
  where project_id is not null;

-- ---------------------------------------------------------------------------
-- 3. sales_log — the immutable EGP ledger of every Dearune ever sold
-- ---------------------------------------------------------------------------
create table if not exists public.sales_log (
  id                uuid primary key default gen_random_uuid(),
  sale_reference    text not null unique
                      default ('DR-S-' || lpad(nextval('public.sale_reference_seq')::text, 6, '0')),
  project_id        uuid references public.projects (id) on delete set null,
  legacy_order_id   uuid references public.orders (id) on delete set null,
  designer_id       uuid references public.designers (id) on delete set null,
  designer_name     text,
  template_id       uuid,
  template_name     text,
  wrapper_type      text,
  title             text,
  sold_at           timestamptz not null default now(),
  selling_price     numeric(10, 2) not null check (selling_price >= 0),
  estimated_cost    numeric(10, 2) not null default 0 check (estimated_cost >= 0),
  -- Profit is derived, never typed: price − cost, always, by the database.
  estimated_profit  numeric(10, 2) generated always as (selling_price - estimated_cost) stored,
  currency          text not null default 'EGP',
  status            text not null default 'completed'
                      check (status in ('completed', 'voided')),
  voided_at         timestamptz,
  void_reason       text,
  voided_by         uuid references public.admin_users (id) on delete set null,
  confirmed_by      uuid references public.admin_users (id) on delete set null,
  snapshot_data     jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  check (status = 'completed' or voided_at is not null)
);

-- A Dearune has at most ONE active (completed) sale. Voided rows are kept
-- forever, so a corrected sale can be recorded again without ever deleting
-- the original transaction.
create unique index if not exists sales_log_active_project_key
  on public.sales_log (project_id)
  where project_id is not null and status = 'completed';

create index if not exists sales_log_sold_at_idx on public.sales_log (sold_at desc);
create index if not exists sales_log_designer_idx on public.sales_log (designer_id, sold_at desc);
create index if not exists sales_log_status_idx on public.sales_log (status, sold_at desc);

-- A sale is a fact: its money can never be rewritten, and it is never
-- deleted — corrections go through VOID (status + reason + who + when).
create or replace function public.sales_log_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Sold log entries are never deleted';
  end if;

  if new.selling_price is distinct from old.selling_price
     or new.estimated_cost is distinct from old.estimated_cost
     or new.estimated_profit is distinct from old.estimated_profit
     or new.currency is distinct from old.currency
     or new.sold_at is distinct from old.sold_at
     or new.sale_reference is distinct from old.sale_reference then
    raise exception 'A sold log entry is immutable';
  end if;

  if old.status = 'voided' then
    raise exception 'A voided sale cannot change';
  end if;

  if new.status = 'voided' then
    if new.voided_at is null then
      raise exception 'A voided sale needs a timestamp';
    end if;
    if new.void_reason is null or btrim(new.void_reason) = '' then
      raise exception 'A voided sale needs a reason';
    end if;
  elsif new.status is distinct from old.status then
    raise exception 'A sale can only move from completed to voided';
  end if;

  return new;
end;
$$;

drop trigger if exists sales_log_guard on public.sales_log;
create trigger sales_log_guard before update or delete on public.sales_log
  for each row execute function public.sales_log_guard();

-- ---------------------------------------------------------------------------
-- 4. project_events — the per-Dearune timeline
-- ---------------------------------------------------------------------------
create table if not exists public.project_events (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  actor_type  text not null check (actor_type in ('admin', 'designer', 'system', 'customer')),
  actor_id    uuid,
  action      text not null,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists project_events_project_id_idx on public.project_events (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 5. The studio runs in EGP
-- ---------------------------------------------------------------------------
alter table public.app_settings alter column currency set default 'EGP';
update public.app_settings set currency = 'EGP' where id = 1;

-- ---------------------------------------------------------------------------
-- 6. RLS: admins read over PostgREST, the service role writes
-- ---------------------------------------------------------------------------
alter table public.sales_log enable row level security;
alter table public.project_events enable row level security;
alter table public.projects enable row level security;

grant select on public.projects to authenticated;
grant select on public.sales_log to authenticated;
grant select on public.project_events to authenticated;

-- The ledger and the timeline are read-only from the browser. Only Edge
-- Functions (service role) may write them.
revoke insert, update, delete, truncate on public.sales_log from anon, authenticated;
revoke insert, update, delete, truncate on public.project_events from anon, authenticated;
-- `projects` stays write-locked for anon/authenticated (designer_projects
-- already revoked everything; only SELECT is handed back for the admin).

drop policy if exists "admins_read_projects" on public.projects;
create policy "admins_read_projects" on public.projects
  for select to authenticated using (public.is_dearune_admin());

drop policy if exists "admins_read_sales_log" on public.sales_log;
create policy "admins_read_sales_log" on public.sales_log
  for select to authenticated using (public.is_dearune_admin());

drop policy if exists "admins_read_project_events" on public.project_events;
create policy "admins_read_project_events" on public.project_events
  for select to authenticated using (public.is_dearune_admin());

-- ---------------------------------------------------------------------------
-- 7. Carry every legacy paid order into the ledger (once)
--
-- Paid + cancelled orders become VOIDED rows (the money was corrected away);
-- paid + live orders become COMPLETED rows. Their original currency is kept
-- exactly as it was recorded — history is never re-priced.
-- ---------------------------------------------------------------------------
insert into public.sales_log (
  legacy_order_id, designer_id, designer_name, template_id, template_name,
  wrapper_type, title, sold_at, selling_price, estimated_cost,
  currency, status, voided_at, void_reason, snapshot_data
)
select
  o.id,
  o.designer_id,
  d.name,
  o.template_id,
  t.name,
  o.wrapper_type,
  o.recipient_name,
  o.paid_at,
  o.snapshot_price,
  o.estimated_cost,
  o.currency,
  case when o.cancelled_at is not null then 'voided' else 'completed' end,
  o.cancelled_at,
  case when o.cancelled_at is not null then coalesce(o.cancel_reason, 'legacy order cancelled') end,
  jsonb_build_object(
    'source', 'legacy-order',
    'legacy_order_id', o.id,
    'legacy_created_at', o.created_at,
    'legacy_cancelled_at', o.cancelled_at
  )
from public.orders o
left join public.designers d on d.id = o.designer_id
left join public.templates t on t.id = o.template_id
where o.paid_at is not null
  and not exists (
    select 1 from public.sales_log s where s.legacy_order_id = o.id
  );

-- ---------------------------------------------------------------------------
-- 8. Every existing Dearune gets a "configured" entry on its timeline
-- ---------------------------------------------------------------------------
insert into public.project_events (project_id, actor_type, actor_id, action, detail, created_at)
select
  p.id,
  'designer',
  p.designer_id,
  'project.configured',
  jsonb_build_object('reference', p.reference, 'template_slug', p.template_slug),
  coalesce(p.configured_at, p.submitted_at, p.created_at)
from public.projects p
where not exists (
  select 1 from public.project_events e
  where e.project_id = p.id and e.action = 'project.configured'
);
