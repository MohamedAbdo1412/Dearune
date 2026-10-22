/**
 * The three application icons.
 *
 * They are drawn, not traced: the same sheet of antique paper, the same
 * letterpress rules and the same ink as the Dearune wordmark, with one
 * strong symbol in the middle and the Dearune monogram tucked into the
 * corner behind it.
 *
 *   Dearune QA         a scanned code, stamped and verified
 *   Dearune Operations a sealed parcel, ribboned for dispatch
 *   Dearune Designer   a pen nib and the drop of ink leaving it
 *
 * Every icon is written twice: a full plate with its border ("any"), and a
 * bare plate with the mark drawn small enough to survive a circular mask
 * ("maskable"). The mark is cut out of the paper with even-odd fills, so
 * the holes are holes and not painted-over patches.
 *
 * Run with:  npm run app-assets
 */

import { createCanvas, loadImage } from '@napi-rs/canvas'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DEARUNE_APPS } from '../src/pwa/apps.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const OUT = resolve(ROOT, 'public/app-icons')

/* ------------------------------------------------------------------ palette */

const INK = '#32281e'
const WINE = '#7c3834'
const BRASS = '#a27c3d'
const PAPER_LIGHT = '#f8efdb'
const PAPER_DARK = '#e6d4ae'
const PARCHMENT = '#f1e3c4'

const CANVAS = 512

/* ------------------------------------------------------------------- marks */

/**
 * The Dearune monogram: the letter D, cut from a small wine plate. It is
 * the same mark the site carries in its header, kept quiet and in the
 * corner so the app's own symbol stays the thing that is read first.
 */
const MONOGRAM = `
  <g transform="translate(4 74)">
    <rect x="0" y="0" width="22" height="22" rx="5" fill="${WINE}"/>
    <g transform="translate(5 4)">
      <path fill="${PARCHMENT}" fill-rule="evenodd" d="
        M 0 0 H 5.2 C 9.4 0 12 2.8 12 7 C 12 11.2 9.4 14 5.2 14 H 0 Z
        M 3.4 2.6 V 11.4 H 5 C 7.4 11.4 8.6 9.9 8.6 7 C 8.6 4.1 7.4 2.6 5 2.6 Z"/>
    </g>
  </g>`

/** A code that has been read and stamped: the frame, the marks, the seal. */
const MARK_QA = `
  <g fill="none" stroke="${INK}" stroke-width="6">
    <rect x="16" y="8" width="58" height="58" rx="6"/>
  </g>
  <g fill="${INK}">
    <rect x="21" y="13" width="16" height="16" rx="1.5"/>
    <rect x="53" y="13" width="16" height="16" rx="1.5"/>
    <rect x="21" y="45" width="16" height="16" rx="1.5"/>
    <rect x="45" y="42" width="7" height="7"/>
    <rect x="45" y="51" width="7" height="7"/>
  </g>
  <g fill="${PARCHMENT}">
    <rect x="25.5" y="17.5" width="7" height="7"/>
    <rect x="57.5" y="17.5" width="7" height="7"/>
    <rect x="25.5" y="49.5" width="7" height="7"/>
  </g>
  <circle cx="72" cy="64" r="14" fill="${WINE}"/>
  <path d="M 63.5 64 L 69 69.5 L 79.5 57" fill="none" stroke="${PARCHMENT}"
        stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`

/** A parcel, ribboned and sealed: the work going out of the studio. */
const MARK_OPERATIONS = `
  <g fill="${INK}">
    <rect x="10" y="13" width="80" height="17" rx="3"/>
    <rect x="17" y="30" width="66" height="41" rx="3"/>
  </g>
  <rect x="43" y="13" width="14" height="58" fill="${WINE}"/>
  <circle cx="50" cy="32" r="11" fill="${PARCHMENT}"/>
  <circle cx="50" cy="32" r="11" fill="none" stroke="${INK}" stroke-width="2.4"/>`

