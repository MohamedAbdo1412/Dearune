import { supabase, currentAccessToken, invokeFunction } from '@/lib/supabase'
import { MILESTONE_LABELS } from './constants'

// Orders — the ONE record the Operations screen works on.
//
// Every row here is a `projects` row: the Dearune itself, with its canonical id
// (`DR-000021`), its authoritative `milestone`, its designer, its shipment and
// its refunds. Making, Shipping, Delivery and After-Sale are four filters over
// this single view, so an order can never exist twice and moving it between
// sections moves one column instead of copying a row.
//
// Reads go straight to PostgREST (admin select-only RLS) and are paginated,
// filtered and sorted by the DATABASE, not by the browser. Writes go through
// the `admin-operations` edge function, which calls the transactional `ops_*`
// functions; the database has the final word on every transition.

export const ORDER_COLUMNS = [
  'project_id',
  'canonical_id',
  'sold_id',
  'is_digital',
  'title',
  'public_id',
  'public_token',
  'wrapper_type',
  'template_slug',
  'sale_price',
  'currency',
  'milestone',
  'milestone_updated_at',
  'milestone_updated_by',
  'paid_at',
  'manufactured_at',
  'shipped_at',
  'arrived_at',
  'archived_at',
  'message_active',
  'message_protected',
  'designer_id',
  'designer_name',
  'designer_code',
  'shipping_id',
  'recipient_name',
  'customer_phone',
  'recipient_phone_alt',
  'carrier',
  'carrier_reference',
  'tracking_code',
  'manifest_id',
  'shipment_state',
  'shipment_status',
  'shipment_shipped_at',
  'shipment_delivered_at',
  'address_line1',
  'address_line2',
  'city',
  'state_province',
  'governorate',
  'district',
  'postal_code',
  'country',
  'special_instructions',
  'unit_count',
  'unit_reference',
  'search_references',
  'refunded_amount',
  'refund_count',
  'qr_destination',
  'qr_activated',
  'qr_openable',
  'qr_blocked_reason',
  'message_activated_at',
  'recipient_opened_at',
  'recipient_open_count',
].join(', ')

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------
// A section is a WINDOW onto `projects.milestone`, never a place an order is
// copied to. Moving an order between sections changes one milestone value.
export const ORDER_SECTIONS = [
  {
    key: 'making',
    milestones: ['sold', 'making'],
    label: 'Making',
    path: '/admin/operations',
    description: 'Printing, QR, assembly and QC. Finishing Making moves the order to Shipping.',
  },
  {
    key: 'shipping',
    milestones: ['shipping'],
    path: '/admin/operations/shipping',
    label: 'Shipping',
    description: 'Choose the carrier, record the tracking number and hand the parcel over.',
  },
  {
    key: 'delivery',
    milestones: ['delivery', 'delivered'],
    path: '/admin/operations/delivery',
    label: 'Delivery',
    description: 'Parcels with a carrier. Confirm Delivered when the recipient has it.',
  },
  {
    key: 'after-sale',
    milestones: ['after_sale'],
    label: 'After-Sale',
    path: '/admin/operations/after-sale',
    description: 'Refunds, complaints, corrections and post-delivery history.',
  },
  {
    key: 'unopened',
    milestones: ['sold', 'making', 'shipping', 'delivery', 'delivered', 'after_sale'],
    label: 'Unopened Messages',
    path: '/admin/operations/unopened',
    description:
      'Published Dearunes whose recipient has not opened the letter yet. Opening one here is a preview, not a recipient read.',
    unopened: true,
  },
]

// `delivered` is a real milestone but not a section of its own: a delivered
// order stays in Delivery (with its delivered colour) until it is moved to
// After-Sale. This is what makes the "Delivered" action a state change rather
// than an archive.
export const DELIVERY_MILESTONES = ['delivery', 'delivered']

// The Unopened Messages section is a filter on message_active + recipient_opened_at
// rather than a milestone window, so it gets its own flag on the section object.
export function isUnopenedSection(key) {
  return key === 'unopened'
}

export function sectionByKey(key) {
  return ORDER_SECTIONS.find((section) => section.key === key) ?? ORDER_SECTIONS[0]
}

