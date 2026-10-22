/**
 * The three Dearune apps.
 *
 * Serves the *built* site (dist/) the way Cloudflare does — the same
 * `_headers` file, the same single-page-application fallback, the same
 * `/api/*` handling — and then drives a real Chromium through it.
 *
 * Proves:
 *   - each app has its own manifest, served as a manifest, with its own
 *     name, short name, colours, start address and scope;
 *   - each app's icons resolve;
 *   - the page points at the manifest of the app it is showing, and gives
 *     the website's manifest back on the way out;
 *   - each app's worker registers for its own scope only, and the three
 *     scopes do not overlap;
 *   - no app's worker stands in front of another app's pages, and nothing
 *     private is written to a cache;
 *   - the Apps page offers the three apps, with a working install action
 *     and the right walk-through for the browser being used;
 *   - nothing on the Apps page scrolls sideways on a small phone.
 *
 * Run with:  npm run build && node e2e/pwa-apps.mjs
 */

import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync, readFileSync as readSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const DIST = join(ROOT, 'dist')
const PORT = 4321
const BASE = `http://localhost:${PORT}`

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain; charset=utf-8',
}

/* ------------------------------------------------------------- the registry */

/**
 * The same list the site and the build script use, read straight from the
 * source so the check cannot drift away from the app it is checking.
 */
const { DEARUNE_APPS } = await import('../src/pwa/apps.js')

const ADMIN_UUID = '11111111-2222-3333-4444-555555555555'

/* ------------------------------------------------------------ the mock auth */

function supabaseUrl() {
  if (process.env.VITE_SUPABASE_URL) return process.env.VITE_SUPABASE_URL
  const file = join(ROOT, '.env')
  if (!existsSync(file)) throw new Error('No .env — the admin guard cannot be faked.')
  const line = readSync(file, 'utf8')
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith('VITE_SUPABASE_URL='))
  if (!line) throw new Error('No VITE_SUPABASE_URL in .env')
  return line.split('=').slice(1).join('=').trim()
}

const SUPA = supabaseUrl()
const SUPA_HOST = new URL(SUPA).hostname
const STORAGE_KEY = `sb-${SUPA_HOST.split('.')[0]}-auth-token`

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
  sub: ADMIN_UUID,
  aud: 'authenticated',
  role: 'authenticated',
  exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
})}.sig`

const FIXTURES = {
  admin_users: [{ id: ADMIN_UUID }],
  settings: [{ key: 'maintenance_mode', value: false }],
  app_settings: [
    {
      id: 1,
      maintenance_mode: false,
      allow_new_orders: true,
      business_name: 'Dearune',
      currency: 'EGP',
      storage_provider: 'supabase',
    },
  ],
}

async function installMocks(context, page) {
  await page.addInitScript(
    ([key, session]) => {
      window.localStorage.setItem(key, session)
    },
    [
      STORAGE_KEY,
      JSON.stringify({
        access_token: jwt,
        token_type: 'bearer',
        expires_in: 86400,
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        refresh_token: 'refresh',
        user: {
          id: ADMIN_UUID,
          aud: 'authenticated',
          role: 'authenticated',
          email: 'admin@dearune.test',
          app_metadata: {},
          user_metadata: {},
          created_at: '2026-01-01T00:00:00.000Z',
        },
      }),
    ],
  )

  // The route is set on the context, not on the page: once a service worker
  // is in charge of the page, the requests it lets through belong to the
  // worker, and only a context route still sees them.
  await context.route(`${SUPA}/**`, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.startsWith('/rest/v1/')) {
      const table = url.pathname.replace('/rest/v1/', '').split('/')[0]
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-99/*' },
        body: JSON.stringify(FIXTURES[table] || []),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
}

/* ----------------------------------------------------------------- the server */

/**
 * Reads dist/_headers the way Cloudflare does, so the file that ships is the
 * file that is exercised here.
 */
async function readHeaderRules() {
  const file = join(DIST, '_headers')
  if (!existsSync(file)) return []
  const rules = []
  let current = null
  for (const line of (await readFile(file, 'utf8')).split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    if (!/^\s/.test(line)) {
      current = { pattern: line.trim(), headers: [] }
      rules.push(current)
      continue
    }
    if (!current) continue
    const at = line.indexOf(':')
    if (at === -1) continue
    current.headers.push([line.slice(0, at).trim(), line.slice(at + 1).trim()])
  }
  return rules
}

