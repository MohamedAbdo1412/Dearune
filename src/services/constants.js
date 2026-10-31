// Wrappers are resolved from the catalog (name + kind). Keep legacy lists
// only as safe fallbacks; do not use them for business logic.
export const WRAPPER_TYPES = ['digital', 'open_letter', 'sealed_letter', 'open_card']

export const WRAPPER_LABELS = {
  digital: 'Digital only',
  open_letter: 'Open letter',
  sealed_letter: 'Sealed letter',
  open_card: 'Open card',
}

export const STAGE_ORDER = [
  'pending',
  'in-production',
  'manufactured',
  'shipped',
  'delivered',
  'cancelled',
  'deleted',
]

export const STAGE_LABELS = {
  pending: 'Pending',
  'in-production': 'In production',
  manufactured: 'Manufactured',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  deleted: 'Deleted',
}

// ---------------------------------------------------------------------------
// One identity, one milestone — the vocabulary every dashboard shares
// ---------------------------------------------------------------------------
// The canonical Dearune id is allocated by the database (`projects.reference`)
// and is the ONLY id the studio quotes:
//   DR-000021 — literal "DR-", one hyphen, exactly six digits.
export const DEARUNE_ID_PATTERN = /^DR-\d{6}$/

// The Sold ID is DERIVED from the canonical id, never stored in the browser:
//   DR-000021 → SOL-000021
// It exists so a sold order can be read out loud without the workshop unit id
// creeping into the sale record.
export function soldIdFor(canonicalReference) {
  const value = String(canonicalReference ?? '').trim().toUpperCase()
  return DEARUNE_ID_PATTERN.test(value) ? `SOL-${value.slice(3)}` : ''
}

// The ONE lifecycle, in order. `projects.milestone` is the only stored stage;
// Admin, Designer, Operations and the Worker dashboard all read this column and
// this list. `archived_at` is orthogonal to it, not a stage of its own.
export const MILESTONE_ORDER = [
  'configured',
  'sold',
  'making',
  'shipping',
  'delivery',
  'delivered',
  'after_sale',
]

export const MILESTONE_LABELS = {
  configured: 'Configured',
  sold: 'Sold',
  making: 'In making',
  shipping: 'Ready to ship',
  delivery: 'Out for delivery',
  delivered: 'Delivered',
  after_sale: 'After-sale',
}

export const MILESTONE_SHORT = {
  configured: 'Config.',
  sold: 'Sold',
  making: 'Making',
  shipping: 'To ship',
  delivery: 'Delivery',
  delivered: 'Delivered',
  after_sale: 'After-sale',
}

export function milestoneRank(value) {
  return MILESTONE_ORDER.indexOf(String(value ?? ''))
}

export function isMilestone(value) {
  return milestoneRank(value) >= 0
}

// The stage of a Dearune, straight from the database. Archiving hides a
// Dearune from the working lists without pretending the order went backwards.
export function projectStage(project) {
  const row = project ?? {}
  if (row.archived_at) return 'archived'
  const value = String(row.milestone ?? '')
  return isMilestone(value) ? value : 'configured'
}

// Kept for the Designer screens' stage tabs: the lifecycle plus the orthogonal
// archived state. Derived, so a new milestone shows up everywhere at once.
export const PROJECT_STAGE_ORDER = [...MILESTONE_ORDER, 'archived']

export const PROJECT_STAGE_LABELS = { ...MILESTONE_LABELS, archived: 'Archived' }

// ---------------------------------------------------------------------------
// Operations — the manufacturing vocabulary for a single physical unit
// ---------------------------------------------------------------------------
// The canonical business identifier of one physical Dearune. It is allocated
// by the database (`physical_products.reference`) and is never rewritten:
//   DR70700897645 — literal "DR" plus exactly eleven decimal digits.
export const PHYSICAL_ID_PATTERN = /^DR\d{11}$/

// Generic Operations status has been removed in favor of explicit milestones.

