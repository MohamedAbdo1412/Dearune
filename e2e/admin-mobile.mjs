// A browser check of the admin dashboard at phone widths.
// The backend is MOCKED: every PostgREST call is answered from a fixture, so
// the real UI renders with realistic rows without touching the live archive.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const BASE = 'http://127.0.0.1:5199'
const SUPA = 'https://mockproject.supabase.co'
const ADMIN_UUID = '11111111-2222-3333-4444-555555555555'
const PUBLIC_ID = 'a1b2c3d4e5f60718293a4b5c'
const PUBLIC_TOKEN = '0123456789abcdef0123456789abcdef'

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
const jwt = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({
  sub: ADMIN_UUID, aud: 'authenticated', role: 'authenticated',
  exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
}) + '.sig'

const now = '2026-10-20T10:00:00.000Z'

const projects = [{
  id: 'proj-1', reference: 'DR-2026-0001', designer_id: 'des-1', template_slug: 'classic-letter',
  template_version: 3, title: 'For Nana, with love and a very long address indeed',
  status: 'manufactured', public_id: PUBLIC_ID, public_token: PUBLIC_TOKEN, wrapper_type: 'gift-box',
  sale_price: 2400, estimated_cost: 900, currency: 'EGP', configured_at: now, submitted_at: now,
  created_at: now, updated_at: now, paid_at: now, manufactured_at: now, shipped_at: now,
  arrived_at: null, archived_at: null, first_activated_at: null, message_active: true,
  policy_version: 'v3', policies_accepted_at: now,
  payload: {
    greeting: 'Dearest Nana,', body: 'A body that is long enough to need wrapping on a phone. '.repeat(6),
    closing: 'All my love, Amin', senderName: 'Amin', language: 'en', passwordSet: false,
    photos: [{ path: 'designer-drafts/a/photo-1.jpg', originalName: 'a-very-long-photo-file-name-indeed.jpg', mimeType: 'image/jpeg' }],
    audio: { path: 'designer-drafts/a/note.m4a', originalName: 'voice-note.m4a', mimeType: 'audio/mp4' },
  },
}]

const designers = [{ id: 'des-1', name: 'Nour El-Amin', code: 'DR-4417', revoked_at: null, last_login_at: now, created_at: now, updated_at: now }]
const templates = [{ id: 'tpl-1', name: 'Classic Letter', slug: 'classic-letter', description: 'A4 laid paper', enabled: true, sort_order: 1 }]
const shipping = [{
  id: 'shp-1', project_id: 'proj-1', recipient_name: 'Hana Mahmoud', address_line1: '12 Mohamed Farid Street, Apartment 4',
  address_line2: 'Behind the old pharmacy', city: 'Cairo', state_province: 'Cairo', postal_code: '11511',
  country: 'Egypt', phone: '+20 100 000 0000', provider: 'bosta', tracking_code: 'BOS-8891-A',
  tracking_url: 'https://bosta.example/track/BOS-8891-A', special_instructions: 'Leave with the concierge',
  created_at: now, updated_at: now,
}]
const salesLog = [{
  id: 'sale-1', sale_reference: 'SALE-2026-0007', project_id: 'proj-1', designer_id: 'des-1',
  designer_name: 'Nour El-Amin', template_id: 'tpl-1', template_name: 'Classic Letter', wrapper_type: 'gift-box',
  title: 'For Nana, with love', sold_at: now, selling_price: 2400, estimated_cost: 900, estimated_profit: 1500,
  currency: 'EGP', status: 'completed', voided_at: null, void_reason: null, snapshot_data: {}, created_at: now,
}]
const projectEvents = [
  { id: 'ev-1', project_id: 'proj-1', action: 'paid', actor_type: 'designer', created_at: now, detail: {} },
  { id: 'ev-2', project_id: 'proj-1', action: 'manufactured', actor_type: 'admin', created_at: now, detail: { note: 'bottle 1 of 2' } },
]

