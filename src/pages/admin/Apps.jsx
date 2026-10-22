import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { DEARUNE_APPS } from '@/pwa/apps'
import { AppInstallAction } from '@/components/app-install'
import '@/styles/apps.css'

// The three apps, on one sheet of paper.
//
// Each card is a doorway to a section the studio already has: the same
// screen, the same sign-in, the same records. The card carries the app's own
// mark and its own install action, because each app is installed on its own
// and never in place of another.
export default function Apps() {
  return (
    <div className="apps-page">
      <header className="apps-header">
        <img className="apps-mark" src="/favicon.svg" width="60" height="60" alt="" />
        <div className="apps-headings">
          <h1 className="apps-title">Dearune Apps</h1>
          <p className="apps-lede">
            Three small apps for the studio&rsquo;s own desks — the QA scanner, the
            production floor and the design table. Each one opens straight to the
            section you already work in, under the same account.
          </p>
        </div>
      </header>

      <ul className="apps-grid">
        {DEARUNE_APPS.map((app) => (
          <li key={app.id} className="apps-card">
            <img
              className="apps-card-icon"
              src={app.iconPath}
              alt=""
              width="64"
              height="64"
              loading="lazy"
            />
            <h2 className="apps-card-title">{app.name}</h2>
            <p className="apps-card-text">{app.description}</p>
            <p className="apps-card-route">{app.route}</p>

            <div className="apps-card-actions">
              <Link className="apps-btn apps-btn-ink" to={app.route}>
                Open {app.label}
                <ArrowRight className="size-4 shrink-0" />
              </Link>
              <AppInstallAction app={app} />
            </div>
          </li>
        ))}
      </ul>

      <p className="apps-foot">
        An app is a doorway, not a new place. Everything you see inside one is
        the section you already know, under the same permissions, and nothing
        you write is kept in the app itself.
      </p>
    </div>
  )
}
