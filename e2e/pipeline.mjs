import { chromium } from 'playwright'
import assert from 'node:assert/strict'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173'
const FUNC = process.env.FUNC_BASE || 'https://xwgegarncnxswiswsufx.supabase.co/functions/v1'
const CODE = '706269'
const PASSCODE = '033034'
const BODY_AR = 'رحلة النجاح تبدأ بخطوة صغيرة، وتُكتب هذه الرسالة بكل الحب.'
const BODY_EN = 'This letter is written in ink that dries slowly, on purpose.'

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

function wavBytes() {
  const sampleRate = 8000
  const seconds = 0.1
  const n = Math.floor(sampleRate * seconds)
  const dataSize = n * 2
  const buf = new ArrayBuffer(44 + dataSize)
  const v = new DataView(buf)
  const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  writeStr(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); writeStr(8, 'WAVE')
  writeStr(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  writeStr(36, 'data'); v.setUint32(40, dataSize, true)
  return Buffer.from(new Uint8Array(buf))
}

async function login(page) {
  await page.goto(`${BASE}/create`)
  const cover = page.locator('.book-cover')
  await cover.first().waitFor({ state: 'visible', timeout: 15000 })
  const closed = page.locator('.book-cover.is-closed')
  if (await closed.count()) {
    await closed.click()
    await cover.first().waitFor({ state: 'visible', timeout: 10000 })
    const sample = () => page.evaluate(() => getComputedStyle(document.querySelector('.book-cover')).transform)
    let prev = await sample()
    for (let i = 0; i < 16; i++) {
      await page.waitForTimeout(250)
      const cur = await sample()
      if (cur === prev) break
      prev = cur
    }
  }
  await page.locator('#bk-code').waitFor({ state: 'visible', timeout: 15000 })
  await page.locator('#bk-code').fill(CODE)
  await page.locator('#bk-pass').fill(PASSCODE)
  await page.locator('#bk-pass').press('Enter')
  try {
    await page.locator('#bk-receiver').waitFor({ state: 'visible', timeout: 15000 })
    await settled(page)
  } catch {
    const info = await page.evaluate(() => {
      const draftKey = Object.keys(localStorage).find((k) => k.startsWith('dearune.draft.v2'))
      let draftStage = null
      try {
        draftStage = draftKey ? JSON.parse(localStorage.getItem(draftKey)).currentStage : null
      } catch {}
      return {
        url: location.href,
        htmlLen: document.documentElement.innerHTML.length,
        inputs: [...document.querySelectorAll('input')].map((i) => i.id || i.name),
        receiverExists: Boolean(document.querySelector('#bk-receiver')),
        formExists: Boolean(document.querySelector('form')),
        draftStage,
        snippet: document.body.innerText.slice(0, 160),
      }
    })
    throw new Error(`receiver never appeared. login state: ${JSON.stringify(info)}`)
  }
}

// Wait for a spread turn to finish fully: the rotating leaf stays mounted
// until handleTurnEnd, and interacting with the arriving page mid-turn races
// persistStage into reverting an already-advanced stage.
async function settled(page) {
  await page.waitForFunction(() => document.querySelectorAll('.turn-leaf').length === 0, null, { timeout: 15000 })
}

async function toPapers(page) {
  await page.locator('#bk-receiver').fill('Tess')
  await page.locator('#bk-receiver').press('Enter')
  try {
    await page.locator('.paper-card').first().waitFor({ state: 'visible', timeout: 15000 })
    await settled(page)
  } catch {
    const info = await page.evaluate(() => ({
      paperCards: document.querySelectorAll('.paper-card').length,
      errText: document.querySelector('.templates-stage .err-msg, .board-feedback .msg')?.textContent ?? null,
      loadingAny: /opening the|waiting|loading|being bound/i.test(document.body.innerText),
      inputs: [...document.querySelectorAll('input')].map((i) => i.id || i.name),
      cardsText: [...document.querySelectorAll('.paper-card')].map((c) => c.textContent.slice(0, 40)),
      snippet: document.body.innerText.slice(0, 200),
    }))
    throw new Error(`paper cards never appeared. state: ${JSON.stringify(info)} errors: ${runtimeErrors.join(' | ') || '(none)'}`)
  }
}

async function pickMemorial(page) {
  const card = page.locator('.paper-card', { hasText: 'Memorial Message' })
  await card.dispatchEvent('click')
  try {
    await page.locator('.lang-row').waitFor({ state: 'visible', timeout: 15000 })
    await settled(page)
  } catch {
    const info = await page.evaluate(() => ({
      card: [...document.querySelectorAll('.paper-card')].find((c) => c.textContent.includes('Memorial Message'))?.className ?? null,
      turns: document.querySelectorAll('.turn-leaf').length,
      draftStage: (() => {
        const k = Object.keys(localStorage).find((x) => x.startsWith('dearune.draft.v2'))
        try { return k ? JSON.parse(localStorage.getItem(k)).currentStage : null } catch { return null }
      })(),
    }))
    throw new Error(`language stage never appeared. state: ${JSON.stringify(info)} errors: ${runtimeErrors.join(' | ') || '(none)'}`)
  }
}

async function toEditor(page) {
  await page.locator('.lang-card:has-text("العربية")').dispatchEvent('click')
  try {
    await page.locator('#mm-greeting').waitFor({ state: 'visible', timeout: 15000 })
    await settled(page)
  } catch {
    const info = await page.evaluate(() => ({
      turns: document.querySelectorAll('.turn-leaf').length,
      langCards: document.querySelectorAll('.lang-card').length,
      inputs: [...document.querySelectorAll('input')].map((i) => i.id || i.name),
      snippet: document.body.innerText.slice(0, 180),
    }))
    throw new Error(`editor stage never appeared. state: ${JSON.stringify(info)} errors: ${runtimeErrors.join(' | ') || '(none)'}`)
  }
}

async function writeLetter(page, body) {
  await page.locator('#mm-body').fill(body)
  await page.locator('#mm-sender').fill('Amin')
}

async function pinPhoto(page) {
  await page.locator('.m-print').first().dispatchEvent('click')
  await page.locator('#mm-photo-input').setInputFiles({ name: 'smoke.png', mimeType: 'image/png', buffer: PNG_1PX })
  await page.locator('.crop-overlay').waitFor({ state: 'visible', timeout: 10000 })
  const pin = page.locator('.crop-actions').getByRole('button', { name: /pin it to the page/ })
  await pin.waitFor({ state: 'visible', timeout: 10000 })
  await page.waitForFunction(() => {
    const b = document.querySelector('.crop-actions .d-btn--ink')
    return b && !b.disabled
  }, { timeout: 15000 })
  await pin.dispatchEvent('click')
  await page.locator('.crop-overlay').waitFor({ state: 'hidden', timeout: 20000 })
  try {
    await page.locator('.m-print.is-set').first().waitFor({ state: 'visible', timeout: 15000 })
  } catch {
    const info = await page.evaluate(() => {
      const draftKey = Object.keys(localStorage).find((x) => x.startsWith('dearune.draft.v2'))
      let photos = null
      try {
        const md = Object.values(JSON.parse(localStorage.getItem(draftKey)).templateDrafts ?? {}).find((d) => d && Array.isArray(d.photos))
        photos = md?.photos ?? null
      } catch {}
      return {
        toasts: [...document.querySelectorAll('[data-sonner-toast], .toast, .sonner, .msg')].map((t) => t.textContent).slice(0, 3),
        photos: photos ? photos.map((p) => (p ? (p.path || 'set') : null)) : null,
        cropOpen: Boolean(document.querySelector('.crop-overlay')),
        mPrintClasses: [...document.querySelectorAll('.m-print')].map((el) => el.className),
        graffiti: [...document.querySelectorAll('.m-print img')].map((im) => im.src.slice(0, 40)),
      }
    })
    throw new Error(`photo pin failed. state: ${JSON.stringify(info)} errors: ${runtimeErrors.join(' | ') || '(none)'}`)
  }
  await page.locator('.m-print.is-set').first().waitFor({ state: 'visible', timeout: 15000 })
  await settled(page)
}

async function attachAudio(page) {
  await page.locator('input[type="file"][accept="audio/*"]').setInputFiles({ name: 'smoke.wav', mimeType: 'audio/wav', buffer: wavBytes() })
  try {
    await page.locator('.m-audio-player').waitFor({ state: 'visible', timeout: 20000 })
  } catch {
    const info = await page.evaluate(() => {
      const draftKey = Object.keys(localStorage).find((x) => x.startsWith('dearune.draft.v2'))
      let audio = null
      try {
        const md = Object.values(JSON.parse(localStorage.getItem(draftKey)).templateDrafts ?? {}).find((d) => d && 'audio' in d)
        audio = md?.audio ?? null
      } catch {}
      return {
        audio: audio ? audio.path : null,
        alerts: [...document.querySelectorAll('.field-note--warn')].map((a) => a.textContent),
        busy: Boolean(document.querySelector('.d-btn--thread.is-busy')),
        hasLabel: Boolean(document.querySelector('.d-btn--thread label, label.d-btn--thread')),
        liftBtn: Boolean([...document.querySelectorAll('button')].find((b) => /lift the sound|إزالة الصوت/.test(b.textContent))),
      }
    })
    throw new Error(`audio attach failed. state: ${JSON.stringify(info)} errors: ${runtimeErrors.join(' | ') || '(none)'}`)
  }
}

async function seal(page) {
  await page.locator('.stage-actions .d-btn--ink').first().dispatchEvent('click')
  await page.locator('.lock-stage').first().waitFor({ state: 'visible', timeout: 15000 })
  await settled(page)
  const pw = page.locator('.lock-field input')
  await pw.nth(0).fill('locket4')
  await pw.nth(1).fill('locket4')
  await page.locator('.stage-actions .d-btn--ink').first().dispatchEvent('click')
  await page.locator('.review-letter').first().waitFor({ state: 'visible', timeout: 15000 })
  await settled(page)
}

async function noSecretsCheck(page) {
  const audit = await page.evaluate(() => {
    const out = { keys: [], threats: [] }
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      out.keys.push(key)
      const value = localStorage.getItem(key) ?? ''
      const lower = value.toLowerCase()
      if (lower.includes('passcode') || lower.includes('033034')) out.threats.push(`${key}: contains passcode`)
    }
    const draftKey = out.keys.find((k) => k.startsWith('dearune.draft.v2.'))
    if (draftKey) {
      const draft = JSON.parse(localStorage.getItem(draftKey))
      out.draft = draft
    }
    return out
  })
  assert.deepStrictEqual(audit.threats, [], 'no passcode or secret may live in localStorage')
  assert.ok(audit.draft, 'a v2 draft exists')
  assert.ok(audit.draft.templateDrafts['memorial-message'], 'memorial draft stored under its own slug')
  const md = audit.draft.templateDrafts['memorial-message']
  assert.equal(md.passwordSet, true, 'lock presence recorded')
  assert.ok(!('password' in md), 'the message password itself is never persisted')
  assert.ok(!('passcode' in md), 'no passcode in the memorial draft')
  return audit.draft
}

