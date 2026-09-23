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