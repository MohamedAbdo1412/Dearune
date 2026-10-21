import { PDFDocument, degrees, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { qrContent, qrDataUrl } from './qr'
import { PHYSICAL_ID_PATTERN, OPERATIONS_STATUS_LABELS } from './constants'
import { validateOperationForPaper } from './operations'

// The artwork's own layers and the fonts, resolved by the bundler so every
// asset is emitted and fingerprinted instead of guessed at runtime.
// (`deco-front-c` and `deco-back-c` have been removed as requested.)
import paperTextureUrl from '@/assets/productionDocuments/qr-paper/paper-texture.png'
import paperTextureUrlBack from '@/assets/productionDocuments/qr-paper/paper-texture-back.png'
import decoFrontAUrl from '@/assets/productionDocuments/qr-paper/deco-front-a.png'
import decoFrontBUrl from '@/assets/productionDocuments/qr-paper/deco-front-b.png'
import decoFrontDUrl from '@/assets/productionDocuments/qr-paper/deco-front-d.png'
import decoBackAUrl from '@/assets/productionDocuments/qr-paper/deco-back-a.png'
import decoBackBUrl from '@/assets/productionDocuments/qr-paper/deco-back-b.png'
import serifUrl from '@/assets/fonts/LibreBaskerville-Bold.ttf'
import serifRegularUrl from '@/assets/fonts/LibreBaskerville-Regular.ttf'
import sansUrl from '@/assets/fonts/AtkinsonHyperlegible-Regular.ttf'
import sansItalicUrl from '@/assets/fonts/AtkinsonHyperlegible-Italic.ttf'
import sansBoldUrl from '@/assets/fonts/AtkinsonHyperlegible-Bold.ttf'

// ---------------------------------------------------------------------------
// The QR production paper (2-up 90° rotated layout).
// ---------------------------------------------------------------------------
// Each unit produces two consecutive A4 pages (front + back), carrying TWO
// 90°-rotated designs per page (top half + bottom half) matching the updated
// studio layout (`rotated new design.pdf`):
//
//   * every page is rebuilt at TRUE A4 (210 × 297 mm) so it prints without
//     scaling, with two rotated designs stacked vertically per page;
//   * `deco-front-c` and `deco-back-c` are removed;
//   * full color control is provided via `COLORS` (and `options.colors`),
//     preserving the warm antique brown lockup/masthead, pure black strip
//     typography, red `Note !` warning block + underline, and blue accent ID;
//   * both rotated designs on each unit page receive the complete dynamic
//     information (QR code, Operations strip fields, and all 5 Order IDs).
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

// Vertical offset (in source units) between the bottom design slot and the top
// design slot on each A4 page.
export const SLOT_OFFSET_Y = 1320.28
export const UNIT_SLOTS = [
  { key: 'top', offsetY: SLOT_OFFSET_Y },
  { key: 'bottom', offsetY: 0 },
]

// ---- Color palette & color control ----------------------------------------
// Edit `COLORS` directly or pass `options.colors` to `buildQrPaperPdf` /
// `buildQrPaperPreview` (supports pdf-lib `rgb(...)`, hex strings like
// `'#342717'`, `[r, g, b]` arrays, or `{ r, g, b }` objects).
export const COLORS = {
  ink: rgb(0.2039, 0.1529, 0.0902),      // #342717 — warm antique brown (front lockup & masthead)
  brand: rgb(0.2039, 0.1529, 0.0902),    // #342717 — front lockup & masthead text
  strip: rgb(0, 0, 0),                   // #000000 — Operations heading & strip monogram
  fields: rgb(0, 0, 0),                  // #000000 — dynamic strip field lines
  note: rgb(1, 0, 0),                    // #ff0000 — red "Note !" & removal instructions
  orderId: rgb(0, 0, 0),                 // #000000 — black ORDER ID & reference runs
  accentId: rgb(0, 0.0118, 1),           // #0003ff — blue inverted reference ID run
  qrBackground: rgb(1, 1, 1),            // #ffffff — white card behind the QR code
}

export const INK = COLORS.ink

export function resolveColor(value, fallback = INK) {
  if (!value) return fallback
  if (typeof value === 'object' && value.type === 'RGB') return value
  if (typeof value === 'string') {
    const hex = value.trim().replace(/^#/, '')
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      const r = parseInt(hex[0] + hex[0], 16) / 255
      const g = parseInt(hex[1] + hex[1], 16) / 255
      const b = parseInt(hex[2] + hex[2], 16) / 255
      return rgb(r, g, b)
    }
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      const r = parseInt(hex.slice(0, 2), 16) / 255
      const g = parseInt(hex.slice(2, 4), 16) / 255
      const b = parseInt(hex.slice(4, 6), 16) / 255
      return rgb(r, g, b)
    }
  }
  if (Array.isArray(value) && value.length >= 3) {
    const scale = value.some((n) => n > 1) ? 255 : 1
    return rgb(value[0] / scale, value[1] / scale, value[2] / scale)
  }
  if (typeof value === 'object' && 'r' in value && 'g' in value && 'b' in value) {
    const scale = value.r > 1 || value.g > 1 || value.b > 1 ? 255 : 1
    return rgb(value.r / scale, value.g / scale, value.b / scale)
  }
  return fallback
}

