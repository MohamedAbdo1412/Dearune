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