import { PIN_NAMES } from './pushpin'

// A thumbnail of the memorial letter — three small prints held by pins, for
// the choosing of papers. Pure ornament; the real letter is drawn once more
// in the book itself.

export default function MemorialCardMini() {
  return (
    <span className="tpl-card-art memorial-mini" aria-hidden="true">
      <span className="mini-paper">
        <span className="mini-lines"><i /><i /><i /><i /></span>
        {PIN_NAMES.map((pin, i) => (
          <span key={pin} className={`mini-print mp-${i}`} data-pin={pin}>
            <span className="mini-photo" />
          </span>
        ))}
        <span className="mini-seal" />
      </span>
    </span>
  )
}

export function ClassicLetterMini() {
  return (
    <span className="tpl-card-art classic-mini" aria-hidden="true">
      <span className="mini-paper">
        <span className="mini-lines"><i /><i /><i /></span>
        <span className="mini-wax" />
      </span>
    </span>
  )
}

export function WaxWordMini() {
  return (
    <span className="tpl-card-art wax-mini" aria-hidden="true">
      <span className="mini-paper">
        <span className="mini-word">
          <i>w</i>
          <i>o</i>
          <i>r</i>
          <i>d</i>
        </span>
        <span className="mini-swirl" />
      </span>
    </span>
  )
}

export function SilentCardMini() {
  return (
    <span className="tpl-card-art silent-mini" aria-hidden="true">
      <span className="mini-paper">
        <span className="mini-rune" />
      </span>
    </span>
  )
}