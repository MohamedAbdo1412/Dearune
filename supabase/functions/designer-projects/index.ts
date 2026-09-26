import { corsHeaders, errorResponse, handleOptions, jsonResponse, readJson } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
import { randomSecret, requireDesigner } from '../_shared/auth.ts'

// Designer projects: create + read the books a designer has handed over.
//
// POST /designer-projects  body { projectId, templateSlug, receiverName,
//                                 draft, policyVersion, policiesAcceptedAt }
//   creates the project AFTER validating the letter against the paper's own
//   constraints and verifying every media reference lives inside the
//   designer's private namespace. The design is intentionally write-once:
//   there is no update route, so a submitted project is permanently read-only.
//   Deletion is deliberately absent too. The client supplies the project id it
//   has used locally since "New Dearune", so media uploaded under that id and
//   the final project row always agree, even if a failed request is retried.
//   A submission is only accepted with the CURRENT terms version; the exact
//   version and acceptance time are stored alongside it, read-only, forever.
//
// GET  /designer-projects
//   lists the designer's projects (metadata, no payloads), plus the lifecycle
//   fields used to draw each book's availability. The two-year availability
//   window is always measured from FIRST ACTIVATION (derived here, never
//   stored), so deactivating and reactivating a message cannot reset its clock.
// GET  /designer-projects/unlock
//   returns the authenticated designer's draft-unlock secret so a reloaded
//   session (a token is present but the key was memory-only) can decrypt its
//   own local drafts again. The secret never leaves the account that owns it.
// GET  /designer-projects/{id}
//   returns one project including its full letter payload. Read-only access
//   means a project can always be re-read for as long as the designer exists.

const POLICY_VERSION = '2026-09-24-v1'
const AVAILABILITY_YEARS = 2

// The paper version each template is drawn at. Evolving a template later never
// rewrites what an earlier submission snapshotted: the project stores the
// version it was closed under, so its layout can pin down "the letters as they
// were then" instead of silently inheriting a redesigned default.
const TEMPLATE_VERSIONS: Record<string, number> = {
  'memorial-message': 1,
}

const MAX_LENGTHS: Record<string, number> = {
  greeting: 120,
  closing: 120,
  senderName: 80,
  body: 4000,
  receiverName: 120,
}
const MAX_PHOTOS = 3
const MAX_MEDIA_BYTES = 64 * 1024 * 1024
const PROJECT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const METADATA_COLUMNS = 'id, template_slug, template_version, title, status, public_id, submitted_at, created_at, updated_at, first_activated_at, message_active, policy_version, policies_accepted_at'

// Two years measured from first activation, derived here so it can never be
// drifted by re-activation. A stored `first_activated_at` is returned verbatim
// and the sibling `expires_at` is computed as its +2 rim.
function withExpiry(project: Record<string, unknown>): Record<string, unknown> {
  const first = project.first_activated_at ? new Date(String(project.first_activated_at)) : null
  if (first && !Number.isNaN(first.getTime())) {
    const expires = new Date(first)
    expires.setUTCFullYear(expires.getUTCFullYear() + AVAILABILITY_YEARS)
    return { ...project, expires_at: expires.toISOString() }
  }
  return { ...project, expires_at: null }
}

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

