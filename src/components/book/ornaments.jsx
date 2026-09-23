import { roman } from './romans'

export function Fleuron({ className = '', short = false }) {
  return (
    <div className={`rule${short ? ' rule--short' : ''} ${className}`} aria-hidden="true">
      <span className="fleuron">❦</span>
    </div>
  )
}

export function Turnmark({ folio }) {
  return (
    <div className="page-turnmark" aria-hidden="true">
      <span>folio</span>
      <span>{roman(folio)}</span>
    </div>
  )
}

export function Pagina({ folio }) {
  return (
    <div className="page-pagina" aria-hidden="true">
      — {roman(folio)} —
    </div>
  )
}

// Shared chrome for the folios: the frame, the folio mark on the margin,
// and the printed page number. Used by both the resting page and the
// turning sheet so the two match.
export function Folio({ children, folio, className = '' }) {
  return (
    <div className={`book-page ${className}`}>
      <div className="book-page-inner">
        <Turnmark folio={folio} />
        <div className="book-folio-body">{children}</div>
        <Pagina folio={folio} />
      </div>
    </div>
  )
}