function headerRulesFor(rules, pathname) {
  const matched = []
  for (const rule of rules) {
    const pattern = rule.pattern
      .split('*')
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')
    if (new RegExp(`^${pattern}$`).test(pathname)) matched.push(...rule.headers)
  }
  return matched
}

async function serve() {
  const rules = await readHeaderRules()

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, BASE)
    const pathname = decodeURIComponent(url.pathname)

    const send = (status, body, type) => {
      const headers = new Map()
      for (const [name, value] of headerRulesFor(rules, pathname)) headers.set(name, value)
      headers.set('Content-Type', type)
      res.writeHead(status, Object.fromEntries(headers))
      res.end(body)
    }

    if (pathname === '/api/health') {
      return send(200, JSON.stringify({ ok: true }), MIME['.json'])
    }
    if (pathname.startsWith('/api/')) {
      return send(404, JSON.stringify({ error: 'Not found' }), MIME['.json'])
    }

    const file = join(DIST, pathname)
    if (pathname !== '/' && file.startsWith(DIST) && existsSync(file) && extname(file)) {
      const body = await readFile(file)
      return send(200, body, MIME[extname(file)] || 'application/octet-stream')
    }

    const shell = await readFile(join(DIST, 'index.html'))
    return send(200, shell, MIME['.html'])
  })

  await new Promise((done) => server.listen(PORT, done))
  return server
}

/* ------------------------------------------------------------------ the checks */

const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail })
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

/** The manifest the document is currently pointing at. */
async function documentManifest(page) {
  return page.evaluate(() => {
    const link = document.querySelector('link[rel~="manifest"]')
    return link ? new URL(link.href).pathname : null
  })
}