export function resolvePalette(overrides = {}) {
  return {
    ink: resolveColor(overrides.ink ?? overrides.brand, COLORS.ink),
    brand: resolveColor(overrides.brand ?? overrides.ink, COLORS.brand),
    strip: resolveColor(overrides.strip, COLORS.strip),
    fields: resolveColor(overrides.fields ?? overrides.strip, COLORS.fields),
    note: resolveColor(overrides.note, COLORS.note),
    orderId: resolveColor(overrides.orderId ?? overrides.strip, COLORS.orderId),
    accentId: resolveColor(overrides.accentId, COLORS.accentId),
    qrBackground: resolveColor(overrides.qrBackground, COLORS.qrBackground),
  }
}

// ---- The artwork's own text runs (base slot; top slot adds SLOT_OFFSET_Y) -
const FACE = {
  serif: 'serif',
  serifRegular: 'serifRegular',
  sans: 'sans',
  sansItalic: 'sansItalic',
  sansBold: 'sansBold',
}

export const STATIC_RUNS = [
  // Front page — the lockup (rotated -90°)
  { page: 'front', face: FACE.serif, text: '', x: 431.31, y: 929.62, size: 168.52, width: 132.29, rotate: -90, colorKey: 'brand' },
  { page: 'front', face: FACE.serif, text: '', x: 394.03, y: 975.37, size: 173.26, width: 128.21, rotate: -90, colorKey: 'brand' },
  { page: 'front', face: FACE.serif, text: '', x: 435.38, y: 776.3, size: 39.15, width: 263.7, rotate: -90, colorKey: 'brand' },
  { page: 'front', face: FACE.serifRegular, text: ' .', x: 409.64, y: 771.73, size: 17.13, width: 419.64, rotate: -90, colorKey: 'brand' },
  // Front page — the masthead (rotated -90°)
  { page: 'front', face: FACE.serif, text: '', x: 1532.28, y: 834.44, size: 50.95, width: 343.23, rotate: -90, colorKey: 'brand' },
  { page: 'front', face: FACE.serif, text: '', x: 1460.98, y: 1127.36, size: 50.95, width: 929.07, rotate: -90, colorKey: 'brand' },
]

// The detachable strip, identical on both pages and repeated for both slots.
export const STRIP_RUNS = [
  { face: FACE.sansBold, text: 'Operations', x: 141.89, y: 1166.62, size: 29.8, width: 155.25, rotate: -90, colorKey: 'strip' },
  {
    face: FACE.sansBold,
    text: 'Note !',
    x: 151.98,
    y: 607.72,
    size: 18.97,
    width: 54.38,
    rotate: -90,
    colorKey: 'note',
    underline: { x: 149.32, y: 553.34, width: 1.6, height: 54.38 },
  },
  { face: FACE.sansItalic, text: 'please remove this', x: 125.9, y: 607.72, size: 18.97, width: 171.18, rotate: -90, colorKey: 'note' },
  { face: FACE.sansItalic, text: 'section before', x: 99.83, y: 601.65, size: 18.97, width: 128.94, rotate: -90, colorKey: 'note' },
  { face: FACE.sansItalic, text: 'manufacturing and', x: 73.75, y: 607.72, size: 18.97, width: 167.88, rotate: -90, colorKey: 'note' },
  { face: FACE.sansItalic, text: 'put it in the bottle neck', x: 47.68, y: 601.65, size: 18.97, width: 214.08, rotate: -90, colorKey: 'note' },
  { face: FACE.sansItalic, text: 'till shipping', x: 21.6, y: 607.72, size: 18.97, width: 108.57, rotate: -90, colorKey: 'note' },
  // Strip monogram
  { face: FACE.serif, text: 'D', x: 56.62, y: 139.5, size: 98.59, width: 77.39, rotate: -90, colorKey: 'strip' },
  { face: FACE.serif, text: 'U', x: 34.81, y: 166.26, size: 101.36, width: 75.01, rotate: -90, colorKey: 'strip' },
]

