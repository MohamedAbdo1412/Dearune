/**
 * The installable app.
 *
 * Serves the *built* site (dist/) the way Cloudflare does — the same
 * `_headers` file, the same single-page-application fallback, the same
 * `/api/*` handling — and then drives a real Chromium through it.
 *
 * Proves:
 *   - the manifest is served as a manifest and describes the Dearune app;
 *   - the service worker registers at the site root and caches the shell;
 *   - `/api/*` is never cached;
 *   - a direct visit to a deep route still boots the app;
 *   - the install action appears when the browser offers a prompt, asks the
 *     browser to install, and gets out of the way once it is installed or the
 *     offer is turned down;
 *   - a browser that never offers a prompt is given the steps instead.
 *
 * Run with:  npm run build && node e2e/pwa-install.mjs
 */

import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const DIST = join(ROOT, 'dist')
const PORT = 4319
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

    // worker.js: the health check and the /api/* guard.
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

    // not_found_handling: single-page-application
    const shell = await readFile(join(DIST, 'index.html'))
    return send(200, shell, MIME['.html'])
  })

  await new Promise((done) => server.listen(PORT, done))
  return server
}

const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail })
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

/** Puts a browser install prompt in the page, the way Chrome would. */
async function offerInstall(page, outcome = 'accepted') {
  await page.evaluate(() => {
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
  })
  await page.waitForSelector('.install-btn', { timeout: 5000 })
  return async () => {
    await page.evaluate((value) => window.__chooseInstall({ outcome: value }), outcome)
  }
}

