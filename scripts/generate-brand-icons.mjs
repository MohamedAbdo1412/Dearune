/**
 * Generates every Dearune app/favicon asset from the real brand artwork.
 *
 * Source of truth : production/logo.png  (2000x2000, parchment + ink)
 *                  - the ornamental serif "D" emblem  (upper band)
 *                  - the letter-spaced "DEARUNE" wordmark (lower band)
 *
 * The emblem's ink is a solid silhouette on parchment, so it is traced with
 * marching squares into a vector outline. That single outline is then used
 * for the SVG favicon and rasterised at every required size, which keeps the
 * favicon and the app icon pixel-identical in shape.
 *
 * Run with:  npm run icons
 */

import { createCanvas, loadImage } from '@napi-rs/canvas'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const LOGO = resolve(ROOT, 'production/logo.png')
const PUBLIC = resolve(ROOT, 'public')
const ICONS = resolve(PUBLIC, 'icons')

/** Luminance below this counts as ink (parchment is ~150-220, ink is ~0-40). */
const INK_THRESHOLD = 112

/**
 * The Dearune ink. Matches --ink in src/styles/landing.css (#32281e) and the
 * QR ink recorded in production/pdf dimensions prompt.txt (#342717).
 */
const BRAND_INK = '#32281e'

/* ------------------------------------------------------------------ utils */

const luminance = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b

/** Median of an array of numbers (does not mutate the input). */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

const hex = (rgb) =>
  '#' +
  rgb
    .map((v) => Math.round(v).toString(16).padStart(2, '0'))
    .join('')

/* ----------------------------------------------------------- image loading */

async function loadLogo() {
  const image = await loadImage(LOGO)
  const canvas = createCanvas(image.width, image.height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0)
  return { image, ctx, data: ctx.getImageData(0, 0, image.width, image.height).data }
}

const pixelAt = (data, width, x, y) => {
  const o = (y * width + x) * 4
  return [data[o], data[o + 1], data[o + 2]]
}

/**
 * Finds the horizontal bands of ink in the artwork. The Dearune logo is made
 * of two bands: the big ornamental "D" and, below it, the DEARUNE wordmark.
 */
function findInkBands(data, width, height) {
  const rowHasInk = new Uint8Array(height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelAt(data, width, x, y)
      if (luminance(r, g, b) < INK_THRESHOLD) {
        rowHasInk[y] = 1
        break
      }
    }
  }

  const bands = []
  let start = -1
  for (let y = 0; y < height; y++) {
    if (rowHasInk[y] && start === -1) start = y
    if (!rowHasInk[y] && start !== -1) {
      bands.push([start, y - 1])
      start = -1
    }
  }
  if (start !== -1) bands.push([start, height - 1])

  return bands.map(([top, bottom]) => {
    let minX = width
    let maxX = -1
    for (let y = top; y <= bottom; y++) {
      for (let x = 0; x < width; x++) {
        const [r, g, b] = pixelAt(data, width, x, y)
        if (luminance(r, g, b) < INK_THRESHOLD) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
        }
      }
    }
    return { top, bottom, left: minX, right: maxX }
  })
}

/* --------------------------------------------------------- contour tracing */

/**
 * Crack following on the binary ink mask.
 *
 * Every ink pixel contributes the boundary edges it shares with a non-ink
 * neighbour, each one directed so that the ink always sits on the same side.
 * Chaining those directed edges yields closed loops - one per ink component,
 * plus one per enclosed hole - without any of the diagonal-case guesswork
 * that marching squares needs.
 */
function traceContours(mask, width, height) {
  const at = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : mask[y * width + x])

  /** vertex key -> outgoing directed edges */
  const outgoing = new Map()
  const key = (x, y) => `${x},${y}`

  const add = (x1, y1, x2, y2) => {
    const k = key(x1, y1)
    if (!outgoing.has(k)) outgoing.set(k, [])
    outgoing.get(k).push({ x1, y1, x2, y2, used: false })
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!at(x, y)) continue
      if (!at(x, y - 1)) add(x, y, x + 1, y) // top edge, heading right
      if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1) // right edge, heading down
      if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1) // bottom edge, heading left
      if (!at(x - 1, y)) add(x, y + 1, x, y) // left edge, heading up
    }
  }

  /* chain the directed edges into closed loops */
  const loops = []
  for (const segments of outgoing.values()) {
    for (const seed of segments) {
      if (seed.used) continue
      seed.used = true
      const points = [[seed.x1, seed.y1]]
      let current = seed

      let guard = 0
      while (guard++ < 1e6) {
        points.push([current.x2, current.y2])
        if (current.x2 === seed.x1 && current.y2 === seed.y1) break

        const candidates = (outgoing.get(key(current.x2, current.y2)) || []).filter((s) => !s.used)
        if (!candidates.length) break

        let next = candidates[0]
        if (candidates.length > 1) {
          // a diagonal touch offers two exits: always take the sharpest
          // clockwise turn so the two ink pixels stay separate components.
          const dx = current.x2 - current.x1
          const dy = current.y2 - current.y1
          let bestRank = -Infinity
          for (const c of candidates) {
            const cx = c.x2 - c.x1
            const cy = c.y2 - c.y1
            const cross = dx * cy - dy * cx
            const rank = cross > 0 ? 2 : cross === 0 ? 1 : 0
            if (rank > bestRank) {
              bestRank = rank
              next = c
            }
          }
        }
        next.used = true
        current = next
      }
      if (points.length > 3) loops.push(points)
    }
  }
  return loops
}

