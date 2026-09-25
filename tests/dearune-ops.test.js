import { describe, expect, it } from 'vitest'
import {
  nextDearuneAction,
  PROJECT_STAGE_LABELS,
  PROJECT_STAGE_ORDER,
  projectStage,
} from '../src/services/constants'
import { SALES_CSV_HEADERS, saleDearuneLabel, salesCsv, salesCsvBlob, sumSales } from '../src/services/sales'

const base = {
  wrapper_type: 'open_letter',
  configured_at: '2026-01-01T00:00:00Z',
  paid_at: null,
  manufactured_at: null,
  shipped_at: null,
  arrived_at: null,
  archived_at: null,
  message_active: false,
  first_activated_at: null,
  status: 'submitted',
}

describe('projectStage', () => {
  it('is configured until the sale is recorded', () => {
    expect(projectStage(base)).toBe('configured')
  })

  it('walks the physical pipeline once sold', () => {
    expect(projectStage({ ...base, paid_at: 'now' })).toBe('sold')
    expect(projectStage({ ...base, paid_at: 'now', manufactured_at: 'now' })).toBe('made')
    expect(projectStage({ ...base, paid_at: 'now', manufactured_at: 'now', shipped_at: 'now' })).toBe('shipped')
    expect(projectStage({ ...base, paid_at: 'now', manufactured_at: 'now', shipped_at: 'now', arrived_at: 'now' })).toBe('delivered')
  })

  it('delivers a digital Dearune when its message is opened', () => {
    const digital = { ...base, wrapper_type: 'digital', paid_at: 'now' }
    expect(projectStage(digital)).toBe('sold')
    expect(projectStage({ ...digital, message_active: true, first_activated_at: 'now' })).toBe('delivered')
  })

  it('is archived above everything else', () => {
    expect(projectStage({ ...base, archived_at: 'now', paid_at: 'now', arrived_at: 'now' })).toBe('archived')
    expect(projectStage({ ...base, status: 'archived' })).toBe('archived')
  })

  it('labels every stage', () => {
    for (const stage of PROJECT_STAGE_ORDER) {
      expect(PROJECT_STAGE_LABELS[stage]).toBeTruthy()
    }
  })
})

describe('nextDearuneAction', () => {
  it('asks for the sale first', () => {
    expect(nextDearuneAction(base)).toBe('sale')
  })

  it('walks made → shipped → arrived for physical Dearunes', () => {
    expect(nextDearuneAction({ ...base, paid_at: 'now' })).toBe('made')
    expect(nextDearuneAction({ ...base, paid_at: 'now', manufactured_at: 'now' })).toBe('shipped')
    expect(nextDearuneAction({ ...base, paid_at: 'now', manufactured_at: 'now', shipped_at: 'now' })).toBe('arrived')
    expect(nextDearuneAction({ ...base, paid_at: 'now', manufactured_at: 'now', shipped_at: 'now', arrived_at: 'now' })).toBe('open')
  })

  it('opens a sold digital Dearune, and has nothing left to do once open', () => {
    expect(nextDearuneAction({ ...base, wrapper_type: 'digital', paid_at: 'now' })).toBe('open')
    expect(nextDearuneAction({ ...base, wrapper_type: 'digital', paid_at: 'now', message_active: true })).toBeNull()
  })

  it('offers restore on an archived Dearune', () => {
    expect(nextDearuneAction({ ...base, archived_at: 'now' })).toBe('restore')
  })
})

const sale = (overrides = {}) => ({
  sale_reference: 'DR-S-000001',
  status: 'completed',
  sold_at: '2026-02-01T10:00:00Z',
  currency: 'EGP',
  selling_price: 100,
  estimated_cost: 40,
  estimated_profit: 60,
  project_id: '11111111-1111-1111-1111-111111111111',
  legacy_order_id: null,
  designer_name: 'Able Ansel',
  template_name: 'Memorial Message',
  wrapper_type: 'open_letter',
  title: 'سارة',
  voided_at: null,
  void_reason: null,
  snapshot_data: { reference: 'DR-000042', source: 'dearune' },
  ...overrides,
})

describe('sumSales', () => {
  it('counts only completed sales in the requested currency', () => {
    const rows = [
      sale(),
      sale({ selling_price: 50, estimated_profit: 10 }),
      sale({ status: 'voided', selling_price: 999 }),
      sale({ currency: 'GBP', selling_price: 700 }),
    ]
    expect(sumSales(rows, 'EGP')).toEqual({ revenue: 150, profit: 70, count: 2 })
  })

  it('returns zeroes for nothing', () => {
    expect(sumSales([], 'EGP')).toEqual({ revenue: 0, profit: 0, count: 0 })
    expect(sumSales(null, 'EGP')).toEqual({ revenue: 0, profit: 0, count: 0 })
  })
})

describe('saleDearuneLabel', () => {
  it('prefers the project reference from the snapshot', () => {
    expect(saleDearuneLabel(sale())).toBe('DR-000042')
  })

  it('falls back to the legacy order id, then the project id', () => {
    expect(saleDearuneLabel(sale({ snapshot_data: {}, legacy_order_id: 'legacy-1' }))).toBe('legacy-1')
    expect(saleDearuneLabel(sale({ snapshot_data: {} }))).toBe('11111111-1111-1111-1111-111111111111')
  })
})

describe('salesCsv', () => {
  it('starts with the headers and keeps Arabic titles intact', () => {
    const csv = salesCsv([sale()])
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe(SALES_CSV_HEADERS.join(','))
    expect(csv).toContain('سارة')
    expect(csv).toContain('DR-S-000001')
    expect(csv).toContain('DR-000042')
  })

  it('quotes values that contain commas, quotes or newlines', () => {
    const csv = salesCsv([sale({ title: 'Hassan, "the baker"' })])
    expect(csv).toContain('"Hassan, ""the baker"""')
  })

  it('labels legacy rows as legacy orders', () => {
    const csv = salesCsv([sale({ snapshot_data: { source: 'legacy-order' }, legacy_order_id: 'legacy-2' })])
    expect(csv).toContain('legacy order')
  })

  it('writes a UTF-8 BOM so spreadsheets read the Arabic', async () => {
    const blob = salesCsvBlob([sale()])
    expect(blob.type).toContain('text/csv')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    // EF BB BF — Blob.text() would decode it away again, so read the bytes.
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(new TextDecoder().decode(bytes)).toContain('سارة')
  })
})