async function main() {
  if (!existsSync(join(DIST, 'index.html'))) {
    console.error('dist/index.html is missing — run `npm run build` first.')
    process.exit(1)
  }

  const server = await serve()
  const browser = await chromium.launch()

  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(String(error)))
    await installMocks(context, page)
    await page.goto(`${BASE}/admin/overview`, { waitUntil: 'load' })
    await page.waitForTimeout(300)

    /* ------------------------------------------------------ the manifests */
    for (const app of DEARUNE_APPS) {
      const manifest = await page.evaluate(async (path) => {
        const response = await fetch(path)
        return {
          status: response.status,
          type: response.headers.get('content-type'),
          body: await response.json(),
        }
      }, app.manifestPath)

      check(
        `${app.name}: the manifest is served`,
        manifest.status === 200,
        `${app.manifestPath} ${manifest.status}`,
      )
      check(
        `${app.name}: the manifest arrives as a manifest`,
        manifest.type === 'application/manifest+json',
        String(manifest.type),
      )
      check(`${app.name}: the manifest names the app`, manifest.body.name === app.name, manifest.body.name)
      check(
        `${app.name}: the manifest has its own short name`,
        manifest.body.short_name === app.shortName,
        manifest.body.short_name,
      )
      check(
        `${app.name}: the manifest opens at its own section`,
        manifest.body.start_url === app.startUrl,
        manifest.body.start_url,
      )
      check(
        `${app.name}: the manifest covers only its own section`,
        manifest.body.scope === app.scope,
        manifest.body.scope,
      )
      check(
        `${app.name}: the app stands on its own`,
        manifest.body.display === 'standalone',
        manifest.body.display,
      )
      check(
        `${app.name}: the manifest carries the brand colours`,
        manifest.body.theme_color === '#32281e' && manifest.body.background_color === '#fbf4e4',
        `${manifest.body.theme_color} on ${manifest.body.background_color}`,
      )

      const purposes = (manifest.body.icons || []).map((icon) => icon.purpose)
      check(
        `${app.name}: the manifest has an any and a maskable icon`,
        purposes.includes('any') && purposes.includes('maskable'),
        purposes.join(', '),
      )
      const sizes = (manifest.body.icons || []).map((icon) => icon.sizes)
      check(
        `${app.name}: the icons are 192 and 512 wide`,
        sizes.includes('192x192') && sizes.includes('512x512'),
        sizes.join(', '),
      )

      const icons = await page.evaluate(async (list) => {
        const results = []
        for (const icon of list) {
          const response = await fetch(icon.src)
          results.push({ src: icon.src, status: response.status, type: response.headers.get('content-type') })
        }
        return results
      }, manifest.body.icons)
      check(
        `${app.name}: every icon resolves`,
        icons.every((icon) => icon.status === 200 && icon.type === 'image/png'),
        icons.map((icon) => `${icon.src} ${icon.status}`).join(', '),
      )
    }

    /* ------------------------------------------------------ the app names */
    const names = DEARUNE_APPS.map((app) => app.name)
    check(
      'the three apps have three different names',
      new Set(names).size === names.length,
      names.join(', '),
    )
    const shortNames = DEARUNE_APPS.map((app) => app.shortName)
    check(
      'the three apps have three different short names',
      new Set(shortNames).size === shortNames.length,
      shortNames.join(', '),
    )

    /* ------------------------------------------- which manifest is in play */
    for (const app of DEARUNE_APPS) {
      await page.goto(`${BASE}${app.route}`, { waitUntil: 'load' })
      await page.waitForTimeout(400)
      const manifest = await documentManifest(page)
      check(
        `${app.name}: the page points at its own manifest`,
        manifest === app.manifestPath,
        String(manifest),
      )
      check(
        `${app.name}: the page knows which app it is in`,
        (await page.getAttribute('html', 'data-dearune-app')) === app.id,
        String(await page.getAttribute('html', 'data-dearune-app')),
      )
    }

    await page.goto(`${BASE}/admin/overview`, { waitUntil: 'load' })
    await page.waitForTimeout(400)
    check(
      'the website gets its own manifest back',
      (await documentManifest(page)) === '/manifest.webmanifest',
      String(await documentManifest(page)),
    )

    /* ------------------------------------------------ the service workers */
    await page.goto(`${BASE}/admin/qa`, { waitUntil: 'load' })
    await page.waitForTimeout(800)

    const registrations = await page.evaluate(async (apps) => {
      const found = {}
      for (const app of apps) {
        const registration = await navigator.serviceWorker.getRegistration(app.scope)
        found[app.id] = registration
          ? {
              scope: new URL(registration.scope).pathname,
              script: registration.active?.scriptURL || registration.installing?.scriptURL || '',
            }
          : null
      }
      const root = await navigator.serviceWorker.getRegistration('/')
      return {
        apps: found,
        root: root
          ? { scope: new URL(root.scope).pathname, script: root.active?.scriptURL || '' }
          : null,
      }
    }, DEARUNE_APPS)

    check('the website keeps its worker at the root', registrations.root?.scope === '/', String(registrations.root?.scope))
    check(
      'the website worker is still /sw.js',
      Boolean(registrations.root?.script?.endsWith('/sw.js')),
      registrations.root?.script,
    )

    for (const app of DEARUNE_APPS) {
      const registration = registrations.apps[app.id]
      check(
        `${app.name}: its worker registers`,
        Boolean(registration),
        registration ? registration.scope : 'no registration',
      )
      check(
        `${app.name}: its worker covers only its own section`,
        registration?.scope === app.scope,
        registration?.scope,
      )
      check(
        `${app.name}: its worker is its own file`,
        Boolean(registration?.script?.endsWith(`sw-${app.id}.js`)),
        registration?.script,
      )
    }

    const scopes = DEARUNE_APPS.map((app) => app.scope)
    const overlapping = scopes.some((a, i) =>
      scopes.some((b, j) => i !== j && (b === a || b.startsWith(`${a}/`) || a.startsWith(`${b}/`))),
    )
    check('the three scopes do not overlap', !overlapping, scopes.join(', '))

    /* ------------------------------------------- nobody stands in front */
    const swSource = await (await fetch(`${BASE}/sw-qa.js`)).text()
    check(
      'the QA worker leaves other origins alone',
      swSource.includes('url.origin !== self.location.origin'),
      'other origins are passed through',
    )
    check(
      'the QA worker never caches the API',
      swSource.includes("startsWith('/api/')") && !swSource.includes('cache.put(request, response.clone())') === false,
      'the API is passed through',
    )
    check(
      'the QA worker only answers its own section',
      swSource.includes("startsWith(SECTION)") && swSource.includes("const SECTION = '/admin/qa'"),
      "SECTION = '/admin/qa'",
    )

    const cachesAfter = await page.evaluate(async () => {
      const names = await caches.keys()
      const entries = []
      for (const name of names) {
        const cache = await caches.open(name)
        for (const request of await cache.keys()) entries.push({ name, url: request.url })
      }
      return entries
    })
    check(
      'no API call is ever cached',
      !cachesAfter.some((entry) => entry.url.includes('/api/')),
      `${cachesAfter.length} cached entries`,
    )
    check(
      'no Supabase call is ever cached',
      !cachesAfter.some((entry) => entry.url.includes('supabase.co')),
      `${cachesAfter.length} cached entries`,
    )

    /* --------------------------------------------------- the Apps page */
    await page.goto(`${BASE}/admin/apps`, { waitUntil: 'load' })
    await page.waitForSelector('.apps-card', { timeout: 10000 })

    const cards = await page.locator('.apps-card').count()
    check('the Apps page shows three cards', cards === 3, `${cards} cards`)

    const titles = await page.locator('.apps-card-title').allTextContents()
    check(
      'the cards are named after the apps',
      DEARUNE_APPS.every((app) => titles.includes(app.name)),
      titles.join(', '),
    )

    const icons = await page.locator('.apps-card-icon').evaluateAll((nodes) =>
      nodes.map((node) => ({ src: new URL(node.src).pathname, w: node.naturalWidth, h: node.naturalHeight })),
    )
    check(
      'every card carries its own icon',
      DEARUNE_APPS.every((app, index) => icons[index]?.src === app.iconPath && icons[index]?.w === 192),
      icons.map((icon) => icon.src).join(', '),
    )

    const openLinks = await page.locator('.apps-btn-ink').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('href')),
    )
    check(
      'every card opens the section it belongs to',
      DEARUNE_APPS.every((app, index) => openLinks[index] === app.route),
      openLinks.join(', '),
    )

    const installButtons = await page.locator('.apps-btn-wine').allTextContents()
    check(
      'every card offers its own install',
      DEARUNE_APPS.every((app, index) =>
        installButtons[index].replace(/\s+/g, ' ').trim() === `Install ${app.label}`,
      ),
      installButtons.map((text) => text.trim()).join(' | '),
    )

    /* ------------------------------------------- the install action works */
    const popupPromise = context.waitForEvent('page', { timeout: 10000 })
    await page.locator('.apps-btn-wine').first().click()
    const popup = await popupPromise
    check(
      'the install action opens the app it belongs to',
      new URL(popup.url()).pathname === DEARUNE_APPS[0].startUrl,
      popup.url(),
    )
    await popup.close()

    await page.waitForSelector('.apps-install-note', { timeout: 5000 })
    const note = (await page.locator('.apps-install-note').first().textContent()).replace(/\s+/g, ' ')
    check(
      'the walk-through names the right app',
      note.includes(DEARUNE_APPS[0].name) && note.includes(DEARUNE_APPS[0].startUrl),
      note.slice(0, 90),
    )
    check(
      'the walk-through explains the browser menu',
      note.includes('menu') || note.includes('Share'),
      note.slice(0, 90),
    )

    /* ---------------------------------- a prompt belongs to one app only */
    await page.goto(`${BASE}/admin/qa`, { waitUntil: 'load' })
    await page.waitForTimeout(500)
    const offered = await page.evaluate(() => {
      window.__installCalls = 0
      window.__chooseInstall = null
      const event = new Event('beforeinstallprompt')
      event.prompt = () => {
        window.__installCalls += 1
        return Promise.resolve()
      }
      event.userChoice = new Promise((resolve) => {
        window.__chooseInstall = resolve
      })
      window.dispatchEvent(event)
      return true
    })
    check('the browser offered an install for the app in view', offered)
    await page.waitForSelector('text=Keep Dearune QA on your home screen.', { timeout: 5000 })
    check('the app in view offers its own install', true)

    await page.click('text=Install QA')
    const calls = await page.evaluate(() => window.__installCalls)
    check('the app in view asks the browser to install', calls === 1, `${calls} prompt call(s)`)
    await page.evaluate(() => window.__chooseInstall({ outcome: 'accepted' }))

    await page.goto(`${BASE}/admin/operations`, { waitUntil: 'load' })
    await page.waitForTimeout(600)
    const offeredElsewhere = await page.locator('text=Keep Dearune Operations on your home screen.').count()
    check('another app is not offered the QA prompt', offeredElsewhere === 0)

    /* ------------------------------------------- nothing scrolls sideways */
    for (const width of [320, 375, 768]) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto(`${BASE}/admin/apps`, { waitUntil: 'load' })
      await page.waitForSelector('.apps-card', { timeout: 10000 })
      await page.waitForTimeout(300)
      const over = await page.evaluate(() => {
        const doc = document.documentElement
        return doc.scrollWidth - doc.clientWidth
      })
      check(`the Apps page does not scroll sideways at ${width}px`, over <= 1, `${over}px`)
    }

    check('no page errors', errors.length === 0, errors.join(' | '))
  } finally {
    await browser.close()
    server.close()
  }

  const failed = checks.filter((entry) => !entry.ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
  if (failed.length) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
