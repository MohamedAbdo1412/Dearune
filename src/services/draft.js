// Local-first draft for the book pipeline (version 2).
//
// Everything a designer types lives in localStorage under one namespaced,
// versioned key scoped to a designer identity. Text — receiver name,
// language, letter fields, choice of paper — is local only; media uploads
// are the exception (blobs would overflow storage, so they are sent to the
// private media bucket and only the returned reference is kept here).
//
// Since v2, each TEMPLATE keeps its own draft inside `templateDrafts`, so a
// designer can leave Memorial half-finished, page round another paper, and
// come back to find their letter, language and photos intact. Choosing one
// template never deletes another's draft.
//
// SECURITY: this module never stores the designer passcode, the designer
// JWT, or a message password. The password stage only records `passwordSet`.
//
// The pure helpers are unit-tested in tests/pipeline.test.js; storage access
// is guarded so the module is safe to import in node test environments.

export const DRAFT_VERSION = 2
export const BASE_STAGES = ['access', 'receiver', 'templates']
export const UNWRITTEN_STAGE = 'unwritten'
export const REVIEW_STAGE = 'review'
export const STATUS_STAGE = 'status'

// Stable stage sequence each registered template contributes after the base
// book. Keyed by template slug; must match the frontend template registry.
export const TEMPLATE_STAGES = {
  'memorial-message': ['memorial.language', 'memorial.editor', 'memorial.password', REVIEW_STAGE],
}

export function templateStagesFor(slug) {
  if (!slug) return []
  return TEMPLATE_STAGES[slug] ?? [UNWRITTEN_STAGE]
}

export function isTemplateStage(stage) {
  return !!stage && stage.startsWith('memorial.')
}

export function draftRef(designerId, prefix = 'designer') {
  return `${prefix}:${designerId}`
}

export function draftStorageKey(designerId, version = DRAFT_VERSION) {
  return `dearune.draft.v${version}.${draftRef(designerId)}`
}

