import { describe, expect, it } from 'vitest'
import { buildInsertPdf, buildShippingPdf } from '../src/services/pdf'
import { qrDataUrl } from '../src/services/qr'

describe('QR generator', () => {
  it('produces a loadable PNG data URL from a payload string', async () => {
    const url = await qrDataUrl('test-payload-123', 220)
    expect(url.startsWith('data:image/png;base64,')).toBe(true)
  })
})

describe('PDF builders', () => {
  it('builds a valid A4 message insert PDF that embeds the QR', async () => {
    const bytes = await buildInsertPdf({
      headline: 'To Mia',
      body: 'Some words are meant to last.',
      signature: 'from the heart',
      qrContent: 'https://example.com/message/DLABC?token=tok',
      printConfig: {},
    })
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBeGreaterThan(1000)
    const head = new TextDecoder().decode(bytes.slice(0, 8))
    expect(head.startsWith('%PDF-')).toBe(true)
  })

  it('builds a shipping label PDF without message or QR secrets', async () => {
    const bytes = await buildShippingPdf({
      orderId: '11111111-2222-3333-4444-555555555555',
      recipientName: 'Mia',
      customerName: 'Customer',
      templateName: 'Classic Letter',
      wrapperType: 'open_letter',
      shipping: {
        addressLine1: '1 High Street',
        city: 'London',
        postalCode: 'SW1A 1AA',
        country: 'UK',
        specialInstructions: 'Ring the bell',
      },
      createdDate: '2026-09-23T00:00:00Z',
      dueDate: null,
    })
    expect(bytes.length).toBeGreaterThan(1000)
    expect(new TextDecoder().decode(bytes.slice(0, 8))).toContain('%PDF-')
  })
})