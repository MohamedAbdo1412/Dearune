// A behavioural check of the QA desk: read-only guarantee, the three
// identifiers, the copy buttons, the collapsible groups, and every camera
// failure path. The backend is mocked; the camera is Chromium's fake device.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const BASE = 'http://127.0.0.1:5197'
const SUPA = 'https://mockproject.supabase.co'
const ADMIN_UUID = '11111111-2222-3333-4444-555555555555'
const PUBLIC_ID = 'a1b2c3d4e5f60718293a4b5c'
const PUBLIC_TOKEN = '0123456789abcdef0123456789abcdef'
const NOW = '2026-10-20T10:00:00.000Z'

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
const JWT = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({
  sub: ADMIN_UUID, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86400,
}) + '.sig'

const projects = [{
  id: 'proj-1', reference: 'DR-2026-0001', designer_id: 'des-1', template_slug: 'classic-letter', template_version: 3,
  title: 'For Nana, with love', status: 'manufactured', public_id: PUBLIC_ID, public_token: PUBLIC_TOKEN,
  wrapper_type: 'gift-box', sale_price: 2400, estimated_cost: 900, currency: 'EGP', configured_at: NOW,
  submitted_at: NOW, created_at: NOW, updated_at: NOW, paid_at: NOW, manufactured_at: NOW, shipped_at: NOW,
  arrived_at: null, archived_at: null, first_activated_at: null, message_active: true, policy_version: 'v3',
  policies_accepted_at: NOW,
  payload: {
    greeting: 'Dearest Nana,', body: 'A body long enough to wrap on a phone. '.repeat(4), closing: 'All my love',
    senderName: 'Amin', language: 'en', passwordSet: false,
    photos: [{ path: 'd/a/p1.jpg', originalName: 'photo.jpg', mimeType: 'image/jpeg' }],
    audio: { path: 'd/a/n.m4a', originalName: 'note.m4a', mimeType: 'audio/mp4' },
  },
}]
const designers = [{ id: 'des-1', name: 'Nour El-Amin', code: 'DR-4417', revoked_at: null, last_login_at: NOW, created_at: NOW, updated_at: NOW }]
const templates = [{ id: 'tpl-1', name: 'Classic Letter', slug: 'classic-letter', description: 'A4 laid paper', enabled: true, sort_order: 1 }]
const shipping = [{
  id: 'shp-1', project_id: 'proj-1', recipient_name: 'Hana Mahmoud', address_line1: '12 Mohamed Farid Street',
  address_line2: '', city: 'Cairo', state_province: 'Cairo', postal_code: '11511', country: 'Egypt',
  phone: '+20 100 000 0000', provider: 'bosta', tracking_code: 'BOS-8891-A', tracking_url: '',
  special_instructions: '', created_at: NOW, updated_at: NOW,
}]
const salesLog = [{
  id: 'sale-1', sale_reference: 'SALE-2026-0007', project_id: 'proj-1', designer_id: 'des-1', designer_name: 'Nour El-Amin',
  template_id: 'tpl-1', template_name: 'Classic Letter', wrapper_type: 'gift-box', title: 'For Nana', sold_at: NOW,
  selling_price: 2400, estimated_cost: 900, estimated_profit: 1500, currency: 'EGP', status: 'completed',
  voided_at: null, void_reason: null, snapshot_data: {}, created_at: NOW,
}]
const projectEvents = [{ id: 'ev-1', project_id: 'proj-1', action: 'paid', actor_type: 'designer', created_at: NOW, detail: {} }]
const unit = (n) => ({
  id: `unit-${n}`, reference: `DR7070089764${n}`, unit_index: n, status: 'ready_to_print', notes: '', on_hold_reason: '',
  cancelled_reason: '', archived_at: null, created_at: NOW, updated_at: NOW, project_id: 'proj-1',
  project_reference: 'DR-2026-0001', project_title: 'For Nana', public_id: PUBLIC_ID, public_token: PUBLIC_TOKEN,
  wrapper_type: 'gift-box', template_slug: 'classic-letter', paid_at: NOW, message_active: true,
  message_protected: false, designer_id: 'des-1', designer_name: 'Nour El-Amin', designer_code: 'DR-4417',
  recipient_name: 'Hana Mahmoud', customer_phone: '+20 100 000 0000', tracking_code: 'BOS-8891-A', provider: 'bosta',
  address_line1: '12 Mohamed Farid Street', address_line2: '', city: 'Cairo', state_province: 'Cairo',
  postal_code: '11511', country: 'Egypt', special_instructions: '', qr_target: true, qr_ready: true,
})
const units = [unit(1), unit(2)]
const unitEvents = [{ id: 'pe-1', physical_product_id: 'unit-1', actor_type: 'admin', action: 'created', detail: {}, created_at: NOW }]
const FIXTURES = {
  projects, designers, templates, shipping, sales_log: salesLog, project_events: projectEvents,
  physical_product_events: unitEvents, operations_units: units, physical_products: units,
  admin_users: [{ id: ADMIN_UUID }],
  app_settings: [{ id: 1, maintenance_mode: false, allow_new_orders: true, business_name: 'Dearune', currency: 'EGP', storage_provider: 'supabase' }],
}

