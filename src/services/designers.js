import { supabase, currentAccessToken, invokeFunction } from '@/lib/supabase'

export async function fetchDesigners() {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase
    .from('designers')
    .select('id, name, code, created_by, last_login_at, revoked_at, created_at, updated_at')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createDesigner(name) {
  const token = await currentAccessToken()
  if (!token) throw new Error('Not signed in')
  return invokeFunction('admin-designers', { method: 'POST', adminToken: token, body: { action: 'create', name } })
}

export async function resetPasscode(designerId) {
  const token = await currentAccessToken()
  if (!token) throw new Error('Not signed in')
  return invokeFunction('admin-designers', { method: 'POST', adminToken: token, body: { action: 'reset-passcode', designerId } })
}

export async function revokeDesigner(designerId) {
  const token = await currentAccessToken()
  if (!token) throw new Error('Not signed in')
  return invokeFunction('admin-designers', { method: 'POST', adminToken: token, body: { action: 'revoke', designerId } })
}

export async function activateDesigner(designerId) {
  const token = await currentAccessToken()
  if (!token) throw new Error('Not signed in')
  return invokeFunction('admin-designers', { method: 'POST', adminToken: token, body: { action: 'activate', designerId } })
}