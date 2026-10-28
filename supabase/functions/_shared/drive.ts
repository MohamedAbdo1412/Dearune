import { requireEnv } from './env.ts'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const DRIVE_URL = 'https://www.googleapis.com/drive/v3'
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3'
const TOKEN_TTL = 50 * 60 * 1000 // 50 minutes in milliseconds

let cachedToken: string | null = null
let cachedTokenAt: number = 0

export async function googleAccessToken(): Promise<string> {
  const now = Date.now()
  if (cachedToken && now - cachedTokenAt < TOKEN_TTL) return cachedToken
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: requireEnv('GOOGLE_CLIENT_ID'),
    client_secret: requireEnv('GOOGLE_CLIENT_SECRET'),
    refresh_token: requireEnv('GOOGLE_REFRESH_TOKEN'),
  })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) throw new Error('Google token exchange failed')
  const json = await res.json()
  if (!json.access_token) throw new Error('Google token exchange returned no token')
  cachedToken = json.access_token
  cachedTokenAt = Date.now()
  return cachedToken
}

async function gdrive(token: string) {
  return {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  }
}

export async function driveListFolder(token: string, name: string, parentId: string): Promise<{ id: string } | null> {
  const q = `name = '${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`
  const url = `${DRIVE_URL}/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=10&supportsAllDrives=true`
  const res = await fetch(url, { headers: await gdrive(token) })
  if (!res.ok) throw new Error('Drive folder lookup failed')
  const json = await res.json()
  return json.files?.[0] ?? null
}

export async function driveCreateFolder(token: string, name: string, parentId: string): Promise<string> {
  const body = JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
  const res = await fetch(`${DRIVE_URL}/files?supportsAllDrives=true`, {
    method: 'POST',
    headers: await gdrive(token),
    body,
  })
  if (!res.ok) throw new Error('Drive folder create failed')
  const json = await res.json()
  return json.id
}

export async function driveEnsureFolder(token: string, name: string, parentId: string): Promise<string> {
  const existing = await driveListFolder(token, name, parentId)
  if (existing) return existing.id
  return driveCreateFolder(token, name, parentId)
}

// Creates a resumable upload session in the given folder. Returns the session url,
// which the browser uses to PUT the bytes directly. Only the bare minimum needed for
// the specific upload is returned to the client.
export async function driveCreateResumableSession(
  token: string,
  options: { name: string; mimeType: string; sizeBytes: number; parentId: string },
): Promise<string> {
  const metadata = JSON.stringify({
    name: options.name,
    mimeType: options.mimeType,
    parents: [options.parentId],
  })
  const res = await fetch(`${UPLOAD_URL}/files?uploadType=resumable&supportsAllDrives=true`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-upload-content-type': options.mimeType,
      'x-upload-content-length': String(options.sizeBytes),
    },
    body: metadata,
  })
  if (!res.ok) throw new Error('Drive resumable session failed')
  const location = res.headers.get('location')
  if (!location) throw new Error('Drive upload session returned no location')
  return location
}

export async function driveFileExists(token: string, fileId: string): Promise<boolean> {
  const res = await fetch(`${DRIVE_URL}/files/${encodeURIComponent(fileId)}?fields=id,trashed,parents&supportsAllDrives=true`, {
    headers: await gdrive(token),
  })
  if (!res.ok) return false
  const json = await res.json()
  return !json.trashed && Boolean(json.id)
}

export async function driveGetFileParent(token: string, fileId: string): Promise<string | null> {
  const res = await fetch(`${DRIVE_URL}/files/${encodeURIComponent(fileId)}?fields=parents,trashed&supportsAllDrives=true`, {
    headers: await gdrive(token),
  })
  if (!res.ok) return null
  const json = await res.json()
  if (json.trashed) return null
  return json.parents?.[0] ?? null
}

export async function driveDownload(token: string, fileId: string, range: string | null): Promise<Response> {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` }
  if (range) headers.range = range
  return fetch(`${DRIVE_URL}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, { headers })
}

export async function driveTrash(token: string, fileId: string): Promise<void> {
  await fetch(`${DRIVE_URL}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
    method: 'PATCH',
    headers: await gdrive(token),
    body: JSON.stringify({ trashed: true }),
  })
}