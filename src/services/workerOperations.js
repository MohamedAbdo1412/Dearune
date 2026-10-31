import { workerRpc } from '@/services/workerRpc'
import { toOperation } from '@/services/operations'

// Safe Operations reads and permission-checked writes. The RPCs return only
// operational fields; no sale price, cost or letter payload is present in any
// response. The public token appears only in the dedicated print payload,
// which is separately gated by `operations.print`.
//
// Rows are mapped through the admin service's pure `toOperation()` mapper, so
// both dashboards read the identical shape without sharing an admin query.

export async function fetchWorkerOperations(includeArchived = false) {
  const data = await workerRpc('worker_operations_units', { p_include_archived: Boolean(includeArchived) })
  return Array.isArray(data) ? data : []
}

export async function fetchWorkerDearuneDetail(projectId) {
  return workerRpc('worker_dearune_detail', { p_project_id: projectId })
}

export async function markWorkerDearuneManufactured(projectId) {
  return workerRpc('worker_mark_dearune_manufactured', { p_project_id: projectId })
}

export async function markWorkerDearuneShipped(projectId, trackingCode = null, provider = null) {
  return workerRpc('worker_mark_dearune_shipped', { p_project_id: projectId, p_tracking_code: trackingCode, p_provider: provider })
}

export async function markWorkerDearuneDelivered(projectId) {
  return workerRpc('worker_mark_dearune_delivered', { p_project_id: projectId })
}

export async function updateWorkerOperation(productId, { notes } = {}) {
  return workerRpc('worker_update_operation', {
    p_product_id: productId,
    p_notes: notes ?? null,
  })
}

export async function archiveWorkerOperations(productIds, archive) {
  return workerRpc('worker_archive_operations', {
    p_product_ids: productIds,
    p_archive: Boolean(archive),
  })
}

export async function updateWorkerOperationContact(projectId, phone) {
  return workerRpc('worker_update_operation_contact', {
    p_project_id: projectId,
    p_phone: phone ?? '',
  })
}

export async function updateWorkerOperationDesigner(projectId, designerId) {
  return workerRpc('worker_update_operation_designer', {
    p_project_id: projectId,
    p_designer_id: designerId,
  })
}

export async function ensureWorkerOperations(projectId, units = 1) {
  return workerRpc('worker_ensure_operations', {
    p_project_id: projectId,
    p_units: units,
  })
}

export async function fetchWorkerOperationEvents(productId) {
  const data = await workerRpc('worker_operation_events', { p_product_id: productId })
  return Array.isArray(data) ? data : []
}

export async function fetchWorkerAssignableDesigners() {
  const data = await workerRpc('worker_assignable_designers')
  return Array.isArray(data) ? data : []
}

export async function fetchWorkerOperationsForPrint(productIds = null) {
  const data = await workerRpc('worker_operations_print', { p_product_ids: productIds })
  if (!Array.isArray(data)) return []
  return data.map((row) => toOperation(row))
}

export async function fetchWorkerOperationsForExport(includeArchived = true) {
  const data = await workerRpc('worker_export_operations', {
    p_include_archived: Boolean(includeArchived),
  })
  return Array.isArray(data) ? data : []
}

/** Build the same operational CSV the admin screen offers, from safe rows only. */
export function downloadWorkerOperationsCsv(rows) {
  const columns = [
    ['Unit ID', 'reference'],
    ['Unit', 'unit_index'],
    ['Dearune ID', 'project_reference'],
    ['Sold ID', 'sold_id'],
    ['Milestone', 'milestone'],
    ['Title', 'project_title'],
    ['Designer', 'designer_name'],
    ['Designer ID', 'designer_code'],
    ['Recipient', 'recipient_name'],
    ['Phone', 'customer_phone'],
    ['Address', 'address_line1'],
    ['Address 2', 'address_line2'],
    ['City', 'city'],
    ['State', 'state_province'],
    ['Postal code', 'postal_code'],
    ['Country', 'country'],
    ['Courier', 'provider'],
    ['Tracking', 'tracking_code'],
    ['Archived', 'archived_at'],
    ['Notes', 'notes'],
  ]
  const escape = (value) => {
    if (value === null || value === undefined) return ''
    const text = String(value)
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const lines = [columns.map(([label]) => escape(label)).join(',')]
  for (const row of rows ?? []) {
    lines.push(columns.map(([, key]) => escape(row?.[key])).join(','))
  }
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `Dearune-Operations-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
