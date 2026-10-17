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

// Every step a unit walks, in the order the workshop performs them. `on_hold`
// and `cancelled` are escape hatches, not steps, so they are kept out of the
// linear order but still listed here so nothing can silently accept a status
// this app does not know.
export const OPERATIONS_STEP_ORDER = [
  'pending_verification',
  'information_verified',
  'ready_to_print',
  'printing',
  'printed',
  'qr_verified',
  'manufacturing',
  'quality_control',
  'qc_passed',
  'ready_for_packaging',
  'packed',
  'ready_for_shipment',
  'shipped',
  'delivered',
]

export const OPERATIONS_EXIT_STATUSES = ['on_hold', 'cancelled']

export const OPERATIONS_STATUS_ORDER = [...OPERATIONS_STEP_ORDER, ...OPERATIONS_EXIT_STATUSES]

export const OPERATIONS_STATUS_LABELS = {
  pending_verification: 'Pending Verification',
  information_verified: 'Information Verified',
  ready_to_print: 'Ready to Print',
  printing: 'Printing',
  printed: 'Printed',
  qr_verified: 'QR Verified',
  manufacturing: 'Manufacturing / Assembly',
  quality_control: 'Quality Control',
  qc_passed: 'QC Passed',
  ready_for_packaging: 'Ready for Packaging',
  packed: 'Packed',
  ready_for_shipment: 'Ready for Shipment',
  shipped: 'Shipped / Handed to Bosta',
  delivered: 'Delivered',
  on_hold: 'On Hold',
  cancelled: 'Cancelled',
}

// Short labels for the dense list view.
export const OPERATIONS_STATUS_SHORT = {
  pending_verification: 'Pending',
  information_verified: 'Verified',
  ready_to_print: 'To print',
  printing: 'Printing',
  printed: 'Printed',
  qr_verified: 'QR ok',
  manufacturing: 'Assembly',
  quality_control: 'QC',
  qc_passed: 'QC passed',
  ready_for_packaging: 'To pack',
  packed: 'Packed',
  ready_for_shipment: 'To ship',
  shipped: 'Shipped',
  delivered: 'Delivered',
  on_hold: 'On hold',
  cancelled: 'Cancelled',
}

export function isOperationsStatus(value) {
  return OPERATIONS_STATUS_ORDER.includes(value)
}

// What the next step is, or null at the end of the line. Mirrors — but does
// not replace — the database's own transition guard, which is the authority.
export function nextOperationsStatus(status) {
  const index = OPERATIONS_STEP_ORDER.indexOf(status)
  if (index < 0 || index === OPERATIONS_STEP_ORDER.length - 1) return null
  return OPERATIONS_STEP_ORDER[index + 1]
}

// The intended step order position. Escape hatches sort after everything so a
// held or cancelled unit never looks "further along" than it is.
export function operationsRank(status) {
  const index = OPERATIONS_STEP_ORDER.indexOf(status)
  return index < 0 ? OPERATIONS_STEP_ORDER.length : index
}

export function isOperationsTerminal(status) {
  return status === 'delivered' || status === 'cancelled'
}

// "Sold As" is a DERIVED label, never a second stored identifier. One
// canonical id, one derived display form.
export function soldAsId(reference) {
  const value = String(reference ?? '').trim()
  return PHYSICAL_ID_PATTERN.test(value) ? `SOL-${value}` : ''
}

// Deliberate bridge between the detailed workshop steps and the Dearune's own
// coarse stage. Operations may advance the Dearune's stamps (made / shipped /
// arrived) but never invents a stage the Dearune's own rules would reject.
export function operationsProjectStage(status) {
  switch (status) {
    case 'manufacturing':
    case 'quality_control':
    case 'qc_passed':
    case 'ready_for_packaging':
    case 'packed':
    case 'ready_for_shipment':
      return 'made'
    case 'shipped':
      return 'shipped'
    case 'delivered':
      return 'arrived'
    default:
      return null
  }
}

export const PUBLIC_SITE_URL = import.meta.env.VITE_PUBLIC_SITE_URL?.replace(/\/+$/, '') ?? ''

export function orderStage(order, publishedAt = null) {
  if (order.deleted_at) return 'deleted'
  if (order.cancelled_at) return 'cancelled'
  if (order.wrapper_type === 'digital') {
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
    if (row.wrapper_type === 'digital' && row.message_active) return 'delivered'
    return 'sold'
  }
  return 'configured'
}

export function isDigital(project) {
  return project?.wrapper_type === 'digital'
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