/** Chaikin corner cutting - turns the pixel staircase into smooth curves. */
function chaikin(points, iterations = 2) {
  let pts = points
  for (let i = 0; i < iterations; i++) {
    const next = []
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k]
      const b = pts[(k + 1) % pts.length]
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25])
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75])
    }
    pts = next
  }
  return pts
}

/** Ramer-Douglas-Peucker simplification (iterative). */
function simplify(points, epsilon) {
  if (points.length < 3) return points
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const stack = [[0, points.length - 1]]

  while (stack.length) {
    const [first, last] = stack.pop()
    let maxDist = -1
    let index = -1
    const [ax, ay] = points[first]
    const [bx, by] = points[last]
    const dx = bx - ax
    const dy = by - ay
    const denom = Math.hypot(dx, dy)

    for (let i = first + 1; i < last; i++) {
      const [px, py] = points[i]
      let dist
      if (denom === 0) {
        dist = Math.hypot(px - ax, py - ay)
      } else {
        dist = Math.abs(dy * px - dx * py + bx * ay - by * ax) / denom
      }
      if (dist > maxDist) {
        maxDist = dist
        index = i
      }
    }

    if (maxDist > epsilon && index !== -1) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }
  return points.filter((_, i) => keep[i])
}

function polygonArea(points) {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    area += x1 * y2 - x2 * y1
  }
  return area / 2
}

function toPathData(loops) {
  return loops
    .map((loop) => {
      const d = loop.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join('')
      return `${d}Z`
    })
    .join('')
}

/* ------------------------------------------------------------- rendering */

/**
 * Renders the traced emblem onto a parchment tile.
 * `widthRatio` is the width the emblem occupies as a fraction of the tile.
 */
function renderIcon(loops, size, { widthRatio, parchment, ink, rounded = 0 }) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')

  if (rounded > 0) {
    const r = rounded * size
    ctx.beginPath()
    ctx.moveTo(r, 0)
    ctx.arcTo(size, 0, size, size, r)
    ctx.arcTo(size, size, 0, size, r)
    ctx.arcTo(0, size, 0, 0, r)
    ctx.arcTo(0, 0, size, 0, r)
    ctx.closePath()
    ctx.fillStyle = parchment
    ctx.fill()
  } else {
    ctx.fillStyle = parchment
    ctx.fillRect(0, 0, size, size)
  }

  const bounds = boundsOf(loops)
  const scale = (widthRatio * size) / bounds.width
  const offsetX = (size - bounds.width * scale) / 2 - bounds.minX * scale
  const offsetY = (size - bounds.height * scale) / 2 - bounds.minY * scale

  ctx.save()
  ctx.translate(offsetX, offsetY)
  ctx.scale(scale, scale)
  ctx.fillStyle = ink
  ctx.beginPath()
  for (const loop of loops) {
    loop.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.closePath()
  }
  ctx.fill('evenodd')
  ctx.restore()

  return canvas.toBuffer('image/png')
}

