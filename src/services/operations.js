import { supabase, currentAccessToken, invokeFunction } from '@/lib/supabase'
import {
  OPERATIONS_STATUS_ORDER,
  PHYSICAL_ID_PATTERN,
  operationsRank,
  soldAsId,
} from './constants'

// The admin's view of the production line.
//
// Reads go straight to PostgREST over `operations_units` — a security-invoker
// view that joins the unit, its Dearune, its designer and its delivery row
// WITHOUT dragging the private letter payload to the browser. Every write
// goes through the `admin-operations` edge function, which owns the rules;
// the database trigger has the final word. Nothing here writes directly.

export const OPERATION_COLUMNS = [
  'id',
  'reference',
  'unit_index',
  'status',
  'notes',
  'on_hold_reason',
  'cancelled_reason',
  'archived_at',
  'created_at',
  'updated_at',
  'project_id',
  'project_reference',
  'project_title',
  'public_id',
  'public_token',
  'wrapper_type',
  'template_slug',
  'paid_at',
  'message_active',
  'message_protected',
  'designer_id',
  'designer_name',
  'designer_code',
  'recipient_name',
  'customer_phone',
  'tracking_code',
  'provider',
  'address_line1',
  'address_line2',
  'city',
  'state_province',
  'postal_code',
  'country',
  'special_instructions',
  'qr_target',
  'qr_ready',
].join(', ')

// ---- reading ---------------------------------------------------------------

export async function fetchOperations({ includeArchived = false } = {}) {
  if (!supabase) throw new Error('Supabase is not configured')
  let query = supabase.from('operations_units').select(OPERATION_COLUMNS)
  if (!includeArchived) query = query.is('archived_at', null)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(toOperation)
}