// The four field lines. `label` is fixed; the value is bound per unit.
export const STRIP_FIELDS = [
  { key: 'date', label: 'Date & Time', x: 116.78, y: 1166.6, size: 18.21, maxWidth: 525, rotate: -90, colorKey: 'fields' },
  { key: 'designerName', label: 'Designer Name', x: 91.42, y: 1166.6, size: 18.21, maxWidth: 525, rotate: -90, colorKey: 'fields' },
  { key: 'customerNumber', label: 'Customer Number', x: 66.05, y: 1166.6, size: 18.21, maxWidth: 525, rotate: -90, colorKey: 'fields' },
  { key: 'designerId', label: 'Designer ID', x: 40.69, y: 1166.6, size: 18.21, maxWidth: 525, rotate: -90, colorKey: 'fields' },
]

// The canonical id appears in FIVE places per design slot (ten per page).
export const ID_RUNS = [
  { kind: 'order', x: 9.85, y: 1166.67, size: 27.04, maxWidth: 504, rotate: -90, colorKey: 'orderId' },
  { kind: 'vertical', x: 5.24, y: 1282.67, size: 14.67, maxWidth: 153.6, rotate: 0, colorKey: 'orderId' },
  { kind: 'vertical', x: 14.18, y: 631.04, size: 14.67, maxWidth: 153.6, rotate: 0, colorKey: 'orderId' },
  { kind: 'vertical', x: 158.6, y: 227.64, size: 14.67, maxWidth: 153.6, rotate: 180, colorKey: 'accentId' },
  { kind: 'plain', x: 156.63, y: 185.4, size: 14.67, maxWidth: 153.6, rotate: -90, colorKey: 'orderId' },
]

// White backing card and QR module box in source units (base slot; top slot adds SLOT_OFFSET_Y).
export const QR_CARD_BOX = { x: 740.32, y: 391.56, size: 542.5 }
export const QR_BOX = { x: 796.51, y: 447.75, size: 430.12, rotate: -90 }

// The artwork's decorative image layers in source units (without `deco-front-c` and `deco-back-c`).
export const IMAGE_LAYERS = {
  front: [
    { src: 'deco-front-a', x: 98.97, y: 1191.43, width: 69.75, height: 69.75, rotate: -90 },
    { src: 'deco-front-b', x: 104.44, y: 279.55, width: 72.89, height: 82.32, rotate: -90 },
    { src: 'deco-front-d', x: 10.08, y: 88.56, width: 102.0, height: 78.0, rotate: -90 },
  ],
  back: [
    { src: 'deco-back-a', x: 98.97, y: 1191.43, width: 69.75, height: 69.75, rotate: -90 },
    { src: 'deco-back-b', x: 104.44, y: 279.55, width: 72.89, height: 82.32, rotate: -90 },
  ],
}

// Paper texture bounding box per slot (starts at x=197.25 so the left Operations strip stays clean white).
export const PAPER_TEXTURE_RECT = { x: 197.25, y: 2.96, width: 1663.5, height: 1320.0, rotate: -90 }

// ---- Formatting -----------------------------------------------------------

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

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
  const designerName = operation?.designerName || ''
  return {
    reference,
    spacedId: spacedId(reference),
    idLine: operationsIdLine(reference),
    date: dateLabel || formatProductionDate(new Date()),
    designerName,
    designerId: operation?.designerCode || '',
    customerNumber: operation?.customerPhone || '',
  }
}

// ---- PDF assembly ---------------------------------------------------------

