import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import jsQR from 'jsqr'
import {
  A4,
  ASSET_URLS,
  QR_BOX,
  ax,
  ay,
  buildQrPaperPdf,
  formatProductionDate,
  operationsIdLine,
  paperValues,
  spacedId,
} from '../src/services/qrPaper'

// The bundler hands the service root-relative URLs in a test run; the suite
// reads them off disk. Production fetches them instead.
const loadAsset = async (url) => {
  const relative = decodeURIComponent(String(url)).replace(/^\/+/, '').split('?')[0]
  return new Uint8Array(fs.readFileSync(path.resolve(process.cwd(), relative)))
}

const SAMPLE = {
  designerName: 'Abu Tricka',
  designerCode: 'DR-666666',
  customerPhone: '01022869672',
}

const operation = (overrides = {}) => ({
  id: overrides.id ?? '11111111-1111-1111-1111-111111111111',
  reference: 'DR70700000001',
  status: 'ready_to_print',
  projectId: '22222222-2222-2222-2222-222222222222',
  publicId: 'abcdef0123456789abcdef01',
  publicToken: 'tok-one',
  designerName: 'Nour Adel',
  designerCode: 'DR-100001',
  customerPhone: '01000000001',
  ...overrides,
})

const DATE_LABEL = '1 October 2026 - 09:15'

async function open(bytes) {
  return pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise
}

async function pageText(page) {
  const content = await page.getTextContent()
  return content.items.filter((item) => 'str' in item && item.str).map((item) => item.str)
}

// jsQR is slow on megapixel input, so shrink to a few pixels per module
// first. Box-averaging keeps the code readable — the edges blur, the module
// centres do not.
function downscale(rgba, width, height, target) {
  const scale = Math.max(1, Math.ceil(Math.max(width, height) / target))
  if (scale === 1) return { data: rgba, width, height }
  const outWidth = Math.floor(width / scale)
  const outHeight = Math.floor(height / scale)
  const out = new Uint8ClampedArray(outWidth * outHeight * 4)
  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const sx = x * scale + dx
          const sy = y * scale + dy
          if (sx >= width || sy >= height) continue
          const i = (sy * width + sx) * 4
          r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; a += rgba[i + 3]; n++
        }
      }
      const o = (y * outWidth + x) * 4
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n
    }
  }
  return { data: out, width: outWidth, height: outHeight }
}

// Some images live inside a Form XObject (`g_d0_*`); pdfjs never resolves
// those through `page.objs`, so every lookup gets a deadline instead of
// hanging the suite.
const resolveImage = (page, name, ms = 3000) =>
  Promise.race([
    new Promise((resolve) => {
      try {
        const cached = page.objs.get(name)
        if (cached) resolve(cached)
        else page.objs.get(name, resolve)
      } catch {
        page.objs.get(name, resolve)
      }
    }),
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ])

async function imageNamesOnPage(page) {
  const ops = await page.getOperatorList()
  const O = pdfjs.OPS
  return ops.fnArray
    .map((fn, index) => (fn === O.paintImageXObject ? String(ops.argsArray[index][0]) : null))
    .filter((name) => name && !name.startsWith('g_d0_'))
}

// The paper texture is the largest image on a page. Its colour is the whole
// antique look, so it is worth proving the artwork survived the round trip.
async function textureStats(page) {
  for (const name of await imageNamesOnPage(page)) {
    const image = await resolveImage(page, name)
    if (!image?.data || !image.width) continue
    if (image.width * image.height < 1_000_000) continue
    let r = 0, g = 0, b = 0, n = 0
    for (let i = 0; i < image.width * image.height; i++) {
      const a = image.data.length === image.width * image.height * 4 ? image.data[i * 4 + 3] : 255
      if (a < 128) continue
      r += image.data[i * 4]; g += image.data[i * 4 + 1]; b += image.data[i * 4 + 2]; n++
    }
    if (!n) continue
    return { width: image.width, height: image.height, r: r / n, g: g / n, b: b / n }
  }
  return null
}

