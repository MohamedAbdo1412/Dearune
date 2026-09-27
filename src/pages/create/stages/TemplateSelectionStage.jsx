import DearuneLoader from '@/components/book/DearuneLoader'
import { Fleuron } from '@/components/book/ornaments'
import { HourglassIcon } from 'lucide-react'
import { getCatalogItemState } from '@/services/catalog'
import { templateMiniFor, templateRegistry } from '@/templates'

// The chooser renders the ADMIN's archive, not a list of its own: the
// papers arrive already hidden (inactive ones were never sent), in admin
// order, each carrying its `display_state`. `getCatalogItemState` (the one
// home of that vocabulary) decides the seal, the veil and whether the card
// may be pressed at all — pointer AND keyboard, since a disabled <button>
// refuses both.
export default function TemplateSelectionStage({ templates, loading, error, chosenSlug, onSelect, onRetry, notice = '' }) {
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
          {notice ? (
            <p className="stage-note" role="status">
              {notice}
            </p>
          ) : null}
          <div className="paper-grid" role="group" aria-label="Papers to choose from">
            {(templates ?? []).map((template) => {
              const Mini = templateMiniFor(template.slug)
              const bound = Boolean(templateRegistry(template.slug))
              const item = getCatalogItemState(template)
              const chosen = chosenSlug === template.slug
              return (
                <button
                  key={template.slug}
                  type="button"
                  className={[
                    'paper-card',
                    chosen ? 'is-chosen' : '',
                    bound ? '' : 'is-coming',
                    // A future badge state (seasonal, premium, …) gets the
                    // frame the moment its registry entry declares a badge.
                    item.badge ? 'is-badged' : '',
                    item.selectable ? '' : 'is-unavailable',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  data-state={item.state}
                  disabled={!item.selectable}
                  onClick={() => onSelect(template)}
                  aria-pressed={chosen}
                >
                  {item.badge ? (
                    <span className="paper-seal" aria-hidden="true">
                      {item.badge}
                    </span>
                  ) : null}
                  <span className="paper-art">{Mini ? <Mini /> : <span className="paper-blank" />}</span>
                  <span className="paper-meta">
                    <span className="paper-name">{template.name}</span>
                    <span className="paper-phrase">{template.description || 'plain words on fine paper'}</span>
                  </span>
                  <span className="paper-state">
                    {!item.selectable ? 'unavailable' : bound ? 'open' : 'being bound'}
                  </span>
                  {!item.selectable ? (
                    <span className="card-veil">
                      <span className="card-veil-label">
                        <HourglassIcon className="size-3.5" aria-hidden="true" />
                        Not available now
                      </span>
                    </span>
                  ) : null}
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
