import { PDFDocument, degrees, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { qrContent, qrDataUrl } from './qr'
import { PHYSICAL_ID_PATTERN, OPERATIONS_STATUS_LABELS } from './constants'
import { validateOperationForPaper } from './operations'

// The artwork's own layers and the fonts, resolved by the bundler so every
// asset is emitted and fingerprinted instead of guessed at runtime.
import paperTextureUrl from '@/assets/productionDocuments/qr-paper/paper-texture.png'
import decoFrontAUrl from '@/assets/productionDocuments/qr-paper/deco-front-a.png'
import decoFrontBUrl from '@/assets/productionDocuments/qr-paper/deco-front-b.png'
import decoFrontCUrl from '@/assets/productionDocuments/qr-paper/deco-front-c.png'
import decoFrontDUrl from '@/assets/productionDocuments/qr-paper/deco-front-d.png'
import decoBackAUrl from '@/assets/productionDocuments/qr-paper/deco-back-a.png'
import decoBackBUrl from '@/assets/productionDocuments/qr-paper/deco-back-b.png'
import decoBackCUrl from '@/assets/productionDocuments/qr-paper/deco-back-c.png'
import serifUrl from '@/assets/fonts/LibreBaskerville-Bold.ttf'
import serifRegularUrl from '@/assets/fonts/LibreBaskerville-Regular.ttf'
import sansUrl from '@/assets/fonts/AtkinsonHyperlegible-Regular.ttf'
import sansItalicUrl from '@/assets/fonts/AtkinsonHyperlegible-Italic.ttf'
import sansBoldUrl from '@/assets/fonts/AtkinsonHyperlegible-Bold.ttf'

// ---------------------------------------------------------------------------
// The QR production paper.
// ---------------------------------------------------------------------------
// The studio's artwork ships as `The Memorial Massege QR.pdf`: two oversized
// pages (1860.75 × 2630.25 pt) carrying the antique paper texture, the Dearune
// lockup, the detachable Operations strip and an example QR. It is a design
// proof, not a product: its page is ~3.125× A4, it spells the title MESSEGE,
// and it prints one hard-coded sample on every copy.
//
// This generator keeps that artwork and only replaces what has to change:
//
//   * every page is rebuilt at TRUE A4 (210 × 297 mm) so it prints without
//     scaling, and the artwork is re-placed 1:1 from the extracted layers
//     (texture + the four decorative cut-outs) in the original proportions;
//   * the title is drawn correctly — THE MEMORIAL MESSAGE;
//   * the QR is generated per unit and encodes THAT customer's memorial
//     destination, so no two papers can share a code;
//   * the canonical id is printed in every position the sample occupied, so
//     the strip can never disagree with the database about which unit it is;
//   * the detachable strip stays on BOTH pages and is entirely dynamic:
//     date/time, designer name, designer id, customer number and the id.
//
// All artwork positions below are in the SOURCE page's own units, copied
// straight out of the artwork so the layout is reproducible and testable
// rather than eyeballed.
// ---------------------------------------------------------------------------

// Source page geometry (the artwork's MediaBox).
export const SOURCE = {
  width: 1860.75,
  height: 2630.2499,
  bottom: 7.829912,
}

// True A4 in PostScript points (210 × 297 mm).
export const A4 = { width: 595.2756, height: 841.8898 }

const SX = A4.width / SOURCE.width
const SY = A4.height / SOURCE.height

export const ax = (x) => x * SX
export const ay = (y) => (y - SOURCE.bottom) * SY
export const asize = (size) => size * SY

// Ink and paper. The artwork is a warm near-black on white.
const INK = rgb(0.106, 0.071, 0.051)

// ---- the artwork's own text runs ------------------------------------------
// `face` is which bundled family reproduces the run; `targetWidth` is the
// width the artwork's own glyphs occupy, used to keep a re-drawn run the same
// size on the page instead of letting a different cut overflow the design.
const FACE = { serif: 'serif', serifRegular: 'serifRegular', sans: 'sans', sansItalic: 'sansItalic', sansBold: 'sansBold' }

export const STATIC_RUNS = [
  // Front page — the lockup
  { page: 'front', face: FACE.serif, text: 'D', x: 554.34, y: 623.49, size: 237.51, width: 186.44 },
  { page: 'front', face: FACE.serif, text: 'U', x: 489.87, y: 570.97, size: 244.19, width: 180.7 },
  { page: 'front', face: FACE.serif, text: 'D E A R U N E', x: 770.43, y: 629.22, size: 55.17, width: 371.64 },
  { page: 'front', face: FACE.serifRegular, text: 'S O M E   W O R D S   A R E   M E A N T   T O   L A S T .', x: 776.88, y: 592.96, size: 24.15, width: 591.42 },
  // Front page — the masthead. Corrected spelling: MESSEGE → MESSAGE.
  { page: 'front', face: FACE.serif, text: 'D E A R U N E', x: 688.5, y: 2175.16, size: 71.8, width: 483.73 },
  { page: 'front', face: FACE.serif, text: 'T H E   M E M O R I A L   M E S S A G E', x: 277.29, y: 2074.66, size: 71.8, width: 1306.16 },
]

// The detachable strip, identical on both pages. `static` runs are reprinted
// exactly; `dynamic` runs are the ones the studio actually has to read.
export const STRIP_RUNS = [
  { face: FACE.sansBold, text: 'Operations', x: 220.34, y: 215.6, size: 41.99, width: 218.8 },
  { face: FACE.sansBold, text: 'Note !', x: 1008.03, y: 229.83, size: 26.74, width: 76.64 },
  { face: FACE.sansItalic, text: 'please remove this', x: 1008.03, y: 193.08, size: 26.74, width: 241.25 },
  { face: FACE.sansItalic, text: 'section before', x: 1016.58, y: 156.33, size: 26.74, width: 181.72 },
  { face: FACE.sansItalic, text: 'manufacturing and', x: 1008.03, y: 119.58, size: 26.74, width: 236.6 },
  { face: FACE.sansItalic, text: 'put it in the bottle neck', x: 1016.58, y: 82.83, size: 26.74, width: 301.71 },
  { face: FACE.sansItalic, text: 'till shipping', x: 1008.03, y: 46.08, size: 26.74, width: 153.01 },
  // Strip monogram
  { face: FACE.serif, text: 'D', x: 1667.91, y: 95.42, size: 138.94, width: 109.07 },
  { face: FACE.serif, text: 'U', x: 1630.2, y: 64.69, size: 142.85, width: 105.71 },
]

// The four field lines. `label` is fixed; the value is bound per unit.
export const STRIP_FIELDS = [
  { key: 'date', label: 'Date & Time', x: 220.36, y: 180.21, size: 25.66, maxWidth: 740 },
  { key: 'designerName', label: 'Designer Name', x: 220.36, y: 144.46, size: 25.66, maxWidth: 740 },
  { key: 'customerNumber', label: 'Customer Number', x: 220.36, y: 108.72, size: 25.66, maxWidth: 740 },
  { key: 'designerId', label: 'Designer ID', x: 220.36, y: 72.97, size: 25.66, maxWidth: 740 },
]

// The canonical id appears in FIVE places on each page — the same five the
// artwork used for its sample. Every one of them is dynamic.
export const ID_RUNS = [
  { kind: 'order', x: 220.26, y: 29.52, size: 38.11, maxWidth: 700 },
  { kind: 'vertical', x: 56.77, y: 23.02, size: 20.68, rotate: 90 },
  { kind: 'vertical', x: 972.86, y: 23.02, size: 20.68, rotate: 90 },
  { kind: 'vertical', x: 1543.69, y: 280.15, size: 20.68, rotate: -90 },
  { kind: 'plain', x: 1603.22, y: 236.37, size: 20.68, maxWidth: 700 },
]

// The QR, measured from the artwork (module box, centred on the page).
export const QR_BOX = { x: 627.35, y: 1142.6, size: 606.05 }

// The artwork's own image layers, in source units.
export const IMAGE_LAYERS = {
  front: [
    { src: 'deco-front-c', x: 489.6, y: 511.92, width: 187.2, height: 244.32 },
    { src: 'deco-front-a', x: 87.06, y: 155.15, width: 98.25, height: 98.25 },
    { src: 'deco-front-b', x: 1354.52, y: 162.82, width: 116.02, height: 102.72 },
    { src: 'deco-front-d', x: 1629.84, y: 30.0, width: 109.92, height: 143.28 },
  ],
  back: [
    { src: 'deco-back-a', x: 87.06, y: 155.15, width: 98.25, height: 98.25 },
    { src: 'deco-back-b', x: 1354.52, y: 162.82, width: 116.02, height: 102.72 },
    { src: 'deco-back-c', x: 1629.84, y: 30.0, width: 109.92, height: 143.28 },
  ],
}

export const PAPER_TEXTURE_RECT = { x: 0, y: 295, width: 1860.75, height: 2343.03 }

// ---- formatting ------------------------------------------------------------

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// "14 September 2026 - 17:30" — the shape the artwork prints.
export function formatProductionDate(date) {
  const value = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(value.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${value.getDate()} ${MONTHS[value.getMonth()]} ${value.getFullYear()} - ${pad(value.getHours())}:${pad(value.getMinutes())}`
}


export function spacedId(reference) {
  return String(reference ?? '').split('').join(' ')
}

export function operationsIdLine(reference) {
  return `ORDER ID : ${spacedId(reference)}`
}

// Everything that differs between two units' papers. Pure, so the exact
// strings can be asserted before a file is ever produced.
export function paperValues(operation, { dateLabel = '' } = {}) {
  const reference = String(operation?.reference ?? '')
  return {
    reference,
    spacedId: spacedId(reference),
    idLine: operationsIdLine(reference),
    date: dateLabel || formatProductionDate(new Date()),
    designerName: operation?.designerName || '',
    designerId: operation?.designerCode || '',
    customerNumber: operation?.customerPhone || '',
  }
}

// ---- pdf assembly ----------------------------------------------------------

// The bundler hands us URLs. In the browser they are fetchable; in a Node test
// run they are project-relative paths, so the loader is injectable and the
// suite supplies a filesystem one. Production never passes an override.
export async function fetchAsset(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not load an artwork asset (${response.status})`)
  return new Uint8Array(await response.arrayBuffer())
}

// Draw `text` at `size`, but never let it run past `maxWidth` or fall short of
// the artwork's own `width`. A different cut of the same family is fine; a
// line that spills over the strip is not.
export function fitSize(font, text, size, { width = 0, maxWidth = 0 } = {}) {
  const natural = font.widthOfTextAtSize(text, size)
  if (!natural) return size
  if (maxWidth && natural > maxWidth) return Math.max(4, (size * maxWidth) / natural)
  if (width) {
    const ratio = width / natural
    // Only correct a real difference; matching a target to the pixel would
    // distort the design for no visible gain.
    if (ratio > 0.9 && ratio < 1.12) return size
    return Math.max(4, size * Math.min(1.2, Math.max(0.82, ratio)))
  }
  return size
}

function drawRun(page, fonts, run, text, options = {}) {
  const font = fonts[run.face]
  const size = asize(fitSize(font, text, run.size, { width: options.useWidth ? run.width : 0, maxWidth: run.maxWidth ?? 0 }))
  page.drawText(text, {
    x: ax(run.x),
    y: ay(run.y),
    size,
    font,
    color: INK,
    rotate: run.rotate ? degrees(run.rotate) : undefined,
  })
}

const ASSET_URLS = {
  serif: serifUrl,
  serifRegular: serifRegularUrl,
  sans: sansUrl,
  sansItalic: sansItalicUrl,
  sansBold: sansBoldUrl,
  texture: paperTextureUrl,
  'deco-front-a': decoFrontAUrl,
  'deco-front-b': decoFrontBUrl,
  'deco-front-c': decoFrontCUrl,
  'deco-front-d': decoFrontDUrl,
  'deco-back-a': decoBackAUrl,
  'deco-back-b': decoBackBUrl,
  'deco-back-c': decoBackCUrl,
}

export { ASSET_URLS }

async function loadAssets(doc, load) {
  doc.registerFontkit(fontkit)
  const [serifBytes, serifRegularBytes, sansBytes, sansItalicBytes, sansBoldBytes] = await Promise.all([
    load(ASSET_URLS.serif),
    load(ASSET_URLS.serifRegular),
    load(ASSET_URLS.sans),
    load(ASSET_URLS.sansItalic),
    load(ASSET_URLS.sansBold),
  ])

  const fonts = {
    [FACE.serif]: await doc.embedFont(serifBytes, { subset: true }),
    [FACE.serifRegular]: await doc.embedFont(serifRegularBytes, { subset: true }),
    [FACE.sans]: await doc.embedFont(sansBytes, { subset: true }),
    [FACE.sansItalic]: await doc.embedFont(sansItalicBytes, { subset: true }),
    [FACE.sansBold]: await doc.embedFont(sansBoldBytes, { subset: true }),
  }

  const texture = await doc.embedPng(await load(ASSET_URLS.texture))
  const deco = {}
  for (const name of ['deco-front-a', 'deco-front-b', 'deco-front-c', 'deco-front-d', 'deco-back-a', 'deco-back-b', 'deco-back-c']) {
    deco[name] = await doc.embedPng(await load(ASSET_URLS[name]))
  }

  return { fonts, texture, deco }
}

function drawArtwork(page, assets, side) {
  page.drawImage(assets.texture, {
    x: ax(PAPER_TEXTURE_RECT.x),
    y: ay(PAPER_TEXTURE_RECT.y),
    width: ax(PAPER_TEXTURE_RECT.width),
    height: asize(PAPER_TEXTURE_RECT.height),
  })
  for (const layer of IMAGE_LAYERS[side]) {
    page.drawImage(assets.deco[layer.src], {
      x: ax(layer.x),
      y: ay(layer.y),
      width: ax(layer.width),
      height: asize(layer.height),
    })
  }
}

// The detachable Operations strip. Printed identically on both pages so the
// two halves of one unit can never disagree.
function drawStrip(page, assets, values) {
  for (const run of STRIP_RUNS) drawRun(page, assets.fonts, run, run.text, { useWidth: true })

  for (const field of STRIP_FIELDS) {
    const value =
      field.key === 'date' ? values.date
        : field.key === 'designerName' ? values.designerName
        : field.key === 'customerNumber' ? values.customerNumber
        : values.designerId
    // A missing value is shown as an obvious dash, never as a plausible lie.
    drawRun(page, assets.fonts, { ...field, face: FACE.sans }, `${field.label} : ${value || '—'}`)
  }

  for (const run of ID_RUNS) {
    const text =
      run.kind === 'order' ? values.idLine
        : run.kind === 'vertical' ? values.spacedId
        : values.reference
    drawRun(page, assets.fonts, { ...run, face: FACE.serif }, text)
  }
}

async function drawQr(page, doc, operation) {
  const content = qrContent({ publicId: operation.publicId, token: operation.publicToken })
  const dataUrl = await qrDataUrl(content, 1024)
  const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0))
  const image = await doc.embedPng(bytes)
  const size = ax(QR_BOX.size)
  page.drawImage(image, {
    x: ax(QR_BOX.x),
    y: ay(QR_BOX.y),
    width: size,
    height: size,
  })
  return content
}

