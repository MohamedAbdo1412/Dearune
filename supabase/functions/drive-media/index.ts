import { adminClient } from '../_shared/supabase.ts'
import { requireDesigner, requireAdmin, sha256Hex } from '../_shared/auth.ts'
import { googleAccessToken, driveDownload } from '../_shared/drive.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, range, content-type',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Range, Content-Length, Content-Type',
}

function respond(err: { error: string }, status: number): Response {
  return new Response(JSON.stringify(err), { status, headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' } })
}

type AuthContext =
  | {
      mode: 'public'
      publicId: string
      token: string
    }
  | {
      mode: 'designer'
      designerId: string
    }
  | {
      mode: 'admin'
    }

async function messageAvailability(messageId: string): Promise<{ ok: boolean }> {
  const sb = adminClient()
  const { data: message } = await sb.from('messages')
    .select('order_id, message_active, published_at, qr_token_hash')
    .eq('id', messageId)
    .maybeSingle()
  if (!message) return { ok: false }
  if (!message.message_active || !message.published_at) return { ok: false }
  const { data: order } = await sb.from('orders').select('cancelled_at, wrapper_type, arrived_at').eq('id', message.order_id).maybeSingle()
  if (!order || order.cancelled_at) return { ok: false }
  if (await isDigitalWrapper(sb, order.wrapper_type)) return { ok: true }
  if (!order.arrived_at) return { ok: false }
  return { ok: true }
}

async function isDigitalWrapper(sb: ReturnType<typeof adminClient>, wrapperKey: string): Promise<boolean> {
  if (!wrapperKey) return false
  const { data } = await sb.from('wrapper_types').select('kind').eq('key', wrapperKey).maybeSingle()
  return data ? data.kind === 'digital' : wrapperKey === 'digital'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return respond({ error: 'Method not allowed' }, 405)
  }

  const url = new URL(req.url)
  const parts = url.pathname.split('/').filter(Boolean)
  const fileId = url.searchParams.get('file') ?? (parts.length > 0 ? parts[parts.length - 1] : '')
  const publicIdParam = url.searchParams.get('msg') ?? ''
  const tokenParam = url.searchParams.get('token') ?? ''

  const sb = adminClient()

  let auth: AuthContext | null = null
  if (publicIdParam && tokenParam) {
    auth = { mode: 'public', publicId: publicIdParam, token: tokenParam }
  } else {
    const designer = await requireDesigner(req)
    if (designer) auth = { mode: 'designer', designerId: designer.designerId }
    else {
      const admin = await requireAdmin(req)
      if (admin) auth = { mode: 'admin' }
    }
  }
  if (!auth) return respond({ error: 'Unauthorized' }, 401)

  // Look up the media row (message media or shipping label).
  const { data: media } = await sb.from('message_media').select('id, message_id, media_type, mime_type, drive_file_id, disabled_at').eq('drive_file_id', fileId).maybeSingle()

  if (media) {
    if (media.disabled_at) return respond({ error: 'Not found' }, 404)

    if (auth.mode === 'public') {
      const { data: message } = await sb.from('messages').select('id, public_id, qr_token_hash, message_active, published_at').eq('id', media.message_id).maybeSingle()
      if (!message || message.public_id !== publicIdParam) return respond({ error: 'Not found' }, 404)
      if (!message.message_active || !message.published_at) return respond({ error: 'Forbidden' }, 403)
      if (!message.qr_token_hash || message.qr_token_hash !== await sha256Hex(tokenParam)) return respond({ error: 'Forbidden' }, 403)
      const availability = await messageAvailability(message.id)
      if (!availability.ok) return respond({ error: 'Forbidden' }, 403)
    } else if (auth.mode === 'designer') {
      const { data: message } = await sb.from('messages').select('order_id').eq('id', media.message_id).maybeSingle()
      if (!message) return respond({ error: 'Forbidden' }, 403)
      const { data: order } = await sb.from('orders').select('designer_id').eq('id', message.order_id).maybeSingle()
      if (!order || order.designer_id !== auth.designerId) return respond({ error: 'Forbidden' }, 403)
    }
  } else {
    // Not in message_media — only an admin may pull a shipping label.
    if (auth.mode !== 'admin') return respond({ error: 'Not found' }, 404)
    const { data: shipping } = await sb.from('shipping')
      .select('label_media')
      .eq('label_media->>driveFileId', fileId)
      .maybeSingle()
    if (!shipping) return respond({ error: 'Not found' }, 404)
  }

  const token = await googleAccessToken()
  const range = req.headers.get('range')
  const driveRes = await driveDownload(token, fileId, range)

  if (!driveRes.ok) return respond({ error: 'Media unavailable' }, 502)

  const headers = new Headers()
  for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const value = driveRes.headers.get(key)
    if (value) headers.set(key, value)
  }
  if (media?.mime_type && !headers.has('content-type')) headers.set('content-type', media.mime_type)
  if (!headers.has('accept-ranges')) headers.set('accept-ranges', 'bytes')
  for (const [key, value] of Object.entries(CORS)) headers.set(key, value)

  if (req.method === 'HEAD') {
    return new Response(null, { status: driveRes.status, headers })
  }

  const body = driveRes.body
  if (!body) return respond({ error: 'Media unavailable' }, 502)

  return new Response(body, { status: driveRes.status, headers })
})