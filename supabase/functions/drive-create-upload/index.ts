import { corsHeaders, errorResponse, handleOptions, jsonResponse, readJson } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
import { requireAdminOrDesigner } from '../_shared/auth.ts'
import { requireEnv } from '../_shared/env.ts'
import { googleAccessToken, driveEnsureFolder, driveCreateResumableSession } from '../_shared/drive.ts'

const MEDIA_TYPES = ['image', 'audio', 'video', 'file'] as const
const MAX_BYTES: Record<string, number> = {
  image: 20 * 1024 * 1024,
  audio: 60 * 1024 * 1024,
  video: 400 * 1024 * 1024,
  file: 50 * 1024 * 1024,
}

const allowedMime = (value: string): boolean => {
  const lower = value.toLowerCase()
  return (
    lower.startsWith('image/') ||
    lower.startsWith('audio/') ||
    lower.startsWith('video/') ||
    lower === 'application/pdf' ||
    lower === 'text/plain' ||
    lower === 'application/zip' ||
    lower === 'application/octet-stream'
  )
}

function safeName(fileName: string): string {
  const cleaned = fileName.replace(/[^a-z0-9._-]/gi, '').slice(-80)
  return cleaned || 'file'
}

async function ensureMessageFolders(messageId: string, mediaType: string): Promise<Record<string, string> | Response> {
  const sb = adminClient()
  const { data: message } = await sb.from('messages').select('id, drive_folders').eq('id', messageId).maybeSingle()
  if (!message) return errorResponse('Message not found', 404)

  const token = await googleAccessToken()
  const root = requireEnv('GOOGLE_DRIVE_MEDIA_FOLDER_ID')
  const folders = { ...((message.drive_folders ?? {}) as Record<string, string>) }

  if (!folders.message) {
    const mediaRoot = await driveEnsureFolder(token, 'MessageMedia', root)
    folders.message = await driveEnsureFolder(token, messageId, mediaRoot)
  }
  if (!folders[mediaType]) {
    folders[mediaType] = await driveEnsureFolder(token, mediaType, folders.message)
  }

  await sb.from('messages').update({ drive_folders: folders }).eq('id', messageId)
  return folders
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const auth = await requireAdminOrDesigner(req)
  if (!auth) return errorResponse('Unauthorized', 401)

  const body = await readJson(req)
  const scope = body.scope === 'label' ? 'label' : 'message'
  const fileName = typeof body.fileName === 'string' ? body.fileName : ''
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType : ''
  const sizeBytes = typeof body.sizeBytes === 'number' ? body.sizeBytes : NaN

  if (!fileName || !mimeType || !Number.isFinite(sizeBytes) || sizeBytes <= 0) return errorResponse('Missing upload details', 400)

  const sb = adminClient()

  if (scope === 'label') {
    if (auth.role !== 'admin') return errorResponse('Forbidden', 403)
    if (mimeType !== 'application/pdf' && mimeType !== 'application/octet-stream') return errorResponse('Only PDF files are supported', 400)
    if (sizeBytes > MAX_BYTES.file) return errorResponse('File is too large', 400)

    const orderId = typeof body.orderId === 'string' ? body.orderId : ''
    if (!orderId) return errorResponse('Missing order id', 400)
    const { data: order } = await sb.from('orders').select('id').eq('id', orderId).maybeSingle()
    if (!order) return errorResponse('Order not found', 404)

    const token = await googleAccessToken()
    const root = requireEnv('GOOGLE_DRIVE_MEDIA_FOLDER_ID')
    const labelsRoot = await driveEnsureFolder(token, 'ShippingLabels', root)
    const orderFolder = await driveEnsureFolder(token, orderId, labelsRoot)

    const sessionUrl = await driveCreateResumableSession(token, {
      name: `${safeName(fileName)}.pdf`,
      mimeType,
      sizeBytes,
      parentId: orderFolder,
    })
    return jsonResponse({ sessionUrl, uploadType: 'drive-resumable', scope, fileName, orderId })
  }

  // scope === 'message'
  const messageId = typeof body.messageId === 'string' ? body.messageId : ''
  const mediaType = typeof body.mediaType === 'string' ? body.mediaType : ''
  if (!messageId) return errorResponse('Missing message id', 400)
  if (!(MEDIA_TYPES as readonly string[]).includes(mediaType)) return errorResponse('Unsupported media type', 400)
  if (sizeBytes > MAX_BYTES[mediaType]) return errorResponse('File is too large', 400)
  if (!allowedMime(mimeType)) return errorResponse('This file type is not supported', 400)

  const { data: message } = await sb.from('messages')
    .select('id, locked_at, order:orders(id, designer_id, cancelled_at, deleted_at)')
    .eq('id', messageId)
    .maybeSingle()
  if (!message) return errorResponse('Message not found', 404)

  const order = Array.isArray(message.order) ? message.order[0] : message.order
  if (!order || order.deleted_at) return errorResponse('Order not found', 404)
  if (auth.role === 'designer') {
    if (order.designer_id !== auth.designerId) return errorResponse('Not your message', 403)
    if (order.cancelled_at) return errorResponse('Order is cancelled', 400)
    if (message.locked_at) return errorResponse('Message is locked and cannot be edited', 409)
  }

  const folders = await ensureMessageFolders(messageId, mediaType)
  if (folders instanceof Response) return folders

  const token = await googleAccessToken()
  const sessionUrl = await driveCreateResumableSession(token, {
    name: safeName(fileName),
    mimeType,
    sizeBytes,
    parentId: folders[mediaType],
  })

  return jsonResponse({ sessionUrl, uploadType: 'drive-resumable', scope: 'message', mediaType, fileName, messageId })
})

export const cors = corsHeaders