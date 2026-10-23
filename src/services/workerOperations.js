import { workerRpc } from '@/services/workerRpc'

// Safe Operations reads and permission-checked writes. The RPCs return only
// operational fields; no sale price, cost, payload or public token is present
// in any response.

export async function fetchWorkerOperations(includeArchived = false) {
  const data = await workerRpc('worker_operations_units', { p_include_archived: Boolean(includeArchived) })
  return Array.isArray(data) ? data : []
}

export async function setWorkerOperationStatus(productId, status, reason = null) {
  return workerRpc('worker_set_operation_status', {
    p_product_id: productId,
    p_status: status,
    p_reason: reason || null,
  })
}

export async function updateWorkerOperation(productId, { notes, onHoldReason, cancelledReason } = {}) {
  return workerRpc('worker_update_operation', {
    p_product_id: productId,
    p_notes: notes ?? null,
    p_on_hold_reason: onHoldReason ?? null,
    p_cancelled_reason: cancelledReason ?? null,
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

export async function fetchWorkerOperationEvents() {
  return []
}
