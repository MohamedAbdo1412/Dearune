-- Designer pipeline: server-enforced login attempt throttling.
--
-- Designers are not Supabase auth users, so there is no native lockout.
-- This table counts consecutive failed logins for a 6-digit designer code
-- (the identifier) and, past a threshold, blocks further attempts for a
-- fixed window. All writes happen in Edge Functions through the service-role
-- client (adminClient), which bypasses RLS; roles that could interact with
-- the public REST API are locked down so the counters cannot be read,
-- manipulated, or reset by the client.

create table if not exists public.designer_login_attempts (
  identifier  text primary key,
  fail_count  integer not null default 0,
  locked_until timestamptz,
  updated_at  timestamptz not null default now()
);

alter table public.designer_login_attempts enable row level security;

-- Registers one failed login for an identifier. Atomically increments the
-- counter (INSERT .. ON CONFLICT) and, when the sequence reaches
-- p_lock_after, locks the identifier for p_lock_seconds and resets the
-- counter. Returns a JSON payload for the Edge Function to turn into a
-- 429 response: {"lock_until": iso8601} on lock, or {"fail_count": n}.
create or replace function public.record_designer_login_failure(
  p_identifier    text,
  p_lock_after    integer default 3,
  p_lock_seconds  integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fail integer;
  v_locked_until timestamptz;
begin
  insert into public.designer_login_attempts as t (identifier, fail_count, updated_at)
  values (p_identifier, 1, now())
  on conflict (identifier)
  do update set fail_count = t.fail_count + 1, updated_at = now()
  returning fail_count into v_fail;

  if v_fail >= p_lock_after then
    update public.designer_login_attempts
    set locked_until = now() + make_interval(secs => p_lock_seconds),
        fail_count   = 0,
        updated_at   = now()
    where identifier = p_identifier
    returning locked_until into v_locked_until;

    return jsonb_build_object('lock_until', to_char(v_locked_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
  end if;

  return jsonb_build_object('fail_count', v_fail);
end;
$$;

-- Clears the counter after a successful login so a sequence of failures does
-- not accumulate across successful sessions.
create or replace function public.clear_designer_login_attempts(p_identifier text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.designer_login_attempts
  where identifier = p_identifier;
end;
$$;

revoke execute on function public.record_designer_login_failure(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.clear_designer_login_attempts(text) from public, anon, authenticated;
revoke all on table public.designer_login_attempts from anon, authenticated;

-- The (self-cancelling) lockout window must be readable so the Edge Function
-- can answer 429 with a precise retryAfterSeconds/lockedUntil.
revoke select on table public.designer_login_attempts from anon, authenticated;