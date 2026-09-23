import { corsHeaders, errorResponse, handleOptions, jsonResponse, readJson } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
import { requireAdmin } from '../_shared/auth.ts'
import { googleAccessToken, driveTrash } from '../_shared/drive.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const admin = await requireAdmin(req)
  if (!admin) return errorResponse('Unauthorized', 401)

  const body = await readJson(req)
  if (body.confirm !== true) return errorResponse('Permanent deletion requires explicit confirmation', 400)

  const sb = adminClient()
  const token = await googleAccessToken()

  let rows: Array<{ id: string; drive_file_id: string }> = []

  if (typeof body.messageId === 'string' && body.messageId) {
    const { data } = await sb.from('message_media').select('id, drive_file_id').eq('message_id', body.messageId)
    rows = data ?? []
    await sb.from('messages').update({ drive_folders: {} }).eq('id', body.messageId)
  } else if (Array.isArray(body.driveFileIds) && body.driveFileIds.length > 0) {
    const ids = body.driveFileIds.filter((id): id is string => typeof id === 'string')
    if (ids.length > 0) {
      const { data } = await sb.from('message_media').select('id, drive_file_id').in('drive_file_id', ids)
      rows = data ?? []
    }
  } else {
    return errorResponse('Nothing to delete', 400)
  }

  if (rows.length === 0) return jsonResponse({ deleted: 0 })

  for (const row of rows) {
    await driveTrash(token, row.drive_file_id)
  }
  const rowIds = rows.map((r) => r.id)
  await sb.from('message_media').delete().in('id', rowIds)

  return jsonResponse({ deleted: rows.length })
})

export const cors = corsHeaders