// The printing screens work on physical units and have always spoken in these
// five words. They are a PROJECTION of `projects.milestone`, not a second stage
// machine: nothing stores them, and nothing else may derive a stage separately.
// This is the ONE definition — `operations.js` re-exports it.
export const OPERATIONS_STATUS_ORDER = ['pending', 'sold', 'manufactured', 'shipped', 'delivered']

export function unitStageFromMilestone(milestone) {
  switch (String(milestone ?? '')) {
    case 'sold':
    case 'making':
      return 'sold'
    case 'shipping':
      return 'manufactured'
    case 'delivery':
      return 'shipped'
    case 'delivered':
    case 'after_sale':
      return 'delivered'
    default:
      return 'pending'
  }
}

export const OPERATIONS_STATUS_LABELS = {
  pending: 'Pending',
  sold: 'Sold',
  manufactured: 'Manufactured',
  shipped: 'Shipped',
  delivered: 'Delivered',
}

export const OPERATIONS_STATUS_SHORT = {
  pending: 'Pend.',
  sold: 'Sold',
  manufactured: 'Mfg.',
  shipped: 'Shipped',
  delivered: 'Del.',
}

export const PUBLIC_SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL?.replace(/\/+$/, '') ?? ''

// Legacy `orders` rows (the pre-project sales table) still carry their own
// timestamps. Nothing new is written there; this stays only so old receipts can
// still be rendered.
export function orderStage(order, publishedAt = null) {
  if (order?.deleted_at) return 'deleted'
  if (order?.cancelled_at) return 'cancelled'
  const isDigital =
    order?.wrapper_kind === 'digital' || (order?.wrapper_kind == null && order?.wrapper_type === 'digital')
  if (isDigital) {
    if (publishedAt) return 'delivered'
    if (order.paid_at) return 'in-production'
    return 'pending'
  }
  if (order.arrived_at) return 'delivered'
  if (order.shipped_at) return 'shipped'
  if (order.manufactured_at) return 'manufactured'
  if (order.paid_at) return 'in-production'
  return 'pending'
}


// A Dearune (a `projects` record) walks ONE pipeline: Configured → Sold →
// Making → Shipping → Delivery → Delivered → After-Sale. Digital Dearunes skip
// the three production stages: they are delivered the moment the message opens.
export function isDigital(project) {
  if (!project) return false
  if (project.wrapper_kind === 'digital') return true
  if (project.wrapper_kind === 'physical') return false
  return project.wrapper_type === 'digital'
}

// The next thing the studio has to do with a Dearune, straight from the stored
// milestone. One answer, read by the Designer sheet and the Admin dashboard.
export function nextDearuneAction(project) {
  if (!project) return null
  if (project.archived_at) return 'restore'

  const stage = projectStage(project)
  const digital = isDigital(project)

  switch (stage) {
    case 'configured':
      return 'sale'
    case 'sold':
    case 'making':
      return digital ? (project.message_active ? null : 'open') : 'made'
    case 'shipping':
      return 'shipped'
    case 'delivery':
      return 'arrived'
    case 'delivered':
    case 'after_sale':
      return project.message_active ? null : 'open'
    default:
      return null
  }
}

export const DEARUNE_ACTION_LABELS = {
  sale: 'Record sale',
  made: 'Mark made',
  shipped: 'Mark shipped',
  arrived: 'Mark arrived',
  open: 'Open message',
  close: 'Close message',
  restore: 'Restore',
}


export function isCacheable(chars) {
  return chars
    .toUpperCase()
    .split('')
    .every((c) => !['0', 'O', '1', 'I', 'L'].includes(c))
}

const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function randomBase62(length = 10) {
  const bytes = new Uint8Array(length)
  globalThis.crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += CHARSET[bytes[i] % CHARSET.length]
  }
  return out
}

export function randomNumericCode(length = 6) {
  const bytes = new Uint8Array(length)
  globalThis.crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += String(bytes[i] % 10)
  }
  return out
}

export function publicMessageUrl(payload) {
  const base = PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '')
  return `${base}/message/${payload.publicId}?token=${encodeURIComponent(payload.token)}`
}