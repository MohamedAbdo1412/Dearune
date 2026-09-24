import { webcrypto } from 'node:crypto'
import { describe, expect, it, beforeEach } from 'vitest'
import {
  DRAFT_VERSION,
  BASE_STAGES,
  REVIEW_STAGE,
  POLICIES_STAGE,
  SUBMITTED_STAGE,
  STATUS_STAGE,
  templateStagesFor,
  decodeJwtPayload,
  draftRef,
  draftStorageKey,
  formatCountdown,
  createLocalProject,
  getActiveProjectId,
  listLocalProjects,
  setActiveProject,
  removeRegistryProject,
  loadDraft,
  saveDraft,
  loadTemplateDraft,
  saveTemplateDraft,
  clearTemplateDraft,
  clearDraft,
  normalizeDraft,
} from '../src/services/draft'
import {
  unlockDraftKey,
  lockDraftKey,
  draftUnlockedFor,
  isDraftUnlocked,
  encryptBytes,
  decryptBytes,
} from '../src/services/draftCrypto'

// Web Crypto is required by the draft encryption core. Node exposes it as
// globalThis.crypto from v20 on; under older runtimes it is filled from
// node:crypto's webcrypto so the same AES-GCM code is exercised here.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
}

function makeStore() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    key: (n) => [...map.keys()][n],
    get length() {
      return map.size
    },
  }
}

