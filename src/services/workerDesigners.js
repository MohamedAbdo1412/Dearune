import { currentAccessToken, invokeFunction } from '@/lib/supabase'
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

export async function resetDesignerPasscodeAsWorker(designerId) {
  return call('reset-passcode', { designerId })
}

export async function revokeDesignerAsWorker(designerId) {
  return call('revoke', { designerId })
}

export async function activateDesignerAsWorker(designerId) {
  return call('activate', { designerId })
}
