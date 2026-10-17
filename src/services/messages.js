import { supabase, supabaseUrl } from '@/lib/supabase'

export function publicMediaUrl(fileId, { publicId, token }) {
  if (!supabaseUrl) return ''
  const params = new URLSearchParams({ file: fileId, msg: publicId, token })
  return `${supabaseUrl}/functions/v1/drive-media?${params.toString()}`
}

// A designer Dearune keeps its photos in the private drafts bucket, so the
// public reader resolves them through `project-media` — which re-checks the
// same token the paper's QR carries and only ever signs paths the letter owns.
export function projectMediaUrl(path, { publicId, token }) {
  if (!supabaseUrl || !path) return ''
  const params = new URLSearchParams({ project: publicId, token, path })
  return `${supabaseUrl}/functions/v1/project-media?${params.toString()}`
}

// Dearunes have been published two ways: the legacy order/`messages` path and
// the current designer/`projects` path. The reader asks for the legacy row
// first and only falls back when it does not exist, so an existing public link
// keeps behaving exactly as before.
export async function fetchPublicMessage(publicId, token, { bump = true } = {}) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.rpc('get_public_message', { p_public_id: publicId, p_bump: bump })
  if (error) throw error
  if (data?.found) return data

  const { data: projectData, error: projectError } = await supabase.rpc('get_public_project_message', {
    p_public_id: publicId,
    p_token: token ?? '',
  })
  if (projectError) throw projectError
  return projectData ?? data
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