// Find the QR on a page by asking every embedded image whether it decodes.
async function decodeQrOnPage(page) {
  const names = await imageNamesOnPage(page)

  for (const name of names) {
    const image = await resolveImage(page, name)
    if (!image?.data || !image.width) continue
    // Only a square image can be the code. This skips the 1748×2481 paper
    // texture, which jsQR would chew on for minutes.
    const longer = Math.max(image.width, image.height)
    if (Math.abs(image.width - image.height) > longer * 0.02 || longer > 2048) continue
    const rgba =
      image.data.length === image.width * image.height * 4
        ? new Uint8ClampedArray(image.data)
        : (() => {
            const out = new Uint8ClampedArray(image.width * image.height * 4)
            for (let i = 0; i < image.width * image.height; i++) {
              out[i * 4] = image.data[i * 3]
              out[i * 4 + 1] = image.data[i * 3 + 1]
              out[i * 4 + 2] = image.data[i * 3 + 2]
              out[i * 4 + 3] = 255
            }
            return out
          })()
    const smaller = downscale(rgba, image.width, image.height, 300)
    const code = jsQR(smaller.data, smaller.width, smaller.height)
    if (code?.data) return { data: code.data, image }
  }
  return null
}

// pdfjs splits a run into several items where the spaces are, so the title is
// reassembled from consecutive items whose stripped text spells it out.
async function titleBox(page, target = 'THEMEMORIALMESSAGE') {
  const content = await page.getTextContent()
  const items = content.items.filter((item) => 'str' in item && item.str)
  for (let start = 0; start < items.length; start++) {
    let text = ''
    for (let end = start; end < items.length && text.length < target.length; end++) {
      text += items[end].str.replace(/\s+/g, '')
      if (text === target) {
        const run = items.slice(start, end + 1)
        const left = Math.min(...run.map((item) => item.transform[4]))
        const right = Math.max(...run.map((item) => item.transform[4] + item.width))
        return { left, right, width: right - left, baseline: run[0].transform[5] }
      }
      if (!target.startsWith(text)) break
    }
  }
  return null
}

// Where the QR image was actually placed, from the drawing transform.
async function qrPlacement(page) {
  const ops = await page.getOperatorList()
  const O = pdfjs.OPS
  let ctm = [1, 0, 0, 1, 0, 0]
  const stack = []
  const mul = (m, n) => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ]
  const found = []
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i]
    if (fn === O.save) stack.push(ctm.slice())
    else if (fn === O.restore) ctm = stack.pop() ?? ctm
    else if (fn === O.transform) ctm = mul(ctm, ops.argsArray[i])
    else if (fn === O.paintImageXObject) {
      found.push({
        name: String(ops.argsArray[i][0]),
        x: ctm[4],
        y: ctm[5],
        width: Math.hypot(ctm[0], ctm[1]),
        height: Math.hypot(ctm[2], ctm[3]),
      })
    }
  }
  return found
}

describe('production paper formatting', () => {
  it('prints the id letter-spaced, exactly where the artwork put its sample', () => {
    expect(spacedId('DR70700000001')).toBe('D R 7 0 7 0 0 0 0 0 0 0 1')
    expect(operationsIdLine('DR70700000001')).toBe('O D E R I D : D R 7 0 7 0 0 0 0 0 0 0 1')
  })

  it('formats the stamp the way the artwork reads', () => {
    expect(formatProductionDate(new Date(2026, 8, 14, 17, 30))).toBe('14 September 2026 - 17:30')
  })

  it('binds every strip variable to the unit, never to the sample', () => {
    const values = paperValues(operation(), { dateLabel: DATE_LABEL })
    expect(values.designerName).toBe('Nour Adel')
    expect(values.designerId).toBe('DR-100001')
    expect(values.customerNumber).toBe('01000000001')
    expect(values.date).toBe(DATE_LABEL)
    expect(JSON.stringify(values)).not.toContain(SAMPLE.designerName)
    expect(JSON.stringify(values)).not.toContain(SAMPLE.designerCode.replace('DR-', ''))
  })

  it('resolves every artwork asset the generator needs', () => {
    for (const [key, url] of Object.entries(ASSET_URLS)) {
      expect(typeof url, key).toBe('string')
      const relative = url.replace(/^\/+/, '').split('?')[0]
      expect(fs.existsSync(path.resolve(process.cwd(), relative)), `${key} → ${url}`).toBe(true)
    }
  })
})

