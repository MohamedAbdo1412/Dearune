import { corsHeaders, errorResponse, handleOptions, jsonResponse } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
import { requireDesigner } from '../_shared/auth.ts'
import { googleAccessToken, driveEnsureFolder, driveCreateResumableSession, driveTrash, driveDownload } from '../_shared/drive.ts'

// Designers draft media privately, before any order exists, so the bytes are
// stored in a namespaced object space that ONLY this function can address:
// the object name is always built server-side from the verified designer JWT,
// and every read/write/delete uses the service-role client (or Drive's own
// credentials). A designer therefore can never touch another designer's
// drafts, and the browser never sees a secret.
//
// The storage backend is switched in admin Settings. 'supabase' (the default)
// keeps objects in the private 'designer-drafts' bucket and hands back short-
// lived signed URLs. 'google_drive' pushes the same bytes into a per-designer
// Drive folder for dashboard-mirrored drafts.

const BUCKET = 'designer-drafts'
const ROOT_FOLDER = 'Dearune Designer Drafts'
const SIGNED_URL_TTL = 3600

const KIND_LIMITS: Record<string, number> = {
  photo: 20 * 1024 * 1024,
  audio: 60 * 1024 * 1024,
}

const KIND_MIME: Record<string, string> = {
  photo: 'image/',
  audio: 'audio/',
}

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/wav': '.wav',
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/x-m4a': '.m4a',
  'audio/m4a': '.m4a',
}

function sanitizeName(name: string): string {
  const safe = name.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^\.+/, '').slice(0, 80)
  return safe || 'print'
}

function extensionFor(mime: string, originalName: string): string {
  const base = originalName.replace(/^.*(\.[A-Za-z0-9]{1,8})$/, '$1')
  if (/^\.[A-Za-z0-9]{1,8}$/.test(base)) return base
  return EXT_BY_MIME[mime] ?? '.bin'
}

async function resolveStorageProvider(sb: ReturnType<typeof adminClient>): Promise<'supabase' | 'google_drive'> {
  const { data } = await sb.from('app_settings').select('storage_provider').eq('id', 1).maybeSingle()
  return data?.storage_provider === 'google_drive' ? 'google_drive' : 'supabase'
}

function mediaRef({
  storageProvider,
  path,
  mimeType,
  sizeBytes,
  originalName,
}: {
  storageProvider: 'supabase' | 'google_drive'
  path: string
  mimeType: string
  sizeBytes: number
  originalName: string
}) {
  return {
    path,
    storageProvider,
    mimeType,
    sizeBytes,
    originalName,
    addedAt: new Date().toISOString(),
  }
}

async function uploadToDrive(sb: ReturnType<typeof adminClient>, designerId: string, bytes: Uint8Array, mimeType: string, originalName: string) {
  const token = await googleAccessToken()
  const root = await driveEnsureFolder(token, ROOT_FOLDER, 'root')
  const designerFolder = await driveEnsureFolder(token, designerId, root)
  const sessionUrl = await driveCreateResumableSession(token, {
    name: originalName,
    mimeType,
    sizeBytes: bytes.byteLength,
    parentId: designerFolder,
  })
  const res = await fetch(sessionUrl, {
    method: 'PUT',
    headers: { 'content-type': mimeType, 'content-length': String(bytes.byteLength) },
    body: bytes,
  })
  if (!res.ok) throw new Error('Drive upload failed')
  const json = await res.json()
  if (!json?.id) throw new Error('Drive upload returned no file id')
  void sb
  return String(json.id)
}

