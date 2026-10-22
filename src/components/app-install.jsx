import { useState } from 'react'
import { Check, Download, ExternalLink } from 'lucide-react'
import { useAppInstall } from '@/hooks/use-install-prompt'
import { cn } from '@/lib/utils'

/**
 * The install action for one of the three apps.
 *
 * A browser only ever offers one install at a time, and only for the app
 * whose manifest the page is pointing at. So:
 *
 *   - inside the app's own section the browser's own dialog is used;
 *   - everywhere else — the Apps page above all — the app is opened in a new
 *     tab and the reader is walked through the browser menu, because that is
 *     the only honest way to install another app from another page.
 *
 * Nothing here claims an app is installed unless the browser said so.
 */

function openApp(app) {
  const opened = window.open(app.startUrl, '_blank', 'noopener,noreferrer')
  if (!opened) window.open(app.startUrl, '_blank')
}

export function AppInstallAction({ app, className }) {
  const { canPrompt, installed, steps, install } = useAppInstall(app)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  if (installed) {
    return (
      <p className={cn('apps-installed', className)}>
        <Check className="size-4 shrink-0" />
        Installed — {app.name} is on your home screen.
      </p>
    )
  }

  const handleInstall = async () => {
    if (canPrompt) {
      setBusy(true)
      try {
        await install()
      } finally {
        setBusy(false)
      }
      return
    }
    // Another app's manifest is the one the browser is holding, so the app is
    // opened first and the reader is told exactly what to do there.
    openApp(app)
    setOpen(true)
  }

  return (
    <div className={cn('apps-install', className)}>
      <div className="apps-card-actions">
        <button
          type="button"
          className="apps-btn apps-btn-wine"
          onClick={() => void handleInstall()}
          disabled={busy}
        >
          <Download className="size-4 shrink-0" />
          Install {app.label}
        </button>
      </div>

      {open && steps ? (
        <div className="apps-install-note">
          <p className="apps-install-lead">
            {steps.label} — {app.name} opens in its own tab, and the browser
            offers to keep it.
          </p>
          <ol className="apps-install-steps">
            {steps.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <button
            type="button"
            className="apps-btn apps-btn-quiet"
            onClick={() => openApp(app)}
          >
            <ExternalLink className="size-4 shrink-0" />
            Open {app.name}
          </button>
        </div>
      ) : null}
    </div>
  )
}

/**
 * The install action for the app the reader is already inside.
 *
 * It only appears when the browser has actually offered its own dialog for
 * that app — which happens exactly once the app's own page is open, and
 * never anywhere else. Everywhere else the Apps page does the talking.
 */
export function AppInstallPrompt({ app }) {
  const { canPrompt, install } = useAppInstall(app)
  const [busy, setBusy] = useState(false)

  if (!canPrompt) return null

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background px-4 py-3">
      <Download className="size-4 shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1 text-sm text-muted-foreground">
        Keep {app.name} on your home screen.
      </p>
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        onClick={async () => {
          setBusy(true)
          try {
            await install()
          } finally {
            setBusy(false)
          }
        }}
        disabled={busy}
      >
        <Download className="size-4 shrink-0" />
        Install {app.label}
      </button>
    </div>
  )
}
