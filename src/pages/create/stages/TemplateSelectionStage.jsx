import DearuneLoader from '@/components/book/DearuneLoader'
import { Fleuron } from '@/components/book/ornaments'
import { templateMiniFor, templateRegistry } from '@/templates'

export default function TemplateSelectionStage({ templates, loading, error, chosenSlug, onSelect, onRetry }) {
  return (
    <div className="settle stage-root">
      <div className="page-script">choose the paper, once</div>
      <div className="page-kicker" style={{ marginTop: 6 }}>
        chapter the third
      </div>

      <Fleuron />

      {loading ? (
        <div style={{ padding: '2.4em 0' }}>
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
        <div className="papers">
          <div className="paper-grid" role="group" aria-label="Papers to choose from">
            {(templates ?? []).map((template) => {
              const Mini = templateMiniFor(template.slug)
              const active = Boolean(templateRegistry(template.slug))
              return (
                <button
                  key={template.slug}
                  type="button"
                  className={`paper-card${chosenSlug === template.slug ? ' is-chosen' : ''}${active ? '' : ' is-coming'}`}
                  onClick={() => onSelect(template)}
                  aria-pressed={chosenSlug === template.slug}
                >
                  <span className="paper-art">{Mini ? <Mini /> : <span className="paper-blank" />}</span>
                  <span className="paper-meta">
                    <span className="paper-name">{template.name}</span>
                    <span className="paper-phrase">{template.description || 'plain words on fine paper'}</span>
                  </span>
                  <span className="paper-state">{active ? 'open' : 'being bound'}</span>
                </button>
              )
            })}
          </div>
          <p className="note">One choice. Each paper keeps its own drafts, so changing your mind loses nothing.</p>
        </div>
      )}
    </div>
  )
}