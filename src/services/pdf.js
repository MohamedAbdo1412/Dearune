import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { qrDataUrl } from './qr'
import { formatDate, formatMoney } from './format'

const CREAM = rgb(0.984, 0.976, 0.94)
const INK = rgb(0.16, 0.11, 0.09)
const BRAND = rgb(0.35, 0.2, 0.12)

function wrapText(text, font, size, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
      current = candidate
    } else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

export async function buildInsertPdf(options) {
  const doc = await PDFDocument.create()
  const page = doc.addPage([options.printConfig?.page?.width ?? 595.28, options.printConfig?.page?.height ?? 841.89])
  const margin = options.printConfig?.margin ?? 56
  const width = page.getWidth()
  const height = page.getHeight()

  const headingFont = await doc.embedFont(StandardFonts.HelveticaBold)
  const bodyFont = await doc.embedFont(StandardFonts.Helvetica)

  page.drawRectangle({ x: 0, y: 0, width, height, color: CREAM })
  page.drawText((options.printConfig?.watermark?.text ?? 'Dearune').toUpperCase(), {
    x: margin,
    y: height - margin - 14,
    size: 8,
    font: bodyFont,
    color: BRAND,
    opacity: 0.55,
  })

  let cursorY = height - margin - 56

  if (options.headline) {
    page.drawText(options.headline, {
      x: margin,
      y: cursorY,
      size: options.printConfig?.heading?.fontSize ?? 26,
      font: headingFont,
      color: INK,
    })
    cursorY -= (options.printConfig?.heading?.fontSize ?? 26) * 1.6
  }

  const bodySize = options.printConfig?.body?.fontSize ?? 13
  const lineHeight = options.printConfig?.body?.lineHeight ?? 1.6
  const maxWidth = width - margin * 2
  const lines = wrapText(options.body, bodyFont, bodySize, maxWidth)
  for (const line of lines) {
    page.drawText(line, { x: margin, y: cursorY, size: bodySize, font: bodyFont, color: INK })
    cursorY -= bodySize * lineHeight
    if (cursorY < margin + 60) {
      page.drawText('…', { x: margin, y: margin + 24, size: bodySize, font: bodyFont, color: INK })
      break
    }
  }

  if (options.signature) {
    page.drawText(options.signature, {
      x: margin,
      y: cursorY - 12,
      size: options.printConfig?.signature?.fontSize ?? 15,
      font: headingFont,
      color: INK,
    })
  }

  if (options.qrContent) {
    const qrPng = await qrDataUrl(options.qrContent, 200)
    const qrImage = await doc.embedPng(qrPng)
    const qr = options.printConfig?.qr ?? { x: 0.78, y: 0.9, size: 0.12 }
    const qrDim = Math.min(width * (qr.size ?? 0.12), height * (qr.size ?? 0.12))
    const qrX = width * (qr.x ?? 0.78)
    const qrY = height * (qr.y ?? 0.9) - qrDim
    page.drawImage(qrImage, { x: qrX, y: qrY, width: qrDim, height: qrDim })
  }

  for (let i = 1; i <= 3; i++) {
    page.drawCircle({ x: margin + 30 + i * 20, y: margin + 22, size: 2.5, color: BRAND, opacity: 0.8 })
  }

  return doc.save()
}

export async function buildShippingPdf(options) {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595.28, 421.89])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const width = page.getWidth()
  const height = page.getHeight()
  const shipping = options.shipping

  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) })
  page.drawText('DEARUNE', { x: 40, y: height - 48, size: 16, font: bold, color: BRAND })
  page.drawText('Shipping preparation · internal use', { x: 40, y: height - 72, size: 9, font: font, color: rgb(0.4, 0.4, 0.4) })

  page.drawText('Ship to', { x: 40, y: height - 120, size: 9, font: bold, color: rgb(0.3, 0.3, 0.3) })
  const address = [
    options.recipientName,
    shipping.addressLine1,
    shipping.addressLine2 ?? '',
    shipping.city,
    shipping.stateProvince ?? '',
    shipping.postalCode,
    shipping.country,
  ].filter(Boolean)
  let y = height - 145
  for (const line of address) {
    page.drawText(line, { x: 40, y, size: 12, font: font, color: rgb(0.12, 0.12, 0.12) })
    y -= 17
  }

  const right = width - 180
  let ry = height - 120
  const meta = [
    ['Order', options.orderId],
    ['Item', options.templateName],
    ['Wrapper', options.wrapperType],
    ['Customer', options.customerName],
    ['Created', formatDate(options.createdDate)],
    ['Due', formatDate(options.dueDate)],
  ]
  for (const [label, value] of meta) {
    page.drawText(label, { x: right, y: ry, size: 8.5, font: bold, color: rgb(0.3, 0.3, 0.3) })
    page.drawText(value, { x: right + 64, y: ry, size: 9, font: font, color: rgb(0.12, 0.12, 0.12) })
    ry -= 19
  }

  if (shipping.specialInstructions) {
    page.drawText('Special instructions', { x: 40, y: 78, size: 8.5, font: bold, color: rgb(0.3, 0.3, 0.3) })
    page.drawText(shipping.specialInstructions.slice(0, 140), { x: 40, y: 62, size: 9, font: font, color: rgb(0.2, 0.2, 0.2) })
  }

  page.drawRectangle({ x: 0, y: 0, width, height: 6, color: BRAND })
  return doc.save()
}

export async function buildReceiptPdf(options) {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595.28, 421.89])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const width = page.getWidth()

  page.drawRectangle({ x: 0, y: 0, width, height: page.getHeight(), color: CREAM })
  page.drawRectangle({ x: 0, y: page.getHeight() - 6, width, height: 6, color: BRAND })

  page.drawText('DEARUNE · RECEIPT', { x: 40, y: page.getHeight() - 52, size: 14, font: bold, color: BRAND })
  page.drawText(`Order ${options.orderId}`, { x: 40, y: page.getHeight() - 78, size: 9, font: font, color: rgb(0.3, 0.3, 0.3) })
  page.drawText(`Received ${formatDate(options.createdDate)}`, { x: 40, y: page.getHeight() - 92, size: 9, font: font, color: rgb(0.3, 0.3, 0.3) })

  let y = page.getHeight() - 130
  const rows = [
    ['Recipient', options.recipientName],
    ['Message', options.templateName],
    ['Wrapper', options.wrapperType],
    ['Public page', options.publicId],
    ['Total paid', formatMoney(options.price, options.currency)],
  ]
  if (options.customerEmail) rows.push(['Sent to', options.customerEmail])
  for (const [label, value] of rows) {
    page.drawText(label, { x: 40, y, size: 9, font: bold, color: rgb(0.3, 0.3, 0.3) })
    page.drawText(String(value), { x: 150, y, size: 9, font: font, color: rgb(0.12, 0.12, 0.12) })
    y -= 22
  }

  page.drawText('Thank you — some words are meant to last.', { x: 40, y: 52, size: 9, font: font, color: rgb(0.4, 0.4, 0.4) })

  return doc.save()
}

export function downloadPdf(bytes, filename) {
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}