import { corsHeaders, errorResponse, handleOptions, jsonResponse, readJson } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
import { requireAdminOrDesigner, sha256Hex, randomSecret } from '../_shared/auth.ts'
import { googleAccessToken, driveGetFileParent } from '../_shared/drive.ts'

const MEDIA_TYPES = ['image', 'audio', 'video', 'file'] as const
const MAX_BYTES: Record<string, number> = {
  image: 20 * 1024 * 1024,
  audio: 60 * 1024 * 1024,
  video: 400 * 1024 * 1024,
  file: 50 * 1024 * 1024,
}

type AuthUser = { role: 'admin'; adminId: string } | { role: 'designer'; designerId: string; code: string }

async function loadOrder(orderId: string) {
  return adminClient().from('orders').select('id, designer_id, cancelled_at, deleted_at, paid_at, wrapper_type').eq('id', orderId).maybeSingle()
}

async function authorizeForOrder(orderId: string, auth: AuthUser): Promise<Response | null> {
  const { data: order, error } = await loadOrder(orderId)
  if (error || !order) return errorResponse('Order not found', 404)
  if (auth.role === 'designer' && order.designer_id !== auth.designerId) return errorResponse('Not your order', 403)
  return null
}

function validAddition(item: unknown): false | { driveFileId: string; mediaType: string; mimeType: string; sizeBytes: number; originalFilename: string } {
  if (typeof item !== 'object' || item === null) return false
  const r = item as Record<string, unknown>
  if (typeof r.driveFileId !== 'string' || !/^[A-Za-z0-9_-]{8,}$/.test(r.driveFileId)) return false
  if (typeof r.mediaType !== 'string' || !(MEDIA_TYPES as readonly string[]).includes(r.mediaType)) return false
  if (typeof r.mimeType !== 'string' || r.mimeType.length > 200) return false
  if (typeof r.sizeBytes !== 'number' || !Number.isFinite(r.sizeBytes) || r.sizeBytes <= 0 || r.sizeBytes > MAX_BYTES[r.mediaType]) return false
  if (typeof r.originalFilename !== 'string' || r.originalFilename.length > 200) return false
  return {
    driveFileId: r.driveFileId,
    mediaType: r.mediaType as string,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    originalFilename: r.originalFilename,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()

  const path = new URL(req.url).pathname.split('/').filter(Boolean)
  const orderId = path[path.length - 1] ?? ''

  const auth = await requireAdminOrDesigner(req)
  if (!auth) return errorResponse('Unauthorized', 401)

  const notFound = await authorizeForOrder(orderId, auth)
  if (notFound) return notFound

  const sb = adminClient()

  if (req.method === 'GET') {
    const { data: order } = await sb.from('orders')
      .select('recipient_name, occasion, event_date, wrapper_type, snapshot_price, currency, cancelled_at, paid_at, manufactured_at, shipped_at, arrived_at, deleted_at, template:templates(name)')
      .eq('id', orderId)
      .maybeSingle()

    const { data: message } = await sb.from('messages')
      .select('id, order_id, public_id, headline, body, signature, font_family, layout, editor_state, locked_at, published_at, message_active, open_count, first_opened_at, created_at, updated_at')
      .eq('order_id', orderId)
      .maybeSingle()

    const { data: media } = await sb.from('message_media')
      .select('*')
      .eq('message_id', message?.id ?? '00000000-0000-0000-0000-000000000000')
      .is('disabled_at', null)
      .order('sort_order', { ascending: true })

    const templateRow = order?.template
    const templateName = Array.isArray(templateRow) ? templateRow[0]?.name : templateRow?.name

    return jsonResponse({
      order: {
        id: orderId,
        recipient_name: order?.recipient_name,
        occasion: order?.occasion,
        event_date: order?.event_date,
        wrapper_type: order?.wrapper_type,
        snapshot_price: order?.snapshot_price,
        currency: order?.currency,
        cancelled_at: order?.cancelled_at,
        paid_at: order?.paid_at,
        manufactured_at: order?.manufactured_at,
        shipped_at: order?.shipped_at,
        arrived_at: order?.arrived_at,
        deleted_at: order?.deleted_at,
        template_name: templateName,
      },
      message,
      media: media ?? [],
    })
  }

  if (req.method === 'PUT') {
    const body = await readJson(req)

    const headline = typeof body.headline === 'string' ? body.headline : ''
    const messageBody = typeof body.body === 'string' ? body.body : ''
    const signature = typeof body.signature === 'string' ? body.signature : ''
    if (headline.length > 200 || messageBody.length > 20000 || signature.length > 200) {
      return errorResponse('Invalid message content', 400)
    }

    const { data: order } = await sb.from('orders').select('cancelled_at').eq('id', orderId).maybeSingle()
    if (order?.cancelled_at) return errorResponse('Order is cancelled', 400)

    const { data: message } = await sb.from('messages').select('id, locked_at, drive_folders').eq('order_id', orderId).maybeSingle()
    if (!message) return errorResponse('Message not found', 404)
    if (message.locked_at) return errorResponse('Message is locked and cannot be edited', 409)

    const additions = (Array.isArray(body.mediaAdditions) ? body.mediaAdditions : [])
      .map((item) => validAddition(item))
      .filter((item): item is { driveFileId: string; mediaType: string; mimeType: string; sizeBytes: number; originalFilename: string } => item !== false)

    // Verify each Drive file actually lives in the message's media folder for its type.
    if (additions.length > 0) {
      const token = await googleAccessToken()
      const driveFolders = (message.drive_folders ?? {}) as Record<string, unknown>
      for (const addition of additions) {
        const expectedParent = driveFolders[addition.mediaType]
        if (typeof expectedParent !== 'string') return errorResponse('Invalid media path', 400)
        const parent = await driveGetFileParent(token, addition.driveFileId)
        if (parent !== expectedParent) return errorResponse('Invalid media path', 400)
      }
    }

    const removals = Array.isArray(body.mediaRemove) ? body.mediaRemove.filter((id): id is string => typeof id === 'string') : []

    const fields: Record<string, unknown> = {
      headline: headline.trim(),
      body: messageBody,
      signature: signature.trim() || null,
    }
    if (typeof body.fontFamily === 'string') fields.font_family = body.fontFamily.trim() || null
    if (body.layout && typeof body.layout === 'object' && Object.keys(body.layout as Record<string, unknown>).length > 0) {
      fields.layout = body.layout
    }

    await sb.from('messages').update(fields).eq('id', message.id)

    if (additions.length > 0) {
      const { data: existing } = await sb.from('message_media').select('sort_order').eq('message_id', message.id).order('sort_order', { ascending: false }).limit(1)
      const rows = additions.map((a, index) => ({
        message_id: message.id,
        media_type: a.mediaType,
        drive_file_id: a.driveFileId,
        mime_type: a.mimeType,
        size_bytes: a.sizeBytes,
        original_filename: a.originalFilename,
        sort_order: (existing && existing.length > 0 ? existing[0].sort_order : 0) + index + 1,
      }))
      await sb.from('message_media').insert(rows)
    }

    if (removals.length > 0) {
      await sb.from('message_media').update({ disabled_at: new Date().toISOString() }).eq('message_id', message.id).in('id', removals)
    }

    const { data: updated } = await sb.from('messages')
      .select('id, order_id, public_id, headline, body, signature, font_family, layout, editor_state, locked_at, published_at, message_active, open_count, first_opened_at, created_at, updated_at')
      .eq('id', message.id)
      .maybeSingle()

    const { data: media } = await sb.from('message_media').select('*').eq('message_id', message.id).is('disabled_at', null).order('sort_order', { ascending: true })

    return jsonResponse({ message: updated, media: media ?? [] })
  }

  if (req.method === 'POST') {
    const { data: order } = await sb.from('orders').select('id, cancelled_at, paid_at, wrapper_type').eq('id', orderId).is('deleted_at', null).maybeSingle()
    if (!order) return errorResponse('Order not found', 404)
    if (order.cancelled_at) return errorResponse('Order is cancelled', 400)
    if (!order.paid_at) return errorResponse('Order must be paid before publishing', 409)

    const { data: message } = await sb.from('messages').select('id, public_id, body, locked_at').eq('order_id', orderId).maybeSingle()
    if (!message) return errorResponse('Message not found', 404)
    if (!message.body) return errorResponse('Message has no content yet', 400)

    const token = randomSecret(160)
    const tokenHash = await sha256Hex(token)
    const now = new Date().toISOString()

    if (!message.locked_at) {
      await sb.from('messages').update({ locked_at: now, published_at: now, qr_token_hash: tokenHash, preview_rendered_at: now }).eq('id', message.id)
    } else {
      await sb.from('messages').update({ qr_token_hash: tokenHash, published_at: now }).eq('id', message.id)
    }

    await sb.from('order_events').insert({
      order_id: order.id,
      actor_type: auth.role === 'designer' ? 'designer' : 'admin',
      actor_id: auth.role === 'designer' ? auth.designerId : null,
      action: 'message.published',
      detail: { public_id: message.public_id, wrapper_type: order.wrapper_type },
    })

    return jsonResponse({
      message: { id: message.id, public_id: message.public_id },
      qrPayload: { publicId: message.public_id, token },
    })
  }

  return errorResponse('Method not allowed', 405)
})

export const cors = corsHeaders