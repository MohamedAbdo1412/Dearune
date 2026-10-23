-- ============================================================================
-- Workers, granular permissions, two-way messaging and the admin audit trail
-- ============================================================================
--
-- The studio now has two kinds of human operator:
--
--   admin   a row in `public.admin_users`; the only trusted administrator
--           identity, verified by `public.is_dearune_admin()`.
--   worker  a Supabase Auth user recorded in `public.workers`. A worker is
--           never an administrator and cannot promote themselves.
--
-- Designers stay exactly what they were: rows in `public.designers` with a
-- bcrypt passcode, authenticated by the `designer-login` edge function. They
-- are a separate identity system and are not touched here.
--
-- Security model
-- --------------
-- Permissions are normalised into `permissions` (the catalogue) and
-- `worker_permissions` (who holds what). The browser may READ its own
-- permissions so it can draw a menu, but every protected read and write
-- re-checks the database:
--
--   * SQL RPCs call `public.worker_has_permission(...)` and raise on failure;
--   * RLS policies call the same helper (or `current_worker_id()`);
--   * edge functions call `requireWorker(req, permission)`.
--
-- The helper resolves the *live* row every time, so revoking a permission or
-- suspending an account takes effect on the next request. Nothing is cached in
-- the browser as authority.
--
-- Financial data never gains a worker RLS policy. `sales_log`, `projects`
-- (which carries `sale_price` / `estimated_cost`) and `template_pricing` stay
-- admin-only. Workers read financial figures only through purpose-built
-- `security definer` RPCs that check one specific `financial.*` permission and
-- return only the fields that permission grants. See the second migration.
--
-- Writes from the browser are not granted on any table. Worker writes go
-- through permission-checked `security definer` RPCs; account/designer
-- management goes through service-role edge functions. Admins can still read
-- everything through their existing RLS policies.

-- ---------------------------------------------------------------------------
-- 1. Worker identity
-- ---------------------------------------------------------------------------
create table if not exists public.workers (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text not null,
  display_name   text not null,
  status         text not null default 'active'
                   check (status in ('active', 'inactive', 'suspended')),
  status_reason  text,
  last_sign_in_at timestamptz,
  created_by     uuid references public.admin_users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint workers_display_name_len check (char_length(display_name) between 1 and 120),
  constraint workers_email_len check (char_length(email) between 3 and 320)
);

create unique index if not exists workers_email_key on public.workers (lower(email));
create index if not exists workers_status_idx on public.workers (status, created_at desc);
create index if not exists workers_created_at_idx on public.workers (created_at desc);

drop trigger if exists workers_set_updated_at on public.workers;
create trigger workers_set_updated_at before update on public.workers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. The permission catalogue
-- ---------------------------------------------------------------------------
-- `id` is stable and is what code checks. `label` / `description` are the
-- admin-facing copy. A permission is never inferred from another one; the admin
-- must grant it explicitly. `sensitive` marks the financial capabilities so
-- the admin UI can render them separately from ordinary module access.
create table if not exists public.permissions (
  id          text primary key,
  module      text not null
                check (module in ('operations', 'designers', 'qa', 'financial', 'messages')),
  label       text not null,
  description text not null,
  sensitive   boolean not null default false,
  sort_order  integer not null default 0,
  constraint permissions_id_format check (id ~ '^[a-z_]+\.[a-z_]+$')
);

