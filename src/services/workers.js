import { currentAccessToken, invokeFunction } from '@/lib/supabase'

// Admin-side worker account management. Every call goes through the
// `admin-workers` edge function, which starts with `requireAdmin()` and then
// uses the service role. The browser never holds the service-role key and
// never writes `workers`, `worker_permissions` or `auth.users` directly.

async function call(action, payload = {}) {
  const token = await currentAccessToken()
  if (!token) throw new Error('Not signed in')
  return invokeFunction('admin-workers', {
    method: 'POST',
    adminToken: token,
    body: { action, ...payload },
  })
}

export async function fetchWorkers() {
  const result = await call('list')
  return Array.isArray(result?.workers) ? result.workers : []
}

export async function fetchWorkerProfile(workerId) {
  const result = await call('get', { workerId })
  return {
    worker: result?.worker ?? null,
    history: Array.isArray(result?.history) ? result.history : [],
  }
}

export async function createWorker({ displayName, email, permissions }) {
  return call('create', { displayName, email, permissions })
}

export async function updateWorkerDetails({ workerId, displayName, email }) {
  return call('update-details', { workerId, displayName, email })
}

export async function setWorkerStatus({ workerId, status, reason }) {
  return call('set-status', { workerId, status, reason })
}

export async function setWorkerPermissions({ workerId, permissions }) {
  return call('set-permissions', { workerId, permissions })
}

export async function resetWorkerPassword(workerId) {
  return call('reset-password', { workerId })
}
