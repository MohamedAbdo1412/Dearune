import { corsHeaders, errorResponse, handleOptions, jsonResponse } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'

// The public face of a Dearune's letters.
//
// A designer's photos live in the private `designer-drafts` bucket, addressed
// only by `designer-media` with the designer's own JWT. The customer who scans
// the QR on the production paper has no JWT at all — but they do hold the
// Dearune's public token. This function is the one door for them.
//
// It is deliberately narrow:
//   * it requires the project's own `public_token` (the capability printed on
//     the paper) and refuses anything else;
//   * it requires the letter to be switched on and NOT password-protected,
//     matching `get_public_project_message` exactly;
//   * it accepts a bucket path ONLY if that exact path appears in the
//     project's own payload, so a token holder can never enumerate or read
//     another designer's objects;
//   * it answers with a short-lived signed URL rather than streaming, so the
//     bytes keep flowing straight from storage.
const BUCKET = 'designer-drafts'
const SIGNED_URL_TTL = 900

const projectColumns = 'public_id, public_token, message_active, payload'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405)

  const url = new URL(req.url)
  const publicId = (url.searchParams.get('project') ?? '').trim()
  const token = (url.searchParams.get('token') ?? '').trim()
  const path = (url.searchParams.get('path') ?? '').trim()

  if (!publicId || !token) return errorResponse('A Dearune and its token are required', 400)
  if (!path) return errorResponse('Nothing to resolve', 400)

  const sb = adminClient()
  const { data: project } = await sb
    .from('projects')
    .select(projectColumns)
    .eq('public_id', publicId)
    .maybeSingle()

  if (!project) return errorResponse('Media unavailable', 404)

  const payload = parsePayload(project.payload)
  const protectedLetter = Boolean(payload?.passwordSet)
  const allowed =
    project.public_token &&
    project.public_token === token &&
    project.message_active === true &&
    !protectedLetter

  if (!allowed) return errorResponse('Media unavailable', 404)

  // The path must be one this project actually carries — nothing else.
  if (!projectPaths(payload).has(path)) return errorResponse('Media unavailable', 404)

  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL)
  if (error || !data?.signedUrl) return errorResponse('Media unavailable', 404)

  return jsonResponse({ url: data.signedUrl })
})

// A project's payload may have been stored as an object or (early builds) as a
// JSON string scalar; normalise both.
function parsePayload(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null
  let value = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

// Every object path this letter is allowed to show: its photo slots and its
// audio.
function projectPaths(payload: Record<string, unknown> | null): Set<string> {
  const paths = new Set<string>()
  if (!payload) return paths
  const photos = Array.isArray(payload.photos) ? payload.photos : []
  for (const photo of photos) {
    const path = pathOf(photo)
    if (path) paths.add(path)
  }
  const audio = pathOf(payload.audio)
  if (audio) paths.add(audio)
  return paths
}

function pathOf(ref: unknown): string {
  if (!ref || typeof ref !== 'object') return ''
  const value = (ref as Record<string, unknown>).path
  return typeof value === 'string' ? value : ''
}

export const cors = corsHeaders