insert into public.permissions (id, module, label, description, sensitive, sort_order) values
  ('operations.view', 'operations', 'View Operations',
   'Open the production list and see units, statuses and delivery details. Never exposes prices or costs.', false, 10),
  ('operations.create', 'operations', 'Open production units',
   'Add production units to a Dearune that was sold as more than one item.', false, 20),
  ('operations.edit', 'operations', 'Edit operational details',
   'Correct unit notes, the customer phone, or the designer attached to a unit. Never changes a price.', false, 30),
  ('operations.update_status', 'operations', 'Advance production status',
   'Move a unit along the workshop status graph, or place it on hold / cancel it with a reason.', false, 40),
  ('operations.manage', 'operations', 'Archive and restore units',
   'Hide or restore production units from the default Operations list. Archiving never deletes anything.', false, 50),

  ('designers.view', 'designers', 'View designers',
   'Open the designer directory and see each designer''s projects. No money fields are included.', false, 110),
  ('designers.create', 'designers', 'Create designers',
   'Create a new designer account and receive its one-time passcode.', false, 120),
  ('designers.edit', 'designers', 'Edit designers',
   'Change a designer''s name or sign-in ID.', false, 130),
  ('designers.manage', 'designers', 'Manage designer access',
   'Reset a passcode, revoke access, or reactivate a designer.', false, 140),

  ('qa.view', 'qa', 'Use the QA desk',
   'Resolve a printed Dearune QR to its project, physical units and delivery record. Read-only; no prices or costs.', false, 210),

  ('financial.view', 'financial', 'Open the Financial section',
   'Open the Financial section. On its own this reveals no figures; each category below is granted separately.', true, 310),
  ('financial.view_revenue', 'financial', 'View revenue',
   'See money taken: totals, sales count and revenue breakdowns.', true, 320),
  ('financial.view_costs', 'financial', 'View costs',
   'See estimated production costs and cost breakdowns.', true, 330),
  ('financial.view_customer_payables', 'financial', 'View customer payables',
   'See what each customer owes (the selling price per Dearune). Does not grant revenue, cost or profit access by itself.', true, 340),
  ('financial.view_profit', 'financial', 'View profit',
   'See estimated profit totals and margin.', true, 350),
  ('financial.view_payments', 'financial', 'View payments',
   'See the sale/payment ledger: reference, amount, currency, status and date.', true, 360),
  ('financial.manage', 'financial', 'Correct financial records',
   'Void a completed sale with a reason while maintenance mode is on. Every correction is audited. Never changes a recorded price.', true, 370),
  ('financial.export', 'financial', 'Export financial data',
   'Download the financial figures the worker is already allowed to see. Does not grant any extra category.', true, 380),

  ('messages.view', 'messages', 'Read messages',
   'Read the private conversation between this worker and the studio admin.', false, 410),
  ('messages.send', 'messages', 'Send messages',
   'Send a message to the studio admin.', false, 420),
  ('notifications.view', 'messages', 'See unread notifications',
   'Show unread-message badges and in-app notification counts. Does not grant access to message content.', false, 430)
on conflict (id) do update set
  module = excluded.module,
  label = excluded.label,
  description = excluded.description,
  sensitive = excluded.sensitive,
  sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- 3. Who holds what
-- ---------------------------------------------------------------------------
create table if not exists public.worker_permissions (
  worker_id     uuid not null references public.workers (id) on delete cascade,
  permission_id text not null references public.permissions (id) on delete restrict,
  granted_by    uuid references public.admin_users (id) on delete set null,
  granted_at    timestamptz not null default now(),
  primary key (worker_id, permission_id)
);

create index if not exists worker_permissions_permission_idx
  on public.worker_permissions (permission_id);

-- ---------------------------------------------------------------------------
-- 4. Audit trail
-- ---------------------------------------------------------------------------
-- Actor identity is copied, not referenced, so history survives an account
-- removal. Metadata is deliberately small: never passwords, tokens, service
-- keys or message bodies.
create table if not exists public.admin_audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid,
  actor_type  text not null check (actor_type in ('admin', 'worker', 'system')),
  action      text not null,
  target_type text,
  target_id   text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists admin_audit_log_target_idx
  on public.admin_audit_log (target_type, target_id, created_at desc);
create index if not exists admin_audit_log_actor_idx
  on public.admin_audit_log (actor_id, created_at desc);
create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log (created_at desc);

-- ---------------------------------------------------------------------------
-- 5. Live authorisation helpers
-- ---------------------------------------------------------------------------
-- These are the only authority used by RLS and RPCs. They deliberately return
-- false when the worker row is missing or not active, so a suspended account
-- cannot read its way back in with an old token.
create or replace function public.current_worker_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select w.id
  from public.workers w
  where w.id = auth.uid()
    and w.status = 'active'
$$;

create or replace function public.is_active_worker()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.current_worker_id() is not null
$$;

create or replace function public.worker_has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.worker_permissions wp
    join public.workers w on w.id = wp.worker_id
    where wp.worker_id = auth.uid()
      and w.status = 'active'
      and wp.permission_id = p_permission
  )
$$;

