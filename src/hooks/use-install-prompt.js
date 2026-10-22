import { useCallback, useSyncExternalStore } from 'react'
import {
  getInstallState,
  isAppInstalled,
  manualInstallBrowser,
  manualInstallSteps,
  promptInstall,
  subscribeInstall,
} from '@/pwa/install'

/**
 * The install action for the landing page.
 *
 * `canPrompt` is true when the browser has offered its own install dialog
 * for the Dearune website itself. Browsers that never offer one (Safari on
 * iOS, Firefox, Samsung Internet) are walked through it by hand instead.
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
    /** a prompt raised for another app is never used for the website */
    canPrompt: state.canPrompt && state.promptAppId === null,
    manual,
    /** the browser can be walked through the install by hand */
    canInstallManually: Boolean(manual),
    /** the action belongs on the page */
    visible: !state.installed && !state.standalone && !state.dismissed,
    install,
  }
}

/**
 * The install action for one of the three apps.
 *
 * The browser only ever offers one install at a time, and only for the app
 * whose manifest the page is pointing at — so this is true only when the
 * user is inside that app's own section. Everywhere else the app is walked
 * through by hand, which is what the Apps page does.
 */
export function useAppInstall(app) {
  const state = useSyncExternalStore(subscribeInstall, getInstallState, getInstallState)

  const install = useCallback(async () => {
    const outcome = await promptInstall(app.id)
    return outcome
  }, [app.id])

  return {
    /** the browser offered its own dialog for this app */
    canPrompt: state.canPrompt && state.promptAppId === app.id,
    /** the browser has told us this app is installed */
    installed: isAppInstalled(app),
    /** the steps for the browser this reader is using */
    steps: manualInstallSteps(app),
    install,
  }
}
