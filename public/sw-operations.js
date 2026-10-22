/**
 * Dearune Operations — the service worker for this app.
 *
 * Its scope is /admin/operations and nothing else. The other two apps, and the
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

const CACHE = 'dearune-app-operations-v1'
const SECTION = '/admin/operations'

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
          .filter((name) => name.startsWith('dearune-app-operations-v1') && name !== CACHE)
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