const unit = (n, over = {}) => ({
  id: `unit-${n}`, reference: `DR7070089764${n}`, unit_index: n, status: 'ready_to_print',
  notes: 'Handle with care — the cap is hand-finished and the paper must not crease.',
  on_hold_reason: '', cancelled_reason: '', archived_at: null, created_at: now, updated_at: now,
  project_id: 'proj-1', project_reference: 'DR-2026-0001', project_title: 'For Nana, with love',
  public_id: PUBLIC_ID, public_token: PUBLIC_TOKEN, wrapper_type: 'gift-box', template_slug: 'classic-letter',
  paid_at: now, message_active: true, message_protected: false, designer_id: 'des-1',
  designer_name: 'Nour El-Amin', designer_code: 'DR-4417', recipient_name: 'Hana Mahmoud',
  customer_phone: '+20 100 000 0000', tracking_code: 'BOS-8891-A', provider: 'bosta',
  address_line1: '12 Mohamed Farid Street', address_line2: '', city: 'Cairo', state_province: 'Cairo',
  postal_code: '11511', country: 'Egypt', special_instructions: '', qr_target: true, qr_ready: true,
  ...over,
})
const units = [unit(1), unit(2, { status: 'on_hold', on_hold_reason: 'Waiting for the replacement cap from the supplier' }), unit(3, { status: 'packed', archived_at: now })]
const unitEvents = [
  { id: 'pe-1', physical_product_id: 'unit-1', actor_type: 'admin', action: 'created', detail: {}, created_at: now },
  { id: 'pe-2', physical_product_id: 'unit-1', actor_type: 'admin', action: 'status_changed', detail: { from_status: 'paid', to_status: 'ready_to_print' }, created_at: now },
]

const TABLE_FIXTURES = {
  projects, designers, templates, shipping,
  sales_log: salesLog, project_events: projectEvents, physical_product_events: unitEvents,
  operations_units: units, physical_products: units,
  admin_users: [{ id: ADMIN_UUID }],
  settings: [{ key: 'maintenance_mode', value: false }],
  app_settings: [{ id: 1, maintenance_mode: false, allow_new_orders: true, business_name: 'Dearune', currency: 'EGP', storage_provider: 'supabase' }],
  designers_list: designers,
}

function fixtureFor(table) {
  if (TABLE_FIXTURES[table]) return TABLE_FIXTURES[table]
  return []
}

