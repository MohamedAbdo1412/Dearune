/**
 * The three application manifests and the three application service workers.
 *
 * They are written from the one registry (src/pwa/apps.js) so that a route
 * can never drift away from the manifest, the icon or the worker that
 * belongs to it.
 *
 * Each app gets:
 *
 *   - its own manifest, with its own name, its own short name, its own
 *     icons, its own colours and its own start address;
 *   - its own service worker, bound to its own scope and nothing else.
 *
 * The scopes are /admin/qa, /admin/operations and /admin/designers. They do
 * not overlap, and the main website's worker keeps the root. The browser
 * gives a URL to the most specific scope that claims it, so an app's worker
 * only ever stands in front of its own section.
 *
 * Run with:  npm run app-assets
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DEARUNE_APPS, DEARUNE_THEME } from '../src/pwa/apps.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const MANIFEST_DIR = resolve(ROOT, 'public/manifests')
const ICON_DIR = resolve(ROOT, 'public/app-icons')
const PUBLIC_DIR = resolve(ROOT, 'public')

/* ------------------------------------------------------------------ manifest */

function manifestFor(app) {
  return {
    id: app.scope,
    name: app.name,
    short_name: app.shortName,
    description: app.description,
    lang: 'en',
    dir: 'ltr',
    start_url: app.startUrl,
    scope: app.scope,
    display: 'standalone',
    background_color: DEARUNE_THEME.backgroundColor,
    theme_color: DEARUNE_THEME.themeColor,
    categories: ['business', 'productivity', 'utilities'],
    icons: [
      {
        src: `/app-icons/dearune-${app.id}-192.png`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `/app-icons/dearune-${app.id}-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `/app-icons/dearune-${app.id}-maskable-192.png`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: `/app-icons/dearune-${app.id}-maskable-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}

/* -------------------------------------------------------------------- worker */

function workerFor(app) {
  const prefix = app.workerCache.replace(/v\\d+$/, '')
  return `/**
 * ${app.name} — the service worker for this app.
 *
 * Its scope is ${app.scope} and nothing else. The other two apps, and the
 * public website, are never touched by it: the browser hands each URL to
 * the most specific scope that claims it, and this one claims only its own
 * section.
 *
 * The cache holds one thing: the public HTML shell of this section, so the
 * desk still opens when the network is slow or gone. Everything the desk
 * actually shows — records, messages, orders, tokens — is fetched from
 * Supabase and is never written to a cache. The studio's own /api/ calls
 * and every other origin are left entirely alone.
 *
 * The scope is wider than this file's own folder, which the browser allows
 * only because the file is served with a Service-Worker-Allowed header (see
 * public/_headers). Where that header is missing the browser refuses the
 * registration, and the app simply carries on working without it.
 */

const CACHE = '${app.workerCache}'
const SECTION = '${app.scope}'

self.addEventListener('install', (event) => {
  // A new worker takes over at once, so a fresh deployment is picked up on
  // the next visit instead of waiting for every tab of the app to close.
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter((name) => name.startsWith('${prefix}') && name !== CACHE)
          .map((name) => caches.delete(name)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Other origins — Supabase among them — are none of our business.
  if (url.origin !== self.location.origin) return
  // The studio's own API answers with live records. It is never cached.
  if (url.pathname.startsWith('/api/')) return
  // Outside this app's section is not ours to answer.
  if (!url.pathname.startsWith(SECTION)) return

  // Only the page itself is ours; the scripts and styles it uses live in
  // /assets and belong to the website's own worker.
  if (request.mode !== 'navigate') return

  event.respondWith(networkFirst(request))
})

/**
 * The page comes from the network whenever the network answers, so a
 * deployment is never hidden behind a stale copy. The cached copy is only
 * reached when the network does not answer at all.
 */
async function networkFirst(request) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (response && response.ok && response.type === 'basic') {
      await cache.put(request, response.clone())
    }
    return response
  } catch (error) {
    const cached = await cache.match(request)
    if (cached) return cached
    throw error
  }
}
`
}

/* -------------------------------------------------------------------- main */

function main() {
  mkdirSync(MANIFEST_DIR, { recursive: true })

  for (const app of DEARUNE_APPS) {
    for (const icon of [
      `dearune-${app.id}-192.png`,
      `dearune-${app.id}-512.png`,
      `dearune-${app.id}-maskable-192.png`,
      `dearune-${app.id}-maskable-512.png`,
    ]) {
      const file = resolve(ICON_DIR, icon)
      if (!existsSync(file)) {
        throw new Error(
          `The ${app.name} icon is missing (${file}). Run "npm run app-assets" to draw it.`,
        )
      }
    }

    const manifestFile = resolve(MANIFEST_DIR, `dearune-${app.id}.webmanifest`)
    writeFileSync(manifestFile, `${JSON.stringify(manifestFor(app), null, 2)}\n`, 'utf8')
    console.log(`wrote ${manifestFile}`)

    const workerFile = resolve(PUBLIC_DIR, `sw-${app.id}.js`)
    writeFileSync(workerFile, workerFor(app), 'utf8')
    console.log(`wrote ${workerFile}`)
  }
}

try {
  main()
} catch (error) {
  console.error(error.message || error)
  process.exit(1)
}
