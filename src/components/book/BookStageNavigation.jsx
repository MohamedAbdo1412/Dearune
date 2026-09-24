// The single Back control of the designer pipeline. It lives in the masthead's
// left corner, beside the wordmark, on every spread that has a previous page —
// one physical place for the whole book, so the way back never relocates from
// stage to stage and can't drift over a page's working content. It only ever
// asks the pipeline controller ("take me back to this stage"); the controller
// owns the reverse page-turn, the animation direction, and when state commits.
// A stage with no previous page renders nothing at all.

export default function BookStageNavigation({ onBack, label = 'back', disabled = false }) {
  if (!onBack) return null
  return (
    <nav className="book-nav" aria-label="Go back to the previous page">
      <button type="button" className="book-nav__back" onClick={onBack} disabled={disabled}>
        <span className="book-nav__caret" aria-hidden="true">‹</span>
        <span className="book-nav__word">{label}</span>
      </button>
    </nav>
  )
}