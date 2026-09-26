// The book's motion lifecycle as one pure machine: the cover, the sweeping
// leaf, and the ink pass that follows a landing. CreateBook still owns the
// page it is ON (stage) and whether the shelf or the pipeline is showing —
// this module owns only HOW THE BOOK MOVES, so two turns can never overlap,
// the cover can never open twice, and every transition is testable without
// React.

export const BOOK_CLOSED = 'CLOSED' // the cover is shut
export const BOOK_OPENING = 'OPENING' // the cover is swinging open
export const BOOK_OPEN = 'OPEN' // at rest, the spread is usable
export const BOOK_TURNING_FORWARD = 'TURNING_FORWARD'
export const BOOK_TURNING_BACKWARD = 'TURNING_BACKWARD'
export const BOOK_SETTLING = 'SETTLING' // the ink pass after a landing

export function initialBookMotion({ coverOpen = false } = {}) {
  return {
    coverOpen,
    opening: false,
    turn: null, // { target, direction: 'fwd'|'back', from } while a leaf sweeps
    inking: false,
    inkDirection: 'fwd',
  }
}

// Events:
//   OPEN_COVER        the cover begins to open (a no-op when it is open)
//   COVER_SETTLED      the cover's exit finished (or never existed)
//   GO {target, direction, from}  a page turn begins; refused mid-motion
//   TURN_END          the leaf landed; the stage commits outside the machine
//   INK_START/INK_END the settling pass over the arriving words
//   SHOW_SHELF        land on the shelf: open, at rest, nothing in flight
//   RESET_DESK        a fresh desk: cover shut, nothing in flight
export function bookReducer(state, event) {
  switch (event.type) {
    case 'OPEN_COVER':
      // Already open (or never mounted): nothing to animate, nothing to wait
      // for — a second open can neither restart a swing nor strand `opening`.
      if (state.coverOpen) return state
      return { ...state, coverOpen: true, opening: true }
    case 'COVER_SETTLED':
      return state.opening ? { ...state, opening: false } : state
    case 'GO': {
      if (state.turn || state.opening) return state
      return {
        ...state,
        turn: {
          target: event.target,
          direction: event.direction === 'back' ? 'back' : 'fwd',
          from: event.from,
        },
      }
    }
    case 'TURN_END': {
      if (!state.turn) return state
      // Landing ends any stale ink pass of a previous turn before the next
      // one is scheduled, so an old timer can never dim a fresh spread.
      return { ...state, turn: null, inking: false, inkDirection: state.turn.direction }
    }
    case 'INK_START':
      return state.inking ? state : { ...state, inking: true }
    case 'INK_END':
      return state.inking ? { ...state, inking: false } : state
    case 'SHOW_SHELF':
      return initialBookMotion({ coverOpen: true })
    case 'RESET_DESK':
      return initialBookMotion({ coverOpen: false })
    default:
      return state
  }
}

// One word for "what the book is doing right now" — the state names the
// motion contract runs on, read back for tests and diagnostics.
export function bookStatus(state) {
  if (state.turn) return state.turn.direction === 'back' ? BOOK_TURNING_BACKWARD : BOOK_TURNING_FORWARD
  if (state.inking) return BOOK_SETTLING
  if (state.opening) return BOOK_OPENING
  if (!state.coverOpen) return BOOK_CLOSED
  return BOOK_OPEN
}