-- Called by the Worker Dashboard after sign-in (and on a returning session) so
-- the admin directory can show an honest last-sign-in time. It never changes
-- the worker's permissions and never returns them.
create or replace function public.worker_touch_session()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker public.workers%rowtype;
begin
  select * into v_worker from public.workers where id = auth.uid();
  if not found then
    raise exception 'worker.unknown' using errcode = '42501';
  end if;
  if v_worker.status <> 'active' then
    return jsonb_build_object('status', v_worker.status, 'active', false);
  end if;
  update public.workers
    set last_sign_in_at = now()
    where id = v_worker.id and last_sign_in_at is distinct from now();
  return jsonb_build_object('status', 'active', 'active', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Two-way messaging
-- ---------------------------------------------------------------------------
-- One private thread per worker. The worker may read only their own thread;
-- the admin reads all. There is no client INSERT/UPDATE policy: worker sends
-- and read receipts go through the RPCs below, and admin sends go through an
-- admin-only RPC. That is what makes sender spoofing impossible.
create table if not exists public.worker_messages (
  id          uuid primary key default gen_random_uuid(),
  worker_id   uuid not null references public.workers (id) on delete cascade,
  sender_type text not null check (sender_type in ('admin', 'worker')),
  sender_id   uuid not null,
  title       text not null default '',
  body        text not null,
  priority    boolean not null default false,
  read_at     timestamptz,
  read_by     uuid,
  created_at  timestamptz not null default now(),
  constraint worker_messages_title_len check (char_length(title) <= 200),
  constraint worker_messages_body_len check (char_length(body) between 1 and 5000)
);

create index if not exists worker_messages_thread_idx
  on public.worker_messages (worker_id, created_at desc);
create index if not exists worker_messages_unread_idx
  on public.worker_messages (worker_id, created_at desc)
  where read_at is null;

-- Worker sends. The sender is derived from the session, never from the body.
create or replace function public.worker_send_message(
  p_title text default '',
  p_body text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker uuid := public.current_worker_id();
  v_title  text := btrim(coalesce(p_title, ''));
  v_body   text := btrim(coalesce(p_body, ''));
  v_row    public.worker_messages%rowtype;
begin
  if v_worker is null then
    raise exception 'worker.inactive_or_unknown' using errcode = '42501';
  end if;
  if not public.worker_has_permission('messages.view')
     or not public.worker_has_permission('messages.send') then
    raise exception 'worker.forbidden' using errcode = '42501';
  end if;
  if char_length(v_title) > 200 then
    raise exception 'message.title_too_long' using errcode = '22001';
  end if;
  if char_length(v_body) < 1 then
    raise exception 'message.body_required' using errcode = '22023';
  end if;
  if char_length(v_body) > 5000 then
    raise exception 'message.body_too_long' using errcode = '22001';
  end if;

  insert into public.worker_messages (worker_id, sender_type, sender_id, title, body, priority)
  values (v_worker, 'worker', auth.uid(), v_title, v_body, false)
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'title', v_row.title,
    'body', v_row.body,
    'priority', v_row.priority,
    'readAt', v_row.read_at,
    'createdAt', v_row.created_at
  );
end;
$$;

-- Worker reads their admin messages. Only messages sent by the admin are
-- marked; the worker's own messages stay "unread" until the admin reads them.
create or replace function public.worker_mark_messages_read()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker uuid := public.current_worker_id();
  v_count  integer := 0;
begin
  if v_worker is null then
    raise exception 'worker.inactive_or_unknown' using errcode = '42501';
  end if;
  if not public.worker_has_permission('messages.view') then
    raise exception 'worker.forbidden' using errcode = '42501';
  end if;

  update public.worker_messages
    set read_at = now(), read_by = auth.uid()
    where worker_id = v_worker
      and sender_type = 'admin'
      and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Badge count. `notifications.view` or `messages.view` can see the number;
-- content still requires `messages.view` through RLS.
create or replace function public.worker_unread_count()
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker uuid := public.current_worker_id();
begin
  if v_worker is null then
    return 0;
  end if;
  if not (public.worker_has_permission('messages.view') or public.worker_has_permission('notifications.view')) then
    return 0;
  end if;
  return (
    select count(*)::integer
    from public.worker_messages
    where worker_id = v_worker
      and sender_type = 'admin'
      and read_at is null
  );
end;
$$;

-- Admin sends to one worker. The sender is the authenticated admin, never the
-- body. The audit row records the event without copying the message body.
create or replace function public.admin_send_worker_message(
  p_worker_id uuid,
  p_title text default '',
  p_body text default '',
  p_priority boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_body  text := btrim(coalesce(p_body, ''));
  v_row   public.worker_messages%rowtype;
begin
  if not public.is_dearune_admin() then
    raise exception 'admin.unauthorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.workers where id = p_worker_id) then
    raise exception 'worker.not_found' using errcode = 'P0002';
  end if;
  if char_length(v_title) > 200 then
    raise exception 'message.title_too_long' using errcode = '22001';
  end if;
  if char_length(v_body) < 1 then
    raise exception 'message.body_required' using errcode = '22023';
  end if;
  if char_length(v_body) > 5000 then
    raise exception 'message.body_too_long' using errcode = '22001';
  end if;

  insert into public.worker_messages (worker_id, sender_type, sender_id, title, body, priority)
  values (p_worker_id, 'admin', auth.uid(), v_title, v_body, coalesce(p_priority, false))
  returning * into v_row;

  insert into public.admin_audit_log (actor_id, actor_type, action, target_type, target_id, metadata)
  values (
    auth.uid(), 'admin', 'worker.message.sent', 'worker', p_worker_id::text,
    jsonb_build_object('message_id', v_row.id, 'priority', v_row.priority, 'body_length', char_length(v_body))
  );

  return jsonb_build_object(
    'id', v_row.id,
    'workerId', v_row.worker_id,
    'title', v_row.title,
    'body', v_row.body,
    'priority', v_row.priority,
    'readAt', v_row.read_at,
    'createdAt', v_row.created_at
  );
end;
$$;

-- Admin read receipt for messages the worker sent.
create or replace function public.admin_mark_worker_messages_read(p_worker_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
begin
  if not public.is_dearune_admin() then
    raise exception 'admin.unauthorized' using errcode = '42501';
  end if;

  update public.worker_messages
    set read_at = now(), read_by = auth.uid()
    where worker_id = p_worker_id
      and sender_type = 'worker'
      and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- The central admin inbox: one row per worker, including counts and a preview.
-- The preview is returned only to an authenticated admin.
create or replace function public.admin_worker_inbox()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows jsonb;
begin
  if not public.is_dearune_admin() then
    raise exception 'admin.unauthorized' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_json order by last_message_at desc nulls last, display_name), '[]'::jsonb)
  into v_rows
  from (
    select
      w.display_name,
      jsonb_build_object(
        'workerId', w.id,
        'displayName', w.display_name,
        'email', w.email,
        'status', w.status,
        'lastSignInAt', w.last_sign_in_at,
        'unreadFromWorker', (
          select count(*)::integer from public.worker_messages m
          where m.worker_id = w.id and m.sender_type = 'worker' and m.read_at is null
        ),
        'unreadForWorker', (
          select count(*)::integer from public.worker_messages m
          where m.worker_id = w.id and m.sender_type = 'admin' and m.read_at is null
        ),
        'lastMessageAt', (
          select max(m.created_at) from public.worker_messages m where m.worker_id = w.id
        ),
        'lastMessagePreview', (
          select left(m.body, 140) from public.worker_messages m
          where m.worker_id = w.id order by m.created_at desc limit 1
        ),
        'lastMessageFrom', (
          select m.sender_type from public.worker_messages m
          where m.worker_id = w.id order by m.created_at desc limit 1
        )
      ) as row_json,
      (select max(m.created_at) from public.worker_messages m where m.worker_id = w.id) as last_message_at
    from public.workers w
  ) inbox;

  return v_rows;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Audit writer
-- ---------------------------------------------------------------------------
-- Internal writer. Not executable by API roles; called by security-definer
-- RPCs and by the service-role edge functions.
create or replace function public.record_admin_audit(
  p_actor_id uuid,
  p_actor_type text,
  p_action text,
  p_target_type text default null,
  p_target_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into public.admin_audit_log (actor_id, actor_type, action, target_type, target_id, metadata)
  values (p_actor_id, p_actor_type, p_action, p_target_type, p_target_id, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Financial corrections gain a truthful worker author
-- ---------------------------------------------------------------------------
-- `voided_by` points at `admin_users`; a worker cannot be written there. This
-- extra column lets a worker with `financial.manage` be recorded honestly
-- without weakening the existing admin foreign key.
alter table public.sales_log
  add column if not exists voided_by_worker uuid references public.workers (id) on delete set null;

-- Worker actions belong in the existing project/unit timelines too. Widen the
-- actor vocabulary without changing any historical row.
alter table public.project_events drop constraint if exists project_events_actor_type_check;
alter table public.project_events add constraint project_events_actor_type_check
  check (actor_type in ('admin', 'worker', 'designer', 'system', 'customer'));

alter table public.physical_product_events drop constraint if exists physical_product_events_actor_type_check;
alter table public.physical_product_events add constraint physical_product_events_actor_type_check
  check (actor_type in ('admin', 'worker', 'designer', 'system', 'customer'));

-- ---------------------------------------------------------------------------
-- 8. RLS
-- ---------------------------------------------------------------------------
alter table public.workers enable row level security;
alter table public.permissions enable row level security;
alter table public.worker_permissions enable row level security;
alter table public.worker_messages enable row level security;
alter table public.admin_audit_log enable row level security;

-- Reaffirm the table privileges Supabase grants by default, then remove every
-- write capability from the API roles. Only SELECT is ever granted.
revoke all on public.workers from anon;
revoke insert, update, delete, truncate on public.workers from anon, authenticated;
grant select on public.workers to authenticated;

drop policy if exists workers_read_self_or_admin on public.workers;
create policy workers_read_self_or_admin on public.workers
  for select to authenticated
  using (id = auth.uid() or public.is_dearune_admin());

revoke all on public.permissions from anon;
revoke insert, update, delete, truncate on public.permissions from anon, authenticated;
grant select on public.permissions to authenticated;

drop policy if exists permissions_read_authenticated on public.permissions;
create policy permissions_read_authenticated on public.permissions
  for select to authenticated
  using (true);

revoke all on public.worker_permissions from anon;
revoke insert, update, delete, truncate on public.worker_permissions from anon, authenticated;
grant select on public.worker_permissions to authenticated;

drop policy if exists worker_permissions_read_self_or_admin on public.worker_permissions;
create policy worker_permissions_read_self_or_admin on public.worker_permissions
  for select to authenticated
  using (worker_id = auth.uid() or public.is_dearune_admin());

revoke all on public.worker_messages from anon;
revoke insert, update, delete, truncate on public.worker_messages from anon, authenticated;
grant select on public.worker_messages to authenticated;

drop policy if exists worker_messages_read_own_or_admin on public.worker_messages;
create policy worker_messages_read_own_or_admin on public.worker_messages
  for select to authenticated
  using (
    public.is_dearune_admin()
    or (
      worker_id = public.current_worker_id()
      and public.worker_has_permission('messages.view')
    )
  );

revoke all on public.admin_audit_log from anon;
revoke insert, update, delete, truncate on public.admin_audit_log from anon, authenticated;
grant select on public.admin_audit_log to authenticated;

drop policy if exists admin_audit_log_read_admin on public.admin_audit_log;
create policy admin_audit_log_read_admin on public.admin_audit_log
  for select to authenticated
  using (public.is_dearune_admin());

-- ---------------------------------------------------------------------------
-- 9. Function privileges
-- ---------------------------------------------------------------------------
revoke all on function public.current_worker_id() from public, anon, authenticated;
revoke all on function public.is_active_worker() from public, anon, authenticated;
revoke all on function public.worker_has_permission(text) from public, anon, authenticated;
revoke all on function public.worker_touch_session() from public, anon, authenticated;
revoke all on function public.worker_send_message(text, text) from public, anon, authenticated;
revoke all on function public.worker_mark_messages_read() from public, anon, authenticated;
revoke all on function public.worker_unread_count() from public, anon, authenticated;
revoke all on function public.admin_send_worker_message(uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.admin_mark_worker_messages_read(uuid) from public, anon, authenticated;
revoke all on function public.admin_worker_inbox() from public, anon, authenticated;
revoke all on function public.record_admin_audit(uuid, text, text, text, text, jsonb) from public, anon, authenticated;

grant execute on function public.current_worker_id() to authenticated;
grant execute on function public.is_active_worker() to authenticated;
grant execute on function public.worker_has_permission(text) to authenticated;
grant execute on function public.worker_touch_session() to authenticated;
grant execute on function public.worker_send_message(text, text) to authenticated;
grant execute on function public.worker_mark_messages_read() to authenticated;
grant execute on function public.worker_unread_count() to authenticated;
grant execute on function public.admin_send_worker_message(uuid, text, text, boolean) to authenticated;
grant execute on function public.admin_mark_worker_messages_read(uuid) to authenticated;
grant execute on function public.admin_worker_inbox() to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Realtime (only when the project has the Supabase publication)
-- ---------------------------------------------------------------------------
-- The Worker Dashboard subscribes to its own thread and also refreshes on
-- focus / a 60-second poll, so in-app notifications work even where Realtime
-- is not configured. Adding the table here is guarded so a bare Postgres (the
-- test database) applies this migration unchanged.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'worker_messages'
     ) then
    execute 'alter publication supabase_realtime add table public.worker_messages';
  end if;
end $$;
