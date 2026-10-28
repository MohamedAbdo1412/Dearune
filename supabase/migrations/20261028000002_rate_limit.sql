-- ============================================================================
-- Rate limiting: token bucket per key with per-minute refill
-- ============================================================================
-- Provides `consume_rate_limit(key text, tokens int default 1, capacity int default 60, refill_per_minute int default 60)`
-- Returns jsonb with { allowed: boolean, remaining: int, retry_after_seconds: int }
-- Uses a simple token bucket stored in a table. Suitable for Edge Function
-- rate limiting (public media access, designer submissions, worker designer mgmt).
-- ============================================================================

create table if not exists public.rate_limit_buckets (
  key       text primary key,
  tokens    int not null default 60,
  updated_at timestamptz not null default now()
);

create index if not exists rate_limit_buckets_updated_idx
  on public.rate_limit_buckets (updated_at);

-- Consume tokens from a bucket. Refills at `refill_per_minute` tokens per minute.
create or replace function public.consume_rate_limit(
  p_key text,
  p_tokens int default 1,
  p_capacity int default 60,
  p_refill_per_minute int default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now      timestamptz := now();
  v_bucket   record;
  v_elapsed  interval;
  v_refill   int;
  v_allowed  boolean;
  v_remaining int;
  v_retry    int := 0;
begin
  -- Upsert bucket
  insert into public.rate_limit_buckets (key, tokens, updated_at)
  values (p_key, p_capacity, v_now)
  on conflict (key) do update set
    tokens = case
      when rate_limit_buckets.updated_at < v_now - interval '1 minute' * (rate_limit_buckets.tokens / nullif(p_refill_per_minute, 0))
      then p_capacity
      else least(
        p_capacity,
        rate_limit_buckets.tokens + floor(extract(epoch from (v_now - rate_limit_buckets.updated_at)) / 60) * p_refill_per_minute
      )
    end,
    updated_at = v_now
  returning * into v_bucket;

  -- Consume tokens
  v_allowed := v_bucket.tokens >= p_tokens;
  if v_allowed then
    update public.rate_limit_buckets
    set tokens = tokens - p_tokens,
        updated_at = v_now
    where key = p_key;
    v_remaining := v_bucket.tokens - p_tokens;
  else
    -- Calculate retry-after in seconds
    v_refill := greatest(1, p_refill_per_minute / 60.0);
    v_retry := ceiling((p_tokens - v_bucket.tokens)::numeric / v_refill) * 60;
  end if;

  return jsonb_build_object(
    'allowed', v_allowed,
    'remaining', greatest(0, v_remaining),
    'retry_after_seconds', v_retry
  );
end;
$$;

grant execute on function public.consume_rate_limit(text, int, int, int) to authenticated, anon, service_role;