export function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const json = decodeURIComponent(
      Array.prototype.map
        .call(atob(padded), (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    )
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function normalizeTemplateDraft(slug, raw) {
  if (!slug || !raw || typeof raw !== 'object') return null
  if (slug === 'memorial-message') return normalizeMemorialDraft(raw)
  // Unknown future templates keep a generic bag of provided draft fields.
  const bag = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' || value === null || value === undefined) bag[key] = value
    else bag[key] = value
  }
  return bag
}

// Whitelist for the memorial draft so hints of a password/secret can never
// accidentally be persisted.
const MEMORIAL_DRAFT_FIELDS = ['language', 'greeting', 'body', 'closing', 'senderName', 'photos', 'audio', 'passwordSet']

function normalizeMemorialDraft(raw) {
  const out = {}
  for (const key of MEMORIAL_DRAFT_FIELDS) {
    const value = raw[key]
    if (key === 'photos') {
      out.photos = Array.isArray(value) ? value.map((p) => (p && typeof p === 'object' ? normalizeMediaRef(p) : null)).slice(0, 3) : [null, null, null]
      while (out.photos.length < 3) out.photos.push(null)
      continue
    }
    if (key === 'audio') {
      out.audio = value && typeof value === 'object' ? normalizeMediaRef(value) : null
      continue
    }
    if (key === 'passwordSet') {
      out.passwordSet = Boolean(value)
      continue
    }
    out[key] = typeof value === 'string' ? value : ''
  }
  return out
}

export function normalizeMediaRef(raw) {
  if (!raw || typeof raw !== 'object') return null
  const path = typeof raw.path === 'string' ? raw.path : ''
  if (!path) return null
  return {
    path,
    storageProvider: raw.storageProvider === 'google_drive' ? 'google_drive' : 'supabase',
    mimeType: typeof raw.mimeType === 'string' ? raw.mimeType : 'application/octet-stream',
    sizeBytes: Number.isFinite(Number(raw.sizeBytes)) ? Number(raw.sizeBytes) : 0,
    originalName: typeof raw.originalName === 'string' ? raw.originalName : '',
    addedAt: typeof raw.addedAt === 'string' ? raw.addedAt : new Date().toISOString(),
  }
}

export function normalizeDraft(raw, designerId) {
  if (!raw || typeof raw !== 'object') return null
  if (raw.version !== DRAFT_VERSION) return null
  if (!designerId || raw.ref !== draftRef(designerId)) return null
  if (raw.designerId !== designerId) return null

  const templateSlug = typeof raw.templateSlug === 'string' && raw.templateSlug ? raw.templateSlug : null
  const allStages = BASE_STAGES.concat(templateSlug ? templateStagesFor(templateSlug) : [], [STATUS_STAGE])
  const currentStage = raw.currentStage
  if (typeof currentStage !== 'string' || !allStages.includes(currentStage)) {
    return null
  }

  const templateDrafts = {}
  const stored = raw.templateDrafts && typeof raw.templateDrafts === 'object' ? raw.templateDrafts : {}
  for (const slug of Object.keys(stored)) {
    const normalized = normalizeTemplateDraft(slug, stored[slug])
    if (normalized) templateDrafts[slug] = normalized
  }

  return {
    version: DRAFT_VERSION,
    ref: raw.ref,
    designerId: raw.designerId,
    designerName: typeof raw.designerName === 'string' ? raw.designerName : '',
    receiverName: typeof raw.receiverName === 'string' ? raw.receiverName : '',
    currentStage,
    templateSlug,
    submittedAt: typeof raw.submittedAt === 'string' ? raw.submittedAt : null,
    templateDrafts,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  }
}

// Migrate a v1 draft into v2. v1 kept a single flat templateSlug and a stage
// of access/template/reserved; we promote the slug and park the designer at
// template selection so nothing is lost but nobody is dropped into a half
// state either.
function migrateV1(raw, designerId) {
  if (!raw || typeof raw !== 'object') return null
  if (raw.ref !== draftRef(designerId)) return null
  if (raw.designerId !== designerId) return null
  const templateSlug = typeof raw.templateSlug === 'string' && raw.templateSlug ? raw.templateSlug : null
  const oldStage = raw.currentStage
  let currentStage = 'templates'
  if (templateSlug && oldStage === 'reserved') currentStage = templateSlug === 'memorial-message' ? 'memorial.language' : 'templates'
  return {
    version: DRAFT_VERSION,
    ref: raw.ref,
    designerId: raw.designerId,
    designerName: typeof raw.designerName === 'string' ? raw.designerName : '',
    receiverName: '',
    currentStage,
    templateSlug,
    templateDrafts: {},
    submittedAt: null,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export function loadDraft(designerId) {
  if (!designerId) return null
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(draftStorageKey(designerId, DRAFT_VERSION))
    if (raw) {
      const draft = normalizeDraft(JSON.parse(raw), designerId)
      if (draft) return draft
    }
    // Fall back to a v1 draft sitting in the old key and migrate it.
    const v1 = localStorage.getItem(draftStorageKey(designerId, 1))
    if (v1) {
      const migrated = migrateV1(JSON.parse(v1), designerId)
      if (migrated) {
        localStorage.setItem(draftStorageKey(designerId, DRAFT_VERSION), JSON.stringify(migrated))
        localStorage.removeItem(draftStorageKey(designerId, 1))
        return migrated
      }
    }
    return null
  } catch {
    return null
  }
}

function writeDraft(designerId, draft) {
  if (!designerId || typeof localStorage === 'undefined') return null
  const normalized = normalizeDraft(draft, designerId)
  if (!normalized) return null
  localStorage.setItem(draftStorageKey(designerId, DRAFT_VERSION), JSON.stringify(normalized))
  return normalized
}

export function saveDraft(designerId, partial) {
  if (!designerId || typeof localStorage === 'undefined') return null
  const previous = loadDraft(designerId)
  const patch = { ...previous, ...partial }
  patch.version = DRAFT_VERSION
  patch.ref = draftRef(designerId)
  patch.designerId = designerId
  patch.createdAt = patch.createdAt ?? previous?.createdAt ?? new Date().toISOString()
  patch.updatedAt = new Date().toISOString()
  return writeDraft(designerId, patch)
}

export function loadTemplateDraft(designerId, slug) {
  const draft = loadDraft(designerId)
  if (!draft?.templateDrafts || !slug) return null
  const normalized = normalizeTemplateDraft(slug, draft.templateDrafts[slug])
  return normalized
}

export function saveTemplateDraft(designerId, slug, partial) {
  if (!designerId || !slug || typeof localStorage === 'undefined') return null
  // A template draft may arrive before any base chapter was saved (the
  // editor write-throughs on the very first keystroke); seed a minimal
  // draft so the storage layer never has to guess a stage.
  const previous = loadDraft(designerId) ?? {
    version: DRAFT_VERSION,
    ref: draftRef(designerId),
    designerId,
    designerName: '',
    receiverName: '',
    currentStage: 'templates',
    templateSlug: null,
    submittedAt: null,
    templateDrafts: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  const current = previous.templateDrafts?.[slug] ?? {}
  const next = { ...current, ...partial }
  const templateDrafts = { ...(previous.templateDrafts ?? {}), [slug]: normalizeTemplateDraft(slug, next) }
  return writeDraft(designerId, { ...previous, templateDrafts })
}

export function clearTemplateDraft(designerId, slug) {
  if (!designerId || typeof localStorage === 'undefined') return
  const draft = loadDraft(designerId)
  if (!draft) return
  const templateDrafts = { ...draft.templateDrafts }
  delete templateDrafts[slug]
  saveDraft(designerId, { templateDrafts, currentStage: 'templates', templateSlug: null })
}

export function clearDraft(designerId) {
  if (!designerId || typeof localStorage === 'undefined') return
  localStorage.removeItem(draftStorageKey(designerId, DRAFT_VERSION))
  localStorage.removeItem(draftStorageKey(designerId, 1))
}

export function formatCountdown(totalSeconds) {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}