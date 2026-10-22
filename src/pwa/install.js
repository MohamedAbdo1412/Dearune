/**
 * The install prompt, kept out of React on purpose: the browser fires
 * `beforeinstallprompt` once it has read the manifest and registered the
 * service worker, and that can happen before the first render. The listener
 * therefore lives here, at module scope, and React subscribes to it.
 *
 * Nothing in the site depends on any of this. A browser that will not offer
 * an install simply never sets a prompt, and the action stays hidden.
 */

const DISMISSED_KEY = 'dearune:install-dismissed'
const DISMISSED_FOR = 30 * 24 * 60 * 60 * 1000

const listeners = new Set()

let deferredPrompt = null
let dismissedUntil = 0

let snapshot = {
  /** the browser offered a native install prompt */
  canPrompt: false,
  /** the app is installed, or is running as an installed app */
  installed: false,
  /** the app is running in its own window */
  standalone: false,
  /** the offer was turned down recently, so it is not repeated */
  dismissed: false,
}

function emit(patch) {
  const next = { ...snapshot, ...patch }
  if (
    next.canPrompt === snapshot.canPrompt &&
    next.installed === snapshot.installed &&
    next.standalone === snapshot.standalone &&
    next.dismissed === snapshot.dismissed
  ) {
    return
  }
  snapshot = next
  for (const listener of listeners) listener()
}

function isStandalone() {
  if (typeof window === 'undefined') return false
  if (window.navigator.standalone === true) return true
  try {
    return window.matchMedia('(display-mode: standalone)').matches
  } catch {
    return false
  }
}

function readDismissedUntil() {
  try {
    return Number(window.localStorage.getItem(DISMISSED_KEY)) || 0
  } catch {
    return 0
  }
}

function writeDismissedUntil(value) {
  try {
    window.localStorage.setItem(DISMISSED_KEY, String(value))
  } catch {
    /* private browsing: the offer simply comes back another day */
  }
}

if (typeof window !== 'undefined') {
  dismissedUntil = readDismissedUntil()
  const standalone = isStandalone()

  emit({
    installed: standalone,
    standalone,
    dismissed: Date.now() < dismissedUntil,
  })

  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep the event so the offer can be shown at a moment of our choosing.
    event.preventDefault()
    deferredPrompt = event
    emit({ canPrompt: true })
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    emit({ canPrompt: false, installed: true })
  })

  try {
    const displayMode = window.matchMedia('(display-mode: standalone)')
    displayMode.addEventListener?.('change', (event) => {
      emit({ standalone: event.matches, installed: event.matches || snapshot.installed })
    })
  } catch {
    /* the media query is optional */
  }
}

export function subscribeInstall(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getInstallState() {
  return snapshot
}

/**
 * Shows the browser's own install dialog.
 * @returns {Promise<'accepted'|'dismissed'|'unavailable'>}
 */
export async function promptInstall() {
  if (!deferredPrompt) return 'unavailable'
  const prompt = deferredPrompt
  deferredPrompt = null
  emit({ canPrompt: false })

  try {
    await prompt.prompt()
    const choice = await prompt.userChoice
    if (choice?.outcome === 'accepted') {
      emit({ installed: true })
      return 'accepted'
    }
    dismissedUntil = Date.now() + DISMISSED_FOR
    writeDismissedUntil(dismissedUntil)
    emit({ dismissed: true })
    return 'dismissed'
  } catch {
    return 'unavailable'
  }
}

/**
 * Browsers that never raise `beforeinstallprompt` and have to be walked
 * through it by hand.
 */
export function manualInstallBrowser() {
  if (typeof navigator === 'undefined') return null
  const ua = navigator.userAgent || ''
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  if (isIos) {
    return {
      label: 'Add to Home Screen',
      steps: [
        'Tap the Share button in Safari — the square with an arrow.',
        'Choose “Add to Home Screen”.',
        'Tap Add. Dearune then opens from your home screen.',
      ],
    }
  }
  if (/SamsungBrowser/i.test(ua)) {
    return {
      label: 'Add to Home screen',
      steps: [
        'Open the menu in your browser.',
        'Choose “Add to Home screen”.',
        'Confirm, and Dearune is kept on your phone.',
      ],
    }
  }
  if (/Firefox|FxiOS/i.test(ua)) {
    return {
      label: 'Install',
      steps: [
        'Open the menu in your browser.',
        'Choose “Install”, or “Add to Home screen”.',
        'Dearune is then kept on your phone.',
      ],
    }
  }
  return null
}
