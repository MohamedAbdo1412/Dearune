import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('console', (m) => {
  const t = m.text().trim()
  if (t.startsWith('[store]') || t.startsWith('[anim]')) console.log(t)
})
await page.addInitScript(() => {
  const orig = localStorage.setItem.bind(localStorage)
  localStorage.setItem = (k, v) => {
    if (k.startsWith('dearune.draft')) {
      let info = ''
      try { const d = JSON.parse(v); info = `stage=${d.currentStage} recv=${d.receiverName} slug=${d.templateSlug}` } catch {}
      console.log(`[store] ${info}`)
    }
    orig(k, v)
  }
  document.addEventListener('animationend', (e) => console.log(`[anim] end ${e.animationName} on ${e.target?.className}`), true)
  document.addEventListener('animationstart', (e) => console.log(`[anim] start ${e.animationName}`), true)
})
const BASE = 'http://localhost:5173'
await page.goto(`${BASE}/create`)
await page.waitForSelector('.book-cover', { timeout: 15000 })
const closed = page.locator('.book-cover.is-closed')
if (await closed.count()) {
  await closed.click()
  const sample = () => page.evaluate(() => getComputedStyle(document.querySelector('.book-cover')).transform)
  let prev = await sample()
  for (let i = 0; i < 16; i++) { await page.waitForTimeout(250); const cur = await sample(); if (cur === prev) break; prev = cur }
}
await page.waitForSelector('#bk-code', { timeout: 15000 })
await page.locator('#bk-code').fill('706269')
await page.locator('#bk-pass').fill('033034')
console.log('--- pressing login enter ---')
await page.locator('#bk-pass').press('Enter')
await page.locator('#bk-receiver').waitFor({ state: 'visible', timeout: 15000 })
await page.waitForFunction(() => document.querySelectorAll('.turn-leaf').length === 0, null, { timeout: 15000 })
const mid = await page.evaluate(() => ({ turn: document.querySelectorAll('.turn-leaf').length, inputs: [...document.querySelectorAll('input')].map((i) => i.id || i.name) }))
console.log('after settled:', JSON.stringify(mid))
console.log('--- filling receiver ---')
await page.locator('#bk-receiver').fill('Tess')
await page.locator('#bk-receiver').press('Enter')
await page.waitForTimeout(6000)
console.log('--- final ---')
const out = await page.evaluate(() => {
  const draftKey = Object.keys(localStorage).find((k) => k.startsWith('dearune.draft.v2'))
  let draft = null
  try { draft = draftKey ? JSON.parse(localStorage.getItem(draftKey)) : null } catch {}
  return { stage: draft?.currentStage, recv: draft?.receiverName, inputs: [...document.querySelectorAll('input')].map((i) => i.id || i.name), paperCards: document.querySelectorAll('.paper-card').length }
})
console.log(JSON.stringify(out))
await browser.close()