function b64url(text) {
  return btoa(text)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function fakeToken(payload) {
  return `${b64url('{"alg":"HS256","typ":"JWT"}' )}.${b64url(JSON.stringify(payload))}.sig`
}

function freshStore() {
  globalThis.localStorage = makeStore()
}

describe('decodeJwtPayload', () => {
  it('returns null for empty / malformed input', () => {
    expect(decodeJwtPayload('')).toBeNull()
    expect(decodeJwtPayload(null)).toBeNull()
    expect(decodeJwtPayload('no-dots-here')).toBeNull()
    expect(decodeJwtPayload('x.!!!!.z')).toBeNull()
  })

  it('decodes the middle segment of a JWT', () => {
    const payload = { role: 'designer', code: '126223', sub: 'd-123' }
    expect(decodeJwtPayload(fakeToken(payload))).toMatchObject({ role: 'designer', code: '126223', sub: 'd-123' })
  })
})

describe('draft storage keys', () => {
  it('is namespaced, versioned, and scoped to the designer', () => {
    expect(draftRef('d-9')).toBe('designer:d-9')
    expect(draftRef('d-9', 'p-1')).toBe('designer:d-9.project:p-1')
    expect(draftStorageKey('d-9')).toBe(`dearune.draft.v${DRAFT_VERSION}.designer:d-9`)
    expect(draftStorageKey('d-9', 'p-1')).toBe(`dearune.draft.v${DRAFT_VERSION}.designer:d-9.project:p-1`)
  })
})

describe('normalizeDraft', () => {
  const base = {
    version: DRAFT_VERSION,
    ref: 'designer:d-9.project:p-1',
    designerId: 'd-9',
    currentStage: 'templates',
  }

  it('rejects wrong version / wrong person / unknown stage', () => {
    expect(normalizeDraft({ ...base, version: 999 }, 'd-9', 'p-1')).toBeNull()
    expect(normalizeDraft({ ...base, ref: 'designer:other.project:p-1' }, 'd-9', 'p-1')).toBeNull()
    expect(normalizeDraft({ ...base, designerId: 'other' }, 'd-9', 'p-1')).toBeNull()
    expect(normalizeDraft({ ...base, currentStage: 'treasure-room' }, 'd-9', 'p-1')).toBeNull()
    expect(normalizeDraft({ ...base, currentStage: 'reserved' }, 'd-9', 'p-1')).toBeNull()
  })

  it('accepts the pipeline stages including the terms and the hand-over', () => {
    const withPaper = { ...base, templateSlug: 'memorial-message' }
    expect(normalizeDraft({ ...withPaper, currentStage: REVIEW_STAGE }, 'd-9', 'p-1')).toMatchObject({ currentStage: REVIEW_STAGE })
    expect(normalizeDraft({ ...withPaper, currentStage: POLICIES_STAGE }, 'd-9', 'p-1')).toMatchObject({ currentStage: POLICIES_STAGE })
    expect(normalizeDraft({ ...base, currentStage: SUBMITTED_STAGE }, 'd-9', 'p-1')).toMatchObject({ currentStage: SUBMITTED_STAGE })
    expect(normalizeDraft({ ...base, currentStage: STATUS_STAGE }, 'd-9', 'p-1')).toMatchObject({ currentStage: STATUS_STAGE })
  })

  it('normalizes valid drafts and fills timestamps', () => {
    const out = normalizeDraft(
      { ...base, templateSlug: 'memorial-message', currentStage: 'memorial.editor', submittedAt: '2026-09-24T10:00:00.000Z', submittedProjectId: 'p-1', submitLedger: {} },
      'd-9',
      'p-1'
    )
    expect(out).toMatchObject({ version: DRAFT_VERSION, templateSlug: 'memorial-message', currentStage: 'memorial.editor' })
    expect(out.submittedAt).toBe('2026-09-24T10:00:00.000Z')
    expect(out.submittedProjectId).toBe('p-1')
    expect(typeof out.createdAt).toBe('string')
    expect(typeof out.updatedAt).toBe('string')
  })

  it('accepts undefined templateSlug as null', () => {
    const out = normalizeDraft(base, 'd-9', 'p-1')
    expect(out.templateSlug).toBeNull()
  })
})

describe('draft encryption round-trip', () => {
  beforeEach(async () => {
    freshStore()
    await unlockDraftKey('d-9', 'secret-nine')
  })

  it('encrypts and decrypts bytes, and rejects tampered ciphertext', async () => {
    const plain = new TextEncoder().encode('the words must not leave the desk')
    const sealed = await encryptBytes(plain)
    expect(sealed.ct).toBeInstanceOf(ArrayBuffer)
    const round = await decryptBytes(sealed)
    expect(new TextDecoder().decode(round)).toBe('the words must not leave the desk')

    const tampered = new Uint8Array(sealed.ct)
    tampered[0] ^= 0xff
    expect(await decryptBytes({ iv: sealed.iv, ct: tampered })).toBeNull()
  })

  it('keeps one identity unlocked at a time', async () => {
    expect(draftUnlockedFor()).toBe('d-9')
    await unlockDraftKey('d-7', 'secret-seven')
    expect(draftUnlockedFor()).toBe('d-7')
    lockDraftKey()
    expect(isDraftUnlocked()).toBe(false)
    expect(draftUnlockedFor()).toBeNull()
  })
})

describe('draft persistence (encrypted, project-scoped)', () => {
  beforeEach(async () => {
    freshStore()
    await unlockDraftKey('d-9', 'secret-nine')
  })

  it('saves, loads, patches, and clears a draft under one project id', async () => {
    await saveDraft('d-9', { designerName: 'Tess', currentStage: 'templates', templateSlug: null, receiverName: 'Maya' }, 'p-1')
    await saveDraft('d-9', { currentStage: 'memorial.editor', templateSlug: 'memorial-message' }, 'p-1')

    const nine = await loadDraft('d-9', 'p-1')
    expect(nine).toMatchObject({ designerId: 'd-9', projectId: 'p-1', designerName: 'Tess', receiverName: 'Maya', currentStage: 'memorial.editor', templateSlug: 'memorial-message' })

    await clearDraft('d-9', 'p-1')
    expect(await loadDraft('d-9', 'p-1')).toBeNull()
  })

  it('keeps one project from leaking into another', async () => {
    await saveDraft('d-9', { currentStage: 'templates', templateSlug: null }, 'p-1')
    await saveDraft('d-9', { currentStage: 'memorial.editor', templateSlug: 'memorial-message' }, 'p-2')

    expect(await loadDraft('d-9', 'p-1')).toMatchObject({ currentStage: 'templates' })
    expect(await loadDraft('d-9', 'p-2')).toMatchObject({ currentStage: 'memorial.editor' })
  })

  it('stores only ciphertext — the words never touch storage as text', async () => {
    createLocalProject('d-9')
    await saveDraft('d-9', { designerName: 'Tess', currentStage: 'memorial.editor', templateSlug: 'memorial-message' }, 'p-1')

    const raw = localStorage.getItem(draftStorageKey('d-9', 'p-1'))
    const env = JSON.parse(raw)
    expect(env).toMatchObject({ v: 1 })
    expect(typeof env.iv).toBe('string')
    expect(typeof env.ct).toBe('string')
    expect(raw).not.toContain('Tess')
    expect(raw).not.toContain('memorial')

    // and the registry key (metadata-only) carries no prose either
    const reg = localStorage.getItem(draftStorageKey('d-9'))
    expect(reg).not.toContain('Tess')
    expect(reg).not.toContain('memorial')
  })

  it('uses a fresh nonce so identical letters never read identically', async () => {
    await saveDraft('d-9', { currentStage: 'templates', templateSlug: null }, 'p-1')
    const firstCt = JSON.parse(localStorage.getItem(draftStorageKey('d-9', 'p-1'))).ct
    await saveDraft('d-9', { currentStage: 'templates', templateSlug: null }, 'p-1')
    const secondCt = JSON.parse(localStorage.getItem(draftStorageKey('d-9', 'p-1'))).ct
    expect(firstCt).not.toBe(secondCt)
  })

  it('a locked session can read nothing and write nothing', async () => {
    await saveDraft('d-9', { currentStage: 'memorial.editor', templateSlug: 'memorial-message' }, 'p-1')
    lockDraftKey()
    expect(await loadDraft('d-9', 'p-1')).toBeNull()
    expect(await saveDraft('d-9', { currentStage: 'review' }, 'p-1')).toBeNull()
  })

  it('a different designer cannot decrypt someone else’s draft', async () => {
    await saveDraft('d-9', { designerName: 'Tess', currentStage: 'memorial.editor', templateSlug: 'memorial-message' }, 'p-1')

    await unlockDraftKey('d-7', 'secret-seven')
    expect(await loadDraft('d-9', 'p-1')).toBeNull()

    await unlockDraftKey('d-9', 'secret-nine')
    expect(await loadDraft('d-9', 'p-1')).toMatchObject({ designerName: 'Tess' })
  })

  it('ignores corrupted storage', async () => {
    localStorage.setItem(draftStorageKey('d-9', 'p-1'), '{{not json')
    expect(await loadDraft('d-9', 'p-1')).toBeNull()
  })

  it('does not read a draft for an unknown designer or project', async () => {
    expect(await loadDraft('', 'p-1')).toBeNull()
    expect(await loadDraft('d-9', '')).toBeNull()
    expect(await loadDraft(null, 'p-1')).toBeNull()
    expect(await loadDraft('d-9', null)).toBeNull()
  })
})

describe('draft registry', () => {
  beforeEach(async () => {
    freshStore()
    await unlockDraftKey('d-9', 'secret-nine')
  })

  it('opens a project, remembers it as active, and lists it', () => {
    const pid = createLocalProject('d-9')
    expect(pid).toBeTruthy()
    expect(getActiveProjectId('d-9')).toBe(pid)
    expect(listLocalProjects('d-9')).toHaveLength(1)
    expect(listLocalProjects('d-9')[0]).toMatchObject({ projectId: pid })
    expect(typeof listLocalProjects('d-9')[0].updatedAt).toBe('string')
  })

  it('switches the active project when a second book is opened', () => {
    const first = createLocalProject('d-9')
    const second = createLocalProject('d-9')
    expect(getActiveProjectId('d-9')).toBe(second)
    expect(setActiveProject('d-9', first)).toBe(true)
    expect(getActiveProjectId('d-9')).toBe(first)
    expect(setActiveProject('d-9', 'never-made')).toBe(false)
    expect(getActiveProjectId('d-9')).toBe(first)
  })

  it('removes a project and clears the active pointer', () => {
    const pid = createLocalProject('d-9')
    removeRegistryProject('d-9', pid)
    expect(listLocalProjects('d-9')).toHaveLength(0)
    expect(getActiveProjectId('d-9')).toBeNull()
  })

  it('keeps the registry plain (metadata only)', () => {
    createLocalProject('d-9')
    const reg = JSON.parse(localStorage.getItem(draftStorageKey('d-9')))
    expect(reg).toMatchObject({ version: DRAFT_VERSION, designerId: 'd-9' })
    const projects = Object.values(reg.projects)
    expect(projects.length).toBe(1)
    expect(Object.keys(projects[0])).toEqual(['createdAt', 'updatedAt'])
  })
})

describe('formatCountdown', () => {
  it('renders minutes:seconds', () => {
    expect(formatCountdown(60)).toBe('1:00')
    expect(formatCountdown(0)).toBe('0:00')
    expect(formatCountdown(59)).toBe('0:59')
    expect(formatCountdown(125)).toBe('2:05')
  })

  it('handles non-numbers defensively', () => {
    expect(formatCountdown(-5)).toBe('0:00')
    expect(formatCountdown(undefined)).toBe('0:00')
  })
})

describe('template drafts stay isolated per slug', () => {
  beforeEach(async () => {
    freshStore()
    await unlockDraftKey('d-9', 'secret-nine')
  })

  it('saves a memorial draft and never persists a message password', async () => {
    await saveDraft('d-9', { currentStage: 'templates', templateSlug: null }, 'p-1')
    await saveTemplateDraft('d-9', 'memorial-message', { language: 'ar', greeting: 'أبي الحبيب', body: 'لا يوم يمر دونك.', passwordSet: true }, 'p-1')
    const memorial = await loadTemplateDraft('d-9', 'memorial-message', 'p-1')
    expect(memorial).toMatchObject({ language: 'ar', greeting: 'أبي الحبيب', body: 'لا يوم يمر دونك.', passwordSet: true })
    expect(memorial.photos).toEqual([null, null, null])
    expect(memorial.audio).toBeNull()
    expect(Object.keys(memorial)).not.toContain('password')
    expect(Object.keys(memorial)).not.toContain('passwordValue')
  })

  it('works even when a template draft precedes any base chapter', async () => {
    await saveTemplateDraft('d-9', 'memorial-message', { body: 'first keystroke' }, 'p-1')
    expect(await loadTemplateDraft('d-9', 'memorial-message', 'p-1')).toMatchObject({ body: 'first keystroke' })
    expect(await loadDraft('d-9', 'p-1')).toMatchObject({ currentStage: 'templates' })
  })

  it('leaves one paper alone while writing another', async () => {
    await saveDraft('d-9', { currentStage: 'templates', templateSlug: null }, 'p-1')
    await saveTemplateDraft('d-9', 'memorial-message', { body: 'chapter five', language: 'en' }, 'p-1')
    await saveTemplateDraft('d-9', 'memorial-message', { closing: 'with love' }, 'p-1')
    await saveTemplateDraft('d-9', 'classic-letter', { body: 'a classic draft' }, 'p-1')

    const memorial = await loadTemplateDraft('d-9', 'memorial-message', 'p-1')
    expect(memorial).toMatchObject({ body: 'chapter five', language: 'en', closing: 'with love' })

    expect(await loadTemplateDraft('d-9', 'classic-letter', 'p-1')).toMatchObject({ body: 'a classic draft' })

    await clearTemplateDraft('d-9', 'classic-letter', 'p-1')
    expect(await loadTemplateDraft('d-9', 'classic-letter', 'p-1')).toBeNull()
    expect(await loadTemplateDraft('d-9', 'memorial-message', 'p-1')).toMatchObject({ body: 'chapter five' })
  })
})

describe('template stages', () => {
  it('maps base stages, then template chapters after them', () => {
    expect(BASE_STAGES).toEqual(['access', 'receiver', 'templates'])
    expect(templateStagesFor('memorial-message')).toEqual(['memorial.language', 'memorial.editor', 'memorial.password', REVIEW_STAGE, POLICIES_STAGE])
    expect(POLICIES_STAGE).toBe('policies')
    expect(SUBMITTED_STAGE).toBe('submitted')
  })

  it('falls back to the unwritten placeholder for unknown papers', () => {
    expect(templateStagesFor('classic-letter')).toEqual(['unwritten'])
    expect(templateStagesFor(null)).toEqual([])
    expect(templateStagesFor('')).toEqual([])
  })
})