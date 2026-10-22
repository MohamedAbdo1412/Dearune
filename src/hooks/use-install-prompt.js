import { useCallback, useSyncExternalStore } from 'react'
import {
  getInstallState,
  manualInstallBrowser,
  promptInstall,
  subscribeInstall,
} from '@/pwa/install'

/**
 * The install action for the landing page.
 *
 * `canPrompt` is true when the browser has offered its own install dialog.
 * Browsers that never offer one (Safari on iOS, Firefox, Samsung Internet)
 * are walked through it by hand instead.
 */
export function useInstallPrompt() {
  const state = useSyncExternalStore(subscribeInstall, getInstallState, getInstallState)

  const install = useCallback(async () => {
    const outcome = await promptInstall()
    return outcome
  }, [])

  const manual = manualInstallBrowser()

  return {
    ...state,
    manual,
    /** the browser can be walked through the install by hand */
    canInstallManually: Boolean(manual),
    /** the action belongs on the page */
    visible: !state.installed && !state.standalone && !state.dismissed,
    install,
  }
}
