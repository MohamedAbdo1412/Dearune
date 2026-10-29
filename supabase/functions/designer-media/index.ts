import { corsHeaders, errorResponse, handleOptions, jsonResponse } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
import { requireAdminOrDesigner } from '../_shared/auth.ts'
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
const SIGNED_URL_TTL = 3000 // 50 minutes

// Studio-owned asset namespaces, kept in the same private bucket as the
// designer drafts: `wrappers/<key>/…` for the wrapper catalog and
// `templates/<key>/…` (key = the template's slug) for template previews.
const WRAPPER_KEY_RE = /^[a-z][a-z0-9_]{0,29}$/
const TEMPLATE_KEY_RE = /^[a-z][a-z0-9_-]{0,63}$/
const WRAPPER_ASSET_PATH_RE = /^wrappers\/[a-z][a-z0-9_]{0,29}\/[A-Za-z0-9_][A-Za-z0-9._-]*$/
const TEMPLATE_ASSET_PATH_RE = /^templates\/[a-z][a-z0-9_-]{0,63}\/[A-Za-z0-9_][A-Za-z0-9._-]*$/

function isStudioAssetPath(path: string): boolean {
  return WRAPPER_ASSET_PATH_RE.test(path) || TEMPLATE_ASSET_PATH_RE.test(path)
}

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

