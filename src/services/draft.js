// Local-first drafts for the book pipeline (version 3, project-scoped).
//
// A designer now keeps MANY books, each under its own project id ("New
// Dearune" opens a fresh project; "Previous Designs" resurfaces the server's
// shelf; the local registry remembers which project is in hand). Each project
// owns its letter fully: receiver, paper choice, template fields AND media.
//
// SECURITY — everything written here is ciphertext, encrypted with the
// AES-GCM key derived from the designer's draft-unlock secret (see
// draftCrypto). Plaintext never touches storage: the only plaintext record is
// the per-designer REGISTRY, a metadata-only list of project ids and their
// updatedAt stamps (no words, no names, no media references). Reads and writes
// require the account to be unlocked, so a different designer logging into the
// same computer cannot decrypt the first one's drafts.
//
// Media blobs are NOT stored here at all (they would overflow localStorage):
// encrypted bytes live in IndexedDB (draftMediaStore) and only references
// { store: 'local', projectId, role, slot, … } travel inside the encrypted
// draft. Nothing is uploaded to the network while writing; uploads happen at
// submission time.
//
// IMORTANT contract for callers: every persistence call takes the project id,
// and the very first action on a new book is createLocalProject(designerId) so
// the registry knows which project is active before any chapter is written.
//
// The pure helpers are unit-tested in tests/pipeline.test.js; storage access is
// guarded so the module is safe to import in node test environments.

import { isDraftUnlocked, sealJson, unsealJson } from './draftCrypto'
import { BASE_STAGES, SHARED_TEMPLATE_STAGES, STATUS_STAGE, SUBMITTED_STAGE, TEMPLATE_SEQUENCES, templateStagesFor } from '@/templates/stages'

export const DRAFT_VERSION = 3

// The page vocabulary and template sequences live in the template contract
// (src/templates/stages.js); the draft layer re-exports them so persistence
// and the pipeline share one sequence instead of keeping a parallel copy.
export {
  BASE_STAGES,
  UNWRITTEN_STAGE,
  REVIEW_STAGE,
  POLICIES_STAGE,
  SUBMITTED_STAGE,
  STATUS_STAGE,
  TEMPLATE_SEQUENCES as TEMPLATE_STAGES,
  templateStagesFor,
} from '@/templates/stages'

export function isTemplateStage(stage) {
  if (!stage) return false
  if (SHARED_TEMPLATE_STAGES.includes(stage)) return false
  // A template page is one that belongs to any registered sequence — the
  // memorial's `memorial.*` pages and the external link's `external.*` pages
  // alike. Shared book pages (wrapper/review/policies) are not template pages.
  return Object.values(TEMPLATE_SEQUENCES).some((sequence) => sequence.includes(stage))
}

export function draftRef(designerId, projectId) {
  return projectId ? `designer:${designerId}.project:${projectId}` : `designer:${designerId}`
}

