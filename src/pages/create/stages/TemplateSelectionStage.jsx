import DearuneLoader from '@/components/book/DearuneLoader'
import TemplateSample from '@/components/book/TemplateSample'
import { Fleuron } from '@/components/book/ornaments'

export default function TemplateSelectionStage({ templates, loading, error, chosenSlug, onSelect, onRetry }) {
  return (
    <div className="settle stage-root">
      <div className="page-script">choose the paper</div>
      <div className="page-kicker" style={{ marginTop: 6 }}>
        chapter the second
      </div>
      <h2 className="page-title">How shall it be sent?</h2>
      <p className="page-lead" style={{ marginBottom: 6 }}>
        Three papers hang in the archive. Each is set by hand, whether plain,
        waxed, or silent. Choose the one that feels like the words inside.
      </p>

      <Fleuron />

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2em 0' }}>
          <DearuneLoader label="the archive is being fetched…" />
        </div>
      ) : error ? (
        <div className="board-feedback">
          <div className="msg">{error}</div>
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <button type="button" className="d-btn d-btn--thread" onClick={onRetry}>
              fetch the archive again
            </button>
          </div>
        </div>
      ) : (
        <div className="archive" role="group" aria-label="Papers to choose from">
          {templates.map((template) => (
            <TemplateSample
              key={template.slug}
              template={template}
              chosen={template.slug === chosenSlug}
              onPick={onSelect}
            />
          ))}
          <p className="note">One choice, kept for you even if you walk away.</p>
        </div>
      )}
    </div>
  )
}