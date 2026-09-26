import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// Visual QA: screenshot /qa/memorial at every width the directive names —
// desktop, laptop, tablet, and the phone ladder — after webfonts have
// settled, so letter, dropcap and ruqaa are all rendered truthfully.
//
//   npm run preview            (serves the build on 127.0.0.1:4173)
//   node e2e/qa-memorial.mjs   (writes e2e/shots/memorial-<width>.png)
//
// BASE_URL overrides the target (e.g. a dev server on 5173).

const BASE = process.env.BASE_URL || 'http://localhost:4173'
const WIDTHS = [1920, 1440, 1024, 768, 430, 390, 360]
const OUT_DIR = fileURLToPath(new URL('./shots/', import.meta.url))

// What a screenshot can only SHOW, we also measure: the editorial grid, the
// royal-red dropcap, the ruqaa face, and the close collapsing to one column
// on a phone. Any drift fails the run, not just the human eye.
async function verify(page, width) {
  const facts = await page.evaluate(() => {
    const sheet = document.querySelector('.qa-sheet .memorial.is-english.is-compact, .qa-sheet .memorial.is-english')
    const hero = sheet?.querySelector('.m-print.pos-a')
    const lowerLeft = sheet?.querySelector('.m-print.pos-b')
    const lowerMid = sheet?.querySelector('.m-print.pos-c')
    const close = sheet?.querySelector('.m-close')
    const bodyP = sheet?.querySelector('.m-scripted > p')
    const arGreeting = document.querySelector('.memorial.is-arabic .m-greeting')
    return {
      heroColumn: hero ? getComputedStyle(hero).gridColumn : null,
      lowerLeftColumn: lowerLeft ? getComputedStyle(lowerLeft).gridColumn : null,
      lowerMidColumn: lowerMid ? getComputedStyle(lowerMid).gridColumn : null,
      closeColumns: close ? getComputedStyle(close).gridTemplateColumns.split(' ').length : null,
      dropcapColor: bodyP ? getComputedStyle(bodyP, '::first-letter').color : null,
      arFont: arGreeting ? getComputedStyle(arGreeting).fontFamily : null,
      arefLoaded: document.fonts.check('16px "Aref Ruqaa"'),
      heroRow: hero ? getComputedStyle(hero).gridRow : null,
    }
  })
  const failures = []
  if (facts.heroColumn !== '6 / 12') failures.push(`hero grid-column = ${facts.heroColumn}, expected 6 / 12`)
  if (facts.lowerLeftColumn !== '1 / 7') failures.push(`lower-left grid-column = ${facts.lowerLeftColumn}, expected 1 / 7`)
  if (facts.lowerMidColumn !== '7 / 11') failures.push(`lower-mid grid-column = ${facts.lowerMidColumn}, expected 7 / 11`)
  if (facts.heroRow.split(' ')[0] !== '1') failures.push(`hero grid-row = ${facts.heroRow}, expected row 1`)
  const wantColumns = width <= 860 ? 1 : 2
  if (facts.closeColumns !== wantColumns) failures.push(`.m-close has ${facts.closeColumns} columns at ${width}px, expected ${wantColumns}`)
  const RED = ['rgba(122, 29, 40, 1)', 'rgb(122, 29, 40)']
  if (!RED.includes(facts.dropcapColor)) failures.push(`EN dropcap color = ${facts.dropcapColor}, expected royal red #7a1d28`)
  if (!facts.arefLoaded) failures.push('Aref Ruqaa webfont not loaded')
  if (!/Aref Ruqaa/.test(facts.arFont ?? '')) failures.push(`Arabic greeting font = ${facts.arFont}, expected Aref Ruqaa`)
  return failures
}

await mkdir(OUT_DIR, { recursive: true })
const browser = await chromium.launch({ headless: true })
const failures = []

try {
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    await page.goto(`${BASE}/qa/memorial`, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(500) // let the settle animations land
    await page.screenshot({ path: `${OUT_DIR}memorial-${width}.png`, fullPage: true })
    for (const issue of await verify(page, width)) failures.push(`${width}px: ${issue}`)
    await page.close()
    console.log(`✓ memorial-${width}.png`)
  }
} finally {
  await browser.close()
}
console.log(`shots written to ${OUT_DIR}`)
if (failures.length) {
  for (const issue of failures) console.error(`✗ ${issue}`)
  process.exitCode = 1
} else {
  console.log('layout checks: all green')
}
