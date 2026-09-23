import { Folio, Fleuron } from './ornaments'

// The physical book: a spread of paper on a dark desk. Left leaf is the
// "verso" — a quiet statement of what the book is — and the right leaf is
// the working folio. When a cover is present its board sits over both and
// lifts open. Mirrors the hand-held scale: no chrome, oak, or glass.
export default function BookShell({
  leftNode = <VersoPage />,
  rightNode,
  turnNode,
  coverOpen = false,
  onOpenCover,
  flipping = false,
}) {
  return (
    <div className="book-stage">
      <div className="book-scene">
        <div className={`book${flipping ? ' flipping' : ''}`}>
          <div className="book-sheet is-left">{leftNode}</div>
          <div className="book-spine" aria-hidden="true" />
          <div className="book-sheet is-right">
            {rightNode}
            {turnNode}
          </div>
          <button
            type="button"
            className={`book-cover${coverOpen ? ' is-opening' : ' is-closed'}`}
            onClick={onOpenCover}
            aria-label="Open the book"
          >
            <span className="cover-kicker">dearune · a finite book</span>
            <span className="cover-device" aria-hidden="true">
              D
            </span>
            <span className="cover-title">Dearune</span>
            <span className="cover-subtitle">One private book, for a single message.</span>
            <span className="cover-open">
              Open the book
              <span className="cover-arrow" aria-hidden="true">
                →
              </span>
            </span>
          </button>
          <div className="book-block" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <span key={n} className={n === 5 ? 'bottom' : ''} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function VersoPage() {
  return (
    <Folio folio={2} className="verso">
      <div style={{ textAlign: 'center', paddingTop: '1.2em' }}>
        <div className="page-script">a word on keeping</div>
        <div className="page-kicker" style={{ marginTop: 6, marginBottom: 12 }}>
          the first folio
        </div>
        <Fleuron />
      </div>
      <div className="page-body" style={{ marginTop: 8 }}>
        <p className="dropcap">
          A letter is the nearest thing to a held hand. At Dearune we keep one
          message at a time — set by hand, closed in wax, mailed softly — so
          that a few lines may travel as far as a person can be.
        </p>
        <p style={{ marginTop: '1em' }}>
          This book belongs to a single message. Your hand reaches in to write
          it; the world reaches in to read it.
        </p>
      </div>
      <div className="mind" style={{ marginTop: 'auto' }}>
        <Fleuron short />
        <div className="page-kicker" style={{ marginTop: 4 }}>
          remembered · not written to the clouds
        </div>
        <div style={{ marginTop: 14, fontSize: '0.74rem', letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--ink-faint)', textAlign: 'center' }}>
          ❦ est. to be read slowly ❦
        </div>
      </div>
    </Folio>
  )
}