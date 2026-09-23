import { describe, expect, it, beforeEach } from 'vitest'
import {
  DRAFT_VERSION,
  DRAFT_STAGES,
  decodeJwtPayload,
  draftRef,
  draftStorageKey,
  formatCountdown,
  clearDraft,
  loadDraft,
  normalizeDraft,
  saveDraft,
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
  const base = { version: DRAFT_VERSION, ref: 'designer:d-9', designerId: 'd-9', currentStage: 'template' }

  it('rejects wrong version / wrong person / unknown stage', () => {
    expect(normalizeDraft({ ...base, version: 999 }, 'd-9')).toBeNull()
    expect(normalizeDraft({ ...base, ref: 'designer:other' }, 'd-9')).toBeNull()
    expect(normalizeDraft({ ...base, designerId: 'other' }, 'd-9')).toBeNull()
    expect(normalizeDraft({ ...base, currentStage: 'treasure-room' }, 'd-9')).toBeNull()
  })

  it('normalizes valid drafts and fills timestamps', () => {
    const out = normalizeDraft({ ...base, templateSlug: 'word-and-wax' }, 'd-9')
    expect(out).toMatchObject({ version: DRAFT_VERSION, templateSlug: 'word-and-wax', currentStage: 'template' })
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
    saveDraft('d-9', { designerName: 'Tess', currentStage: 'template', templateSlug: 'classic-letter' })
    saveDraft('d-7', { designerName: 'Mika', currentStage: 'reserved', templateSlug: 'silent-card' })

    const nine = loadDraft('d-9')
    expect(nine).toMatchObject({ designerId: 'd-9', designerName: 'Tess', currentStage: 'template', templateSlug: 'classic-letter' })

    const seven = loadDraft('d-7')
    expect(seven.templateSlug).toBe('silent-card')
    expect(seven.currentStage).toBe('reserved')

    clearDraft('d-9')
    expect(loadDraft('d-9')).toBeNull()
    expect(loadDraft('d-7')).not.toBeNull()
  })

  it('keeps previous fields when patching a partial draft', () => {
    saveDraft('d-9', { designerName: 'Tess', templateSlug: 'word-and-wax' })
    saveDraft('d-9', { currentStage: 'reserved' })
    const draft = loadDraft('d-9')
    expect(draft).toMatchObject({ designerName: 'Tess', templateSlug: 'word-and-wax', currentStage: 'reserved' })
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

describe('DRAFT_STAGES', () => {
  it('exposes the reserved placeholder as the final chapter', () => {
    expect(DRAFT_STAGES).toEqual(['access', 'template', 'reserved'])
  })
})