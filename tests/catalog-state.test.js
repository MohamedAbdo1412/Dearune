import { describe, expect, it } from 'vitest'
import {
  DISPLAY_STATES,
  DISPLAY_STATE_META,
  chooserCatalogItems,
  getCatalogItemState,
  isCatalogSelectable,
  sortCatalogItems,
  visibleCatalogItems,
} from '@/services/catalog'

// The merchandising vocabulary is consulted by the admin shelves, both
// Create choosers and the bounce validation — one module, one meaning.

const paper = (over = {}) => ({
  id: 'p1',
  slug: 'love-story',
  name: 'Love Story',
  enabled: true,
  sort_order: 1,
  display_state: 'normal',
  created_at: '2026-01-01T00:00:00.000Z',
  ...over,
})

const wrapper = (over = {}) => ({
  id: 'w1',
  key: 'treasure_box',
  name: 'Treasure Box',
  active: true,
  display_order: 30,
  display_state: 'normal',
  created_at: '2026-01-02T00:00:00.000Z',
  ...over,
})

describe('the shipped display states', () => {
  it('are exactly normal, new and not_available', () => {
    expect(DISPLAY_STATES).toEqual(['normal', 'new', 'not_available'])
  })

  it('each carry a label, a selectability and a badge slot for the admin select', () => {
    for (const state of DISPLAY_STATES) {
      const meta = DISPLAY_STATE_META[state]
      expect(meta, `missing meta for ${state}`).toBeTruthy()
      expect(typeof meta.label).toBe('string')
      expect(typeof meta.selectable).toBe('boolean')
      expect(typeof meta.badge).toBe('string')
    }
    expect(DISPLAY_STATE_META.normal.selectable).toBe(true)
    expect(DISPLAY_STATE_META.new.selectable).toBe(true)
    expect(DISPLAY_STATE_META.new.badge).toBe('New')
    expect(DISPLAY_STATE_META.not_available.selectable).toBe(false)
  })
})

describe('getCatalogItemState', () => {
  it('hides an inactive paper entirely, whatever state it carries', () => {
    const state = getCatalogItemState(paper({ enabled: false, display_state: 'new' }))
    expect(state.visible).toBe(false)
    expect(state.selectable).toBe(false)
    expect(state.badge).toBe('')
    expect(state.summary).toBe('Hidden')
  })

  it('reads the wrapper spelling of the activation flag as well', () => {
    expect(getCatalogItemState(wrapper({ active: false })).visible).toBe(false)
    expect(getCatalogItemState(wrapper({ active: true })).visible).toBe(true)
    // the spec name is understood first, if a payload ever carries it
    expect(getCatalogItemState({ is_active: false, enabled: true }).visible).toBe(false)
  })

  it('offers a normal item plainly: selectable, no badge', () => {
    const state = getCatalogItemState(paper())
    expect(state).toMatchObject({ visible: true, selectable: true, state: 'normal', badge: '' })
    expect(isCatalogSelectable(paper())).toBe(true)
  })

  it('seals a new item but still lets it be chosen', () => {
    const state = getCatalogItemState(paper({ display_state: 'new', sort_order: 1 }))
    expect(state.visible).toBe(true)
    expect(state.selectable).toBe(true)
    expect(state.badge).toBe('New')
  })

  it('shows a resting item but refuses selection', () => {
    const state = getCatalogItemState(paper({ display_state: 'not_available' }))
    expect(state.visible).toBe(true)
    expect(state.selectable).toBe(false)
    expect(state.badge).toBe('')
    expect(isCatalogSelectable(paper({ display_state: 'not_available' }))).toBe(false)
  })

  it('treats a missing display_state as plain normal', () => {
    const state = getCatalogItemState(paper({ display_state: undefined }))
    expect(state).toMatchObject({ visible: true, selectable: true, state: 'normal' })
  })

  it('fails safe on a future state this build does not know', () => {
    const state = getCatalogItemState(paper({ display_state: 'sold_out' }))
    expect(state.visible).toBe(true)
    expect(state.selectable).toBe(false)
    expect(state.label).toBe('Sold Out')
  })

  it('never crashes on a missing row (deleted or not yet fetched)', () => {
    expect(getCatalogItemState(undefined).visible).toBe(false)
    expect(getCatalogItemState(null).summary).toBe('Hidden')
  })

  it('summarizes exactly what the admin shelf previews', () => {
    expect(getCatalogItemState(paper({ sort_order: 2, display_state: 'new' })).summary).toBe(
      'Visible • New • Order #2'
    )
    expect(getCatalogItemState(paper({ sort_order: 4, display_state: 'not_available' })).summary).toBe(
      'Visible • Not Available Now • Order #4'
    )
    expect(getCatalogItemState(paper({ enabled: false, display_state: 'not_available' })).summary).toBe(
      'Hidden'
    )
    expect(getCatalogItemState(wrapper({ display_order: 30, active: true })).summary).toBe(
      'Visible • Normal • Order #30'
    )
  })

  it('reads the wrapper order column spelling too', () => {
    expect(getCatalogItemState(wrapper({ display_order: 7 })).order).toBe(7)
    expect(getCatalogItemState(paper({ sort_order: 7 })).order).toBe(7)
  })
})

describe('sortCatalogItems', () => {
  it('follows the admin order, never creation luck', () => {
    const items = [
      paper({ slug: 'b', name: 'B', sort_order: 3 }),
      paper({ slug: 'a', name: 'A', sort_order: 1 }),
      paper({ slug: 'c', name: 'C', sort_order: 2 }),
    ]
    expect(sortCatalogItems(items).map((t) => t.slug)).toEqual(['a', 'c', 'b'])
  })

  it('breaks duplicate orders by created_at, then name — deterministic', () => {
    const items = [
      paper({ slug: 'later', name: 'Later', sort_order: 1, created_at: '2026-02-01T00:00:00.000Z' }),
      paper({ slug: 'earlier', name: 'Earlier', sort_order: 1, created_at: '2026-01-01T00:00:00.000Z' }),
      paper({ slug: 'undated', name: 'Undated', sort_order: 1, created_at: undefined }),
    ]
    expect(sortCatalogItems(items).map((t) => t.slug)).toEqual(['earlier', 'later', 'undated'])
  })

  it('does not mutate the input', () => {
    const items = [paper({ sort_order: 2 }), paper({ sort_order: 1 })]
    sortCatalogItems(items)
    expect(items[0].sort_order).toBe(2)
  })
})

describe('chooserCatalogItems', () => {
  it('drops hidden items and keeps resting ones, in admin order', () => {
    const items = [
      paper({ slug: 'old', name: 'Old', sort_order: 9, enabled: false }),
      paper({ slug: 'resting', name: 'Resting', sort_order: 3, display_state: 'not_available' }),
      paper({ slug: 'story', name: 'Love Story', sort_order: 1, display_state: 'new' }),
      paper({ slug: 'plain', name: 'Plain', sort_order: 2 }),
    ]
    expect(chooserCatalogItems(items).map((t) => t.slug)).toEqual(['story', 'plain', 'resting'])
    expect(visibleCatalogItems(items).map((t) => t.slug)).toEqual(['resting', 'story', 'plain'])
  })
})