function boundsOf(loops) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const loop of loops) {
    for (const [x, y] of loop) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

/* ------------------------------------------------------------------ main */

async function main() {
  const { image, ctx, data } = await loadLogo()
  const width = image.width
  const height = image.height

  const bands = findInkBands(data, width, height)
  if (!bands.length) throw new Error('No ink found in production/logo.png')
  const emblemBand = bands.reduce((a, b) => (b.bottom - b.top > a.bottom - a.top ? b : a))

  console.log(
    `logo: ${width}x${height}  ink bands: ${bands
      .map((b) => `[${b.left},${b.top} -> ${b.right},${b.bottom}]`)
      .join('  ')}`,
  )
  console.log(`emblem: ${emblemBand.right - emblemBand.left + 1}x${emblemBand.bottom - emblemBand.top + 1}`)

  /* palette straight from the artwork */
  const parchmentPixels = []
  const inkPixels = []
  for (let y = 0; y < height; y += 3) {
    for (let x = 0; x < width; x += 3) {
      const [r, g, b] = pixelAt(data, width, x, y)
      const l = luminance(r, g, b)
      if (l < INK_THRESHOLD) inkPixels.push([r, g, b])
      else if (l > 150) parchmentPixels.push([r, g, b])
    }
  }
  const parchment = hex([
    median(parchmentPixels.map((p) => p[0])),
    median(parchmentPixels.map((p) => p[1])),
    median(parchmentPixels.map((p) => p[2])),
  ])
  const artworkInk = hex([
    median(inkPixels.map((p) => p[0])),
    median(inkPixels.map((p) => p[1])),
    median(inkPixels.map((p) => p[2])),
  ])
  /* the artwork is printed in flat black; the Dearune ink used on the site
     (src/styles/landing.css --ink, and the QR ink in the production notes)
     is the warm near-black, so the emblem is rendered in that. */
  const ink = BRAND_INK
  console.log(`palette: parchment ${parchment}  artwork ink ${artworkInk}  -> emblem ink ${ink}`)

  /* trace the emblem */
  const ew = emblemBand.right - emblemBand.left + 1
  const eh = emblemBand.bottom - emblemBand.top + 1
  /* one pixel of parchment padding so the outer boundary is closed */
  const mw = ew + 2
  const mh = eh + 2
  const mask = new Uint8Array(mw * mh)
  for (let y = 0; y < eh; y++) {
    for (let x = 0; x < ew; x++) {
      const [r, g, b] = pixelAt(data, width, emblemBand.left + x, emblemBand.top + y)
      mask[(y + 1) * mw + (x + 1)] = luminance(r, g, b) < INK_THRESHOLD ? 1 : 0
    }
  }

  const rawLoops = traceContours(mask, mw, mh)
  const loops = rawLoops
    .map((loop) => simplify(chaikin(loop, 2), 2))
    .filter((loop) => loop.length > 2 && Math.abs(polygonArea(loop)) > 6)
    .map((loop) => loop.map(([x, y]) => [x - 1, y - 1]))

  const bounds = boundsOf(loops)
  console.log(
    `traced ${rawLoops.length} contour(s) -> ${loops.length} kept, ${loops.reduce(
      (n, l) => n + l.length,
      0,
    )} points, bounds ${bounds.width.toFixed(1)}x${bounds.height.toFixed(1)}`,
  )

  /* the SVG favicon: parchment plate + the traced emblem */
  const favicon = resolve(PUBLIC, 'favicon.svg')
  const svgSize = 512
  const faviconRatio = 0.78
  const favScale = (faviconRatio * svgSize) / bounds.width
  const favOffsetX = (svgSize - bounds.width * favScale) / 2 - bounds.minX * favScale
  const favOffsetY = (svgSize - bounds.height * favScale) / 2 - bounds.minY * favScale

  const scaledLoops = loops.map((loop) =>
    loop.map(([x, y]) => [x * favScale + favOffsetX, y * favScale + favOffsetY]),
  )
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgSize} ${svgSize}" width="${svgSize}" height="${svgSize}" role="img" aria-label="Dearune">
  <title>Dearune</title>
  <rect width="${svgSize}" height="${svgSize}" rx="${Math.round(svgSize * 0.16)}" fill="${parchment}"/>
  <path fill="${ink}" fill-rule="evenodd" d="${toPathData(scaledLoops)}"/>
</svg>
`
  writeFileSync(favicon, svg, 'utf8')
  console.log(`wrote ${favicon}`)

  /* raster icons */
  mkdirSync(ICONS, { recursive: true })
  const targets = [
    { file: 'favicon-16x16.png', size: 16, ratio: 0.84 },
    { file: 'favicon-32x32.png', size: 32, ratio: 0.82 },
    { file: 'icon-96x96.png', size: 96, ratio: 0.8 },
    { file: 'apple-touch-icon.png', size: 180, ratio: 0.76 },
    { file: 'pwa-192x192.png', size: 192, ratio: 0.78 },
    { file: 'pwa-512x512.png', size: 512, ratio: 0.78 },
    // maskable: emblem kept inside the 80% safe circle
    { file: 'pwa-maskable-192x192.png', size: 192, ratio: 0.56 },
    { file: 'pwa-maskable-512x512.png', size: 512, ratio: 0.56 },
  ]
  for (const target of targets) {
    const buffer = renderIcon(loops, target.size, {
      widthRatio: target.ratio,
      parchment,
      ink,
    })
    const out = resolve(ICONS, target.file)
    writeFileSync(out, buffer)
    console.log(`wrote ${out} (${target.size}x${target.size})`)
  }

  /* a quick visual sanity check of the trace */
  if (process.argv.includes('--preview')) {
    const preview = createCanvas(72, 60)
    const pctx = preview.getContext('2d')
    pctx.fillStyle = parchment
    pctx.fillRect(0, 0, 72, 60)
    pctx.fillStyle = ink
    pctx.beginPath()
    for (const loop of loops) {
      loop.forEach(([x, y], i) => {
        const px = x / ew * 72
        const py = y / eh * 60
        if (i === 0) pctx.moveTo(px, py)
        else pctx.lineTo(px, py)
      })
      pctx.closePath()
    }
    pctx.fill('evenodd')
    const pdata = pctx.getImageData(0, 0, 72, 60).data
    for (let y = 0; y < 60; y++) {
      let line = ''
      for (let x = 0; x < 72; x++) {
        const o = (y * 72 + x) * 4
        line += luminance(pdata[o], pdata[o + 1], pdata[o + 2]) < INK_THRESHOLD ? '#' : ' '
      }
      console.log(line)
    }
  }

  void ctx
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
