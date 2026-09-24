import { Fleuron } from '@/components/book/ornaments'

// Shown when a paper exists in the archive but its inner pages have not been
// drawn into the book yet. The designer's place is still kept; the studio is
// quietly binding the chapters that follow.

export default function UnwrittenStage({ template, onBack }) {
  return (
    <div className="settle stage-root">
      <div className="page-script">pages under the press</div>
      <div className="page-kicker" style={{ marginTop: 6 }}>
        chapter ∞
      </div>
      <h2 className="page-title">This paper is still being drawn.</h2>

      <Fleuron />

      <div className="page-body">
        <p className="dropcap">
          <em>{template?.name ?? 'This paper'}</em> is real — it hangs in the studio, its plates half-inked, its
          pages not yet fitted into this book.
        </p>
        <p style={{ marginTop: '1em' }}>
          In the meantime nothing is lost: the choice is kept for you, and your drafts wait exactly where you left
          them.
        </p>
      </div>

      <div className="stage-actions">
        <button type="button" className="d-btn d-btn--thread" onClick={onBack}>
          ← choose another paper
        </button>
      </div>
    </div>
  )
}