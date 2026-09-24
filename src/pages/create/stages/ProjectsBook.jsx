import { Fleuron } from '@/components/book/ornaments'
import DearuneLoader from '@/components/book/DearuneLoader'

// The projects book — the shelf of books this designer has handed over. Each
// row opens a read-only view; the server owns the records, so a closed book
// cannot be edited or deleted from here. A fresh book starts with the
// "new dearune" button, which empties the worktable and opens the cover.

function paperName(templates, slug) {
  if (!slug) return ''
  return (templates ?? []).find((t) => t.slug === slug)?.name ?? slug
}

const DAY = 86400000

// The row tells the book's real condition at a glance. A project is born
// sealed but mute; the clock starts only when the reader first opens it, and
// runs the agreed AVAILABILITY_YEARS from that first activation.
function shelfStatus(project) {
  if (!project) return 'waiting'
  const active = Boolean(project.message_active)
  const expires = project.expires_at && !Number.isNaN(Date.parse(project.expires_at)) ? Date.parse(project.expires_at) : null
  if (active) {
    if (expires && expires < Date.now() - DAY) return 'expired'
    if (expires) return `active until ${new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(expires))}`
    return 'active'
  }
  return project.policy_version ? 'sealed, not yet opened' : 'waiting'
}

export default function ProjectsBook({ projects, loading, error, templates, onOpen, openingId, openingAlert, onNewDearune, onRetry }) {
  const date = (iso) => {
    if (!iso || Number.isNaN(Date.parse(iso))) return ''
    return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(iso))
  }

  const rows = Array.isArray(projects) ? projects : []
  const busy = Boolean(openingId)

  return (
    <div className="settle stage-root">
      <div className="page-script">your shelf</div>
      <div className="page-kicker" style={{ marginTop: 6 }}>
        books already made
      </div>

      <Fleuron />

      <h2 className="page-title">{loading ? 'opening the shelf…' : rows.length ? 'books, kept closed' : 'an empty shelf'}</h2>

      {loading ? (
        <div style={{ padding: '2.4em 0' }}>
          <DearuneLoader label="the shelf is being opened…" />
        </div>
      ) : error ? (
        <div className="board-feedback">
          <div className="msg">{error}</div>
          {onRetry ? (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button type="button" className="d-btn d-btn--thread" onClick={onRetry}>
                open the shelf again
              </button>
            </div>
          ) : null}
        </div>
      ) : rows.length ? (
        <>
          {openingAlert ? (
            <div className="field-note--warn" role="alert" style={{ textAlign: 'center', margin: '0 0 10px' }}>
              {openingAlert}
            </div>
          ) : null}
          <div className="project-list" role="list" aria-label="Your books">
            {rows.map((project) => (
              <button
                key={project.id}
                type="button"
                className="project-row"
                role="listitem"
                onClick={() => onOpen(project)}
                disabled={busy}
              >
                <span className="project-title">{project.title || 'an unnamed book'}</span>
                <span className="project-meta">
                  <span>{paperName(templates, project.template_slug)}</span>
                  {date(project.submitted_at) ? <span>{date(project.submitted_at)}</span> : null}
                  <span className={`project-state ${shelfStatus(project) === 'expired' ? 'is-expired' : ''}`}>
                    {shelfStatus(project)}
                  </span>
                </span>
                {openingId === project.id ? (
                  <span className="project-opening">
                    <DearuneLoader small label="opening…" />
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <p className="note">A closed book keeps its words. It cannot be reopened from this side.</p>
        </>
      ) : (
        <p className="page-body" style={{ marginTop: 0 }}>
          <span className="dropcap">N</span>othing has been closed into a book yet. When a book is sealed it will
          wait here, read-only, until it is delivered.
        </p>
      )}

      <div style={{ marginTop: 'auto', paddingTop: 18, textAlign: 'center' }}>
        <button type="button" className="d-btn d-btn--ink" onClick={onNewDearune}>
          ✦ begin a new dearune
        </button>
      </div>
    </div>
  )
}