async function main() {
  if (!existsSync(join(DIST, 'index.html'))) {
    console.error('dist/index.html is missing — run `npm run build` first.')
    process.exit(1)
  }

  const server = await serve()
  const browser = await chromium.launch()

  try {
    /* ---------------------------------------------------------- the shell */
    const context = await browser.newContext()
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(String(error)))

    await page.goto(`${BASE}/`, { waitUntil: 'load' })

    /* ------------------------------------------------------- the manifest */
    const manifest = await page.evaluate(async () => {
      const response = await fetch('/manifest.webmanifest')
      return {
        status: response.status,
        type: response.headers.get('content-type'),
        body: await response.json(),
      }
    })
    check('manifest is served', manifest.status === 200, `status ${manifest.status}`)
    check(
      'manifest has the manifest content type',
      manifest.type === 'application/manifest+json',
      String(manifest.type),
    )
    check('manifest names the app', manifest.body.name === 'Dearune', manifest.body.name)
    check('manifest short name', manifest.body.short_name === 'Dearune', manifest.body.short_name)
    check('manifest stands alone', manifest.body.display === 'standalone', manifest.body.display)
    check('manifest starts at the root', manifest.body.start_url === '/', manifest.body.start_url)
    check('manifest covers the site', manifest.body.scope === '/', manifest.body.scope)
    check(
      'manifest carries the brand colours',
      manifest.body.theme_color === '#32281e' && manifest.body.background_color === '#fbf4e4',
      `${manifest.body.theme_color} on ${manifest.body.background_color}`,
    )
    const purposes = (manifest.body.icons || []).map((icon) => icon.purpose)
    check(
      'manifest has an any and a maskable icon',
      purposes.includes('any') && purposes.includes('maskable'),
      purposes.join(', '),
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
      'every icon resolves',
      icons.every((icon) => icon.status === 200 && icon.type === 'image/png'),
      icons.map((icon) => `${icon.src} ${icon.status}`).join(', '),
    )

    /* -------------------------------------------------- the service worker */
    const registration = await page.evaluate(async () => {
      const ready = await navigator.serviceWorker.ready
      return { scope: ready.scope, script: ready.active?.scriptURL || '' }
    })
    check('the service worker registers', Boolean(registration.scope), registration.scope)
    check(
      'the service worker covers the site',
      new URL(registration.scope).pathname === '/',
      registration.scope,
    )
    check('the service worker is /sw.js', registration.script.endsWith('/sw.js'), registration.script)

    const swSource = await (await fetch(`${BASE}/sw.js`)).text()
    check(
      'the worker does not cache the API',
      swSource.includes('NetworkOnly') && swSource.includes('/api/'),
      'NetworkOnly for /api/*',
    )
    check(
      'the worker does not cache Supabase',
      swSource.includes('supabase.co'),
      'NetworkOnly for *.supabase.co',
    )
    check(
      'the worker does not pre-cache the shell',
      !swSource.includes('"url":"index.html"'),
      'the HTML is always fetched from the network',
    )

    /* ------------------------------------------------------- deep linking */
    await page.goto(`${BASE}/admin/login`, { waitUntil: 'load' })
    const adminBooted = await page.evaluate(() => document.querySelector('#root')?.children.length > 0)
    check('a direct visit to /admin/login boots the app', adminBooted)

    await page.goto(`${BASE}/message/DR7070`, { waitUntil: 'load' })
    const messageBooted = await page.evaluate(() => document.querySelector('#root')?.children.length > 0)
    check('a direct visit to /message/:id boots the app', messageBooted)

    /* ----------------------------------------------------------- caching */
    await page.goto(`${BASE}/`, { waitUntil: 'load' })
    await page.waitForTimeout(1200)
    const health = await page.evaluate(async () => {
      const response = await fetch('/api/health')
      return { status: response.status, body: await response.json() }
    })
    check('the API still answers', health.status === 200 && health.body.ok === true)

    const cached = await page.evaluate(async () => {
      const names = await caches.keys()
      const entries = []
      for (const name of names) {
        const cache = await caches.open(name)
        for (const request of await cache.keys()) entries.push(request.url)
      }
      return entries
    })
    check(
      'the API is never cached',
      !cached.some((url) => url.includes('/api/')),
      `${cached.length} cached entries`,
    )
    check(
      'the shell is cached for offline',
      cached.some((url) => url.endsWith('/') || url.endsWith('/index.html')),
      'the landing shell is in the cache',
    )

    /* -------------------------------------------------------- the install */
    const choose = await offerInstall(page, 'accepted')
    check('the install action appears when the browser offers a prompt', true)
    await page.click('.install-btn')
    const calls = await page.evaluate(() => window.__installCalls)
    check('the action asks the browser to install', calls === 1, `${calls} prompt call(s)`)
    await choose()
    await page.waitForSelector('.install-btn', { state: 'detached', timeout: 5000 })
    check('the action goes away once the app is installed', true)

    await page.goto(`${BASE}/`, { waitUntil: 'load' })
    const chooseAgain = await offerInstall(page, 'dismissed')
    await page.click('.install-btn')
    await chooseAgain()
    await page.waitForSelector('.install-btn', { state: 'detached', timeout: 5000 })
    const remembered = await page.evaluate(() => window.localStorage.getItem('dearune:install-dismissed'))
    check('a turned-down offer is remembered, not repeated', Boolean(remembered), String(remembered))

    /* --------------------------------- a browser that never offers a prompt */
    const iphone = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    })
    const iosPage = await iphone.newPage()
    await iosPage.goto(`${BASE}/`, { waitUntil: 'load' })
    await iosPage.waitForSelector('.install-btn', { timeout: 5000 })
    await iosPage.click('.install-btn')
    await iosPage.waitForSelector('.install-steps', { timeout: 5000 })
    const steps = await iosPage.textContent('.install-steps')
    check(
      'iOS is given the Share > Add to Home Screen steps',
      steps.includes('Share') && steps.includes('Add to Home Screen'),
      steps.replace(/\s+/g, ' ').slice(0, 80),
    )

    /* ------------------------------------------ an installed app stays quiet */
    const installed = await browser.newContext()
    const installedPage = await installed.newPage()
    await installedPage.addInitScript(() => {
      const original = window.matchMedia.bind(window)
      window.matchMedia = (query) =>
        query.includes('display-mode: standalone')
          ? { matches: true, media: query, addEventListener() {}, removeEventListener() {} }
          : original(query)
    })
    await installedPage.goto(`${BASE}/`, { waitUntil: 'load' })
    await installedPage.waitForTimeout(600)
    const quiet = await installedPage.locator('.install-btn').count()
    check('an installed app is not asked to install again', quiet === 0)

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
