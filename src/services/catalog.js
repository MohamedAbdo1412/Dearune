// ---------------------------------------------------------------------------
// Catalog merchandising — the ONE home for the vocabulary the Admin
// Dashboard curates and Create renders.
//
// Two catalogs speak it: papers (`templates.enabled` / `sort_order`) and
// wrappers (`wrapper_types.active` / `display_order`). The columns keep
// their historical names; this module reads either spelling so no screen
// re-implements the rules:
//
//   is_active false           → not rendered at all (no slot, no hint)
//   visible + normal          → plain selectable card
//   visible + new             → same card, wearing the vintage NEW seal
//   visible + not_available   → preview intact, selection refused
//                               (pointer and keyboard)
//
// FUTURE STATES: `display_state` is an open registry, not a closed enum in
// the UI. To ship a new one (coming_soon, seasonal, sold_out, …): add its
// value to the CHECK constraint in a migration, add one entry to
// `DISPLAY_STATE_META` below, done — every admin selector, shelf summary
// and Create card follows without touching their rendering code. Unknown
// values already fail safe: shown, never selectable.
// ---------------------------------------------------------------------------

// The states this build ships. Admin selectors iterate this list.
export const DISPLAY_STATES = ['normal', 'new', 'not_available']

// label       — what the admin select shows
// selectable  — whether Create may choose it
// badge       — small vintage mark stamped on the card ('' = none)
export const DISPLAY_STATE_META = {
  normal: { label: 'Normal', selectable: true, badge: '' },
  new: { label: 'New', selectable: true, badge: 'New' },
  not_available: { label: 'Not Available Now', selectable: false, badge: '' },
}

// The activation flag, whichever catalog spelling the row carries:
// papers say `enabled`, wrappers say `active`, the spec says `is_active`.
function isActiveRow(item) {
  if (typeof item.is_active === 'boolean') return item.is_active
  if (typeof item.enabled === 'boolean') return item.enabled
  if (typeof item.active === 'boolean') return item.active
  return true
}

// Admin-owned position: `sort_order` on papers, `display_order` on wrappers.
function orderOf(item) {
  const raw = item.display_order ?? item.sort_order ?? 0
  const value = Number(raw)
  return Number.isFinite(value) ? value : 0
}

function humanize(state) {
  return String(state).replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// Everything a screen needs to render one row — visibility, the seal, the
// admin shelf summary and selection permission in a single call, so this
// logic exists once instead of once per component.
export function getCatalogItemState(item) {
  if (!item) {
    return {
      active: false,
      visible: false,
      selectable: false,
      state: 'normal',
      label: 'Normal',
      badge: '',
      order: 0,
      summary: 'Hidden',
    }
  }
  const active = isActiveRow(item)
  const raw = typeof item.display_state === 'string' && item.display_state.trim() ? item.display_state.trim() : 'normal'
  const meta = DISPLAY_STATE_META[raw] ?? { label: humanize(raw), selectable: false, badge: '' }
  const order = orderOf(item)
  return {
    active,
    visible: active,
    // A hidden row is never offered; an unknown future state fails safe
    // (visible but not choosable) rather than slipping past merchandising.
    selectable: active && meta.selectable,
    state: raw,
    label: meta.label,
    badge: active ? meta.badge : '',
    order,
    // What the admin shelf shows beside the name. `is_active = false`
    // reads simply `Hidden` — the stored state is kept, not rewritten.
    summary: active ? `Visible • ${meta.label} • Order #${order}` : 'Hidden',
  }
}

export function isCatalogSelectable(item) {
  return getCatalogItemState(item).selectable
}

export function visibleCatalogItems(items = []) {
  return (items ?? []).filter((item) => getCatalogItemState(item).visible)
}

// Admin-owned order with a deterministic tie-break: `display_order ASC,
// created_at ASC`, then name — never insertion luck.
export function sortCatalogItems(items = []) {
  return [...(items ?? [])].sort((a, b) => {
    const byOrder = orderOf(a) - orderOf(b)
    if (byOrder !== 0) return byOrder
    const ta = a?.created_at ? Date.parse(a.created_at) : Number.NaN
    const tb = b?.created_at ? Date.parse(b.created_at) : Number.NaN
    const aMissing = Number.isNaN(ta)
    const bMissing = Number.isNaN(tb)
    if (aMissing !== bMissing) return aMissing ? 1 : -1
    if (!aMissing && ta !== tb) return ta - tb
    const na = String(a?.name ?? a?.slug ?? a?.key ?? '').toLowerCase()
    const nb = String(b?.name ?? b?.slug ?? b?.key ?? '').toLowerCase()
    return na.localeCompare(nb)
  })
}

// What the Create chooser renders: visible items, in admin order.
export function chooserCatalogItems(items = []) {
  return sortCatalogItems(visibleCatalogItems(items))
}