describe('production paper PDF', () => {
  it('gives each unit exactly two consecutive A4 pages, front first', async () => {
    const { bytes, pageCount } = await buildQrPaperPdf(
      [operation({ reference: 'DR70700000001' }), operation({ id: 'b', reference: 'DR70700000002', publicToken: 'tok-two' })],
      { dateLabel: DATE_LABEL, loadAsset },
    )
    expect(pageCount).toBe(4)
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')

    const doc = await open(bytes)
    expect(doc.numPages).toBe(4)
    for (let p = 1; p <= 4; p++) {
      const page = await doc.getPage(p)
      const view = page.getViewport({ scale: 1 })
      expect(view.width).toBeCloseTo(A4.width, 1)
      expect(view.height).toBeCloseTo(A4.height, 1)
    }

    // The masthead exists only on a front page, so its presence identifies
    // which half of the pair each page is.
    const squashed = async (p) => (await pageText(await doc.getPage(p))).join(' ').replace(/\s+/g, '')
    expect(await squashed(1)).toContain('THEMEMORIALMESSAGE')
    expect(await squashed(2)).not.toContain('THEMEMORIALMESSAGE')
    expect(await squashed(3)).toContain('THEMEMORIALMESSAGE')
    expect(await squashed(4)).not.toContain('THEMEMORIALMESSAGE')
  }, 120_000)

  it('scales to a whole batch without dropping or reordering a unit', async () => {
    const many = Array.from({ length: 10 }, (_, index) =>
      operation({
        id: `id-${index}`,
        reference: `DR70700000${String(100 + index)}`,
        publicToken: `tok-${index}`,
      }),
    )
    const { bytes, pageCount } = await buildQrPaperPdf(many, { dateLabel: DATE_LABEL, loadAsset })
    expect(pageCount).toBe(20)
    const doc = await open(bytes)
    expect(doc.numPages).toBe(20)
    // Page 2k+1 is unit k's front, page 2k+2 is its back.
    for (let index = 0; index < 10; index++) {
      const reference = spacedId(`DR70700000${String(100 + index)}`)
      const front = (await pageText(await doc.getPage(index * 2 + 1))).join(' ')
      const back = (await pageText(await doc.getPage(index * 2 + 2))).join(' ')
      expect(front, `front page of unit ${index}`).toContain(reference)
      expect(back, `back page of unit ${index}`).toContain(reference)
      expect(front.replace(/\s+/g, '')).toContain('THEMEMORIALMESSAGE')
    }
  }, 180_000)

  it('spells the title correctly and never reprints the sample', async () => {
    const { bytes } = await buildQrPaperPdf([operation()], { dateLabel: DATE_LABEL, loadAsset })
    const raw = new TextDecoder('latin1').decode(bytes)
    // The original proof's misspelling and its sample order, in any encoding.
    expect(raw).not.toContain('MESSEGE')
    expect(raw).not.toContain('trapcloud8')
    expect(raw).not.toContain('Abu Tricka')
    expect(raw).not.toContain('01022869672')

    const doc = await open(bytes)
    const text = (await pageText(await doc.getPage(1))).join(' ')
    expect(text.replace(/\s+/g, '')).toContain('THEMEMORIALMESSAGE')
    expect(text).not.toContain('MESSEGE')
    expect(text).not.toContain(SAMPLE.designerName)
    expect(text).not.toContain(SAMPLE.customerPhone)
  }, 120_000)

  it('prints the canonical id, the designer and the customer on BOTH pages', async () => {
    const { bytes } = await buildQrPaperPdf([operation({ reference: 'DR70700897645' })], {
      dateLabel: DATE_LABEL,
      loadAsset,
    })
    const doc = await open(bytes)
    for (const p of [1, 2]) {
      const text = (await pageText(await doc.getPage(p))).join(' ')
      expect(text, `page ${p}`).toContain(spacedId('DR70700897645'))
      expect(text, `page ${p}`).toContain(operationsIdLine('DR70700897645'))
      expect(text, `page ${p}`).toContain('Nour Adel')
      expect(text, `page ${p}`).toContain('DR-100001')
      expect(text, `page ${p}`).toContain('01000000001')
      expect(text, `page ${p}`).toContain(DATE_LABEL)
    }
  }, 120_000)

  it('encodes each unit\'s OWN destination in its QR, once per front page', async () => {
    const items = [
      operation({ id: 'a', reference: 'DR70700000001', publicId: 'publicidAAAAAAAAAAAAAAA1', publicToken: 'token-aaa' }),
      operation({ id: 'b', reference: 'DR70700000002', publicId: 'publicidBBBBBBBBBBBBBBB2', publicToken: 'token-bbb' }),
    ]
    const { bytes } = await buildQrPaperPdf(items, { dateLabel: DATE_LABEL, loadAsset })
    const doc = await open(bytes)

    const first = await decodeQrOnPage(await doc.getPage(1))
    const second = await decodeQrOnPage(await doc.getPage(3))
    expect(first?.data).toBe('/message/publicidAAAAAAAAAAAAAAA1?token=token-aaa')
    expect(second?.data).toBe('/message/publicidBBBBBBBBBBBBBBB2?token=token-bbb')
    expect(first.data).not.toBe(second.data)

    // The back pages carry no code at all.
    expect(await decodeQrOnPage(await doc.getPage(2))).toBeNull()
    expect(await decodeQrOnPage(await doc.getPage(4))).toBeNull()
  }, 120_000)

  it('places the QR exactly where the artwork had it', async () => {
    const { bytes } = await buildQrPaperPdf([operation()], { dateLabel: DATE_LABEL, loadAsset })
    const doc = await open(bytes)
    const placements = await qrPlacement(await doc.getPage(1))
    // The texture covers the page, so pick the smallest square image — the QR.
    const qr = placements
      .filter((p) => Math.abs(p.width - p.height) < 1)
      .sort((a, b) => a.width - b.width)
      .find((p) => p.width > 100 && p.width < 400)
    expect(qr).toBeTruthy()
    expect(qr.x).toBeCloseTo(ax(QR_BOX.x), 1)
    expect(qr.y).toBeCloseTo(ay(QR_BOX.y), 1)
    expect(qr.width).toBeCloseTo(ax(QR_BOX.size), 1)
  }, 120_000)

  it('keeps the artwork\'s warm antique texture instead of flattening it', async () => {
    const { bytes } = await buildQrPaperPdf([operation()], { dateLabel: DATE_LABEL, loadAsset })
    const doc = await open(bytes)
    const stats = await textureStats(await doc.getPage(1))
    expect(stats).toBeTruthy()
    expect(stats.width).toBe(1748)
    expect(stats.height).toBe(2481)
    // The artwork's own parchment: a warm brown, read off the source.
    expect(stats.r).toBeGreaterThan(150)
    expect(stats.r).toBeGreaterThan(stats.g)
    expect(stats.g).toBeGreaterThan(stats.b)
    expect(Math.abs(stats.r - 203)).toBeLessThan(22)
    expect(Math.abs(stats.g - 168)).toBeLessThan(22)
    expect(Math.abs(stats.b - 127)).toBeLessThan(22)
  }, 120_000)

  it('keeps the corrected title inside the artwork\'s own footprint', async () => {
    const { bytes } = await buildQrPaperPdf([operation()], { dateLabel: DATE_LABEL, loadAsset })
    const doc = await open(bytes)
    const box = await titleBox(await doc.getPage(1))
    expect(box).toBeTruthy()
    // The artwork set this line 1306.16 source units wide, starting at 277.29.
    const target = 1306.16 * (A4.width / 1860.75)
    expect(box.width).toBeGreaterThan(target * 0.75)
    expect(box.width).toBeLessThan(target * 1.3)
    expect(box.left).toBeCloseTo((277.29 * A4.width) / 1860.75, 0)
    // And on the baseline the artwork used.
    expect(box.baseline).toBeCloseTo(ay(2074.66), 0)
  }, 120_000)

  it('refuses to print a unit whose id is not canonical', async () => {
    await expect(
      buildQrPaperPdf([operation({ reference: 'DR-000001' })], { dateLabel: DATE_LABEL, loadAsset }),
    ).rejects.toThrow(/canonical/i)
  })

  it('refuses an empty selection instead of producing a blank file', async () => {
    await expect(buildQrPaperPdf([], { loadAsset })).rejects.toThrow(/at least one/i)
  })
})
