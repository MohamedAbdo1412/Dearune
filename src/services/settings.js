import { supabase } from '@/lib/supabase'
import { settingsUpdateSchema } from './validation'

const DEFAULT_SETTINGS = {
  id: 1,
  maintenance_mode: false,
  allow_new_orders: true,
  business_name: 'Dearune',
  currency: 'GBP',
  storage_provider: 'supabase',
}

export async function fetchSettings() {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.from('app_settings').select('*').eq('id', 1).maybeSingle()
  if (error) throw error
  if (data) return data
  const { data: created, error: createError } = await supabase.from('app_settings').insert(DEFAULT_SETTINGS).select('*').single()
  if (createError || !created) throw createError ?? new Error('Could not create settings')
  return created
}

const COLUMN_MAP = {
  maintenanceMode: 'maintenance_mode',
  allowNewOrders: 'allow_new_orders',
  businessName: 'business_name',
  currency: 'currency',
  storageProvider: 'storage_provider',
}

export async function updateSettings(patch) {
  if (!supabase) throw new Error('Supabase is not configured')
  const parsed = settingsUpdateSchema.safeParse(patch)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Invalid settings')
  const dbPatch = {}
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) dbPatch[COLUMN_MAP[key] ?? key] = value
  }
  await supabase.from('app_settings').update(dbPatch).eq('id', 1)
}