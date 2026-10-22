// Screenshots of the admin dashboard at phone width, with a mocked backend.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const BASE = 'http://127.0.0.1:5198'
const SUPA = 'https://mockproject.supabase.co'
const ADMIN_UUID = '11111111-2222-3333-4444-555555555555'
const PUBLIC_ID = 'a1b2c3d4e5f60718293a4b5c'
const PUBLIC_TOKEN = '0123456789abcdef0123456789abcdef'
const OUT = path.join(HERE, 'shots', 'admin')

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
const jwt = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({
  sub: ADMIN_UUID, aud: 'authenticated', role: 'authenticated',
  exp: Math.floor(Date.now() / 1000) + 86400,
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
    greeting: 'Dearest Nana,', body: 'A body that is long enough to need wrapping on a phone. '.repeat(5),
    closing: 'All my love, Amin', senderName: 'Amin', language: 'en', passwordSet: false,
    photos: [{ path: 'd/a/p1.jpg', originalName: 'a-very-long-photo-file-name-indeed.jpg', mimeType: 'image/jpeg' }],
    audio: { path: 'd/a/note.m4a', originalName: 'voice-note.m4a', mimeType: 'audio/mp4' },
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
const units = [unit(1), unit(2, { status: 'on_hold', on_hold_reason: 'Waiting for the replacement cap' }), unit(3, { status: 'packed', archived_at: now })]
const unitEvents = [
  { id: 'pe-1', physical_product_id: 'unit-1', actor_type: 'admin', action: 'created', detail: {}, created_at: now },
  { id: 'pe-2', physical_product_id: 'unit-1', actor_type: 'admin', action: 'status_changed', detail: { from_status: 'paid', to_status: 'ready_to_print' }, created_at: now },
]
const FIXTURES = {
  projects, designers, templates, shipping, sales_log: salesLog, project_events: projectEvents,
  physical_product_events: unitEvents, operations_units: units, physical_products: units,
  admin_users: [{ id: ADMIN_UUID }],
}

async function installMocks(page) {
  await page.addInitScript(([key, session]) => { window.localStorage.setItem(key, session) }, [
    'sb-mockproject-auth-token',
    JSON.stringify({
      access_token: jwt, token_type: 'bearer', expires_in: 86400,
      expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'refresh',
      user: { id: ADMIN_UUID, aud: 'authenticated', role: 'authenticated', email: 'a@b.test', app_metadata: {}, user_metadata: {}, created_at: now },
    }),
  ])
  await page.route(`${SUPA}/**`, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.startsWith('/rest/v1/')) {
      const table = url.pathname.replace('/rest/v1/', '').split('/')[0]
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-99/*' }, body: JSON.stringify(FIXTURES[table] ?? []) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
}

let dev
let browser
try {
  dev = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', '5198', '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT, env: { ...process.env, VITE_SUPABASE_URL: SUPA, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_mock' },
    stdio: 'ignore',
  })
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break } catch {}
    await sleep(500)
  }
  browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await installMocks(page)

  const shots = [
    ['/admin/qa', 'qa-idle'],
    ['/admin/operations', 'operations'],
    ['/admin/overview', 'overview'],
    ['/admin/designers', 'designers'],
  ]
  for (const [url, name] of shots) {
    await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' })
    await sleep(900)
    await page.screenshot({ path: path.join(OUT, `${name}-390.png`), fullPage: true })
    console.log(`shot ${name}`)
  }

  // QA with the record resolved
  await page.goto(`${BASE}/admin/qa`, { waitUntil: 'networkidle' })
  await sleep(600)
  await page.fill('#qa-manual', `${PUBLIC_ID}:${PUBLIC_TOKEN}`)
  await page.getByRole('button', { name: /look up/i }).click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: path.join(OUT, 'qa-result-390.png'), fullPage: true })
  console.log('shot qa-result')

  await ctx.close()

  // desktop
  const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const dpage = await dctx.newPage()
  await installMocks(dpage)
  await dpage.goto(`${BASE}/admin/qa`, { waitUntil: 'networkidle' })
  await sleep(600)
  await dpage.fill('#qa-manual', `${PUBLIC_ID}:${PUBLIC_TOKEN}`)
  await dpage.getByRole('button', { name: /look up/i }).click()
  await dpage.waitForTimeout(1500)
  await dpage.screenshot({ path: path.join(OUT, 'qa-result-1440.png'), fullPage: true })
  console.log('shot qa-result desktop')
  await dctx.close()
} finally {
  if (browser) await browser.close()
  if (dev) { try { spawn('taskkill', ['/pid', String(dev.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {} try { dev.kill() } catch {} }
}
