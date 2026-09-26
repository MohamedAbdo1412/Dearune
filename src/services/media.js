import { supabaseUrl, currentAccessToken, invokeFunction } from '@/lib/supabase'

export const MEDIA_TYPE_LABELS = {
  image: 'Image',
  audio: 'Audio',
  video: 'Video',
  file: 'File',
}

export const MEDIA_TYPE_LIMITS = {
  image: 20 * 1024 * 1024,
  audio: 60 * 1024 * 1024,
  video: 400 * 1024 * 1024,
  file: 50 * 1024 * 1024,
}

export function mediaTypeForFile(file) {
  const mime = (file?.type ?? '').toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  return 'file'
}

// ---------------------------------------------------------------------------
// Google Drive (legacy studio flows)
// ---------------------------------------------------------------------------

export async function compressImage(file, maxDim = 1600) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(resolve, 'image/webp', 0.82)
    setTimeout(() => reject(new Error('Image compression timed out')), 30000)
  })
  if (!blob) throw new Error('Could not compress image')

  const name = (file.name ?? 'image.webp').replace(/\.[^.]*$/, '') + '.webp'
  return new File([blob], name, { type: 'image/webp' })
}

export function initMessageUpload({ messageId, mediaType, fileName, mimeType, sizeBytes, token }) {
  return invokeFunction('drive-create-upload', {
    method: 'POST',
    token,
    body: { scope: 'message', messageId, mediaType, fileName, mimeType, sizeBytes },
  })
}

export async function initLabelUpload({ orderId, fileName, sizeBytes, adminToken }) {
  return invokeFunction('drive-create-upload', {
    method: 'POST',
    adminToken,
    body: { scope: 'label', orderId, fileName, mimeType: 'application/pdf', sizeBytes },
  })
}

async function requestNextUrl(res) {
  const location = res.headers.get('location')
  if (location) {
    const current = `${res.url || ''}`
    const next = new URL(location, current).toString()
    return next === current ? null : next
  }
  return null
}

export async function uploadResumableFile(sessionUrl, file) {
  let url = sessionUrl
  let offset = 0
  const size = typeof file.size === 'number' ? file.size : file.byteLength

  while (offset < size) {
    const chunk = file.slice(offset, Math.min(offset + 8 * 1024 * 1024, size))
    let res
    try {
      res = await fetch(url, {
        method: 'PUT',
        headers: {
          'content-type': String(file.type || 'application/octet-stream'),
          'content-length': String(chunk.size),
        },
        body: chunk,
      })
    } catch {
      throw new Error('Upload failed — is your connection stable?')
    }

    if (res.status === 308) {
      offset += chunk.size
      const next = await requestNextUrl(res)
      if (!next) offset = size
      else url = next
      continue
    }
    if (res.ok) {
      const responseBody = await res.text()
      if (!responseBody) return { ok: true }
      try {
        const parsed = JSON.parse(responseBody)
        if (parsed?.id) return { ok: true, fileId: parsed.id }
        return { ok: true }
      } catch {
        return { ok: true }
      }
    }
    if (res.status === 307 && res.headers.get('location')) {
      url = res.headers.get('location')
      continue
    }
    throw new Error(`Upload failed (${res.status})`)
  }

  return { ok: true }
}

export function publicDriveUrl(fileId, { publicId, token }) {
  const params = new URLSearchParams({ file: fileId, msg: publicId, token })
  return `${supabaseUrl}/functions/v1/drive-media?${params.toString()}`
}

export async function authedDriveUrl(fileId) {
  const token = await currentAccessToken()
  if (!token) return null
  const params = new URLSearchParams({ file: fileId })
  return `${supabaseUrl}/functions/v1/drive-media?${params.toString()}`
}

export async function authedDriveBlob(fileId) {
  const token = await currentAccessToken()
  if (!token) throw new Error('Not signed in')
  return designerAuthedDriveBlob(fileId, token)
}