// The words for a milestone come from `constants` so the Admin, Designer and
// Worker dashboards cannot label the same stage differently.
export { MILESTONE_LABELS }


// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------
const SEARCH_COLUMNS = [
  'canonical_id',
  'search_references',
  'unit_reference',
  'title',
  'recipient_name',
  'customer_phone',
  'recipient_phone_alt',
  'tracking_code',
  'carrier_reference',
  'designer_name',
  'designer_code',
  'city',
  'governorate',
]

// PostgREST's `or()` grammar treats commas and parentheses as syntax, and LIKE
// treats % and _ as wildcards. A pasted id with a stray comma must not turn
// into a different query, so those characters are removed rather than escaped.
export function sanitizeSearch(value) {
  return String(value ?? '')
    .replace(/[,()*%_\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Sorting is an allowlist: a caller can never sort by an arbitrary expression.
export const ORDER_SORTS = [
  { key: 'newest', label: 'Newest first', column: 'created_at' },
  { key: 'oldest', label: 'Oldest first', column: 'created_at', ascending: true },
  { key: 'updated', label: 'Recently moved', column: 'milestone_updated_at' },
  { key: 'id', label: 'Dearune ID', column: 'canonical_id', ascending: true },
  { key: 'customer', label: 'Recipient', column: 'recipient_name', ascending: true },
  { key: 'governorate', label: 'Governorate', column: 'governorate', ascending: true },
  { key: 'designer', label: 'Designer', column: 'designer_name', ascending: true },
  { key: 'carrier', label: 'Carrier', column: 'carrier', ascending: true },
  { key: 'delivered', label: 'Delivered on', column: 'shipment_delivered_at' },
  { key: 'refunded', label: 'Refunded amount', column: 'refunded_amount' },
  { key: 'price', label: 'Sale price', column: 'sale_price' },
  // Unopened-specific sorts
  { key: 'activated', label: 'Message activated', column: 'message_activated_at' },
  { key: 'opened', label: 'First opened', column: 'recipient_opened_at' },
]

export function sortDefinition(key) {
  const found = ORDER_SORTS.find((sort) => sort.key === key)
  return found ?? { key: 'newest', label: 'Newest first', column: 'created_at' }
}

// Every filter the four sections offer. Values are passed through untouched;
// the query builder below decides how each one becomes a predicate.
export const EMPTY_FILTERS = {
  query: '',
  carrier: '',
  governorate: '',
  city: '',
  designerId: '',
  wrapperType: '',
  product: '',
  refund: '',
  shipment: '',
  qr: '',
  archived: '',
  paidFrom: '',
  paidTo: '',
  movedFrom: '',
  movedTo: '',
}

export function activeFilters(filters) {
  return Object.entries(filters ?? {}).filter(([, value]) => String(value ?? '').trim() !== '')
}

function text(value) {
  return String(value ?? '').trim()
}

function dayStart(value) {
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function dayEnd(value) {
  const date = new Date(`${value}T23:59:59.999`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * Build the query for one section. Exported so the filter grammar can be
 * asserted without a network call.
 */
export function applyOrderFilters(query, { section, filters = {}, sortKey = 'newest' } = {}) {
  const definition = sectionByKey(section)

  // The Unopened Messages section is NOT a milestone window — it is a filter
  // on message_active + recipient_opened_at over the same ops_orders view.
  if (isUnopenedSection(section)) {
    query = query.eq('message_active', true).is('recipient_opened_at', null)
  } else {
    // A section is a window onto the one milestone column. Delivery shows both
    // `delivery` and `delivered` because a delivered parcel stays on that screen
    // until it is moved to After-Sale.
    query = query.in('milestone', definition.milestones)
  }

  const search = sanitizeSearch(filters.query)
  if (search) {
    const pattern = `%${search}%`
    query = query.or(SEARCH_COLUMNS.map((column) => `${column}.ilike.${pattern}`).join(','))
  }

  if (text(filters.carrier)) query = query.eq('carrier', text(filters.carrier))
  if (text(filters.governorate)) query = query.ilike('governorate', text(filters.governorate))
  if (text(filters.city)) query = query.ilike('city', `%${text(filters.city)}%`)
  if (text(filters.designerId)) query = query.eq('designer_id', text(filters.designerId))
  if (text(filters.wrapperType)) query = query.eq('wrapper_type', text(filters.wrapperType))
  if (text(filters.shipment)) query = query.eq('shipment_state', text(filters.shipment))
  if (text(filters.qr) === 'ready') query = query.eq('qr_openable', true)
  if (text(filters.qr) === 'blocked') query = query.eq('qr_openable', false)
  if (text(filters.archived) === 'only') query = query.not('archived_at', 'is', null)
  if (text(filters.archived) === 'hide') query = query.is('archived_at', null)

  if (text(filters.refund) === 'any') query = query.gt('refund_count', 0)
  if (text(filters.refund) === 'none') query = query.eq('refund_count', 0)
  if (text(filters.refund) === 'refunded') query = query.gt('refunded_amount', 0)

  const paidFrom = dayStart(filters.paidFrom)
  const paidTo = dayEnd(filters.paidTo)
  if (paidFrom) query = query.gte('paid_at', paidFrom)
  if (paidTo) query = query.lte('paid_at', paidTo)

  const movedFrom = dayStart(filters.movedFrom)
  const movedTo = dayEnd(filters.movedTo)
  if (movedFrom) query = query.gte('milestone_updated_at', movedFrom)
  if (movedTo) query = query.lte('milestone_updated_at', movedTo)

  // Unopened section has its own sorts; fall back to newest for it.
  if (!isUnopenedSection(section)) {
    const sort = sortDefinition(sortKey)
    const ascending = Boolean(sort.ascending)
    query = query.order(sort.column, { ascending, nullsFirst: false })
    // Deterministic tie-break: the same query always returns the same page.
    query = query.order('project_id', { ascending: true })
  } else {
    const sort = sortDefinition(sortKey)
    const ascending = Boolean(sort.ascending)
    const column = sort.column === 'created_at' ? 'message_activated_at' : sort.column
    query = query.order(column, { ascending, nullsFirst: false })
    query = query.order('project_id', { ascending: true })
  }

  return query
}

export async function fetchOrders({ section = 'making', filters = {}, sortKey = 'newest', page = 0, pageSize = 25 } = {}) {
  if (!supabase) throw new Error('Supabase is not configured')
  const from = page * pageSize
  const to = from + pageSize - 1

  const query = applyOrderFilters(supabase.from('ops_orders').select(ORDER_COLUMNS, { count: 'exact' }), {
    section,
    filters,
    sortKey,
  }).range(from, to)

  const { data, error, count } = await query
  if (error) throw error
  return { rows: data ?? [], total: count ?? 0, page, pageSize }
}

export async function fetchOrder(projectId) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.from('ops_orders').select(ORDER_COLUMNS).eq('project_id', projectId).maybeSingle()
  if (error) throw error
  return data ?? null
}

export async function fetchMilestoneCounts() {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.from('ops_milestone_counts').select('milestone, total')
  if (error) throw error
  const counts = Object.fromEntries(Object.keys(MILESTONE_LABELS).map((key) => [key, 0]))
  for (const row of data ?? []) counts[row.milestone] = Number(row.total) || 0
  return counts
}

export async function fetchOrderTimeline(projectId) {
  if (!supabase) throw new Error('Supabase is not configured')
  const [events, refunds] = await Promise.all([
    supabase
      .from('project_events')
      .select('id, actor_type, actor_id, action, detail, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('refunds').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
  ])
  if (events.error) throw events.error
  if (refunds.error) throw refunds.error
  return { events: events.data ?? [], refunds: refunds.data ?? [] }
}

export async function fetchOrderReferences(projectId) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase
    .from('order_references')
    .select('id, kind, value, note, created_at')
    .eq('project_id', projectId)
    .order('kind', { ascending: true })
  if (error) throw error
  return data ?? []
}

// The print screens still work on physical units. This is the only place the
// order-based screen reaches back into `operations_units`: to hand the print
// review the unit ids it has always taken.
export async function fetchUnitIdsForProjects(projectIds) {
  if (!supabase) throw new Error('Supabase is not configured')
  if (!Array.isArray(projectIds) || projectIds.length === 0) return []
  const { data, error } = await supabase
    .from('operations_units')
    .select('id, project_id')
    .in('project_id', projectIds)
    .is('archived_at', null)
    .order('unit_index', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function fetchDesignerOptions() {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.from('designers').select('id, name, code').order('name')
  if (error) throw error
  return data ?? []
}

// Resolve a typed identifier to the order it belongs to. This is the same
// registry the whole system uses, so a canonical id, a unit id, a Sold As form
// or a legacy reference all land on the same record — and a reference that
// belongs to nothing resolves to nothing rather than guessing.
export async function resolveOrderReference(value) {
  if (!supabase) throw new Error('Supabase is not configured')
  const typed = String(value ?? '').trim()
  if (!typed) return null
  const candidates = [...new Set([typed, typed.toUpperCase(), typed.replace(/\s+/g, '').toUpperCase()])]

  const { data, error } = await supabase
    .from('order_references')
    .select('value, kind, project_id, projects ( reference, milestone )')
    .in('value', candidates)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    projectId: data.project_id,
    canonicalId: data.projects?.reference ?? null,
    milestone: data.projects?.milestone ?? null,
    value: data.value,
    kind: data.kind,
  }
}

// ---------------------------------------------------------------------------
// Writing — every call is one transactional RPC behind the edge function
// ---------------------------------------------------------------------------
async function act(action, body = {}) {
  const adminToken = await currentAccessToken()
  if (!adminToken) throw new Error('Not signed in')
  return invokeFunction('admin-operations', { method: 'POST', adminToken, body: { action, ...body } })
}

export function completeMaking(projectId, reason = '') {
  return act('making-complete', { projectId, reason })
}

export function saveShipment(projectId, { carrier, tracking = '', manifestId = null }) {
  return act('shipment-save', { projectId, carrier, tracking, manifestId })
}

export function shipOrder(projectId, { carrier, tracking, manifestId = null }) {
  return act('ship', { projectId, carrier, tracking, manifestId })
}

export function deliverOrder(projectId, { reason = '', at = null } = {}) {
  return act('deliver', { projectId, reason, at })
}

export function moveToAfterSale(projectId, reason = '') {
  return act('after-sale', { projectId, reason })
}

export function recordRefund(projectId, { amount, reason, method, reference, status = 'manual', idempotencyKey }) {
  return act('record-refund', { projectId, amount, reason, method, reference, status, idempotencyKey })
}

export function previewManifest({ carrier, filename, sheet, rows }) {
  return act('manifest-preview', { carrier, filename, sheet, rows })
}

export function commitManifest({ carrier, filename, sheet, rows, decisions }) {
  return act('manifest-commit', { carrier, filename, sheet, rows, decisions })
}

export function updateOrderContact(projectId, phone) {
  return act('update-contact', { projectId, phone })
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------
export function orderTitle(order) {
  return order?.title || order?.recipient_name || order?.canonical_id || 'Dearune'
}

export function orderSubtitle(order) {
  return [order?.canonical_id, order?.unit_reference ? `unit ${order.unit_reference}` : null]
    .filter(Boolean)
    .join(' · ')
}

export function isDelivered(order) {
  const stage = String(order?.milestone ?? '')
  return stage === 'delivered' || stage === 'after_sale'
}

// The row tint comes from the persisted state, never from a local click. A
// delivered parcel keeps its colour if the page is refreshed, because the
// colour is a reading of the database rather than a memory of the click.
export function rowStateClass(order) {
  if (isDelivered(order)) return 'bg-emerald-500/[0.07]'
  if (order?.shipment_state === 'shipped') return 'bg-sky-500/[0.06]'
  if (Number(order?.refund_count ?? 0) > 0) return 'bg-amber-500/[0.06]'
  if (order?.archived_at) return 'opacity-60'
  return undefined
}

export const SHIPMENT_STATE_LABELS = {
  awaiting_shipment: 'Awaiting hand-off',
  shipped: 'With the carrier',
  delivered: 'Delivered',
}

export function shipmentStateLabel(order) {
  return SHIPMENT_STATE_LABELS[order?.shipment_state] ?? 'Not shipped'
}

export const REFUND_STATUS_LABELS = {
  pending: 'Pending',
  completed: 'Completed',
  failed: 'Failed',
  manual: 'Recorded by hand',
}

export const REFUND_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'card', label: 'Card' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'other', label: 'Other' },
]

export const REFUND_STATUSES = [
  { value: 'manual', label: 'Recorded by hand (money already returned)' },
  { value: 'pending', label: 'Pending (not returned yet)' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
]

export function refundState(order) {
  const count = Number(order?.refund_count ?? 0)
  const amount = Number(order?.refunded_amount ?? 0)
  if (count === 0) return { key: 'none', label: 'No refunds' }
  if (amount > 0) return { key: 'refunded', label: 'Refunded' }
  return { key: 'recorded', label: `${count} refund${count === 1 ? '' : 's'} recorded` }
}

// The next action an order needs, in the studio's words. Used by the row menu
// and by the detail panel so there is one answer, not two.
export function nextAction(order) {
  switch (order?.milestone) {
    case 'sold':
      return order?.is_digital ? null : { key: 'making-complete', label: 'Finish Making' }
    case 'making':
      return { key: 'making-complete', label: 'Finish Making' }
    case 'shipping':
      return { key: 'ship', label: 'Mark shipped' }
    case 'delivery':
      return { key: 'deliver', label: 'Mark delivered' }
    case 'delivered':
      return { key: 'after-sale', label: 'Move to After-Sale' }
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------
// Every bulk action reuses the same `ops_*` RPCs the individual actions use.
// The edge function loops per order and returns per-order results so the UI
// can report "17 succeeded, 2 missing info, 1 milestone not permitted" with
// access to the failed records. Selection is by stable project_id, never by
// row position, so filters, pagination and sorting never shift the selection.

export async function fetchUnopenedCount() {
  if (!supabase) throw new Error('Supabase is not configured')
  const { count, error } = await supabase
    .from('ops_orders')
    .select('project_id', { count: 'exact', head: true })
    .eq('message_active', true)
    .is('recipient_opened_at', null)
  if (error) throw error
  return count ?? 0
}

// Run a bulk transition over the selected orders. The edge function action is
// `bulk-transition` which takes { projectIds, transition, ...args } and returns
// per-order results.
export async function runBulkTransition(projectIds, transition, args = {}) {
  if (!projectIds?.length) return { results: [], summary: { succeeded: 0, failed: 0, total: 0 } }
  const adminToken = await currentAccessToken()
  if (!adminToken) throw new Error('Not signed in')
  return invokeFunction('admin-operations', {
    method: 'POST',
    adminToken,
    body: { action: 'bulk-transition', projectIds, transition, ...args },
  })
}

// Summarize bulk results into a human-readable line and an array of failures.
export function summarizeBulkResults(results) {
  const succeeded = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok)
  const total = results.length
  const reasons = failed.reduce((acc, r) => {
    const reason = r.error ?? r.message ?? 'Unknown error'
    acc[reason] = (acc[reason] ?? 0) + 1
    return acc
  }, {})
  const reasonLine = Object.entries(reasons)
    .map(([reason, count]) => `${count} ${reason}`)
    .join(', ')
  return {
    summary: `${succeeded} succeeded${failed.length ? `, ${failed.length} failed` : ''}${reasonLine ? ` (${reasonLine})` : ''}`,
    succeeded,
    failed: failed.length,
    total,
    failures: failed,
  }
}

// Fetch all pages of a filtered query (for bulk export). This is used by the
// manifest export dialog to export all matching orders, not just the current page.
export async function fetchAllOrders({ section = 'making', filters = {}, sortKey = 'newest', pageSize = 500 } = {}) {
  if (!supabase) throw new Error('Supabase is not configured')
  const allRows = []
  let page = 0
  while (true) {
    const { rows, total } = await fetchOrders({ section, filters, sortKey, page, pageSize })
    if (rows.length === 0) break
    allRows.push(...rows)
    if (allRows.length >= total) break
    page += 1
  }
  return allRows
}
