import { supabase, currentAccessToken, invokeFunction } from '@/lib/supabase'

// The admin's view of a Dearune: the `projects` record a designer handed
// over through Create Dearune. Reads go straight to PostgREST (the admin
// holds a select-only RLS policy); every WRITE goes through the
// `admin-dearunes` edge function, which owns the rules — Paid = Sold,
// Made → Shipped → Arrived, maintenance-only corrections, message
// activation. That way there is one owner of the state machine, not a copy
// per screen.

// `status` is deliberately absent: it is a deprecated duplicate of `milestone`
// and `archived_at`. Every stage question is answered by `milestone`.
export const DEARUNE_COLUMNS =
  'id, reference, designer_id, template_slug, template_version, title, milestone, milestone_updated_at, public_id, submitted_at, created_at, updated_at, configured_at, wrapper_type, sale_price, estimated_cost, currency, paid_at, manufactured_at, shipped_at, arrived_at, archived_at, first_activated_at, message_active, policy_version, policies_accepted_at'

export const PRODUCTION_FIELDS = ['manufactured_at', 'shipped_at', 'arrived_at']

export async function fetchDearunes(designerId = null) {
  if (!supabase) throw new Error('Supabase is not configured')
  let query = supabase
    .from('projects')
    .select(DEARUNE_COLUMNS)
    .order('created_at', { ascending: false })
  if (designerId) query = query.eq('designer_id', designerId)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function fetchDearune(projectId) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase
    .from('projects')
    .select(`${DEARUNE_COLUMNS}, payload`)
    .eq('id', projectId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Dearune not found')
  return data
}

export async function fetchDearuneEvents(projectId) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase
    .from('project_events')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function fetchDearuneShipping(projectId) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase
    .from('shipping')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

export async function fetchSalesForProject(projectId) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase
    .from('sales_log')
    .select('*')
    .eq('project_id', projectId)
    .order('sold_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

async function act(action, body) {
  const adminToken = await currentAccessToken()
  if (!adminToken) throw new Error('Not signed in')
  return invokeFunction('admin-dearunes', { method: 'POST', adminToken, body: { action, ...body } })
}

export function recordSale(projectId, { wrapperType = null, sellingPrice = null, estimatedCost = null } = {}) {
  const body = { projectId }
  if (wrapperType) body.wrapperType = wrapperType
  if (sellingPrice !== null && sellingPrice !== undefined) body.sellingPrice = sellingPrice
  if (estimatedCost !== null && estimatedCost !== undefined) body.estimatedCost = estimatedCost
  return act('mark-paid', body)
}

export function correctSale(projectId, reason) {
  return act('reverse-paid', { projectId, reason })
}

export function stampDearune(projectId, field) {
  return act('stamp', { projectId, field })
}

export function correctStep(projectId, field, reason) {
  return act('unstamp', { projectId, field, reason })
}

export function setDearuneWrapper(projectId, wrapperType) {
  return act('set-wrapper', { projectId, wrapperType })
}

export function setDearuneActive(projectId, active) {
  return act('set-active', { projectId, active })
}

export function saveDearuneShipping(projectId, fields) {
  return act('save-shipping', { projectId, ...fields })
}

export function archiveDearune(projectId) {
  return act('archive', { projectId })
}

export function restoreDearune(projectId) {
  return act('restore', { projectId })
}