export async function fetchOperationEvents(operationId) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase
    .from('physical_product_events')
    .select('*')
    .eq('physical_product_id', operationId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

// One row, in the shape the screens and the paper generator both read.
export function toOperation(row) {
  const reference = String(row?.reference ?? '')
  const unitIndex = Number(row?.unit_index ?? 1)
  const designerName = row?.designer_name ?? ''
  return {
    id: row.id,
    reference,
    soldAs: soldAsId(reference),
    hasValidId: PHYSICAL_ID_PATTERN.test(reference),
    unitIndex: Number.isFinite(unitIndex) ? unitIndex : 1,
    status: row.status,
    statusRank: operationsRank(row.status),
    notes: row.notes ?? '',
    onHoldReason: row.on_hold_reason ?? '',
    cancelledReason: row.cancelled_reason ?? '',
    archivedAt: row.archived_at ?? null,
    archived: Boolean(row.archived_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at,

    projectId: row.project_id,
    projectReference: row.project_reference ?? '',
    projectTitle: row.project_title ?? '',
    publicId: row.public_id ?? '',
    publicToken: row.public_token ?? '',
    wrapperType: row.wrapper_type ?? '',
    templateSlug: row.template_slug ?? '',
    paidAt: row.paid_at ?? null,
    messageActive: Boolean(row.message_active),
    messageProtected: Boolean(row.message_protected),
    qrTarget: Boolean(row.qr_target),
    qrReady: Boolean(row.qr_ready),

    designerId: row.designer_id ?? null,
    designerName,
    designerCode: row.designer_code ?? '',

    recipientName: designerName || row.recipient_name || '',
    customerPhone: row.customer_phone ?? '',
    trackingCode: row.tracking_code ?? '',
    provider: row.provider ?? '',
    addressLine1: row.address_line1 ?? '',
    addressLine2: row.address_line2 ?? '',
    city: row.city ?? '',
    stateProvince: row.state_province ?? '',
    postalCode: row.postal_code ?? '',
    country: row.country ?? '',
    specialInstructions: row.special_instructions ?? '',
  }
}

// ---- sorting / filtering (pure, so they can be asserted) -------------------

export const OPERATIONS_SORTS = [
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'updated', label: 'Recently updated' },
  { key: 'status', label: 'Status' },
  { key: 'id', label: 'ID' },
  { key: 'customer', label: 'Customer' },
]

const time = (value) => {
  const parsed = Date.parse(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : 0
}

const text = (value) => String(value ?? '').toLowerCase()

// Every field the studio might type into the search box. Search matches the
// canonical id and its Sold As form, so pasting either finds the unit.
export function operationSearchText(operation) {
  return [
    operation.reference,
    operation.soldAs,
    operation.projectReference,
    operation.projectTitle,
    operation.designerName,
    operation.designerCode,
    operation.recipientName,
    operation.customerPhone,
  ]
    .map(text)
    .join(' \u0000 ')
}

export function matchesOperationQuery(operation, query) {
  const needle = text(query).trim()
  if (!needle) return true
  const haystack = operationSearchText(operation)
  return needle.split(/\s+/).every((token) => haystack.includes(token))
}

// Deterministic, total ordering — ties always fall back to the canonical id
// so two screens can never disagree about what "first" means.
export function sortOperations(operations, sortKey = 'newest') {
  const rows = [...(operations ?? [])]
  const byId = (a, b) => String(a.reference).localeCompare(String(b.reference))
  switch (sortKey) {
    case 'oldest':
      return rows.sort((a, b) => time(a.createdAt) - time(b.createdAt) || byId(a, b))
    case 'updated':
      return rows.sort((a, b) => time(b.updatedAt) - time(a.updatedAt) || byId(a, b))
    case 'status':
      return rows.sort((a, b) => a.statusRank - b.statusRank || time(b.createdAt) - time(a.createdAt) || byId(a, b))
    case 'id':
      return rows.sort(byId)
    case 'customer':
      return rows.sort((a, b) =>
        text(a.recipientName).localeCompare(text(b.recipientName)) ||
        text(a.customerPhone).localeCompare(text(b.customerPhone)) ||
        byId(a, b),
      )
    case 'newest':
    default:
      return rows.sort((a, b) => time(b.createdAt) - time(a.createdAt) || byId(a, b))
  }
}

export function viewOperations(operations, { sortKey = 'newest', query = '', status = '', includeArchived = false } = {}) {
  const rows = (operations ?? []).filter((row) => {
    if (!includeArchived && row.archived) return false
    if (status && row.status !== status) return false
    return matchesOperationQuery(row, query)
  })
  return sortOperations(rows, sortKey)
}

export function statusCounts(operations) {
  const counts = Object.fromEntries(OPERATIONS_STATUS_ORDER.map((key) => [key, 0]))
  for (const row of operations ?? []) {
    if (counts[row.status] === undefined) counts[row.status] = 0
    counts[row.status] += 1
  }
  return counts
}

// ---- validation (shared by the review step and the generator) ---------------

// Everything a paper needs before it can be printed. Reported per item so the
// review step can show exactly what is missing instead of silently skipping.
export function validateOperationForPaper(operation) {
  const errors = []
  const warnings = []

  if (!operation) return { ok: false, errors: ['The Operations record no longer exists'], warnings }

  if (!PHYSICAL_ID_PATTERN.test(operation.reference)) {
    errors.push('This unit has no valid canonical ID (DR + 11 digits)')
  }
  if (!operation.designerName) errors.push('No designer name on file')
  if (!operation.designerCode) errors.push('No designer ID on file')
  if (!operation.publicId) errors.push('The Dearune has no public id, so its QR has no destination')
  if (!operation.publicToken) {
    errors.push('The Dearune has no public token, so its QR could not be verified')
  }
  if (!operation.messageActive && !errors.length) {
    warnings.push('The letter is not switched on yet — the printed QR will not open it')
  }
  if (operation.messageProtected) {
    warnings.push('The letter is password-protected, so the public reader will not open it')
  }
  if (!operation.customerPhone) {
    warnings.push('No customer number on file — the paper will print an empty field')
  }

  return { ok: errors.length === 0, errors, warnings }
}

// ---- writing ---------------------------------------------------------------

async function act(action, body) {
  const adminToken = await currentAccessToken()
  if (!adminToken) throw new Error('Not signed in')
  return invokeFunction('admin-operations', { method: 'POST', adminToken, body: { action, ...body } })
}

export function ensureOperations(projectId, units = 1) {
  return act('ensure', { projectId, units })
}

export function setOperationStatus(productId, status, reason = '') {
  return act('set-status', { productId, status, reason })
}

export function updateOperation(productId, fields = {}) {
  return act('update', { productId, ...fields })
}

export function archiveOperations(productIds) {
  return act('archive', { productIds, productId: Array.isArray(productIds) && productIds.length === 1 ? productIds[0] : undefined })
}

export function restoreOperations(productIds) {
  return act('restore', { productIds })
}

export function updateOperationContact(projectId, phone) {
  return act('update-contact', { projectId, phone })
}

// The Designer name / ID a paper prints are the designer's own fields, so
// correcting them writes back to `designers` rather than stamping a copy onto
// the unit.
export function updateOperationDesigner(projectId, { designerName, designerCode }) {
  return act('update-designer', { projectId, designerName, designerCode })
}
