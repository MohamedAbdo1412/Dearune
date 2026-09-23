import { Fleuron } from '@/components/book/ornaments'

export default function ReservedStage({ designerName, template, onBack }) {
  return (
    <div className="settle stage-root">
      <div className="page-script">to be continued</div>
      <div className="page-kicker" style={{ marginTop: 6 }}>
        chapter the third
      </div>
      <h2 className="page-title">The rest of this book is still being written.</h2>
      <Fleuron />
      <div className="page-body" style={{ marginTop: 4 }}>
        <p className="dropcap">
          We are quietly binding the pages that follow — the words from your
          client, the paper you have chosen{template ? ` (${template.name.toLowerCase()})` : ''},
          the wax that closes it at the end. When the next chapter is ready,
          the book will open exactly where you left it.
        </p>
        <p style={{ marginTop: '1em' }}>
          {designerName ? `Nothing you have done here was lost to the clouds, ${designerName.split(' ')[0]}. ` : ''}
          Your place is marked. Close the book; it remembers.
        </p>
      </div>
      <div style={{ marginTop: 'auto', textAlign: 'center' }}>
        <span className="draft-note" style={{ position: 'static' }}>
          your place is kept · turn no page twice
        </span>
        <button type="button" className="d-btn d-btn--thread" onClick={onBack} style={{ marginTop: 10 }}>
          ← turn back to the papers
        </button>
      </div>
    </div>
  )
}