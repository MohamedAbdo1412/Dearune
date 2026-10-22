// The real thing: a genuine Dearune QR (built with the same `qrcode` call
// and the same content format the printed paper uses) is fed to the camera
// through Chromium's file-backed fake device, and to the upload fallback as
// a PNG. Both must resolve to the same record.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import QRCode from 'qrcode'
import { createCanvas } from '@napi-rs/canvas'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const BASE = 'http://127.0.0.1:5196'
const SUPA = 'https://mockproject.supabase.co'
const ADMIN_UUID = '11111111-2222-3333-4444-555555555555'
const PUBLIC_ID = 'a1b2c3d4e5f60718293a4b5c'
const PUBLIC_TOKEN = '0123456789abcdef0123456789abcdef'
const NOW = '2026-10-20T10:00:00.000Z'

// The exact content the printed paper carries.
const QR_CONTENT = `https://dearune.example/message/${PUBLIC_ID}?token=${encodeURIComponent(PUBLIC_TOKEN)}`

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
    greeting: 'Dearest Nana,', body: 'A letter from the workshop.', closing: 'All my love', senderName: 'Amin',
    language: 'en', passwordSet: false, photos: [], audio: null,
  },
}]
const designers = [{ id: 'des-1', name: 'Nour El-Amin', code: 'DR-4417', revoked_at: null, last_login_at: NOW, created_at: NOW, updated_at: NOW }]
const templates = [{ id: 'tpl-1', name: 'Classic Letter', slug: 'classic-letter', description: 'A4 laid paper', enabled: true, sort_order: 1 }]
const shipping = [{
  id: 'shp-1', project_id: 'proj-1', recipient_name: 'Hana Mahmoud', address_line1: '12 Mohamed Farid Street',
  address_line2: '', city: 'Cairo', state_province: 'Cairo', postal_code: '11511', country: 'Egypt',
  phone: '+20 100 000 0000', provider: 'bosta', tracking_code: 'BOS-8891-A', tracking_url: '', special_instructions: '',
  created_at: NOW, updated_at: NOW,
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
const FIXTURES = {
  projects, designers, templates, shipping, sales_log: salesLog, project_events: projectEvents,
  physical_product_events: [], operations_units: units, physical_products: units,
  admin_users: [{ id: ADMIN_UUID }],
  app_settings: [{ id: 1, maintenance_mode: false, allow_new_orders: true, business_name: 'Dearune', currency: 'EGP', storage_provider: 'supabase' }],
}

function applyFilters(rows, params) {
  let out = rows
  for (const [column, raw] of params.entries()) {
    if (raw.startsWith('eq.')) out = out.filter((row) => String(row[column]) === raw.slice(3))
    else if (raw.startsWith('in.(')) {
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
      return route.fulfill({
        status: 200, contentType: 'application/json', headers: { 'content-range': '0-99/*' },
        body: JSON.stringify(applyFilters(FIXTURES[table] ?? [], url.searchParams)),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
}

// ---- draw the real QR -------------------------------------------------------
function drawQrCanvas(width, height) {
  const qr = QRCode.create(QR_CONTENT, { errorCorrectionLevel: 'M' })
  const size = qr.modules.size
  const data = qr.modules.data
  const quiet = 4
  const total = size + quiet * 2
  const scale = Math.floor(Math.min(width, height) * 0.72 / total)
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#000000'
  const side = total * scale
  const originX = Math.round((width - side) / 2)
  const originY = Math.round((height - side) / 2)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!data[y * size + x]) continue
      ctx.fillRect(originX + (x + quiet) * scale, originY + (y + quiet) * scale, scale, scale)
    }
  }
  return canvas
}

// ---- turn a canvas into a Y4M the fake camera can play ----------------------
function toY4M(canvas) {
  const width = canvas.width
  const height = canvas.height
  const rgba = canvas.getContext('2d').getImageData(0, 0, width, height).data
  const y = Buffer.alloc(width * height)
  const u = Buffer.alloc((width / 2) * (height / 2))
  const v = Buffer.alloc((width / 2) * (height / 2))
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const o = (j * width + i) * 4
      y[j * width + i] = Math.max(0, Math.min(255, Math.round(0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2])))
    }
  }
  for (let j = 0; j < height / 2; j++) {
    for (let i = 0; i < width / 2; i++) {
      let r = 0, g = 0, b = 0
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const o = ((j * 2 + dy) * width + (i * 2 + dx)) * 4
          r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]
        }
      }
      r /= 4; g /= 4; b /= 4
      u[j * (width / 2) + i] = Math.max(0, Math.min(255, Math.round(-0.169 * r - 0.331 * g + 0.5 * b + 128)))
      v[j * (width / 2) + i] = Math.max(0, Math.min(255, Math.round(0.5 * r - 0.419 * g - 0.081 * b + 128)))
    }
  }
  const header = Buffer.from(`YUV4MPEG2 W${width} H${height} F15:1 Ip A1:1 C420mpeg2\n`, 'ascii')
  return Buffer.concat([header, Buffer.from('FRAME\n', 'ascii'), y, u, v])
}

