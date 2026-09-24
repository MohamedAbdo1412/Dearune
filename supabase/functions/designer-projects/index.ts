import { corsHeaders, errorResponse, handleOptions, jsonResponse, readJson } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
import { requireDesigner } from '../_shared/auth.ts'

// Designer projects: create + read the books a designer has handed over.
//
// POST /designer-projects  body { templateSlug, receiverName, draft }
//   creates the project AFTER validating the letter against the paper's own
//   constraints and verifying every media reference lives inside the
//   designer's private namespace. The design is intentionally write-once:
//   there is no update route, so a submitted project is permanently read-only.
//   Deletion is deliberately absent too.
//
// GET  /designer-projects
//   lists the designer's projects (metadata, no payloads).
// GET  /designer-projects/{id}
//   returns one project including its full letter payload. Read-only access
//   means a project can always be re-read for as long as the designer exists.

const LANGUAGE_SET = new Set(['ar', 'en'])
const MAX_LENGTHS: Record<string, number> = {
  greeting: 120,
  closing: 120,
  senderName: 80,
  body: 4000,
  receiverName: 120,
}
const MAX_PHOTOS = 3
const MAX_MEDIA_BYTES = 64 * 1024 * 1024

function cleanText(value: unknown, field: string): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, MAX_LENGTHS[field] ?? 4000)
}

// A media reference is only acceptable if its object path is namespaced under
// this designer's id. The designer-media function always builds upload names
// that way, so accepting anything else here would let one designer cite
// another's drafts inside their project.
function validMediaRef(raw: unknown, designerId: string) {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.path !== 'string' || !r.path) return null
  if (!r.path.startsWith(`${designerId}/`)) return null
  if (typeof r.mimeType !== 'string' || r.mimeType.length > 200) return null
  const sizeBytes = typeof r.sizeBytes === 'number' ? Math.floor(r.sizeBytes) : 0
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0 || sizeBytes > MAX_MEDIA_BYTES) return null
  return {
    path: r.path,
    storageProvider: r.storageProvider === 'google_drive' ? 'google_drive' : 'supabase',
    mimeType: r.mimeType,
    sizeBytes,
    originalName: typeof r.originalName === 'string' ? r.originalName.slice(0, 200) : '',
  }
}

function sanitizePayload(raw: unknown, designerId: string) {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  const language = r.language === 'ar' ? 'ar' : 'en'
  const greeting = cleanText(r.greeting, 'greeting')
  const closing = cleanText(r.closing, 'closing')
  const senderName = cleanText(r.senderName, 'senderName')
  const body = cleanText(r.body, 'body')
  if (!body) return null

  const photosInput = Array.isArray(r.photos) ? r.photos : []
  if (photosInput.length > MAX_PHOTOS) return null
  const photos = photosInput.map((ref) => validMediaRef(ref, designerId))
  for (const ref of photos) {
    if (ref && !ref.mimeType.startsWith('image/')) return null
  }

  const audio = r.audio ? validMediaRef(r.audio, designerId) : null
  if (audio && !audio.mimeType.startsWith('audio/')) return null

  return {
    language,
    greeting,
    closing,
    senderName,
    body,
    photos,
    audio,
    passwordSet: Boolean(r.passwordSet),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()

  const designer = await requireDesigner(req)
  if (!designer) return errorResponse('Unauthorized', 401)

  const path = new URL(req.url).pathname.split('/').filter(Boolean)
  const fnIndex = path.lastIndexOf('designer-projects')
  const projectId = path[fnIndex + 1] ?? ''
  const sb = adminClient()

  if (req.method === 'POST') {
    if (projectId) return errorResponse('Invalid route', 404)
    const body = await readJson(req)

    const templateSlug = typeof body.templateSlug === 'string' ? body.templateSlug : ''
    if (!templateSlug) return errorResponse('A paper must be chosen', 400)

    const { data: template } = await sb.from('templates').select('id, slug, name').eq('slug', templateSlug).eq('enabled', true).maybeSingle()
    if (!template) return errorResponse('This paper is not offered', 400)

    const payload = sanitizePayload(body.draft, designer.designerId)
    if (!payload) return errorResponse('The words are not written yet', 400)

    const receiverName = typeof body.receiverName === 'string'
      ? body.receiverName.trim().slice(0, MAX_LENGTHS.receiverName)
      : ''

    const { data: project, error } = await sb.from('projects').insert({
      designer_id: designer.designerId,
      template_slug: templateSlug,
      title: receiverName || payload.senderName,
      status: 'submitted',
      payload: JSON.stringify(payload),
    }).select('id, template_slug, title, status, public_id, submitted_at, created_at, updated_at').single()

    if (error || !project) return errorResponse('The book could not be closed', 500)

    return jsonResponse({ project })
  }

  if (req.method === 'GET') {
    if (!projectId) {
      const { data, error } = await sb.from('projects')
        .select('id, template_slug, title, status, public_id, submitted_at, created_at, updated_at')
        .eq('designer_id', designer.designerId)
        .order('created_at', { ascending: false })
      if (error) return errorResponse('Failed to open the shelf', 500)
      return jsonResponse({ projects: data ?? [] })
    }

    const { data: project } = await sb.from('projects')
      .select('id, template_slug, title, status, public_id, payload, submitted_at, created_at, updated_at')
      .eq('id', projectId)
      .eq('designer_id', designer.designerId)
      .maybeSingle()
    if (!project) return errorResponse('Not your book', 404)
    return jsonResponse({ project })
  }

  return errorResponse('Method not allowed', 405)
})

export const cors = corsHeaders