export async function fetchAsset(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not load an artwork asset (${response.status})`)
  return new Uint8Array(await response.arrayBuffer())
}

// Draw `text` at `size`, but never let it run past `maxWidth` or fall short of
// the artwork's own `width`.
export function fitSize(font, text, size, { width = 0, maxWidth = 0 } = {}) {
  const natural = font.widthOfTextAtSize(text, size)
  if (!natural) return size
  if (maxWidth && natural > maxWidth) return Math.max(4, (size * maxWidth) / natural)
  if (width) {
    const ratio = width / natural
    if (ratio > 0.9 && ratio < 1.12) return size
    return Math.max(4, size * Math.min(1.2, Math.max(0.82, ratio)))
  }
  return size
}

// Draw an image inside a visual bounding box `{ x, y, width, height, rotate }`
// (in source coordinates), compensating for pdf-lib's rotation pivot so a -90°
// rotated asset lands squarely inside `[x, x + width] × [y, y + height]`.
function drawBoxedImage(page, image, box, offsetY = 0) {
  if (!image) return
  const x0 = ax(box.x)
  const y0 = ay(box.y + offsetY)
  const w = ax(box.width ?? box.size)
  const h = asize(box.height ?? box.size)
  const angle = box.rotate ?? 0

  if (angle === -90 || angle === 270) {
    page.drawImage(image, {
      x: x0,
      y: y0 + h,
      width: h,
      height: w,
      rotate: degrees(-90),
    })
  } else if (angle === 90 || angle === -270) {
    page.drawImage(image, {
      x: x0 + w,
      y: y0,
      width: h,
      height: w,
      rotate: degrees(90),
    })
  } else if (angle === 180 || angle === -180) {
    page.drawImage(image, {
      x: x0 + w,
      y: y0 + h,
      width: w,
      height: h,
      rotate: degrees(180),
    })
  } else {
    page.drawImage(image, {
      x: x0,
      y: y0,
      width: w,
      height: h,
      rotate: angle ? degrees(angle) : undefined,
    })
  }
}

function drawRun(page, fonts, run, text, options = {}) {
  const font = fonts[run.face]
  const size = asize(
    fitSize(font, text, run.size, {
      width: options.useWidth ? run.width : 0,
      maxWidth: run.maxWidth ?? 0,
    }),
  )
  const offsetY = options.offsetY ?? 0
  const palette = options.palette ?? COLORS
  const color = resolveColor(
    run.color ?? (run.colorKey ? palette[run.colorKey] : undefined) ?? palette.ink,
    INK,
  )

  page.drawText(text, {
    x: ax(run.x),
    y: ay(run.y + offsetY),
    size,
    font,
    color,
    rotate: run.rotate ? degrees(run.rotate) : undefined,
  })

  if (run.underline) {
    page.drawRectangle({
      x: ax(run.underline.x),
      y: ay(run.underline.y + offsetY),
      width: ax(run.underline.width),
      height: asize(run.underline.height),
      color,
    })
  }
}

const ASSET_URLS = {
  serif: serifUrl,
  serifRegular: serifRegularUrl,
  sans: sansUrl,
  sansItalic: sansItalicUrl,
  sansBold: sansBoldUrl,
  texture: paperTextureUrl,
  textureBack : paperTextureUrlBack,
  'deco-front-a': decoFrontAUrl,
  'deco-front-b': decoFrontBUrl,
  'deco-front-d': decoFrontDUrl,
  'deco-back-a': decoBackAUrl,
  'deco-back-b': decoBackBUrl,
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
  const textureBack = await doc.embedPng(await load(ASSET_URLS.textureBack))
  const deco = {}
  for (const name of ['deco-front-a', 'deco-front-b', 'deco-front-d', 'deco-back-a', 'deco-back-b']) {
    if (!ASSET_URLS[name]) continue
    try {
      deco[name] = await doc.embedPng(await load(ASSET_URLS[name]))
    } catch {
      // Optional decorative layer omitted if unavailable.
    }
  }

  return { fonts, texture, deco ,textureBack }
}

function drawArtworkSlot(page, assets, side, offsetY = 0) {
  const texture =
    side === 'back' ? assets.textureBack : assets.texture

  drawBoxedImage(page, texture, PAPER_TEXTURE_RECT, offsetY)

  for (const layer of IMAGE_LAYERS[side]) {
    drawBoxedImage(page, assets.deco[layer.src], layer, offsetY)
  }
}

// The detachable Operations strip, drawn for a given design slot (`offsetY`).
function drawStripSlot(page, assets, values, { offsetY = 0, palette = COLORS } = {}) {
  for (const run of STRIP_RUNS) {
    drawRun(page, assets.fonts, run, run.text, { useWidth: true, offsetY, palette })
  }

  for (const field of STRIP_FIELDS) {
    const value =
      field.key === 'date' ? values.date
        : field.key === 'designerName' ? values.designerName
        : field.key === 'customerNumber' ? values.customerNumber
        : values.designerId
    // A missing value is shown as an obvious dash, never as a plausible lie.
    drawRun(
      page,
      assets.fonts,
      { ...field, face: FACE.sans },
      `${field.label} : ${value || '—'}`,
      { offsetY, palette },
    )
  }

  for (const run of ID_RUNS) {
    const text =
      run.kind === 'order' ? values.idLine
        : run.kind === 'vertical' ? values.spacedId
        : values.reference
    drawRun(page, assets.fonts, { ...run, face: FACE.serif }, text, { offsetY, palette })
  }
}

async function embedQrForOperation(doc, operation) {
  const content = qrContent({ publicId: operation.publicId, token: operation.publicToken })
  const dataUrl = await qrDataUrl(content, 1024)
  const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0))
  const image = await doc.embedPng(bytes)
  return { content, image }
}

function drawQrSlot(page, qrImage, { offsetY = 0, palette = COLORS } = {}) {
  
  drawBoxedImage(page, qrImage, QR_BOX, offsetY)
}

// One unit → two consecutive A4 pages (front + back), each carrying two
// 90°-rotated designs (top slot + bottom slot) with all dynamic information
// placed in both slots.
async function drawUnit(doc, assets, assets_back, operation, { dateLabel, palette, bottomOperation } = {}) {
  const hasBottom = Boolean(bottomOperation)
  const topValues = paperValues(operation, { dateLabel })
  const bottomValues = hasBottom ? paperValues(bottomOperation, { dateLabel }) : null

  const topQr = await embedQrForOperation(doc, operation)
  const bottomQr = hasBottom ? await embedQrForOperation(doc, bottomOperation) : null

  const slotConfigs = [
    { offsetY: UNIT_SLOTS[0].offsetY, values: topValues, qr: topQr, has: true },
    { offsetY: UNIT_SLOTS[1].offsetY, values: bottomValues, qr: bottomQr, has: hasBottom },
  ]

  const front = doc.addPage([A4.width, A4.height])
  for (const slot of slotConfigs) {
    if (!slot.has) continue
    drawArtworkSlot(front, assets, 'front', slot.offsetY)
    for (const run of STATIC_RUNS) {
      drawRun(front, assets.fonts, run, run.text, {
        useWidth: true,
        offsetY: slot.offsetY,
        palette,
      })
    }
    drawStripSlot(front, assets, slot.values, { offsetY: slot.offsetY, palette })
    if (slot.qr?.image) {
      drawQrSlot(front, slot.qr.image, { offsetY: slot.offsetY, palette })
    }
  }

  const back = doc.addPage([A4.width, A4.height])
  for (const slot of slotConfigs) {
    if (!slot.has) continue
    drawArtworkSlot(back, assets_back, 'back', slot.offsetY)
    drawStripSlot(back, assets_back, slot.values, { offsetY: slot.offsetY, palette })
  }

  return { qrUrl: topQr.content, values: topValues }
}

/**
 * Produce the printable production papers.
 *
 * @param {Array} operations  `physical_products` rows (or `toOperation` shapes)
 * @param {{ dateLabel?: string, requireValid?: boolean, colors?: object, loadAsset?: Function , loadAssetBack?: Function }} [options]
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
  const assets_back = await loadAssets(doc, options.loadAssetBack ?? fetchAsset)
  const dateLabel = options.dateLabel || formatProductionDate(new Date())
  const palette = resolvePalette(options.colors)

  const normalized = rows.map((row) => (row.designerName !== undefined ? row : normalise(row)))
  const items = []
  for (let i = 0; i < normalized.length; i += 2) {
    const operation = normalized[i]
    const bottomOperation = normalized[i + 1] ?? null
    const result = await drawUnit(doc, assets, assets_back, operation, { dateLabel, palette, bottomOperation })
    items.push({
      id: operation.id,
      reference: operation.reference,
      status: operation.status,
      statusLabel: OPERATIONS_STATUS_LABELS[operation.status] ?? operation.status,
      qrContent: result.qrUrl,
      values: result.values,
    })
    if (bottomOperation) {
      items.push({
        id: bottomOperation.id,
        reference: bottomOperation.reference,
        status: bottomOperation.status,
        statusLabel: OPERATIONS_STATUS_LABELS[bottomOperation.status] ?? bottomOperation.status,
        qrContent: null,
        values: paperValues(bottomOperation, { dateLabel }),
      })
    }
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