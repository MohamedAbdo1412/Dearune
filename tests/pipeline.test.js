import { describe, expect, it, beforeEach } from 'vitest'
import {
  DRAFT_VERSION,
  BASE_STAGES,
  templateStagesFor,
  decodeJwtPayload,
  draftRef,
  draftStorageKey,
  formatCountdown,
  clearDraft,
  loadDraft,
  loadTemplateDraft,
  normalizeDraft,
  saveDraft,
  saveTemplateDraft,
  clearTemplateDraft,
} from '../src/services/draft'

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
    expect(draftRef('d-9', 'designer')).toBe('designer:d-9')
    expect(draftStorageKey('d-9')).toBe(`dearune.draft.v${DRAFT_VERSION}.designer:d-9`)
  })
})

describe('normalizeDraft', () => {
  const base = { version: DRAFT_VERSION, ref: 'designer:d-9', designerId: 'd-9', currentStage: 'templates' }

  it('rejects wrong version / wrong person / unknown stage', () => {
    expect(normalizeDraft({ ...base, version: 999 }, 'd-9')).toBeNull()
    expect(normalizeDraft({ ...base, ref: 'designer:other' }, 'd-9')).toBeNull()
    expect(normalizeDraft({ ...base, designerId: 'other' }, 'd-9')).toBeNull()
    expect(normalizeDraft({ ...base, currentStage: 'treasure-room' }, 'd-9')).toBeNull()
    expect(normalizeDraft({ ...base, currentStage: 'reserved' }, 'd-9')).toBeNull()
  })

  it('normalizes valid drafts and fills timestamps', () => {
    const out = normalizeDraft({ ...base, templateSlug: 'memorial-message', currentStage: 'memorial.editor' }, 'd-9')
    expect(out).toMatchObject({ version: DRAFT_VERSION, templateSlug: 'memorial-message', currentStage: 'memorial.editor' })
    expect(typeof out.createdAt).toBe('string')
    expect(typeof out.updatedAt).toBe('string')
  })

  it('accepts undefined templateSlug as null', () => {
    const out = normalizeDraft(base, 'd-9')
    expect(out.templateSlug).toBeNull()
  })
})

describe('draft persistence', () => {
  beforeEach(() => {
    globalThis.localStorage = makeStore()
  })

  it('saves, loads, and clears a draft for one designer only', () => {
    saveDraft('d-9', { designerName: 'Tess', currentStage: 'templates', templateSlug: null })
    saveDraft('d-7', { designerName: 'Mika', currentStage: 'unwritten', templateSlug: 'classic-letter' })

    const nine = loadDraft('d-9')
    expect(nine).toMatchObject({ designerId: 'd-9', designerName: 'Tess', currentStage: 'templates', templateSlug: null })

    const seven = loadDraft('d-7')
    expect(seven.templateSlug).toBe('classic-letter')
    expect(seven.currentStage).toBe('unwritten')

    clearDraft('d-9')
    expect(loadDraft('d-9')).toBeNull()
    expect(loadDraft('d-7')).not.toBeNull()
  })

  it('keeps previous fields when patching a partial draft', () => {
    saveDraft('d-9', { designerName: 'Tess', templateSlug: 'memorial-message', currentStage: 'memorial.language' })
    saveDraft('d-9', { currentStage: 'memorial.password' })
    const draft = loadDraft('d-9')
    expect(draft).toMatchObject({ designerName: 'Tess', templateSlug: 'memorial-message', currentStage: 'memorial.password' })
  })

  it('ignores corrupted storage', () => {
    localStorage.setItem('dearune.draft.v1.designer:d-9', '{{not json')
    expect(loadDraft('d-9')).toBeNull()
  })

  it('does not read a draft for an unknown designer', () => {
    expect(loadDraft('')).toBeNull()
    expect(loadDraft(null)).toBeNull()
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
  beforeEach(() => {
    globalThis.localStorage = makeStore()
  })

  it('saves a memorial draft and never persists a message password', () => {
    saveDraft('d-9', { currentStage: 'templates', templateSlug: null })
    saveTemplateDraft('d-9', 'memorial-message', {
      language: 'ar',
      greeting: 'أبي الحبيب',
      body: 'لا يوم يمر دونك.',
      passwordSet: true,
    })
    const memorial = loadTemplateDraft('d-9', 'memorial-message')
    expect(memorial).toMatchObject({ language: 'ar', greeting: 'أبي الحبيب', body: 'لا يوم يمر دونك.', passwordSet: true })
    expect(memorial.photos).toEqual([null, null, null])
    expect(memorial.audio).toBeNull()
    expect(Object.keys(memorial)).not.toContain('password')
  })

  it('works even when a template draft precedes any base chapter', () => {
    saveTemplateDraft('d-9', 'memorial-message', { body: 'first keystroke' })
    expect(loadTemplateDraft('d-9', 'memorial-message')).toMatchObject({ body: 'first keystroke' })
  })

  it('leaves one paper alone while writing another', () => {
    saveDraft('d-9', { currentStage: 'templates', templateSlug: null })
    saveTemplateDraft('d-9', 'memorial-message', { body: 'chapter five', language: 'en' })
    saveTemplateDraft('d-9', 'memorial-message', { closing: 'with love' })
    saveTemplateDraft('d-9', 'classic-letter', { body: 'a classic draft' })

    const memorial = loadTemplateDraft('d-9', 'memorial-message')
    expect(memorial).toMatchObject({ body: 'chapter five', language: 'en', closing: 'with love' })

    expect(loadTemplateDraft('d-9', 'classic-letter')).toMatchObject({ body: 'a classic draft' })

    clearTemplateDraft('d-9', 'classic-letter')
    expect(loadTemplateDraft('d-9', 'classic-letter')).toBeNull()
    expect(loadTemplateDraft('d-9', 'memorial-message')).toMatchObject({ body: 'chapter five' })
  })
})

describe('template stages', () => {
  it('maps base stages, then template chapters after them', () => {
    expect(BASE_STAGES).toEqual(['access', 'receiver', 'templates'])
    expect(templateStagesFor('memorial-message')).toEqual(['memorial.language', 'memorial.editor', 'memorial.password', 'review'])
  })

  it('falls back to the unwritten placeholder for unknown papers', () => {
    expect(templateStagesFor('classic-letter')).toEqual(['unwritten'])
    expect(templateStagesFor(null)).toEqual([])
    expect(templateStagesFor('')).toEqual([])
  })
})