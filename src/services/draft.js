// Local-first draft for the book pipeline.
//
// Nothing a designer types is written to Supabase on the way through the
// book — the draft lives in localStorage under a key that is namespaced to
// the project, versioned, and scoped to a specific designer identity. The
// pure helpers (decodeJwtPayload, normalizeDraft, formatCountdown, ...) are
// unit-tested in tests/pipeline.test.js; storage access is guarded so the
// module stays safe to import in node test environments.

export const DRAFT_VERSION = 1
export const DRAFT_STAGES = ['access', 'template', 'reserved'] // rest of the book is reserved

export function draftRef(designerId, prefix = 'designer') {
  return `${prefix}:${designerId}`
}

export function draftStorageKey(designerId) {
  return `dearune.draft.v${DRAFT_VERSION}.${draftRef(designerId)}`
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

export function normalizeDraft(raw, designerId) {
  if (!raw || typeof raw !== 'object') return null
  if (raw.version !== DRAFT_VERSION) return null
  if (!designerId || raw.ref !== draftRef(designerId)) return null
  if (raw.designerId !== designerId) return null
  if (!DRAFT_STAGES.includes(raw.currentStage)) return null
  if (raw.templateSlug !== undefined && raw.templateSlug !== null && typeof raw.templateSlug !== 'string') return null
  return {
    version: DRAFT_VERSION,
    ref: raw.ref,
    designerId: raw.designerId,
    designerName: typeof raw.designerName === 'string' ? raw.designerName : '',
    currentStage: raw.currentStage,
    templateSlug: typeof raw.templateSlug === 'string' ? raw.templateSlug : null,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  }
}

export function loadDraft(designerId) {
  if (!designerId) return null
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(draftStorageKey(designerId))
    if (!raw) return null
    return normalizeDraft(JSON.parse(raw), designerId)
  } catch {
    return null
  }
}

export function saveDraft(designerId, partial) {
  if (!designerId || typeof localStorage === 'undefined') return null
  const previous = loadDraft(designerId)
  const draft = normalizeDraft(
    {
      version: DRAFT_VERSION,
      ref: draftRef(designerId),
      designerId,
      designerName: (partial.designerName ?? previous?.designerName ?? '').toString(),
      currentStage: partial.currentStage ?? previous?.currentStage ?? 'access',
      templateSlug: partial.templateSlug === undefined ? previous?.templateSlug ?? null : partial.templateSlug,
      createdAt: previous?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    designerId
  )
  if (!draft) return null
  localStorage.setItem(draftStorageKey(designerId), JSON.stringify(draft))
  return draft
}

export function clearDraft(designerId) {
  if (!designerId || typeof localStorage === 'undefined') return
  localStorage.removeItem(draftStorageKey(designerId))
}

export function formatCountdown(totalSeconds) {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}