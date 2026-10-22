/**
 * The install prompt, kept out of React on purpose: the browser fires
 * `beforeinstallprompt` once it has read the manifest and registered the
 * service worker, and that can happen before the first render. The listener
 * therefore lives here, at module scope, and React subscribes to it.
 *
 * One page can only ever point at one manifest, so there is one prompt at a
 * time — and that prompt belongs to one app. The browser does not promise
 * anything else: a prompt raised for the QA manifest installs the QA app and
 * nothing else. So the prompt is stored together with the app it belongs to,
 * and it is only offered to that app.
 *
 * Nothing in the site depends on any of this. A browser that will not offer
 * an install simply never sets a prompt, and the action stays hidden.
 */

import { appForPath } from './apps'

const DISMISSED_KEY = 'dearune:install-dismissed'
const DISMISSED_FOR = 30 * 24 * 60 * 60 * 1000
const INSTALLED_KEY = 'dearune:installed-apps'

const listeners = new Set()

/** the app whose manifest the page is currently pointing at (null = the site) */
let activeAppId = null

/** { event, appId } — the browser's own offer, and whose app it is for */
let deferredPrompt = null

/** the app we last asked the browser to install, so appinstalled can be credited */
let pendingAppId = null

let dismissedUntil = 0

/** app ids the browser has told us about, through appinstalled */
let installedAppIds = new Set()

let snapshot = {
  /** the browser offered a native install prompt */
  canPrompt: false,
  /** the app the pending prompt belongs to (null = the main website) */
  promptAppId: null,
  /** the app is installed, or is running as an installed app */
  installed: false,
  /** the app is running in its own window */
  standalone: false,
  /** the offer was turned down recently, so it is not repeated */
  dismissed: false,
  /** the apps the browser has confirmed as installed */
  installedApps: [],
}

function emit(patch) {
  const next = { ...snapshot, ...patch }
  const changed = Object.keys(next).some((key) => next[key] !== snapshot[key])
  if (!changed) return
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

function readInstalledApps() {
  try {
    const raw = window.localStorage.getItem(INSTALLED_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

function writeInstalledApps(ids) {
  try {
    window.localStorage.setItem(INSTALLED_KEY, JSON.stringify([...ids]))
  } catch {
    /* private browsing: the record simply does not survive the session */
  }
}

if (typeof window !== 'undefined') {
  dismissedUntil = readDismissedUntil()
  installedAppIds = new Set(readInstalledApps())
  // The inline script in index.html has already worked out which app's
  // manifest this page is pointing at, before any of this ran.
  activeAppId = document.documentElement?.dataset?.dearuneApp || null
  const standalone = isStandalone()

  emit({
    installed: standalone,
    standalone,
    dismissed: Date.now() < dismissedUntil,
    installedApps: [...installedAppIds],
  })

  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep the event so the offer can be shown at a moment of our choosing.
    event.preventDefault()
    deferredPrompt = { event, appId: activeAppId }
    emit({ canPrompt: true, promptAppId: activeAppId })
  })

  window.addEventListener('appinstalled', () => {
    const appId = pendingAppId
    deferredPrompt = null
    pendingAppId = null
    if (appId) {
      installedAppIds = new Set([...installedAppIds, appId])
      writeInstalledApps(installedAppIds)
    }
    emit({
      canPrompt: false,
      promptAppId: null,
      installed: true,
      installedApps: [...installedAppIds],
    })
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
 * Tells the store which app the page is pointing at.
 *
 * When the page moves from one app's manifest to another's, the offer that
 * was raised for the old manifest is dropped: it must never be handed to the
 * new app, and it must never be handed to the main website either.
 */
export function setActiveApp(appId) {
  if (activeAppId === appId) return
  activeAppId = appId ?? null
  if (deferredPrompt && deferredPrompt.appId !== activeAppId) {
    deferredPrompt = null
    emit({ canPrompt: false, promptAppId: null })
  }
}

/** The app the page is currently pointing at (null = the main website). */
export function getActiveAppId() {
  return activeAppId
}

/**
 * Shows the browser's own install dialog.
 *
 * @param {string|null} appId the app that is being installed; null is the
 *   main website. A prompt raised for another app is never used.
 * @returns {Promise<'accepted'|'dismissed'|'unavailable'>}
 */
export async function promptInstall(appId = null) {
  if (!deferredPrompt || deferredPrompt.appId !== (appId ?? null)) return 'unavailable'
  const prompt = deferredPrompt
  deferredPrompt = null
  emit({ canPrompt: false, promptAppId: null })

  try {
    await prompt.event.prompt()
    const choice = await prompt.event.userChoice
    if (choice?.outcome === 'accepted') {
      pendingAppId = prompt.appId
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
 * Has this app been installed?
 *
 * Two honest answers only: the browser told us through appinstalled, or we
 * are running inside the app's own window. Nothing is guessed.
 */
export function isAppInstalled(app) {
  if (!app) return false
  if (installedAppIds.has(app.id)) return true
  if (isStandalone() && appForPath(window.location.pathname)?.id === app.id) return true
  return false
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

/**
 * The same walk-through, written for one named app: it tells the reader
 * which address to open, because that is where the browser will offer the
 * install.
 */
export function manualInstallSteps(app) {
  if (typeof navigator === 'undefined') return null
  const ua = navigator.userAgent || ''
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  if (isIos) {
    return {
      label: 'Add to Home Screen',
      steps: [
        `Open ${app.name} in Safari — ${app.startUrl}`,
        'Tap the Share button — the square with an arrow.',
        'Choose “Add to Home Screen”, then tap Add.',
      ],
    }
  }
  if (/SamsungBrowser/i.test(ua)) {
    return {
      label: 'Add to Home screen',
      steps: [
        `Open ${app.name} — ${app.startUrl}`,
        'Open the menu in your browser.',
        'Choose “Add to Home screen”, then confirm.',
      ],
    }
  }
  if (/Firefox|FxiOS/i.test(ua)) {
    return {
      label: 'Install',
      steps: [
        `Open ${app.name} — ${app.startUrl}`,
        'Open the menu in your browser.',
        'Choose “Install”, or “Add to Home screen”.',
      ],
    }
  }
  return {
    label: 'Install app',
    steps: [
      `Open ${app.name} in Chrome — ${app.startUrl}`,
      'Tap the ⋮ menu at the top of the browser.',
      'Choose “Install app”. On some phones it reads “Add to Home screen”.',
      'Confirm, and the app keeps its own icon on your home screen.',
    ],
  }
}