async function installMocks(page) {
  await page.addInitScript(
    ([key, session]) => {
      window.localStorage.setItem(key, session)
    },
    [
      `sb-mockproject-auth-token`,
      JSON.stringify({
        access_token: jwt, token_type: 'bearer', expires_in: 86400,
        expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'refresh',
        user: {
          id: ADMIN_UUID, aud: 'authenticated', role: 'authenticated', email: 'admin@dearune.test',
          app_metadata: {}, user_metadata: {}, created_at: now,
        },
      }),
    ],
  )

  await page.route(`${SUPA}/**`, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.startsWith('/rest/v1/')) {
      const table = url.pathname.replace('/rest/v1/', '').split('/')[0]
      const body = JSON.stringify(fixtureFor(table))
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-99/*' }, body })
    }
    if (url.pathname.startsWith('/auth/v1/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
}

async function overflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement
    const over = doc.scrollWidth - doc.clientWidth
    const offenders = []
    if (over > 1) {
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) continue
        if (r.right > window.innerWidth + 1 || r.left < -1) {
          offenders.push({
            tag: el.tagName.toLowerCase(),
            cls: String(el.className || '').slice(0, 110),
            left: Math.round(r.left), right: Math.round(r.right),
            text: (el.textContent || '').trim().slice(0, 40),
          })
        }
      }
    }
    return { over, scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, offenders: offenders.slice(0, 8) }
  })
}

async function check(page, path, label, act) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
  await sleep(700)
  if (act) await act(page)
  const res = await overflow(page)
  const ok = res.over <= 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(34)} over=${res.over}px (${res.scrollWidth}/${res.clientWidth})`)
  if (!ok) for (const o of res.offenders) console.log(`        ↳ <${o.tag}> ${o.cls} [${o.left}..${o.right}] "${o.text}"`)
  return ok
}

let dev
let browser
let failures = 0
try {
  dev = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', '5199', '--strictPort', '--host', '127.0.0.1'], {
    cwd: process.cwd(),
    env: { ...process.env, VITE_SUPABASE_URL: SUPA, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_mock' },
    stdio: 'ignore',
  })
  // wait for the dev server
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/`)
      if (res.ok) break
    } catch {}
    await sleep(500)
  }

  browser = await chromium.launch({ headless: true })

  for (const vp of [
    { name: 'iPhone SE (375)', width: 375, height: 667 },
    { name: 'small (320)', width: 320, height: 568 },
    { name: 'tablet (768)', width: 768, height: 1024 },
  ]) {
    console.log(`\n=== ${vp.name} ===`)
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.width < 768, hasTouch: vp.width < 768 })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await installMocks(page)

    const routes = [
      ['/admin/overview', 'Overview'],
      ['/admin/operations', 'Operations'],
      ['/admin/designers', 'Designers'],
      ['/admin/designers/des-1', 'Designer detail'],
      ['/admin/designers/des-1/messages/proj-1', 'Message detail'],
      ['/admin/sold', 'Sold Logs'],
      ['/admin/sold/sale-1', 'Sale detail'],
      ['/admin/templates', 'Templates'],
      ['/admin/wrappers', 'Wrappers'],
      ['/admin/settings', 'Settings'],
      ['/admin/qa', 'QA'],
    ]
    for (const [path, label] of routes) {
      const ok = await check(page, path, label)
      if (!ok) failures++
    }

    // QA with a resolved record
    const okQa = await check(page, '/admin/qa', 'QA (record resolved)', async (p) => {
      await p.fill('#qa-manual', `${PUBLIC_ID}:${PUBLIC_TOKEN}`)
      await p.getByRole('button', { name: /look up/i }).click()
      await p.waitForTimeout(1200)
      // open every collapsible group
      for (const d of await p.locator('details').all()) {
        await d.evaluate((el) => { el.open = true })
      }
      await p.waitForTimeout(300)
    })
    if (!okQa) failures++

    // Operations: the unit sheet + the reason dialog
    const okSheet = await check(page, '/admin/operations', 'Operations (unit sheet)', async (p) => {
      await p.getByRole('button', { name: /open unit/i }).first().click()
      await p.waitForTimeout(900)
    })
    if (!okSheet) failures++

    const okDialog = await check(page, '/admin/operations', 'Operations (hold dialog)', async (p) => {
      await p.getByRole('button', { name: /open unit/i }).first().click()
      await p.waitForTimeout(700)
      await p.getByRole('button', { name: /put on hold/i }).first().click()
      await p.waitForTimeout(600)
    })
    if (!okDialog) failures++

    // The mobile drawer
    const okDrawer = await check(page, '/admin/overview', 'Nav drawer open', async (p) => {
      await p.getByRole('button', { name: /open the admin menu/i }).click()
      await p.waitForTimeout(700)
    })
    if (!okDrawer) failures++

    if (errors.length) {
      console.log(`  page errors: ${errors.slice(0, 5).join(' | ')}`)
      failures++
    }
    await ctx.close()
  }
  console.log(`\n${failures === 0 ? 'ALL LAYOUT CHECKS PASSED' : `${failures} LAYOUT PROBLEM(S)`}`)
} finally {
  if (browser) await browser.close()
  if (dev) {
    try { spawn('taskkill', ['/pid', String(dev.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
    try { dev.kill() } catch {}
  }
}
