import { useState } from 'react'
import { Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useInstallPrompt } from '@/hooks/use-install-prompt'

/**
 * The install action.
 *
 * It sits quietly under the hero rather than in a pop-up: the browser's own
 * dialog is used where there is one, and where there is not (Safari on iOS,
 * Firefox, Samsung Internet) the same button opens the short list of steps
 * that browser needs.
 */
export function InstallAppAction({ className }) {
  const { canPrompt, visible, manual, install } = useInstallPrompt()
  const [stepsOpen, setStepsOpen] = useState(false)
  const [prompting, setPrompting] = useState(false)

  if (!visible) return null
  if (!canPrompt && !manual && !prompting) return null

  const handleClick = async () => {
    if (canPrompt) {
      setPrompting(true)
      try {
        await install()
      } finally {
        setPrompting(false)
      }
      return
    }
    setStepsOpen((open) => !open)
  }

  return (
    <div className={cn('install-cta', className)}>
      <button
        type="button"
        className="install-btn"
        onClick={handleClick}
        disabled={prompting}
        aria-expanded={stepsOpen}
        aria-controls="dearune-install-steps"
      >
        <Download className="size-4" aria-hidden="true" />
        Install Dearune
      </button>

      {stepsOpen && manual && (
        <div className="install-steps" id="dearune-install-steps">
          <p className="install-steps-lead">To keep Dearune on your phone:</p>
          <ol>
            {manual.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