async function uploadToSupabase(sb: ReturnType<typeof adminClient>, designerId: string, bytes: Uint8Array, mimeType: string, extension: string, fixed = '') {
  // A stable `fixed` name (e.g. the project's photo slot) turns the upload
  // into an upsert: a retried submission overwrites the earlier object instead
  // of leaving an endless row of duplicates.
  const objectName = fixed
    ? `${designerId}/memorial-message/${fixed}${extension}`
    : `${designerId}/memorial-message/${crypto.randomUUID()}${extension}`
  const { error } = await sb.storage.from(BUCKET).upload(objectName, bytes, {
    contentType: mimeType,
    cacheControl: '3600',
    upsert: Boolean(fixed),
  })
  if (error) throw error
  return objectName
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()

  const sb = adminClient()
  const designer = await requireDesigner(req)
  if (!designer) return errorResponse('This book is closed to you', 401)

  const url = new URL(req.url)
  const path = url.searchParams.get('path') ?? ''
  const providerHint = url.searchParams.get('storageProvider')

  // -- Upload ---------------------------------------------------------------
  if (req.method === 'POST') {
    const kind = url.searchParams.get('kind') ?? ''
    const limit = KIND_LIMITS[kind]
    if (!limit) return errorResponse('Unknown media kind', 400)

    const mimeType = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    const requiredPrefix = KIND_MIME[kind]
    if (!mimeType.startsWith(requiredPrefix)) return errorResponse(`A ${kind} must be ${requiredPrefix}*`, 400)

    const originalName = sanitizeName(url.searchParams.get('name') ?? '')
    const fixedName = sanitizeName(url.searchParams.get('fixed') ?? '').replace(/\.g$/, '')
    const bytes = new Uint8Array(await req.arrayBuffer())
    if (bytes.byteLength === 0) return errorResponse('Nothing was sent', 400)
    if (bytes.byteLength > limit) return errorResponse('That is too heavy to pin', 413)

    try {
      const provider = await resolveStorageProvider(sb)
      const storagePath = provider === 'google_drive'
        ? await uploadToDrive(sb, designer.designerId, bytes, mimeType, originalName)
        : await uploadToSupabase(sb, designer.designerId, bytes, mimeType, extensionFor(mimeType, originalName), fixedName)
      return jsonResponse(mediaRef({ storageProvider: provider, path: storagePath, mimeType, sizeBytes: bytes.byteLength, originalName }), 201)
    } catch (cause) {
      return errorResponse(cause instanceof Error ? cause.message : 'Upload failed', 500)
    }
  }

  // -- Delete ---------------------------------------------------------------
  if (req.method === 'DELETE') {
    if (!path) return errorResponse('Nothing to remove', 400)
    try {
      const provider = providerHint === 'google_drive' ? 'google_drive' : await resolveStorageProvider(sb)
      if (provider === 'supabase') {
        // Object names are namespaced by designer id on upload; refusing any
        // path outside that namespace keeps one designer from addressing
        // (or signing) another designer's drafts.
        if (!path.startsWith(`${designer.designerId}/`)) return errorResponse('Not yours to remove', 403)
        await sb.storage.from(BUCKET).remove([path])
      } else {
        const token = await googleAccessToken()
        await driveTrash(token, path)
      }
      return jsonResponse({ removed: path })
    } catch (cause) {
      return errorResponse(cause instanceof Error ? cause.message : 'Could not remove the media', 500)
    }
  }

  // -- Serve / resolve -------------------------------------------------------
  if (req.method === 'GET') {
    if (!path) return errorResponse('Nothing to resolve', 400)

    const streaming = url.searchParams.get('dl') === '1'
    const provider = providerHint === 'google_drive' ? 'google_drive' : providerHint === 'supabase' ? 'supabase' : await resolveStorageProvider(sb)

    // Drive files are streamed through this function so the client keeps one
    // origin and range requests keep working for audio seeking. The bytes are
    // fetched by the client (which attaches the designer JWT) and turned into
    // an object URL; a resolver call that is not a stream just reports which
    // backend the path belongs to.
    if (streaming) {
      try {
        const token = await googleAccessToken()
        const range = req.headers.get('range')
        const driveRes = await driveDownload(token, path, range)
        if (!driveRes.ok) return errorResponse('Media unavailable', 502)
        const headers = new Headers()
        for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
          const value = driveRes.headers.get(key)
          if (value) headers.set(key, value)
        }
        if (!headers.has('accept-ranges')) headers.set('accept-ranges', 'bytes')
        for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value)
        return new Response(driveRes.body, { status: driveRes.status, headers })
      } catch (cause) {
        return errorResponse(cause instanceof Error ? cause.message : 'Media unavailable', 502)
      }
    }

    if (provider === 'google_drive') {
      return jsonResponse({ drive: true, url: null })
    }

    // Supabase objects resolve to short-lived signed URLs (the resolve step
    // happens server-side so no bucket wiring ever leaks). Only objects in
    // this designer's own namespace may be signed.
    if (!path.startsWith(`${designer.designerId}/`)) return errorResponse('Not yours to read', 403)
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL)
    if (error || !data?.signedUrl) return errorResponse('Media unavailable', 404)
    return jsonResponse({ url: data.signedUrl })
  }

  return errorResponse('Method not allowed', 405)
})

export const cors = corsHeaders