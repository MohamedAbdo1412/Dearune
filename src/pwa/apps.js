/**
 * The three Dearune apps.
 *
 * One list, read by three different hands:
 *
 *   - the page decides which manifest the browser is looking at, so that
 *     Chrome offers the right app to install;
 *   - the route decides which app owns which URL, so that no app's service
 *     worker ever stands in front of another app's pages;
 *   - the build script (scripts/generate-app-pwa.mjs) writes the manifests
 *     and the workers from exactly this list.
 *
 * Nothing in this file touches the browser, so the build script can read it
 * in Node the way the site reads it in the page.
 *
 * The routes are the routes the studio already has. These apps are entry
 * points to the existing desks, not new places and not new screens.
 */

/** The Dearune paper and ink, shared with the main site (src/styles/landing.css). */
export const DEARUNE_THEME = {
  themeColor: '#32281e',
  backgroundColor: '#fbf4e4',
}

/** The manifest the main website uses. The apps fall back to it. */
export const MAIN_MANIFEST = '/manifest.webmanifest'

export const DEARUNE_APPS = [
  {
    id: 'qa',
    name: 'Dearune QA',
    label: 'QA',
    shortName: 'Dearune QA',
    description:
      'Scan QR codes and verify Dearune messages, references and production information.',
    /** the existing admin route — where the desk already lives */
    route: '/admin/qa',
    /** where the installed app opens */
    startUrl: '/admin/qa',
    /** what the app is allowed to cover; the worker is bound to it too */
    scope: '/admin/qa',
    manifestPath: '/manifests/dearune-qa.webmanifest',
    workerPath: '/sw-qa.js',
    iconPath: '/app-icons/dearune-qa-192.png',
    workerCache: 'dearune-app-qa-v1',
  },
  {
    id: 'operations',
    name: 'Dearune Operations',
    label: 'Operations',
    shortName: 'Dearune Ops',
    description:
      'Manage orders, production stages, manufacturing information and operational documents.',
    route: '/admin/operations',
    startUrl: '/admin/operations',
    scope: '/admin/operations',
    manifestPath: '/manifests/dearune-operations.webmanifest',
    workerPath: '/sw-operations.js',
    iconPath: '/app-icons/dearune-operations-192.png',
    workerCache: 'dearune-app-operations-v1',
  },
  {
    id: 'designer',
    name: 'Dearune Designer',
    label: 'Designer',
    shortName: 'Dearune Design',
    description: 'Access design work and prepare personalized customer messages.',
    route: '/admin/designers',
    startUrl: '/admin/designers',
    scope: '/admin/designers',
    manifestPath: '/manifests/dearune-designer.webmanifest',
    workerPath: '/sw-designer.js',
    iconPath: '/app-icons/dearune-designer-192.png',
    workerCache: 'dearune-app-designer-v1',
  },
]

/**
 * The app that owns a URL, or null when the URL belongs to the website.
 *
 * The comparison is on a path boundary, so /admin/operations/print belongs
 * to Operations and /admin/qa-scrap belongs to nobody.
 */
export function appForPath(pathname) {
  if (typeof pathname !== 'string' || !pathname) return null
  return (
    DEARUNE_APPS.find(
      (app) => pathname === app.scope || pathname.startsWith(`${app.scope}/`),
    ) ?? null
  )
}

/** The app an install prompt belongs to, or null for the main website. */
export function appById(id) {
  if (!id) return null
  return DEARUNE_APPS.find((app) => app.id === id) ?? null
}