async function cleanupMedia(draft, token) {
  const refs = []
  for (const p of draft.templateDrafts['memorial-message'].photos ?? []) if (p?.path) refs.push(p)
  if (draft.templateDrafts['memorial-message'].audio?.path) refs.push(draft.templateDrafts['memorial-message'].audio)
  if (draft.templateDrafts['classic-letter']?.body) {
    console.log('note: classic-letter draft retained across paper switching (expected)')
  }
  for (const ref of refs) {
    const qs = new URLSearchParams({ path: ref.path, storageProvider: ref.storageProvider })
    const res = await fetch(`${FUNC}/designer-media?${qs}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } })
    if (!res.ok) console.warn(`cleanup delete failed for ${ref.path} (${res.status})`)
  }
  return refs.length
}

let browser
const runtimeErrors = []
try {
  browser = await chromium.launch({ headless: true })

  // ---------------- Desktop: full memorial pipeline ----------------
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => runtimeErrors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') runtimeErrors.push(`console: ${m.text()}`) })

  await login(page)
  console.log('[1] access -> receiver turn OK')

  await toPapers(page)
  const paperCount = await page.locator('.paper-card').count()
  assert.equal(paperCount, 4, 'four papers in the archive grid')
  const coming = await page.locator('.paper-card.is-coming').count()
  assert.equal(coming, 3, 'legacy papers appear as “being bound”, memorial is live')
  console.log('[2] four papers; memorial-message is live')

  await pickMemorial(page)
  console.log('[3] papers -> language OK')

  await toEditor(page)
  const lang = await page.locator('#mm-greeting').getAttribute('dir')
  assert.equal(lang, 'rtl', 'Arabic letter renders RTL')
  const isAr = await page.locator('.memorial.is-arabic').count()
  assert.ok(isAr >= 1, 'arabic class applied')
  console.log('[4] arabic language + RTL letter OK')

  await writeLetter(page, BODY_AR)
  await pinPhoto(page)
  console.log('[5] letter fields + photo pinned (upload + crop via live function) OK')

  await attachAudio(page)
  console.log('[6] audio attached (live upload) OK')

  await seal(page)
  const lockNote = await page.locator('.review-meta .draft-note').count()
  assert.ok(lockNote >= 1, 'review shows the lock is set')
  const bodyShown = (await page.locator('.review-letter .m-body').innerText()).trim()
  assert.ok(bodyShown.includes(BODY_AR.slice(0, 24)), 'review shows the written words')
  console.log('[7] password seal -> review OK (folia, ink, locks)')

  const draft = await noSecretsCheck(page)
  const token = await page.evaluate(() => localStorage.getItem('dearune.designer.token'))
  console.log('[8] localStorage audit clean; memorial draft isolated')

  // Reload must resume exactly where the book was left.
  await page.reload()
  await page.locator('.review-letter:visible').waitFor({ state: 'visible', timeout: 15000 })
  const resumeInfo = await page.evaluate(() => {
    const out = { bodies: [], metas: [], stages: [] }
    document.querySelectorAll('.review-letter').forEach((el) => {
      out.bodies.push((el.querySelector('.m-body')?.innerText ?? '').trim().slice(0, 40))
      out.metas.push(el.querySelector('.review-meta')?.textContent?.slice(0, 60) ?? '')
    })
    const draftKey = Object.keys(localStorage).find((x) => x.startsWith('dearune.draft.v2'))
    const draft = draftKey ? JSON.parse(localStorage.getItem(draftKey)) : null
    out.currentStage = draft?.currentStage
    const md = draft?.templateDrafts?.['memorial-message']
    out.memorial = md ? { keys: Object.keys(md), body: (md.body ?? '').slice(0, 30), senderName: md.senderName, photos: (md.photos ?? []).map((p) => Boolean(p?.path)), hasAudio: Boolean(md.audio?.path) } : null
    document.querySelectorAll('.stage-root .page-script').forEach((el) => out.stages.push(el.textContent))
    out.reviewCount = document.querySelectorAll('.review-letter').length
    out.reviewHTML = document.querySelector('.review-letter')?.innerHTML.slice(0, 300) ?? ''
    return out
  })
  console.log('resumeInfo:', JSON.stringify(resumeInfo))
  const resumed = (await page.locator('.review-letter:visible').locator('.m-body').innerText()).trim()
  assert.ok(resumed.includes(BODY_AR.slice(0, 24)), 'resume keeps the letter across reload')
  console.log('[9] reload resumes at review with the draft intact')

  await ctx.close()

  // ---------------- Mobile: single-page turns ----------------
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })
  const mpage = await mctx.newPage()
  mpage.on('pageerror', (e) => runtimeErrors.push(`mobile pageerror: ${e.message}`))

  await login(mpage)
  const spineVisible = await mpage.locator('.book-spine').isVisible()
  assert.equal(spineVisible, false, 'spine hidden on mobile (single page mode)')
  await toPapers(mpage)
  await pickMemorial(mpage)
  await toEditor(mpage)
  const mobileEditor = await mpage.locator('#mm-body').isVisible()
  assert.equal(mobileEditor, true, 'mobile turn chain lands on the editor')
  console.log('[10] mobile single-page turns OK (access -> receiver -> papers -> language -> editor)')

  await mpage.locator('#mm-body').fill(BODY_EN)
  await mpage.getByRole('button', { name: /seal the letter/ }).first().dispatchEvent('click')
  await mpage.locator('.lock-stage').waitFor({ state: 'visible', timeout: 15000 })
  await settled(mpage)
  const mpw = mpage.locator('.lock-field input')
  await mpw.nth(0).fill('locket4')
  await mpw.nth(1).fill('locket4')
  await mpage.getByRole('button', { name: /seal the letter/ }).last().dispatchEvent('click')
  await mpage.locator('.review-letter').waitFor({ state: 'visible', timeout: 15000 })
  await settled(mpage)
  console.log('[11] mobile editor -> password -> review OK')

  const mdraft = await noSecretsCheck(mpage)
  const mtoken = await mpage.evaluate(() => localStorage.getItem('dearune.designer.token'))
  await mctx.close()

  const cleaned = await cleanupMedia(draft, token)
  console.log(`[12] cleanup: removed ${cleaned} live media object(s)`)

  assert.deepStrictEqual(runtimeErrors, [], 'no console/page errors during the run')
  console.log(`\nALL BROWSER CHECKS PASSED (desktop + mobile)`)
  void mdraft; void mtoken
} finally {
  if (browser) await browser.close()
}