export async function designerAuthedDriveBlob(fileId, token) {
  if (!token) throw new Error('Not signed in')
  const params = new URLSearchParams({ file: fileId })
  const res = await fetch(`${supabaseUrl}/functions/v1/drive-media?${params.toString()}`, {
    headers: { authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Could not load media (${res.status})`)
  return res.blob()
}

// ---------------------------------------------------------------------------
// Supabase Storage (temporary private bucket) — used because Google Drive is
// not configured yet. All media goes through the designer-media edge function
// so the service-role key never reaches the browser and the object path is
// always derived server-side from the designer's JWT (a designer can never
// address another designer's namespace).
// ---------------------------------------------------------------------------

const SIGNED_URL_CACHE = new Map()

// `designerMedia` is shared with `services/wrappers.js` (wrapper catalog
// photos live in the same private bucket, through this same edge function).
export async function designerMedia(method, path, { token, query, body, contentType } = {}) {
  const url = new URL(`${supabaseUrl}/functions/v1/designer-media`)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, value)
    }
  }
  const headers = { apikey: '', 'x-client-info': 'supabase-js-web/2' }
  if (token) headers.authorization = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = contentType ?? (typeof body === 'string' ? 'application/json' : 'application/octet-stream')
  const res = await fetch(url.toString(), { method, headers, body })
  const text = await res.text()
  const json = text ? JSON.parse(text) : {}
  if (!res.ok) {
    const error = new Error(json?.error ?? `Media request failed (${res.status})`)
    error.status = res.status
    throw error
  }
  return json
}

// Upload a raw file to this designer's private namespace. `kind` decides the
// kind (photos / audio); the server generates the object name. When `fixed` is
// given, the object is stored under that stable name with upsert semantics, so
// a retried submission overwrites the earlier object instead of duplicating it.
export function uploadDesignerMedia(file, { token, kind, fixed }) {
  return designerMedia('POST', '', {
    token,
    body: file,
    contentType: file.type || 'application/octet-stream',
    query: { kind, name: file.name ?? '', fixed: fixed || undefined },
  })
}

export async function deleteDesignerMedia(ref, { token }) {
  if (!ref?.path) return
  try {
    const query = { path: ref.path }
    if (ref.storageProvider) query.storageProvider = ref.storageProvider
    await designerMedia('DELETE', '', { token, query })
  } catch {
    // best-effort cleanup; a missing object is not an error for the flow
  }
}

export function getSignedDesignerMediaUrl(ref, token) {
  const query = { path: ref.path }
  if (ref.storageProvider) query.storageProvider = ref.storageProvider
  return designerMedia('GET', '', { token, query }).then((r) => r.url)
}

// Drive-backed drafts cannot be loaded by <img>/<audio> straight from the URL
// (the designer JWT must be attached), so the bytes are fetched here and kept
// as an object URL for the life of the session.
export async function designerDraftDriveBlob(ref, token) {
  const url = new URL(`${supabaseUrl}/functions/v1/designer-media`)
  url.searchParams.set('path', ref.path)
  url.searchParams.set('dl', '1')
  const res = await fetch(url.toString(), {
    headers: { authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Could not load media (${res.status})`)
  return res.blob()
}

// Resolve a stored media reference to a viewable URL, caching signed/object
// URLs for this session so previews don't rediscover the URL on every paint.
export function resolveMediaUrl(ref, token) {
  if (!ref?.path) return Promise.resolve(null)
  if (!token) return Promise.resolve(null)
  const cached = SIGNED_URL_CACHE.get(ref.path)
  if (cached) return Promise.resolve(cached)
  if (ref.storageProvider === 'google_drive') {
    return getSignedDesignerMediaUrl(ref, token)
      .then((marker) => {
        if (!marker) {
          return designerDraftDriveBlob(ref, token)
            .then((blob) => {
              if (!(blob instanceof Blob)) return null
              const url = URL.createObjectURL(blob)
              SIGNED_URL_CACHE.set(ref.path, url)
              return url
            })
            .catch(() => null)
        }
        SIGNED_URL_CACHE.set(ref.path, marker)
        return marker
      })
      .catch(() => null)
  }
  return getSignedDesignerMediaUrl(ref, token)
    .then((url) => {
      SIGNED_URL_CACHE.set(ref.path, url)
      return url
    })
    .catch(() => null)
}

export function forgetMediaUrl(path) {
  SIGNED_URL_CACHE.delete(path)
}

// Crop a source image to the given pixel rect (react-easy-crop output) and
// return a compact JPEG File ready for upload.
export async function cropImageBlob(file, croppedAreaPixels, { maxDim = 1400, quality = 0.85 } = {}) {
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Could not read the image'))
      img.src = objectUrl
    })
    const { width, height, x, y } = croppedAreaPixels
    const scale = Math.min(1, maxDim / Math.max(width, height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(resolve, 'image/jpeg', quality)
      setTimeout(() => reject(new Error('Cropping timed out')), 30000)
    })
    if (!blob) throw new Error('Could not crop the image')
    const base = (file.name ?? 'print').replace(/\.[^.]*$/, '')
    return new File([blob], `${base}-print.jpg`, { type: 'image/jpeg' })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}