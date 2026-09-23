import { supabase, supabaseUrl } from '@/lib/supabase'

export function publicMediaUrl(fileId, { publicId, token }) {
  if (!supabaseUrl) return ''
  const params = new URLSearchParams({ file: fileId, msg: publicId, token })
  return `${supabaseUrl}/functions/v1/drive-media?${params.toString()}`
}

export async function fetchPublicMessage(publicId, token, { bump = true } = {}) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.rpc('get_public_message', { p_public_id: publicId, p_bump: bump })
  if (error) throw error
  return data
}

export async function isAdminSession() {
  if (!supabase) return false
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) return false
  const { data: row } = await supabase
    .from('admin_users')
    .select('id')
    .eq('id', sessionData.session.user.id)
    .maybeSingle()
  return Boolean(row)
}

export async function toggleMessageActive(orderId, active) {
  if (!supabase) throw new Error('Supabase is not configured')
  await supabase.from('messages').update({ message_active: active }).eq('order_id', orderId)
}

export async function fetchMediaRows(messageId) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase
    .from('message_media')
    .select('*')
    .eq('message_id', messageId)
    .is('disabled_at', null)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data ?? []
}