/** A pen nib and the drop of ink leaving it: the words being written. */
const MARK_DESIGNER = `
  <path fill="${INK}" fill-rule="evenodd" d="
    M 50 5
    C 63 19 71 35 71 47
    C 71 56 62 64 50 70
    C 38 64 29 56 29 47
    C 29 35 37 19 50 5 Z
    M 48.7 65 L 48.7 43 L 51.3 43 L 51.3 65 Z
    M 45 34 A 5 5 0 1 0 55 34 A 5 5 0 1 0 45 34 Z"/>
  <path fill="${WINE}" d="
    M 50 74
    C 54.5 80 57.5 84 57.5 87.5
    C 57.5 91.5 54 94.5 50 94.5
    C 46 94.5 42.5 91.5 42.5 87.5
    C 42.5 84 45.5 80 50 74 Z"/>`

const MARKS = {
  qa: MARK_QA,
  operations: MARK_OPERATIONS,
  designer: MARK_DESIGNER,
}

/* ------------------------------------------------------------------ drawing */

/**
 * The plate.
 *
 * `variant` is either "any" (the whole letterpress plate, border and all)
 * or "maskable" (the mark alone, small enough to sit inside the circle an
 * Android launcher cuts out).
 */
function iconSvg(mark, variant) {
  const maskable = variant === 'maskable'
  const scale = maskable ? 2.9 : 4
  const offset = maskable ? 111 : 56
  const border = maskable
    ? ''
    : `
  <rect x="24" y="24" width="464" height="464" rx="34" fill="none" stroke="${BRASS}" stroke-width="8"/>
  <rect x="42" y="42" width="428" height="428" rx="24" fill="none" stroke="${INK}" stroke-width="3" opacity="0.28"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" width="${CANVAS}" height="${CANVAS}" role="img" aria-label="Dearune">
  <defs>
    <radialGradient id="paper" cx="50%" cy="38%" r="78%">
      <stop offset="0%" stop-color="${PAPER_LIGHT}"/>
      <stop offset="100%" stop-color="${PAPER_DARK}"/>
    </radialGradient>
  </defs>
  <rect width="${CANVAS}" height="${CANVAS}" fill="url(#paper)"/>${border}
  <g transform="translate(${offset} ${offset}) scale(${scale})">
${mark}${MONOGRAM}
  </g>
</svg>
`
}

async function writePng(svg, size, file) {
  const image = await loadImage(Buffer.from(svg))
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0, size, size)
  writeFileSync(file, canvas.toBuffer('image/png'))
}

/* -------------------------------------------------------------------- main */

async function main() {
  mkdirSync(OUT, { recursive: true })

  for (const app of DEARUNE_APPS) {
    const mark = MARKS[app.id]
    if (!mark) throw new Error(`No mark drawn for the ${app.name} app`)

    const svg = iconSvg(mark, 'any')
    const svgFile = resolve(OUT, `dearune-${app.id}.svg`)
    writeFileSync(svgFile, svg, 'utf8')
    console.log(`wrote ${svgFile}`)

    await writePng(svg, 192, resolve(OUT, `dearune-${app.id}-192.png`))
    await writePng(svg, 512, resolve(OUT, `dearune-${app.id}-512.png`))
    console.log(`wrote ${resolve(OUT, `dearune-${app.id}-192.png`)}`)
    console.log(`wrote ${resolve(OUT, `dearune-${app.id}-512.png`)}`)

    const maskable = iconSvg(mark, 'maskable')
    await writePng(maskable, 192, resolve(OUT, `dearune-${app.id}-maskable-192.png`))
    await writePng(maskable, 512, resolve(OUT, `dearune-${app.id}-maskable-512.png`))
    console.log(`wrote ${resolve(OUT, `dearune-${app.id}-maskable-192.png`)}`)
    console.log(`wrote ${resolve(OUT, `dearune-${app.id}-maskable-512.png`)}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