let dev
let browser
let failures = 0
const check = async (label, fn) => {
  try { await fn(); console.log(`PASS  ${label}`) }
  catch (err) { failures++; console.log(`FAIL  ${label}\n      ${err.message}`) }
}

try {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dearune-qr-'))
  const canvas = drawQrCanvas(1280, 720)
  const y4mPath = path.join(tmp, 'qr.y4m')
  fs.writeFileSync(y4mPath, toY4M(canvas))
  const pngPath = path.join(tmp, 'qr.png')
  fs.writeFileSync(pngPath, canvas.toBuffer('image/png'))
  console.log(`QR content: ${QR_CONTENT}`)
  console.log(`fake-camera frame: ${y4mPath}`)

  dev = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', '5196', '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT, env: { ...process.env, VITE_SUPABASE_URL: SUPA, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_mock' },
    stdio: 'ignore',
  })
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break } catch {}
    await sleep(500)
  }

  browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${y4mPath}`,
    ],
  })

  // ------------------------------------------------------- the live camera
  console.log('\n[1] the camera decodes a real Dearune QR')
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await ctx.newPage()
    await installMocks(page)
    await page.goto(`${BASE}/admin/qa`, { waitUntil: 'networkidle' })

    const detector = await page.evaluate(() => ({
      hasBarcodeDetector: 'BarcodeDetector' in window,
      formats: window.BarcodeDetector?.getSupportedFormats?.() ?? null,
    }))
    console.log(`  · native BarcodeDetector present: ${detector.hasBarcodeDetector} ${detector.formats ? JSON.stringify(detector.formats) : ''}`)

    await page.getByRole('button', { name: /start scan/i }).click()
    await page.waitForTimeout(4000)

    const text = await page.locator('main').innerText()
    await check('the scan resolved the record on its own', () => {
      assert.match(text, /DR70700897641/, 'the production reference never appeared')
      assert.match(text, /DR-4417/, 'the designer id never appeared')
      assert.match(text, new RegExp(PUBLIC_ID), 'the public id never appeared')
    })
    await check('the token was verified, not shown', () => {
      assert.match(text, /Token verified/i)
      assert.ok(!text.includes(PUBLIC_TOKEN), 'the token leaked into the page')
    })

    const stillLive = await page.evaluate(() => {
      const v = document.querySelector('video')
      const s = v?.srcObject
      return Boolean(s) && s.getVideoTracks().length > 0
    })
    await check('the camera was closed once the code was read', () => assert.equal(stillLive, false))
    await ctx.close()
  }

  // ------------------------------------------------------- the upload path
  console.log('\n[2] the upload fallback decodes the same QR')
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await ctx.newPage()
    await installMocks(page)
    await page.goto(`${BASE}/admin/qa`, { waitUntil: 'networkidle' })
    await page.setInputFiles('#qa-upload', pngPath)
    await page.waitForTimeout(3000)
    const text = await page.locator('main').innerText()
    await check('the uploaded picture resolved the same record', () => {
      assert.match(text, /DR70700897641/)
      assert.match(text, new RegExp(PUBLIC_ID))
    })
    await ctx.close()
  }

  console.log(`\n${failures === 0 ? 'THE REAL QR RESOLVED' : `${failures} PROBLEM(S)`}`)
} finally {
  if (browser) await browser.close()
  if (dev) { try { spawn('taskkill', ['/pid', String(dev.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {} try { dev.kill() } catch {} }
}
process.exit(failures === 0 ? 0 : 1)
