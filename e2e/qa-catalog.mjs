import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// Visual QA: screenshot /qa/catalog — the chooser bench — at desktop, tablet
// and phone widths, and MEASURE what a screenshot can only hint at: the
// merchandising vocabulary itself. Hidden rows leave no slot, resting rows
// render veiled and refuse the pointer, new rows carry the seal, order is
// the admin's, and Next stays held until a choosable wrapper is chosen.
//
//   npm run preview               (serves the build on 127.0.0.1:4173)
//   node e2e/qa-catalog.mjs       (writes e2e/shots/catalog-<width>.png)
//
// BASE_URL overrides the target (e.g. a dev server on 5173).

const BASE = process.env.BASE_URL || 'http://localhost:4173'
const WIDTHS = [1920, 768, 390]
const OUT_DIR = fileURLToPath(new URL('./shots/', import.meta.url))

const PAPER_NAMES = ['The Memorial Letter', 'Classic Letter', 'Word & Wax']
const WRAP_NAMES = ['Oak Box', 'Linen Sleeve', 'Wax & String']
const WRAP_NAMES_AR = ['صندوق البلوط', 'غلاف الكتان', 'شمع وخيط']
const STATES = ['normal', 'new', 'not_available']
const HELD = [false, false, true]

async function verify(page) {
  const facts = await page.evaluate(() => {
    const panels = [...document.querySelectorAll('.qa-panel')]
    // the card's NAME node only (it may carry the seal inside), never the
    // description/price/veil text around it
    const nameOf = (el) => {
      const target = el.querySelector('.paper-name, .wrap-name') ?? el
      const copy = target.cloneNode(true)
      copy.querySelector('.paper-seal, .wrap-seal')?.remove()
      return copy.textContent.trim()
    }
    const cardFacts = (cards) => ({
      names: cards.map(nameOf),
      states: cards.map((c) => c.dataset.state ?? ''),
      disabled: cards.map((c) => c.disabled),
      seals: cards.map((c) => c.querySelector('.paper-seal, .wrap-seal')?.textContent.trim() ?? ''),
      chosen: cards.filter((c) => c.classList.contains('is-chosen')).map(nameOf),
      unavailable: cards.filter((c) => c.classList.contains('is-unavailable')).map(nameOf),
      badged: cards.filter((c) => c.classList.contains('is-badged')).map(nameOf),
      hiddenLeaked: cards.some((c) => c.textContent.includes('Must never render')),
    })
    const panelsCards = (i, sel) => [...(panels[i]?.querySelectorAll(sel) ?? [])]
    const arRow = panels[2]?.querySelector('.wrap-row')
    const nexts = [...document.querySelectorAll('.stage-actions .d-btn')].map((b) => b.disabled)
    const veil = (i) => panels[i]?.querySelector('.card-veil-label')?.textContent.trim() ?? ''
    return {
      papers: cardFacts(panelsCards(0, '.paper-card')),
      wrapsEn: cardFacts(panelsCards(1, '.wrap-card')),
      wrapsAr: cardFacts(panelsCards(2, '.wrap-card')),
      paperNotice: panels[0]?.querySelector('.stage-note')?.textContent.trim() ?? '',
      wrapNoticeEn: panels[1]?.querySelector('.stage-note')?.textContent.trim() ?? '',
      wrapNoticeAr: panels[2]?.querySelector('.stage-note')?.textContent.trim() ?? '',
      paperVeil: veil(0),
      veilEn: veil(1),
      veilAr: veil(2),
      rtl: arRow?.getAttribute('dir') === 'rtl',
      nexts,
      panelCount: panels.length,
    }
  })

  const failures = []
  const eq = (label, got, want) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      failures.push(`${label} = ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
    }
  }

  if (facts.panelCount !== 3) failures.push(`panels = ${facts.panelCount}, expected 3`)

  // papers: the hidden paper (sort_order 0, enabled=false) must be gone —
  // everything else in admin order, each state faithful on its own card.
  eq('paper count', facts.papers.names.length, 3)
  eq('hidden paper leaked', facts.papers.hiddenLeaked, false)
  eq('paper order', facts.papers.names, PAPER_NAMES)
  eq('paper states', facts.papers.states, STATES)
  eq('paper disabled', facts.papers.disabled, HELD)
  eq('paper seals', facts.papers.seals, ['', 'New', ''])
  eq('paper chosen', facts.papers.chosen, ['Classic Letter'])
  eq('paper veiled', facts.papers.unavailable, ['Word & Wax'])
  eq('paper badged', facts.papers.badged, ['Classic Letter'])
  if (!facts.paperNotice.includes('no longer available')) failures.push(`paper notice = "${facts.paperNotice}"`)
  if (facts.paperVeil !== 'Not available now') failures.push(`paper veil = "${facts.paperVeil}"`)

  // wrappers, English: same vocabulary, hidden row absent, Next held until
  // a choosable card is pressed.
  eq('wrap count (en)', facts.wrapsEn.names.length, 3)
  eq('hidden wrapper leaked (en)', facts.wrapsEn.hiddenLeaked, false)
  eq('wrap order (en)', facts.wrapsEn.names, WRAP_NAMES)
  eq('wrap states (en)', facts.wrapsEn.states, STATES)
  eq('wrap disabled (en)', facts.wrapsEn.disabled, HELD)
  eq('wrap seals (en)', facts.wrapsEn.seals, ['', 'New', ''])
  eq('wrap veiled (en)', facts.wrapsEn.unavailable, ['Wax & String'])
  eq('wrap badged (en)', facts.wrapsEn.badged, ['Linen Sleeve'])
  if (facts.veilEn !== 'Not available now') failures.push(`wrap veil (en) = "${facts.veilEn}"`)

  // wrappers, Arabic: the same cards, RTL, the catalog's Arabic names, the
  // resting card already chosen → Next open.
  eq('wrap count (ar)', facts.wrapsAr.names.length, 3)
  eq('hidden wrapper leaked (ar)', facts.wrapsAr.hiddenLeaked, false)
  eq('wrap order (ar)', facts.wrapsAr.names, WRAP_NAMES_AR)
  eq('wrap states (ar)', facts.wrapsAr.states, STATES)
  eq('wrap chosen (ar)', facts.wrapsAr.chosen, ['صندوق البلوط'])
  if (!facts.rtl) failures.push('Arabic wrapper row is not dir="rtl"')
  if (facts.veilAr !== 'غير متاح الآن') failures.push(`wrap veil (ar) = "${facts.veilAr}"`)
  if (!facts.wrapNoticeAr.includes('لم يعد متاحًا')) failures.push(`wrap notice (ar) = "${facts.wrapNoticeAr}"`)

  // Next: held on the English page (nothing chosen), open on the Arabic one.
  eq('next buttons', facts.nexts, [true, false])

  return failures
}

await mkdir(OUT_DIR, { recursive: true })
const browser = await chromium.launch({ headless: true })
const failures = []

try {
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    page.on('pageerror', (err) => failures.push(`${width}px: page error — ${err.message}`))
    await page.goto(`${BASE}/qa/catalog`, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(500) // let the settle animations land
    await page.screenshot({ path: `${OUT_DIR}catalog-${width}.png`, fullPage: true })
    for (const issue of await verify(page)) failures.push(`${width}px: ${issue}`)
    await page.close()
    console.log(`✓ catalog-${width}.png`)
  }
} finally {
  await browser.close()
}
console.log(`shots written to ${OUT_DIR}`)
if (failures.length) {
  for (const issue of failures) console.error(`✗ ${issue}`)
  process.exitCode = 1
} else {
  console.log('merchandising checks: all green')
}