// Storage keys. Without a project id this is the designer's REGISTRY key (the
// only plaintext record — metadata such as active project / updatedAt).
// With a project id it is that project's encrypted draft key.
export function draftStorageKey(designerId, projectId) {
  const base = `dearune.draft.v${DRAFT_VERSION}.${draftRef(designerId)}`
  return projectId ? `${base}.project:${projectId}` : base
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

// ---------------------------------------------------------------------------
// Media references
// ---------------------------------------------------------------------------

// Local references point into IndexedDB (no `path`). Remote references are
// the server's object references created at submission.
export function normalizeMediaRef(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (raw.store === 'local') {
    const projectId = typeof raw.projectId === 'string' ? raw.projectId : ''
    if (!projectId) return null
    return {
      store: 'local',
      projectId,
      role: raw.role === 'audio' ? 'audio' : 'photo',
      slot: Number.isInteger(raw.slot) ? Math.max(0, raw.slot) : 0,
      mimeType: typeof raw.mimeType === 'string' ? raw.mimeType : 'application/octet-stream',
      sizeBytes: Number(raw.sizeBytes) || 0,
      name: typeof raw.name === 'string' ? raw.name : '',
      addedAt: typeof raw.addedAt === 'string' ? raw.addedAt : new Date().toISOString(),
    }
  }
  const path = typeof raw.path === 'string' ? raw.path : ''
  if (!path) return null
  return {
    store: 'supabase',
    path,
    storageProvider: raw.storageProvider === 'google_drive' ? 'google_drive' : 'supabase',
    mimeType: typeof raw.mimeType === 'string' ? raw.mimeType : 'application/octet-stream',
    sizeBytes: Number.isFinite(Number(raw.sizeBytes)) ? Number(raw.sizeBytes) : 0,
    originalName: typeof raw.originalName === 'string' ? raw.originalName : '',
    addedAt: typeof raw.addedAt === 'string' ? raw.addedAt : new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Template drafts
// ---------------------------------------------------------------------------

export function normalizeTemplateDraft(slug, raw) {
  if (!slug || !raw || typeof raw !== 'object') return null
  if (slug === 'memorial-message') return normalizeMemorialDraft(raw)
  if (slug === 'external-link') return normalizeExternalLinkDraft(raw)
  const bag = {}
  for (const [key, value] of Object.entries(raw)) bag[key] = value
  return bag
}

// Whitelist for the external-link draft: the page's language and the one
// destination it prints. A letter's words/prints/sound must never ride along
// in this paper's draft (and vice versa).
const EXTERNAL_LINK_DRAFT_FIELDS = ['destinationUrl']

function normalizeExternalLinkDraft(raw) {
  const out = { language: raw.language === 'ar' ? 'ar' : 'en' }
  for (const key of EXTERNAL_LINK_DRAFT_FIELDS) {
    // Stored longer than the printable limit on purpose: a 3000-character
    // paste must come back as-is so the form can say "too long", not as a
    // silently cut URL that happens to pass the length rule.
    out[key] = typeof raw[key] === 'string' ? raw[key].slice(0, 4096) : ''
  }
  return out
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

// ---------------------------------------------------------------------------
// Draft normalization
// ---------------------------------------------------------------------------

export function normalizeDraft(raw, designerId, projectId) {
  if (!raw || typeof raw !== 'object') return null
  if (raw.version !== DRAFT_VERSION) return null
  if (!designerId) return null
  if (raw.ref !== draftRef(designerId, projectId)) return null
  if (raw.designerId !== designerId) return null

  const templateSlug = typeof raw.templateSlug === 'string' && raw.templateSlug ? raw.templateSlug : null
  const allStages = BASE_STAGES.concat(
    templateSlug ? templateStagesFor(templateSlug) : [],
    [STATUS_STAGE, SUBMITTED_STAGE]
  )
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
    projectId: typeof raw.projectId === 'string' ? raw.projectId : projectId ?? '',
    designerName: typeof raw.designerName === 'string' ? raw.designerName : '',
    receiverName: typeof raw.receiverName === 'string' ? raw.receiverName : '',
    currentStage,
    templateSlug,
    // The arrival wrapper chosen in Create ('' until the stage is passed).
    wrapperKey: typeof raw.wrapperKey === 'string' && /^[a-z][a-z0-9_]{0,29}$/.test(raw.wrapperKey) ? raw.wrapperKey : '',
    submittedAt: typeof raw.submittedAt === 'string' ? raw.submittedAt : null,
    submittedProjectId: typeof raw.submittedProjectId === 'string' ? raw.submittedProjectId : null,
    submitLedger: raw.submitLedger && typeof raw.submitLedger === 'object' ? raw.submitLedger : {},
    templateDrafts,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Project registry (plaintext, metadata only)
// ---------------------------------------------------------------------------

function normalizeRegistry(raw, designerId) {
  if (!raw || typeof raw !== 'object') return null
  if (raw.version !== DRAFT_VERSION) return null
  if (raw.designerId !== designerId) return null
  const projects = {}
  if (raw.projects && typeof raw.projects === 'object') {
    for (const [pid, entry] of Object.entries(raw.projects)) {
      if (pid && entry && typeof entry === 'object') {
        projects[pid] = {
          createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString(),
          updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : new Date().toISOString(),
        }
      }
    }
  }
  const activeProjectId = typeof raw.activeProjectId === 'string' && projects[raw.activeProjectId] ? raw.activeProjectId : null
  return { version: DRAFT_VERSION, designerId, activeProjectId, projects }
}

function readRegistry(designerId) {
  if (!designerId || typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(draftStorageKey(designerId))
    if (!raw) return null
    return normalizeRegistry(JSON.parse(raw), designerId)
  } catch {
    return null
  }
}

function writeRegistry(designerId, registry) {
  if (!designerId || typeof localStorage === 'undefined') return null
  const normalized = normalizeRegistry(registry, designerId)
  if (!normalized) return null
  localStorage.setItem(draftStorageKey(designerId), JSON.stringify(normalized))
  return normalized
}

function nowIso() {
  return new Date().toISOString()
}

export function createLocalProject(designerId) {
  if (!designerId) return null
  if (typeof crypto === 'undefined' || !crypto.randomUUID) return null
  const projectId = crypto.randomUUID()
  const registry = readRegistry(designerId) ?? { version: DRAFT_VERSION, designerId, activeProjectId: null, projects: {} }
  registry.projects = { ...registry.projects, [projectId]: { createdAt: nowIso(), updatedAt: nowIso() } }
  registry.activeProjectId = projectId
  writeRegistry(designerId, registry)
  return projectId
}

export function setActiveProject(designerId, projectId) {
  if (!designerId || !projectId) return false
  const registry = readRegistry(designerId)
  if (!registry || !registry.projects[projectId]) return false
  registry.activeProjectId = projectId
  writeRegistry(designerId, registry)
  return true
}

export function getActiveProjectId(designerId) {
  return readRegistry(designerId)?.activeProjectId ?? null
}

export function listLocalProjects(designerId) {
  const registry = readRegistry(designerId)
  if (!registry) return []
  return Object.entries(registry.projects)
    .map(([projectId, entry]) => ({ projectId, ...entry }))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

function touchRegistry(designerId, projectId) {
  if (!designerId || !projectId) return
  const registry = readRegistry(designerId)
  if (!registry) return
  registry.projects = { ...registry.projects, [projectId]: { ...(registry.projects[projectId] ?? {}), updatedAt: nowIso() } }
  writeRegistry(designerId, registry)
}

export function removeRegistryProject(designerId, projectId) {
  const registry = readRegistry(designerId)
  if (!registry) return
  if (!registry.projects[projectId]) return
  const projects = { ...registry.projects }
  delete projects[projectId]
  registry.projects = projects
  if (registry.activeProjectId === projectId) registry.activeProjectId = null
  writeRegistry(designerId, registry)
}

// ---------------------------------------------------------------------------
// Encrypted draft persistence (async — every body read/writes ciphertext)
// ---------------------------------------------------------------------------

export async function loadDraft(designerId, projectId) {
  if (!designerId || !projectId) return null
  if (typeof localStorage === 'undefined' || !isDraftUnlocked()) return null
  try {
    const raw = localStorage.getItem(draftStorageKey(designerId, projectId))
    if (!raw) return null
    const json = await unsealJson(JSON.parse(raw))
    if (!json) return null
    const forced = {
      ...json,
      version: DRAFT_VERSION,
      ref: draftRef(designerId, projectId),
      designerId,
      projectId,
    }
    return normalizeDraft(forced, designerId, projectId)
  } catch {
    return null
  }
}

async function writeDraft(designerId, projectId, draft) {
  if (typeof localStorage === 'undefined' || !isDraftUnlocked()) return null
  const normalized = normalizeDraft(draft, designerId, projectId)
  if (!normalized) return null
  const env = await sealJson(normalized)
  if (!env) return null
  localStorage.setItem(draftStorageKey(designerId, projectId), JSON.stringify(env))
  return normalized
}

export async function saveDraft(designerId, partial, projectId) {
  if (!designerId || !projectId || typeof localStorage === 'undefined' || !isDraftUnlocked()) return null
  const previous = await loadDraft(designerId, projectId)
  const patch = {
    ...previous,
    ...partial,
    version: DRAFT_VERSION,
    ref: draftRef(designerId, projectId),
    designerId,
    projectId,
  }
  patch.createdAt = patch.createdAt ?? previous?.createdAt ?? nowIso()
  patch.updatedAt = nowIso()
  delete patch.password
  const saved = await writeDraft(designerId, projectId, patch)
  if (saved) touchRegistry(designerId, projectId)
  return saved
}

export async function loadTemplateDraft(designerId, slug, projectId) {
  if (!designerId || !projectId) return null
  const draft = await loadDraft(designerId, projectId)
  if (!draft?.templateDrafts || !slug) return null
  return normalizeTemplateDraft(slug, draft.templateDrafts[slug])
}

export async function saveTemplateDraft(designerId, slug, partial, projectId) {
  if (!designerId || !slug || !projectId || typeof localStorage === 'undefined' || !isDraftUnlocked()) return null
  // A template draft may arrive before any base chapter was saved (the editor
  // write-throughs on the very first keystroke); seed a minimal project draft
  // so the storage layer never has to guess a stage.
  const previous =
    (await loadDraft(designerId, projectId)) ?? {
      version: DRAFT_VERSION,
      ref: draftRef(designerId, projectId),
      designerId,
      projectId,
      designerName: '',
      receiverName: '',
      currentStage: 'templates',
      templateSlug: null,
      submittedAt: null,
      templateDrafts: {},
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
  const current = previous.templateDrafts?.[slug] ?? {}
  const next = { ...current, ...partial }
  delete next.password
  const templateDrafts = { ...(previous.templateDrafts ?? {}), [slug]: normalizeTemplateDraft(slug, next) }
  return saveDraft(designerId, { ...previous, templateDrafts }, projectId)
}

export async function clearTemplateDraft(designerId, slug, projectId) {
  const draft = await loadDraft(designerId, projectId)
  if (!draft) return null
  const templateDrafts = { ...draft.templateDrafts }
  delete templateDrafts[slug]
  return saveDraft(designerId, { templateDrafts }, projectId)
}

// Remove one project's draft from this device (key + registry entry). Media
// blobs in IndexedDB are a separate concern — callers use draftMediaStore's
// deleteProjectMedia when the book's prints and sound are lifted too.
export async function clearDraft(designerId, projectId) {
  if (!designerId || !projectId || typeof localStorage === 'undefined') return
  localStorage.removeItem(draftStorageKey(designerId, projectId))
  removeRegistryProject(designerId, projectId)
}

export function formatCountdown(totalSeconds) {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}