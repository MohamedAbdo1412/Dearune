/**
 * The browser side of the three apps.
 *
 * Two jobs:
 *
 *   - point the page at the manifest of the app it belongs to, so that
 *     Chrome offers that app (and only that app) to install;
 *   - register that app's own service worker, bound to that app's scope.
 *
 * The workers do not overlap: each one is registered for one section, and
 * the browser keeps the most specific scope in charge of a URL. The main
 * website's worker stays at the root and never stands in front of an app.
 */

import { MAIN_MANIFEST, appForPath } from './apps'
import { setActiveApp } from './install'

/** apps whose worker is already registered in this page */
const registered = new Set()

/** The manifest a given app is described by. */
export function manifestFor(app) {
  return app ? app.manifestPath : MAIN_MANIFEST
}

/**
 * Points the document at one manifest, and only one.
 *
 * The website's own manifest is written into the page by the build; the
 * apps take it over while their own section is open, and give it back when
 * the user leaves.
 */
export function applyManifest(app) {
  if (typeof document === 'undefined') return
  const href = manifestFor(app)
  const links = Array.from(document.querySelectorAll('link[rel~="manifest"]'))
  let link = links[0]
  for (const extra of links.slice(1)) extra.remove()
  if (!link) {
    link = document.createElement('link')
    link.rel = 'manifest'
    document.head.appendChild(link)
  }
  if (link.getAttribute('href') !== href) link.setAttribute('href', href)
}

/**
 * Registers the app's own worker, for that app's scope and no other.
 *
 * The scope is wider than the script's own folder, which the browser only
 * allows because the script is served with a Service-Worker-Allowed header
 * (see public/_headers). Where that header is missing the registration is
 * refused — which is the safe way to fail: the app still works, it simply
 * cannot be installed from that host.
 */
export async function ensureAppServiceWorker(app) {
  if (!app || registered.has(app.id)) return
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  try {
    await navigator.serviceWorker.register(app.workerPath, { scope: app.scope })
    registered.add(app.id)
  } catch (error) {
    console.warn(`[dearune] the ${app.name} worker could not be registered:`, error)
  }
}

/**
 * Brings the page and the workers into line with the route the user is on.
 */
export function syncAppForPath(pathname) {
  const app = appForPath(pathname)
  setActiveApp(app ? app.id : null)
  applyManifest(app)
  if (app) void ensureAppServiceWorker(app)
}
