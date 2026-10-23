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
// Operations — the manufacturing vocabulary for a single physical unit
// ---------------------------------------------------------------------------
// The canonical business identifier of one physical Dearune. It is allocated
// by the database (`physical_products.reference`) and is never rewritten:
//   DR70700897645 — literal "DR" plus exactly eleven decimal digits.
export const PHYSICAL_ID_PATTERN = /^DR\d{11}$/

// Generic Operations status has been removed in favor of explicit milestones.
// Keep exports for backward compatibility but mark as deprecated.
export const OPERATIONS_STEP_ORDER = []
export const OPERATIONS_EXIT_STATUSES = []
export const OPERATIONS_STATUS_ORDER = []
export const OPERATIONS_STATUS_LABELS = {}
export const OPERATIONS_STATUS_SHORT = {}

export function isOperationsStatus(value) {
  return false
}

export function nextOperationsStatus(status) {
  return null
}

export function operationsRank(status) {
  return 0
}

export function isOperationsTerminal(status) {
  return false
}

// "Sold As" is a DERIVED label, never a second stored identifier. One
// canonical id, one derived display form.
export function soldAsId(reference) {
  const value = String(reference ?? '').trim()
  return PHYSICAL_ID_PATTERN.test(value) ? `SOL-${value}` : ''
}

// Operations milestones replaced generic status; no longer derived from status.
export function operationsProjectStage(status) {
  return null
}

export const PUBLIC_SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL?.replace(/\/+$/, '') ?? ''

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

// A Dearune (a `projects` record) walks its own pipeline, which starts one
// step earlier than an order did: Configured (the designer handed it over)
// → Sold → Made → Shipped → Delivered. Digital Dearunes skip making and
// shipping: they are delivered the moment the message is opened.
export const PROJECT_STAGE_ORDER = ['configured', 'sold', 'made', 'shipped', 'delivered', 'archived']

export const PROJECT_STAGE_LABELS = {
  configured: 'Configured',
  sold: 'Sold',
  made: 'Made',
  shipped: 'Shipped',
  delivered: 'Delivered',
  archived: 'Archived',
}

export function projectStage(project) {
  const row = project ?? {}
  if (row.archived_at || row.status === 'archived') return 'archived'
  if (row.paid_at) {
    if (row.arrived_at) return 'delivered'
    if (row.shipped_at) return 'shipped'
    if (row.manufactured_at) return 'made'
    const isDigitalWrapper =
      row.wrapper_kind === 'digital' || (row.wrapper_kind == null && row.wrapper_type === 'digital')
    if (isDigitalWrapper && row.message_active) return 'delivered'
    return 'sold'
  }
  return 'configured'
}

export function isDigital(project) {
  if (!project) return false
  if (project.wrapper_kind === 'digital') return true
  if (project.wrapper_kind === 'physical') return false
  return project.wrapper_type === 'digital'
}

// The next thing the studio has to do with a Dearune. Returns an action key
// (or null when there is nothing left to do on this screen).
export function nextDearuneAction(project) {
  if (!project) return null
  if (project.archived_at || project.status === 'archived') return 'restore'
  if (!project.paid_at) return 'sale'
  if (isDigital(project)) return project.message_active ? null : 'open'
  if (!project.manufactured_at) return 'made'
  if (!project.shipped_at) return 'shipped'
  if (!project.arrived_at) return 'arrived'
  return project.message_active ? null : 'open'
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