// A project's payload is a JSONB object. Early builds persisted it through
// JSON.stringify, which PostgREST stores as a JSON string scalar rather than an
// object; a read of those rows comes back as a string. Normalize either form
// here so the client always receives an object — and a row with no readable
// letter at all becomes explicit `null` (the frontend shows a real error
// instead of pretending the sample is the design).
function parsePayload(raw: unknown): Record<string, unknown> | null {
  if (raw === null || raw === undefined) return null
  let payload: unknown = raw
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload)
    } catch {
      return null
    }
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  return payload as Record<string, unknown>
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()

  const designer = await requireDesigner(req)
  if (!designer) return errorResponse('Unauthorized', 401)

  const path = new URL(req.url).pathname.split('/').filter(Boolean)
  const fnIndex = path.lastIndexOf('designer-projects')
  const tail = path.slice(fnIndex + 1)
  const sb = adminClient()

  if (req.method === 'POST') {
    if (tail.length) return errorResponse('Invalid route', 404)
    const body = await readJson(req)

    if (body.policyVersion !== POLICY_VERSION) {
      return errorResponse('The terms must be accepted as written', 400)
    }
    const acceptedAt = typeof body.policiesAcceptedAt === 'string' ? new Date(body.policiesAcceptedAt) : null
    if (!acceptedAt || Number.isNaN(acceptedAt.getTime())) return errorResponse('The terms must be accepted', 400)
    if (Math.abs(Date.now() - acceptedAt.getTime()) > 10 * 60 * 1000) {
      return errorResponse('Please accept the current terms and submit again', 400)
    }

    const templateSlug = typeof body.templateSlug === 'string' ? body.templateSlug : ''
    if (!templateSlug) return errorResponse('A paper must be chosen', 400)

    const { data: template } = await sb.from('templates').select('id, slug, name').eq('slug', templateSlug).eq('enabled', true).maybeSingle()
    if (!template) return errorResponse('This paper is not offered', 400)

    const payload = sanitizePayload(body.draft, designer.designerId)
    if (!payload) return errorResponse('The words are not written yet', 400)

    // The arrival wrapper chosen in Create (optional: a draft written before
    // the wrapper stage existed still submits). It must be an ACTIVE catalog
    // wrapper that THIS template actually offers — the same rule the
    // `designer-templates` payload that fed the stage enforces, re-checked
    // here so a hand-crafted request can't send a Dearune in a wrapper the
    // studio does not offer for this paper.
    const wrapperType = typeof body.wrapperType === 'string' ? body.wrapperType.trim().slice(0, 30) : ''
    if (wrapperType) {
      const { data: wrapperRow } = await sb.from('wrapper_types').select('id').eq('key', wrapperType).eq('active', true).maybeSingle()
      const { data: option } = wrapperRow
        ? await sb
          .from('template_wrapper_options')
          .select('id')
          .eq('template_id', template.id)
          .eq('wrapper_id', wrapperRow.id)
          .eq('enabled', true)
          .maybeSingle()
        : { data: null }
      if (!wrapperRow || !option) return errorResponse('This way of sending it is not available', 400)
    }

    const receiverName = typeof body.receiverName === 'string'
      ? body.receiverName.trim().slice(0, MAX_LENGTHS.receiverName)
      : ''

    // The client chose this id at "New Dearune". Reusing it across retries
    // keeps the local project, its uploaded media namespace, and the final row
    // identical — a retried submit can never fork into a duplicate project.
    const projectId = typeof body.projectId === 'string' && PROJECT_ID_RE.test(body.projectId) ? body.projectId : undefined

    const insert: Record<string, unknown> = {
      designer_id: designer.designerId,
      template_slug: templateSlug,
      template_version: TEMPLATE_VERSIONS[templateSlug] ?? 1,
      title: receiverName || payload.senderName,
      status: 'submitted',
      payload,
      policy_version: POLICY_VERSION,
      policies_accepted_at: acceptedAt.toISOString(),
    }
    if (wrapperType) insert.wrapper_type = wrapperType
    if (projectId) insert.id = projectId

    const { data: project, error } = await sb.from('projects').insert(insert)
      .select(METADATA_COLUMNS).single()
    if (error || !project) return errorResponse('The book could not be closed', 500)

    return jsonResponse({ project: withExpiry(project) })
  }

  if (req.method === 'GET') {
    if (tail[0] === 'unlock') {
      const { data: row } = await sb.from('designers').select('draft_secret').eq('id', designer.designerId).maybeSingle()
      let draftSecret = row?.draft_secret ?? null
      if (!draftSecret) {
        draftSecret = randomSecret(256)
        await sb.from('designers').update({ draft_secret: draftSecret }).eq('id', designer.designerId)
      }
      return jsonResponse({ designerId: designer.designerId, draftSecret })
    }

    if (!tail[0]) {
      const { data, error } = await sb.from('projects')
        .select(METADATA_COLUMNS)
        .eq('designer_id', designer.designerId)
        .order('created_at', { ascending: false })
      if (error) return errorResponse('Failed to open the shelf', 500)
      return jsonResponse({ projects: (data ?? []).map(withExpiry) })
    }

    const { data: project } = await sb.from('projects')
      .select(`${METADATA_COLUMNS}, payload`)
      .eq('id', tail[0])
      .eq('designer_id', designer.designerId)
      .maybeSingle()
    if (!project) return errorResponse('Not your book', 404)
    const read = { ...project, payload: parsePayload(project.payload) }
    return jsonResponse({ project: withExpiry(read) })
  }

  return errorResponse('Method not allowed', 405)
})

export const cors = corsHeaders