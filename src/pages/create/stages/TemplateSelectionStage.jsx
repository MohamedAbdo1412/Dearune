import { useEffect, useMemo, useState } from 'react'
import DearuneLoader from '@/components/book/DearuneLoader'
import { Fleuron } from '@/components/book/ornaments'
import { HourglassIcon } from 'lucide-react'
import { getCatalogItemState } from '@/services/catalog'
import { getDesignerToken } from '@/services/designer'
import { resolveTemplateImageUrl, templatePreviewSource } from '@/services/templates'
import { templateRegistry } from '@/templates'

const EMPTY = {}

// The chooser renders the ADMIN's archive, not a list of its own: the
// papers arrive already hidden (inactive ones were never sent), in admin
// order, each carrying its `display_state`. `getCatalogItemState` (the one
// home of that vocabulary) decides the seal, the veil and whether the card
// may be pressed at all — pointer AND keyboard, since a disabled <button>
// refuses both.
//
// Each card paints the preview the ADMIN uploaded for that paper
// (`preview_image_url` / its generated thumbnail). The column holds a private
// storage path, so it is signed for this session through `designer-media`
// exactly like wrapper photos — and a paper without one falls back to the
// blank sheet rather than a broken image.
export default function TemplateSelectionStage({ templates, loading, error, chosenSlug, onSelect, onRetry, notice = '' }) {
  const token = useMemo(() => getDesignerToken(), [])
  // One resolution pass per archive: the signed URLs are kept beside the key
  // they were signed for, so a changed list simply ignores the stale set
  // instead of clearing state from inside the effect.
  const rows = useMemo(
    () =>
      (templates ?? [])
        .map((template) => ({ slug: template.slug, source: templatePreviewSource(template) }))
        .filter((row) => row.source),
    [templates]
  )
  const sourceKey = useMemo(() => rows.map((row) => `${row.slug}:${row.source}`).join('|'), [rows])
  const [resolved, setResolved] = useState({ key: '', urls: {} })
  const [broken, setBroken] = useState({})
  const previews = resolved.key === sourceKey ? resolved.urls : EMPTY

  useEffect(() => {
    if (!rows.length || !token) return undefined
    let alive = true
    Promise.all(rows.map(async (row) => [row.slug, await resolveTemplateImageUrl(row.source, token)]))
      .then((entries) => {
        if (!alive) return
        setResolved({ key: sourceKey, urls: Object.fromEntries(entries.filter(([, url]) => url)) })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [rows, sourceKey, token])

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
              const bound = Boolean(templateRegistry(template.slug))
              const item = getCatalogItemState(template)
              const chosen = chosenSlug === template.slug
              const preview = previews[template.slug]
              const src = preview && !broken[preview] ? preview : null
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
                  <span className="paper-art">
                    {src ? (
                      <img
                        className="paper-photo"
                        src={src}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        onError={() =>
                          setBroken((current) =>
                            current[preview] ? current : { ...current, [preview]: true }
                          )
                        }
                      />
                    ) : (
                      <span className="paper-blank" aria-hidden="true" />
                    )}
                  </span>
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
