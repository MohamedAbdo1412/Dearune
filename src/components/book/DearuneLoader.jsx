// The press's own loading mark, in four sizes so a spinner inside a button
// never swells to the size of the page it sits on:
//   xs 14px · sm 20px (buttons, inline busy states) · md 34px (a quiet
//   mid-page wait) · lg 54px (a whole-page settle, the largest allowed —
//   the book itself is the loading state, never a giant spinner).
const VALID = new Set(['xs', 'sm', 'md', 'lg'])

export default function DearuneLoader({ label = 'the press is turning…', size = 'lg' }) {
  const resolved = VALID.has(size) ? size : 'lg'
  return (
    <div className={`book-loader book-loader--${resolved}`} role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {label ? <span className="d-hint">{label}</span> : null}
    </div>
  )
}
