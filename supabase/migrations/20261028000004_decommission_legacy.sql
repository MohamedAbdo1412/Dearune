-- ============================================================================
-- Decommission legacy Gen-1 (orders/messages) tables and functions
-- ============================================================================
-- These tables were part of the initial schema but have been replaced by
-- the current projects/sold_orders/physical_products model. They are no
-- longer used by any Edge Function or client code.
-- ============================================================================

-- Drop legacy functions first (if they exist)
drop function if exists public.get_public_message(text, boolean);
drop function if exists public.create_order(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb, uuid, uuid, jsonb);
drop function if exists public.get_order(uuid);
drop function if exists public.list_orders(text, int, int);
drop function if exists public.update_order(uuid, jsonb);
drop function if exists public.create_message(uuid, uuid, text, jsonb, text);
drop function if exists public.get_message(uuid);
drop function if exists public.update_message(uuid, jsonb);

-- Drop legacy tables (cascade to remove dependent objects)
drop table if exists public.messages cascade;
drop table if exists public.orders cascade;

-- Drop legacy types (if they exist and are not used elsewhere)
drop type if exists public.order_status;
drop type if exists public.message_status;

-- Note: The data in these tables is preserved in the new schema:
-- - orders -> projects + sold_orders
-- - messages -> projects (payload contains the letter)