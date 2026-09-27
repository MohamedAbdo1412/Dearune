-- Merchandising state for the two catalogs the studio curates.
--
-- The Admin Dashboard is the source of truth for whether an item is seen,
-- whether it may be chosen, in which order it appears, and which frame it
-- wears in Create. Three conceptual fields per catalog:
--
--   is_active     -> already exists: `templates.enabled`,
--                    `wrapper_types.active`
--   display_order -> already exists: `templates.sort_order`,
--                    `wrapper_types.display_order`
--   display_state -> NEW on both tables (this migration)
--
-- (The two activation/order pairs keep their historical column names —
-- renaming would churn every edge function for no behavioural gain; the
-- frontend reads either spelling in ONE place, `getCatalogItemState` in
-- `src/services/catalog.js`.)
--
-- Semantics:
--   is_active = false      → completely hidden from Create (not rendered,
--                            no empty slot, no hint it exists)
--   display_state normal   → visible, selectable, plain card
--   display_state new      → visible, selectable, vintage NEW seal
--   display_state not_available → visible with its preview, but selection
--                            is refused (pointer AND keyboard)
--
-- Both columns default to values that reproduce exactly today's behaviour
-- (every existing row is active and plain), so this migration is a no-op
-- for production data until an admin changes something.
--
-- Adding a future state (coming_soon, seasonal, …) later = one new value in
-- the CHECK constraint below + one entry in `DISPLAY_STATE_META`
-- (`src/services/catalog.js`); the admin selectors, summaries and Create
-- cards are registry-driven and follow without rewrites.

alter table public.templates
  add column if not exists display_state text not null default 'normal';

alter table public.templates drop constraint if exists templates_display_state_check;
alter table public.templates
  add constraint templates_display_state_check
  check (display_state in ('normal', 'new', 'not_available'));

alter table public.wrapper_types
  add column if not exists display_state text not null default 'normal';

alter table public.wrapper_types drop constraint if exists wrapper_types_display_state_check;
alter table public.wrapper_types
  add constraint wrapper_types_display_state_check
  check (display_state in ('normal', 'new', 'not_available'));

-- The Create archive query is `enabled = true AND deleted_at IS NULL
-- ORDER BY sort_order, created_at` — index that shape so the chooser stays
-- cheap as the catalog grows.
create index if not exists templates_display_idx
  on public.templates (enabled, deleted_at, sort_order, created_at);

-- No RLS changes: both tables stay admin-read/admin-write from the browser
-- (designers reach them only through Edge Functions, service role). The
-- frontend may READ the display fields through those functions; nothing but
-- `is_dearune_admin()` may write them.
