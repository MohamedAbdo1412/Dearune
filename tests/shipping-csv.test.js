import { describe, expect, it } from 'vitest'
import { SHIPPING_CSV_HEADERS, shipmentCsv, shipmentCsvBlob } from '../src/services/shipping'

const shipment = (overrides = {}) => ({
  reference: 'DR-000042',
  stage: 'shipped',
  recipientName: 'سارة',
  title: 'For my sister',
  template: 'Memorial message',
  wrapper: 'Sealed letter',
  addressLine1: '12, Shariaa "Sample"',
  addressLine2: '',
  governorate: 'Cairo Governorate',
  district: 'Heliopolis',
  city: 'Cairo',
  stateProvince: '',
  postalCode: '11511',
  country: 'Egypt',
  phone: '+20 100 000 0000',
  specialInstructions: 'Leave at the door, ring twice',
  trackingCode: 'TRK-99',
  shippedAt: '2026-02-01T10:00:00Z',
  ...overrides,
})

describe('shipmentCsv', () => {
  it('leads with the manifest headers', () => {
    expect(shipmentCsv([]).split('\r\n')[0]).toBe(SHIPPING_CSV_HEADERS.join(','))
  })

  it('writes the stage as a word the studio reads', () => {
    expect(shipmentCsv([shipment()])).toContain('Shipped')
    expect(shipmentCsv([shipment({ stage: 'archived' })])).toContain('Archived')
  })

  it('quotes values that contain commas or quotes, and leaves blanks blank', () => {
    const line = shipmentCsv([shipment()]).split('\r\n')[1]
    expect(line).toContain('"12, Shariaa ""Sample""",,Cairo Governorate,Heliopolis,Cairo,,11511,Egypt,')
    expect(line).toContain('"Leave at the door, ring twice"')
    expect(line).not.toContain('—')
  })

  it('keeps Arabic recipients intact', () => {
    expect(shipmentCsv([shipment()])).toContain('سارة')
  })

  it('writes a UTF-8 BOM so spreadsheets read the Arabic', async () => {
    const blob = shipmentCsvBlob([shipment()])
    expect(blob.type).toContain('text/csv')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    // EF BB BF — Blob.text() would decode it away again, so read the bytes.
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(new TextDecoder().decode(bytes)).toContain('سارة')
  })
})