function sniffMime(bytes: Uint8Array): string | null {
  if (bytes.length < 4) return null
  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  // PNG
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  // GIF
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif'
  // WebP
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp'
  // WAV
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45) return 'audio/wav'
  // OGG
  if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return 'audio/ogg'
  // MP3 (ID3 or sync)
  if ((bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return 'audio/mpeg'
  // WebM/Matroska
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'audio/webm'
  // M4A/MP4
  if (bytes.length >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return 'audio/mp4'
  return null
}

function sanitizeName(name: string): string {
  if (typeof name !== 'string') return 'file'
  // Strip path components to prevent traversal
  const base = name.split(/[\\/]/).pop() ?? name
  const safe = base.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^\.+/, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
  return safe || 'file'
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

  // Reading a book's media is also how the admin previews the letter it
  // belongs to, so GET accepts an admin session as well as the designer's.
  // Uploading and deleting a BOOK's drafts stay designer-only: an admin
  // never touches drafts another account owns.
  //
  // The exception is the studio-owned catalog assets: wrapper photos
  // (`wrappers/<key>/…`, Settings → Wrappers) and template previews
  // (`templates/<slug>/…`, Templates → Preview image) live in the same
  // private bucket, are uploaded and removed by an admin only, and are
  // readable by any studio member — the designer needs wrapper photos to show
  // the arrival options in Create.
  const url = new URL(req.url)
  const path = url.searchParams.get('path') ?? ''
  const providerHint = url.searchParams.get('storageProvider')
  const wrapperKey = url.searchParams.get('wrapper') ?? ''
  const templateKey = url.searchParams.get('template') ?? ''
  const isWrapperAsset = path.startsWith('wrappers/') || Boolean(wrapperKey)
  const isTemplateAsset = path.startsWith('templates/') || Boolean(templateKey)
  const isStudioAsset = isWrapperAsset || isTemplateAsset

  let designerId = ''
  let isAdmin = false
  {
    const who = await requireAdminOrDesigner(req)
    if (!who) return errorResponse('This book is closed to you', 401)
    if (who.role === 'admin') isAdmin = true
    else designerId = who.designerId
  }
  if (req.method !== 'GET') {
    if (isStudioAsset && !isAdmin) return errorResponse('Only the studio can set a studio asset', 403)
    if (!isStudioAsset && isAdmin) return errorResponse('Admins do not own drafts', 403)
  }

  // -- Upload ---------------------------------------------------------------
  if (req.method === 'POST') {
    const kind = url.searchParams.get('kind') ?? ''
    const limit = KIND_LIMITS[kind]
    if (!limit) return errorResponse('Unknown media kind', 400)

    const declaredMime = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    const requiredPrefix = KIND_MIME[kind]
    if (!declaredMime.startsWith(requiredPrefix)) return errorResponse(`A ${kind} must be ${requiredPrefix}*`, 400)

    const originalName = sanitizeName(url.searchParams.get('name') ?? '')
    const fixedName = sanitizeName(url.searchParams.get('fixed') ?? '')
    const bytes = new Uint8Array(await req.arrayBuffer())
    if (bytes.byteLength === 0) return errorResponse('Nothing was sent', 400)
    if (bytes.byteLength > limit) return errorResponse('That is too heavy to pin', 413)

    const sniffed = sniffMime(bytes)
    if (!sniffed) return errorResponse('Unrecognized file format', 400)
    if (sniffed.startsWith('audio/mp4')) {
      // Normalize m4a/m4v family
      const sniffedNorm = 'audio/m4a'
      if (!sniffedNorm.startsWith(requiredPrefix)) return errorResponse(`A ${kind} must be ${requiredPrefix}*`, 400)
    } else if (sniffed.startsWith('audio/mpeg') && kind === 'audio') {
      // ok
    } else if (!sniffed.startsWith(requiredPrefix)) {
      return errorResponse(`A ${kind} must be ${requiredPrefix}*`, 400)
    }
    const mimeType = sniffed.startsWith('audio/mp4') ? 'audio/m4a' : sniffed

    // Studio-owned assets (wrapper catalog photos and template previews)
    // always live in Supabase storage — the designer interface must show
    // wrappers without any Drive dependency, and the admin screens need the
    // template previews to paint — under the owner's key so a re-upload
    // replaces the previous photo in place. Uploads address them by KEY, never
    // by a raw path.
    if (isStudioAsset && !wrapperKey && !templateKey) {
      return errorResponse('Name the wrapper or template', 400)
    }
    if (wrapperKey || templateKey) {
      const namespace = wrapperKey ? 'wrappers' : 'templates'
      const key = wrapperKey || templateKey
      const keyRe = wrapperKey ? WRAPPER_KEY_RE : TEMPLATE_KEY_RE
      if (!keyRe.test(key)) return errorResponse(wrapperKey ? 'Unknown wrapper' : 'Unknown template', 400)
      const objectName = `${namespace}/${key}/${fixedName || crypto.randomUUID()}${extensionFor(mimeType, originalName)}`
      const { error } = await sb.storage.from(BUCKET).upload(objectName, bytes, {
        contentType: mimeType,
        cacheControl: '3600',
        upsert: true,
      })
      if (error) return errorResponse('Could not store the photo', 500)
      return jsonResponse(mediaRef({ storageProvider: 'supabase', path: objectName, mimeType, sizeBytes: bytes.byteLength, originalName }), 201)
    }

    try {
      const provider = await resolveStorageProvider(sb)
      const storagePath = provider === 'google_drive'
        ? await uploadToDrive(sb, designerId, bytes, mimeType, originalName)
        : await uploadToSupabase(sb, designerId, bytes, mimeType, extensionFor(mimeType, originalName), fixedName)
      return jsonResponse(mediaRef({ storageProvider: provider, path: storagePath, mimeType, sizeBytes: bytes.byteLength, originalName }), 201)
    } catch (cause) {
      return errorResponse(cause instanceof Error ? cause.message : 'Upload failed', 500)
    }
  }

  // -- Delete ---------------------------------------------------------------
  if (req.method === 'DELETE') {
    if (!path) return errorResponse('Nothing to remove', 400)
    if (path.startsWith('wrappers/') || path.startsWith('templates/')) {
      if (!isAdmin) return errorResponse('Only the studio can change a studio asset', 403)
      if (!isStudioAssetPath(path)) return errorResponse('Not a studio asset', 403)
      await sb.storage.from(BUCKET).remove([path])
      return jsonResponse({ removed: path })
    }
    try {
      const provider = providerHint === 'google_drive' ? 'google_drive' : await resolveStorageProvider(sb)
      if (provider === 'supabase') {
        // Object names are namespaced by designer id on upload; refusing any
        // path outside that namespace keeps one designer from addressing
        // (or signing) another designer's drafts.
        if (!path.startsWith(`${designerId}/`)) return errorResponse('Not yours to remove', 403)
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

    const streaming = !isStudioAsset && url.searchParams.get('dl') === '1'
    const provider = isStudioAsset
      ? 'supabase'
      : providerHint === 'google_drive' ? 'google_drive' : providerHint === 'supabase' ? 'supabase' : await resolveStorageProvider(sb)

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
    // happens server-side so no bucket wiring ever leaks). The object must
    // live in a designer's namespace; a designer may only sign their own,
    // while an admin session may sign any book the studio has taken on.
    // Studio-owned assets (wrapper catalog photos, template previews) are
    // shared: any signed-in studio member may resolve them (the object name
    // itself carries the owner key, which is validated against the catalog
    // shape above).
    if (path.startsWith('wrappers/') || path.startsWith('templates/')) {
      if (!isStudioAssetPath(path)) return errorResponse('Not a studio asset', 403)
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL)
      if (error || !data?.signedUrl) return errorResponse('Photo unavailable', 404)
      return jsonResponse({ url: data.signedUrl })
    }
    const inNamespace = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i.test(path)
    if (!inNamespace) return errorResponse('Not a studio draft', 403)
    if (designerId && !path.startsWith(`${designerId}/`)) return errorResponse('Not yours to read', 403)
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL)
    if (error || !data?.signedUrl) return errorResponse('Media unavailable', 404)
    return jsonResponse({ url: data.signedUrl })
  }

  return errorResponse('Method not allowed', 405)
})

export const cors = corsHeaders