// One unit → exactly two consecutive pages: the front, then its back.
async function drawUnit(doc, assets, operation, { dateLabel }) {
  const values = paperValues(operation, { dateLabel })
  const front = doc.addPage([A4.width, A4.height])
  drawArtwork(front, assets, 'front')
  for (const run of STATIC_RUNS) drawRun(front, assets.fonts, run, run.text, { useWidth: true })
  drawStrip(front, assets, values)
  const qrUrl = await drawQr(front, doc, operation)

  const back = doc.addPage([A4.width, A4.height])
  drawArtwork(back, assets, 'back')
  drawStrip(back, assets, values)

  return { qrUrl, values }
}

/**
 * Produce the printable production papers.
 *
 * @param {Array} operations  `physical_products` rows (or `toOperation` shapes)
 * @param {{ dateLabel?: string, requireValid?: boolean }} [options]
 * @returns {Promise<{ bytes: Uint8Array, pageCount: number, items: Array }>}
 */
export async function buildQrPaperPdf(operations, options = {}) {
  const rows = (operations ?? []).filter(Boolean)
  if (rows.length === 0) throw new Error('Select at least one Operations record to print')

  // Refuse to print a paper we know is wrong. The review step calls the same
  // validator first, so this is a backstop rather than the only guard.
  if (options.requireValid !== false) {
    const invalid = rows
      .map((row) => ({ row, check: validateOperationForPaper(row) }))
      .filter(({ check }) => !check.ok)
    if (invalid.length) {
      const first = invalid[0]
      throw new Error(
        `Cannot print ${invalid.length} selected record(s). ${first.row.reference}: ${first.check.errors[0]}`,
      )
    }
  }

  const doc = await PDFDocument.create()
  doc.setTitle('Dearune — Production Papers')
  doc.setProducer('Dearune Operations')
  doc.setCreator('Dearune Operations')

  const assets = await loadAssets(doc, options.loadAsset ?? fetchAsset)
  const dateLabel = options.dateLabel || formatProductionDate(new Date())

  const items = []
  for (const row of rows) {
    // The rows the screens hold are already normalised; a raw DB row is
    // normalised here so the generator works from either.
    const operation = row.designerName !== undefined ? row : normalise(row)
    const result = await drawUnit(doc, assets, operation, { dateLabel })
    items.push({
      id: operation.id,
      reference: operation.reference,
      status: operation.status,
      statusLabel: OPERATIONS_STATUS_LABELS[operation.status] ?? operation.status,
      qrContent: result.qrUrl,
      values: result.values,
    })
  }

  const bytes = await doc.save()
  return { bytes, pageCount: doc.getPageCount(), items }
}

function normalise(row) {
  return {
    id: row.id,
    reference: String(row.reference ?? ''),
    status: row.status,
    projectId: row.project_id,
    publicId: row.public_id ?? '',
    publicToken: row.public_token ?? '',
    designerName: row.designer_name ?? '',
    designerCode: row.designer_code ?? '',
    customerPhone: row.customer_phone ?? '',
  }
}

// A single unit's front+back, for the review step's live preview.
export async function buildQrPaperPreview(operation, options = {}) {
  return buildQrPaperPdf([operation], { ...options, requireValid: false })
}

export function isPrintable(operation) {
  return PHYSICAL_ID_PATTERN.test(String(operation?.reference ?? ''))
}
