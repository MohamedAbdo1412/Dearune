import { currentAccessToken, invokeFunction } from '@/lib/supabase'
import { projectStage } from '@/services/constants'
import { downloadShippingCsv } from '@/services/shipping'
import { workerRpc } from '@/services/workerRpc'

// Reads go through purpose-built RPCs that omit money, payload and tokens.
export async function fetchWorkerDesigners() {
  const data = await workerRpc('worker_designers')
  return Array.isArray(data) ? data : []
}

export async function fetchWorkerProjects(designerId = null) {
  const data = await workerRpc('worker_projects', { p_designer_id: designerId })
  return Array.isArray(data) ? data : []
}

export async function fetchWorkerDesignerDetail(designerId) {
  return workerRpc('worker_designer_detail', { p_designer_id: designerId })
}

export async function fetchWorkerShipmentsForExport() {
  const data = await workerRpc('worker_export_shipments')
  return Array.isArray(data) ? data : []
}

// The same shipping manifest shape the admin's Designers screen downloads.
// Template and wrapper are stable keys here because the worker has no catalog
// (and therefore no pricing) read; no money column is part of this export.
export function downloadWorkerShipmentsCsv(rows) {
  const shipments = (rows ?? []).map((row) => ({
    reference: row.reference ?? '',
    stage: projectStage(row),
    recipientName: row.recipient_name ?? row.title ?? '',
    title: row.title ?? '',
    template: row.template_slug ?? '',
    wrapper: row.wrapper_type ?? '',
    addressLine1: row.address_line1 ?? '',
    addressLine2: row.address_line2 ?? '',
    city: row.city ?? '',
    stateProvince: row.state_province ?? '',
    postalCode: row.postal_code ?? '',
    country: row.country ?? '',
    phone: row.phone ?? '',
    specialInstructions: row.special_instructions ?? '',
    trackingCode: row.tracking_code ?? '',
    shippedAt: row.shipped_at ?? '',
  }))
  if (shipments.length === 0) return 0
  downloadShippingCsv(shipments)
  return shipments.length
}

// Writes need bcrypt and the service role, so they live in the
// `worker-designers` edge function. That function checks the worker's live
// permission before each action and records the worker as the audit actor.
async function call(action, payload = {}) {
  const token = await currentAccessToken()
  if (!token) throw new Error('Not signed in')
  return invokeFunction('worker-designers', {
    method: 'POST',
    adminToken: token,
    body: { action, ...payload },
  })
}

export async function createDesignerAsWorker(name) {
  return call('create', { name })
}

export async function updateDesignerAsWorker(designerId, { name, code }) {
  return call('update', { designerId, name, code })
}

export async function assignDesignerToProjectAsWorker(designerId, projectId) {
  return call('assign', { designerId, projectId })
}

export async function resetDesignerPasscodeAsWorker(designerId) {
  return call('reset-passcode', { designerId })
}

export async function revokeDesignerAsWorker(designerId) {
  return call('revoke', { designerId })
}

export async function activateDesignerAsWorker(designerId) {
  return call('activate', { designerId })
}
