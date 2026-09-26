import { describe, it, expect } from 'vitest'
import {
  bookReducer,
  bookStatus,
  initialBookMotion,
  BOOK_CLOSED,
  BOOK_OPENING,
  BOOK_OPEN,
  BOOK_TURNING_FORWARD,
  BOOK_TURNING_BACKWARD,
  BOOK_SETTLING,
} from '@/pages/create/state/bookMachine'

const go = (target, direction = 'fwd', from = 'policies') => ({ type: 'GO', target, direction, from })

describe('bookMachine', () => {
  it('starts with the cover shut and nothing in flight', () => {
    const s = initialBookMotion()
    expect(s).toMatchObject({ coverOpen: false, opening: false, turn: null, inking: false })
    expect(bookStatus(s)).toBe(BOOK_CLOSED)
  })

  it('opens the cover once and settles it', () => {
    let s = bookReducer(initialBookMotion(), { type: 'OPEN_COVER' })
    expect(s).toMatchObject({ coverOpen: true, opening: true })
    expect(bookStatus(s)).toBe(BOOK_OPENING)
    // A second OPEN_COVER while open is a no-op: opening is never stranded.
    s = bookReducer(s, { type: 'OPEN_COVER' })
    expect(s.opening).toBe(true)
    s = bookReducer(s, { type: 'COVER_SETTLED' })
    expect(bookStatus(s)).toBe(BOOK_OPEN)
    s = bookReducer(s, { type: 'COVER_SETTLED' })
    expect(s.opening).toBe(false)
  })

  it('refuses a turn while the cover is swinging or a leaf is already sweeping', () => {
    let s = bookReducer(initialBookMotion(), { type: 'OPEN_COVER' })
    expect(bookReducer(s, go('receiver')).turn).toBeNull()
    s = bookReducer(s, { type: 'COVER_SETTLED' })
    s = bookReducer(s, go('memorial.editor', 'fwd', 'memorial.language'))
    expect(s.turn).toMatchObject({ target: 'memorial.editor', direction: 'fwd', from: 'memorial.language' })
    expect(bookStatus(s)).toBe(BOOK_TURNING_FORWARD)
    expect(bookReducer(s, go('wrapper')).turn.target).toBe('memorial.editor')
  })

  it('lands a turn, remembers its direction for the ink pass, and clears it', () => {
    let s = bookReducer(initialBookMotion({ coverOpen: true }), go('wrapper', 'back', 'memorial.password'))
    expect(bookStatus(s)).toBe(BOOK_TURNING_BACKWARD)
    s = bookReducer(s, { type: 'TURN_END' })
    expect(s.turn).toBeNull()
    expect(s.inkDirection).toBe('back')
    s = bookReducer(s, { type: 'INK_START' })
    expect(bookStatus(s)).toBe(BOOK_SETTLING)
    s = bookReducer(s, { type: 'INK_END' })
    expect(bookStatus(s)).toBe(BOOK_OPEN)
    // Turning End with no turn is a safe no-op.
    expect(bookReducer(s, { type: 'TURN_END' })).toBe(s)
  })

  it('a new landing kills any stale ink pass so old timers cannot dim fresh pages', () => {
    let s = bookReducer(initialBookMotion({ coverOpen: true }), go('review'))
    s = bookReducer(s, { type: 'TURN_END' })
    s = bookReducer(s, { type: 'INK_START' })
    expect(s.inking).toBe(true)
    s = bookReducer(s, go('policies')) // turned again mid-ink
    s = bookReducer(s, { type: 'TURN_END' })
    expect(s.inking).toBe(false)
    // The stale INK_END of the first turn arrives late — harmless.
    expect(bookReducer(s, { type: 'INK_END' }).inking).toBe(false)
  })

  it('shelf and desk resets drop everything mid-flight', () => {
    let s = bookReducer(initialBookMotion(), { type: 'OPEN_COVER' })
    s = bookReducer(s, go('receiver'))
    const shelf = bookReducer(s, { type: 'SHOW_SHELF' })
    expect(shelf).toMatchObject({ coverOpen: true, opening: false, turn: null, inking: false })
    expect(bookStatus(shelf)).toBe(BOOK_OPEN)
    const desk = bookReducer(shelf, { type: 'RESET_DESK' })
    expect(desk).toMatchObject({ coverOpen: false, opening: false, turn: null, inking: false })
    expect(bookStatus(desk)).toBe(BOOK_CLOSED)
  })

  it('ignores unknown events', () => {
    const s = initialBookMotion()
    expect(bookReducer(s, { type: 'WHO_KNOWS' })).toBe(s)
  })
})
