import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://localhost:5173/create')
await page.waitForSelector('.book-cover', { timeout: 15000 })
const closed = page.locator('.book-cover.is-closed')
if (await closed.count()) { await closed.click(); await page.waitForTimeout(2000) }
await page.locator('#bk-code').fill('706269')
await page.locator('#bk-pass').fill('033034')
await page.locator('#bk-pass').press('Enter')
await page.locator('#bk-receiver').waitFor({ state: 'visible', timeout: 15000 })
await page.waitForFunction(() => document.querySelectorAll('.turn-leaf').length === 0, null, { timeout: 15000 })
await page.locator('#bk-receiver').fill('Tess')
await page.locator('#bk-receiver').press('Enter')
await page.locator('.paper-card').first().waitFor({ state: 'visible', timeout: 15000 })
await page.waitForFunction(() => document.querySelectorAll('.turn-leaf').length === 0, null, { timeout: 15000 })
await page.locator('.paper-card', { hasText: 'Memorial Message' }).dispatchEvent('click')
await page.locator('.lang-row').waitFor({ state: 'visible', timeout: 15000 })
await page.waitForFunction(() => document.querySelectorAll('.turn-leaf').length === 0, null, { timeout: 15000 })
await page.locator('.lang-card:has-text("العربية")').dispatchEvent('click')
await page.locator('#mm-greeting').waitFor({ state: 'visible', timeout: 15000 })
await page.waitForFunction(() => document.querySelectorAll('.turn-leaf').length === 0, null, { timeout: 15000 })
const info = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].map((b) => b.textContent.trim().slice(0, 40))
  const stage = document.querySelector('.stage-root')
  return {
    stageScript: stage?.querySelector('.page-script')?.textContent,
    buttons: btns,
    hasMmGreeting: Boolean(document.querySelector('#mm-greeting')),
    hasCropOverlay: Boolean(document.querySelector('.crop-overlay')),
    inputFiles: [...document.querySelectorAll('input[type=file]')].map((i) => i.accept),
  }
})
console.log(JSON.stringify(info, null, 1))
await browser.close()