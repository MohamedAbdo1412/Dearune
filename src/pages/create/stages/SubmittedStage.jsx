import { Fleuron } from '@/components/book/ornaments'

// The success foil: the server has confirmed the project exists and it is
// carved in. The designer is told plainly and given exactly one lever — Close
// the Book — which shuts the cover, sweeps this project's local draft and
// media off the device, and returns them to the shelf. No further options on
// this page: the words have left the desk.

export default function SubmittedStage({ title, forName, paperName, receiptId, onCloseBook }) {
  return (
    <div className="settle stage-root">
      <div className="page-script">handed over</div>
      <div className="page-kicker" style={{ marginTop: 6 }}>
        the final folio
      </div>

      <div className="submitted-seal" aria-hidden="true">
        <span className="seal-wax seal-wax--set" />
      </div>

      <h2 className="page-title">Your Dearune has been submitted</h2>
      <p className="page-lead" style={{ marginBottom: 6 }}>
        A book for {forName || 'the one it is for'} — {paperName || 'chosen paper'} — is now carved in. It will be
        finished by hand and will make its way to them.
      </p>

      <Fleuron />

      {receiptId ? (
        <p className="draft-note" style={{ textAlign: 'center' }}>
          <span className="mono">{title || receiptId}</span> · receipt · {receiptId}
        </p>
      ) : null}
      <p className="page-body" style={{ marginTop: 6, maxWidth: '44ch', marginLeft: 'auto', marginRight: 'auto' }}>
        <span className="dropcap">C</span>lose the book to return it to the shelf. Its pages are no longer
        turned on this desk.
      </p>

      <div style={{ marginTop: 'auto', paddingTop: 18, textAlign: 'center' }}>
        <button type="button" id="mm-close-book" className="d-btn d-btn--ink" onClick={onCloseBook}>
          close the book
        </button>
      </div>
    </div>
  )
}