-- ---------------------------------------------------------------------------
-- Fix the sales log immutability guard
-- ---------------------------------------------------------------------------
-- `estimated_profit` is a stored generated column. PostgreSQL evaluates stored
-- generated columns *after* BEFORE triggers, so inside a BEFORE UPDATE trigger
-- NEW.estimated_profit is NULL even when the sale is not being rewritten. The
-- original guard compared it with OLD.estimated_profit and therefore rejected
-- every update, including a legitimate completed -> voided correction.
--
-- Profit is always `selling_price - estimated_cost`, so comparing those two
-- columns already guarantees the profit cannot change. The guard keeps every
-- other rule exactly as it was: money, currency, date and reference are
-- immutable, deletions are refused, and a sale may only move from completed to
-- voided with a timestamp and a reason.
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
