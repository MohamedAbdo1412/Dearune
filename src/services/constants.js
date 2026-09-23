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