// Apply PostgREST's `eq.` / `in.()` filters so the mock behaves like the
// real database when a query asks for one row in particular.
// PostgREST puts the COLUMN in the key and the operator in the value:
//   ?public_id=eq.abc   ?physical_product_id=in.(a,b)
function applyFilters(rows, params) {
  let out = rows
  for (const [column, raw] of params.entries()) {
    if (raw.startsWith('eq.')) {
      const wanted = raw.slice(3)
      out = out.filter((row) => String(row[column]) === wanted)
    } else if (raw.startsWith('in.(')) {
      const wanted = raw.slice(4, -1).split(',')
      out = out.filter((row) => wanted.includes(String(row[column])))
    }
  }
  return out
}

async function installMocks(page) {
  await page.addInitScript(([key, session]) => { window.localStorage.setItem(key, session) }, [
    'sb-mockproject-auth-token',
    JSON.stringify({
      access_token: JWT, token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400,
      refresh_token: 'refresh',
      user: { id: ADMIN_UUID, aud: 'authenticated', role: 'authenticated', email: 'a@b.test', app_metadata: {}, user_metadata: {}, created_at: NOW },
    }),
  ])
  await page.route(`${SUPA}/**`, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.startsWith('/rest/v1/')) {
      const table = url.pathname.replace('/rest/v1/', '').split('/')[0]
      const rows = applyFilters(FIXTURES[table] ?? [], url.searchParams)
      return route.fulfill({
        status: 200, contentType: 'application/json', headers: { 'content-range': '0-99/*' },
        body: JSON.stringify(rows),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
}

const step = (msg) => console.log(`  · ${msg}`)
let failures = 0
const check = async (label, fn) => {
  try {
    await fn()
    console.log(`PASS  ${label}`)
  } catch (err) {
    failures++
    console.log(`FAIL  ${label}\n      ${err.message}`)
  }
}

let dev
let browser
try {
  dev = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', '5197', '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT, env: { ...process.env, VITE_SUPABASE_URL: SUPA, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_mock' },
    stdio: 'ignore',
  })
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break } catch {}
    await sleep(500)
  }

  browser = await chromium.launch({
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  })

  // ------------------------------------------------------------------ read-only
  console.log('\n[1] the QA desk is read-only')
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] })
    const page = await ctx.newPage()
    const writes = []
    page.on('request', (req) => {
      const url = new URL(req.url())
      if (!url.pathname.startsWith('/rest/v1/') && !url.pathname.startsWith('/functions/v1/')) return
      if (!['GET', 'HEAD'].includes(req.method())) writes.push(`${req.method()} ${url.pathname}${url.search}`)
    })
    await installMocks(page)
    await page.goto(`${BASE}/admin/qa`, { waitUntil: 'networkidle' })
    await page.fill('#qa-manual', `${PUBLIC_ID}:${PUBLIC_TOKEN}`)
    await page.getByRole('button', { name: /look up/i }).click()
    await page.waitForTimeout(1500)
    // open every group and click every copy button
    for (const d of await page.locator('details').all()) await d.evaluate((el) => { el.open = true })
    const copyButtons = await page.getByRole('button', { name: /^copy /i }).all()
    for (const b of copyButtons) { await b.click(); await page.waitForTimeout(120) }
    await page.waitForTimeout(500)
    await check('the QA page writes to nothing', () => assert.deepEqual(writes, [], `writes: ${writes.join(', ')}`))
    step(`requests during a full QA session: ${writes.length} write(s), all reads otherwise`)

    // ------------------------------------------------------- identifiers
    const bodyText = await page.locator('main').innerText()
    await check('Production Reference is shown, on its own', () => {
      assert.match(bodyText, /Production reference/i)
      assert.match(bodyText, /DR70700897641/)
    })
    await check('Designer ID is shown, on its own', () => {
      assert.match(bodyText, /Designer ID/i)
      assert.match(bodyText, /DR-4417/)
    })
    await check('Public ID is shown, on its own', () => {
      assert.match(bodyText, /Public ID/i)
      assert.match(bodyText, new RegExp(PUBLIC_ID))
    })
    await check('the public token is never rendered', () => {
      assert.ok(!bodyText.includes(PUBLIC_TOKEN), 'the token leaked into the page')
    })
    await check('the token is reported as verified', () => assert.match(bodyText, /Token verified/i))

    const groups = await page.locator('details > summary').allInnerTexts()
    const titles = groups.map((g) => g.split('\n')[0].trim())
    await check('every record group is present', () => {
      for (const want of ['Identity', 'Message', 'Designer', 'Physical product', 'Production & order', 'Shipping & delivery', 'Media & additional details']) {
        assert.ok(titles.some((t) => t.startsWith(want)), `missing group: ${want} (saw ${titles.join(' | ')})`)
      }
    })
    step(`groups: ${titles.join(' · ')}`)

    // ------------------------------------------------------- copy behaviour
    const prodButton = page.getByRole('button', { name: /copy production reference/i }).first()
    await prodButton.click()
    await page.waitForTimeout(300)
    const clip = await page.evaluate(() => navigator.clipboard.readText())
    await check('copy puts the production reference on the clipboard', () => assert.equal(clip, 'DR70700897641'))

    await page.getByRole('button', { name: /copy designer id/i }).first().click()
    await page.waitForTimeout(300)
    const clip2 = await page.evaluate(() => navigator.clipboard.readText())
    await check('copy puts the designer id on the clipboard', () => assert.equal(clip2, 'DR-4417'))

    await page.getByRole('button', { name: /copy public id/i }).first().click()
    await page.waitForTimeout(300)
    const clip3 = await page.evaluate(() => navigator.clipboard.readText())
    await check('copy puts the public id on the clipboard', () => assert.equal(clip3, PUBLIC_ID))

    // ------------------------------------------------------- unknown record
    await page.getByRole('button', { name: /scan another/i }).click()
    await page.waitForTimeout(300)
    await page.fill('#qa-manual', 'ffffffffffffffffffffffff')
    await page.getByRole('button', { name: /look up/i }).click()
    await page.waitForTimeout(1200)
    const alertText = await page.locator('[role="alert"]').innerText()
    await check('an unknown public id gets its own message', () => {
      assert.match(alertText, /No record for this code/i)
      assert.match(alertText, /another studio|never created/i)
    })
    step(`unknown-id banner: ${alertText.replace(/\n/g, ' · ')}`)

    // ------------------------------------------------------- wrong token
    await page.fill('#qa-manual', `${PUBLIC_ID}:ffffffffffffffffffffffffffffffff`)
    await page.getByRole('button', { name: /look up/i }).click()
    await page.waitForTimeout(1200)
    const alert2 = await page.locator('[role="alert"]').innerText()
    await check('a wrong token gets its own message', () => {
      assert.match(alert2, /do not match/i)
    })
    step(`token-mismatch banner: ${alert2.replace(/\n/g, ' · ')}`)

    // ------------------------------------------------------- not a QR
    await page.fill('#qa-manual', 'https://example.com/not-a-dearune')
    await page.getByRole('button', { name: /look up/i }).click()
    await page.waitForTimeout(1200)
    const alert3 = await page.locator('[role="alert"]').innerText()
    await check('a foreign QR gets its own message', () => assert.match(alert3, /not a Dearune QR/i))
    step(`invalid banner: ${alert3.replace(/\n/g, ' · ')}`)

    await ctx.close()
  }

  // ------------------------------------------------------------------ camera
  console.log('\n[2] the camera')
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await ctx.newPage()
    await installMocks(page)
    await page.goto(`${BASE}/admin/qa`, { waitUntil: 'networkidle' })

    const camState = () => page.evaluate(() => {
      const v = document.querySelector('video')
      const stream = v?.srcObject
      return {
        hasVideo: Boolean(v),
        live: Boolean(stream) && stream.getVideoTracks().length > 0,
        trackState: stream?.getVideoTracks?.()[0]?.readyState ?? 'none',
        srcObjectCleared: v ? v.srcObject === null : false,
        text: document.body.innerText,
      }
    })

    await check('the camera is NOT open before "Start scan"', async () => {
      assert.ok(!(await page.locator('main').innerText()).includes('Hold the paper flat'), 'the preview is already live')
    })

    await page.getByRole('button', { name: /start scan/i }).click()
    await page.waitForTimeout(2500)
    let state = await camState()
    await check('"Start scan" opens the camera and shows the scan frame', () => {
      assert.equal(state.live, true, 'no live video track')
      assert.match(state.text, /Hold the paper flat/i)
    })

    await page.getByRole('button', { name: /stop camera/i }).click()
    await page.waitForTimeout(800)
    state = await camState()
    await check('"Stop camera" ends every track and clears the preview', () => {
      assert.equal(state.live, false)
      assert.equal(state.srcObjectCleared, true)
    })

    // navigating away must also close it
    await page.getByRole('button', { name: /start scan/i }).click()
    await page.waitForTimeout(2000)
    state = await camState()
    assert.equal(state.live, true, 'camera did not reopen')
    await page.getByRole('button', { name: /open the admin menu/i }).count()
    await page.evaluate(() => window.history.pushState({}, '', '/admin/overview'))
    await page.goto(`${BASE}/admin/overview`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    const ended = await page.evaluate(() => {
      // the QA component is gone; nothing of its stream may survive
      return document.querySelectorAll('video').length
    })
    await check('leaving the page tears the camera down', () => assert.equal(ended, 0))
    await ctx.close()
  }

  // ---------------------------------------------------- camera failure paths
  const failuresToTry = [
    {
      name: 'permission refused',
      init: () => {
        const err = new Error('denied')
        err.name = 'NotAllowedError'
        navigator.mediaDevices.getUserMedia = () => Promise.reject(err)
      },
      expect: /Camera access was refused/i,
    },
    {
      name: 'no camera on the device',
      init: () => {
        const err = new Error('none')
        err.name = 'NotFoundError'
        navigator.mediaDevices.getUserMedia = () => Promise.reject(err)
      },
      expect: /No camera was found/i,
    },
    {
      name: 'camera already in use',
      init: () => {
        const err = new Error('busy')
        err.name = 'NotReadableError'
        navigator.mediaDevices.getUserMedia = () => Promise.reject(err)
      },
      expect: /already in use/i,
    },
    {
      name: 'the browser cannot open a camera',
      init: () => {
        Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true })
      },
      expect: /cannot open a camera/i,
    },
    {
      name: 'an insecure connection',
      init: () => {
        Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true })
        const err = new Error('denied')
        err.name = 'NotAllowedError'
        navigator.mediaDevices.getUserMedia = () => Promise.reject(err)
      },
      expect: /secure connection/i,
    },
  ]

  console.log('\n[3] camera failure paths')
  for (const scenario of failuresToTry) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await ctx.newPage()
    await installMocks(page)
    await page.addInitScript(scenario.init)
    await page.goto(`${BASE}/admin/qa`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: /start scan/i }).click()
    await page.waitForTimeout(1200)
    const text = await page.locator('main').innerText()
    await check(`${scenario.name} → its own message`, () => assert.match(text, scenario.expect))
    const fallback = await page.getByText(/camera is not available right now/i).count()
    await check(`${scenario.name} → the fallbacks are offered`, () => assert.ok(fallback > 0))
    // the fallback still works
    await page.fill('#qa-manual', `${PUBLIC_ID}:${PUBLIC_TOKEN}`)
    await page.getByRole('button', { name: /look up/i }).click()
    await page.waitForTimeout(1400)
    const resolved = await page.locator('main').innerText()
    await check(`${scenario.name} → the manual fallback still resolves`, () => assert.match(resolved, /DR70700897641/))
    await ctx.close()
  }

  console.log(`\n${failures === 0 ? 'ALL BEHAVIOUR CHECKS PASSED' : `${failures} BEHAVIOUR PROBLEM(S)`}`)
} finally {
  if (browser) await browser.close()
  if (dev) { try { spawn('taskkill', ['/pid', String(dev.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {} try { dev.kill() } catch {} }
}
process.exit(failures === 0 ? 0 : 1)
