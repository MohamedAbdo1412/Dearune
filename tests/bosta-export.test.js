import fs from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import {
  BOSTA_FIRST_DATA_ROW,
  BOSTA_HEADER_ROW,
  BOSTA_SHEET,
  BOSTA_TEMPLATE_URL,
  bostaFileStem,
  bostaIssues,
  bostaRowValues,
  buildBostaWorkbook,
  readBostaAreas,
} from '../src/services/bosta'

const loadAsset = async (url) => {
  // Vite percent-encodes the workbook's filename (it contains spaces).
  const relative = decodeURIComponent(String(url)).replace(/^\/+/, '').split('?')[0]
  return new Uint8Array(fs.readFileSync(path.resolve(process.cwd(), relative)))
}

const templateBytes = () => loadAsset(BOSTA_TEMPLATE_URL)

async function openWorkbook(bytes) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(bytes)
  return workbook
}

const operation = (overrides = {}) => ({
  id: 'op-1',
  reference: 'DR70700000001',
  status: 'ready_for_shipment',
  recipientName: 'منى حسن',
  customerPhone: '01000000001',
  addressLine1: '12 شارع النيل',
  addressLine2: '',
  city: 'القاهرة',
  stateProvince: '',
  postalCode: '',
  country: 'Egypt',
  specialInstructions: 'Leave with the doorman',
  ...overrides,
})

describe('Bosta row mapping', () => {
  it('maps the unit onto the template columns, inventing nothing', () => {
    const row = bostaRowValues(operation())
    expect(row.customerName).toBe('منى حسن')
    expect(row.phone).toBe('01000000001')
    expect(row.city).toBe('القاهرة')
    expect(row.address).toBe('12 شارع النيل')
    expect(row.notes).toBe('Leave with the doorman')
    expect(row.reference).toBe('DR70700000001')
    expect(row.description).toBe('Dearune letter - DR70700000001')
    expect(row.pieces).toBe(1)
    // Nothing is fabricated for the fields we have no source for.
    expect(row.codValue).toBe('')
    expect(row.shipmentValue).toBe('')
    expect(row.landmark).toBe('')
    expect(row.allowOpen).toBe('')
  })

  it('folds the second address line in rather than dropping it', () => {
    const row = bostaRowValues(operation({ addressLine2: 'الدور الثالث' }))
    expect(row.address).toBe('12 شارع النيل, الدور الثالث')
  })

  it('names exactly what is missing instead of guessing', () => {
    const issues = bostaIssues(operation({ recipientName: '', city: '', addressLine1: '', customerPhone: '' }))
    expect(issues.some((issue) => issue.includes('اسم العميل'))).toBe(true)
    expect(issues.some((issue) => issue.includes('تليفون'))).toBe(true)
    expect(issues.some((issue) => issue.includes('المدينة'))).toBe(true)
    expect(issues.some((issue) => issue.includes('العنوان'))).toBe(true)
  })

  it('flags a landline, because Bosta wants a mobile', () => {
    const landline = bostaIssues(operation({ customerPhone: '0223456789' }))
    expect(landline.some((issue) => issue.startsWith('* تليفون'))).toBe(true)
    expect(bostaIssues(operation({ customerPhone: '01234567890' }))).toEqual([])
  })

  it('only keeps an area that exists in Bosta its own list', () => {
    const areas = new Set(['مدينة نصر', 'المعادي'])
    expect(bostaRowValues(operation({ stateProvince: 'المعادي' }), { areas }).area).toBe('المعادي')
    expect(bostaRowValues(operation({ stateProvince: 'Nowhere' }), { areas }).area).toBe('')
    expect(
      bostaIssues(operation({ stateProvince: 'Nowhere' }), { areas, areasDropped: true }).some((i) =>
        i.includes('المنطقة'),
      ),
    ).toBe(true)
  })

  it('stamps a sortable file name', () => {
    expect(bostaFileStem(new Date(2026, 9, 17, 9, 5))).toBe('Bosta-Export-2026-10-17-0905')
  })
})

describe('Bosta workbook export', () => {
  it('is a genuine xlsx that keeps the whole supplied template', async () => {
    const source = await openWorkbook(await templateBytes())
    const { bytes, filename } = await buildBostaWorkbook([operation()], { loadAsset })

    // A real zip container, not a renamed CSV.
    expect(new TextDecoder('latin1').decode(bytes.slice(0, 2))).toBe('PK')
    expect(filename).toMatch(/^Bosta-Export-\d{4}-\d{2}-\d{2}-\d{4}\.xlsx$/)

    const built = await openWorkbook(bytes)
    const sourceNames = source.worksheets.map((s) => s.name)
    const builtNames = built.worksheets.map((s) => s.name)
    expect(builtNames).toEqual(sourceNames)
    expect(built.getWorksheet('Cities and Areas')).toBeTruthy()

    // Sheet visibility and the 21k dropdowns must survive, or Bosta rejects it.
    for (const sheet of built.worksheets) {
      const before = source.getWorksheet(sheet.name)
      expect(sheet.state, sheet.name).toBe(before.state)
      expect(sheet.rowCount, sheet.name).toBe(before.rowCount)
      expect(Object.keys(sheet.dataValidations?.model ?? {}).length, sheet.name).toBe(
        Object.keys(before.dataValidations?.model ?? {}).length,
      )
    }

    const header = built.getWorksheet(BOSTA_SHEET).getCell(BOSTA_HEADER_ROW, 1).value
    expect(String(header)).toContain('اسم العميل')
  }, 120_000)

  it('writes one row per selected unit, in column order, starting where the template says', async () => {
    const items = [
      operation({ id: 'a', reference: 'DR70700000001', recipientName: 'First', customerPhone: '01000000001' }),
      operation({ id: 'b', reference: 'DR70700000002', recipientName: 'Second', customerPhone: '01000000002' }),
    ]
    const { bytes, rows, items: report } = await buildBostaWorkbook(items, { loadAsset })
    expect(rows).toBe(2)
    expect(report).toHaveLength(2)

    const sheet = (await openWorkbook(bytes)).getWorksheet(BOSTA_SHEET)
    const at = (row, column) => String(sheet.getCell(row, column).value ?? '')

    expect(at(BOSTA_FIRST_DATA_ROW, 1)).toBe('First')
    expect(at(BOSTA_FIRST_DATA_ROW, 2)).toBe('01000000001')
    expect(at(BOSTA_FIRST_DATA_ROW, 6)).toBe('12 شارع النيل')
    expect(at(BOSTA_FIRST_DATA_ROW, 15)).toBe('DR70700000001')
    expect(at(BOSTA_FIRST_DATA_ROW, 13)).toBe('1')

    expect(at(BOSTA_FIRST_DATA_ROW + 1, 1)).toBe('Second')
    expect(at(BOSTA_FIRST_DATA_ROW + 1, 15)).toBe('DR70700000002')

    // Exactly the selection — the template's own rows are untouched.
    expect(at(BOSTA_FIRST_DATA_ROW + 2, 1)).toBe('')
  }, 120_000)

  it('exports ONLY the selection, never the whole table', async () => {
    const one = await buildBostaWorkbook([operation({ recipientName: 'Only' })], { loadAsset })
    const sheet = (await openWorkbook(one.bytes)).getWorksheet(BOSTA_SHEET)
    expect(String(sheet.getCell(BOSTA_FIRST_DATA_ROW, 1).value)).toBe('Only')
    expect(String(sheet.getCell(BOSTA_FIRST_DATA_ROW + 1, 1).value ?? '')).toBe('')
  }, 120_000)

  it('reads the area vocabulary out of the template itself', async () => {
    const workbook = await openWorkbook(await templateBytes())
    const { areas, cities } = readBostaAreas(workbook)
    expect(cities.size).toBeGreaterThan(10)
    expect(areas.size).toBeGreaterThan(cities.size)
  }, 120_000)

  it('refuses an empty selection instead of shipping a blank manifest', async () => {
    await expect(buildBostaWorkbook([], { loadAsset })).rejects.toThrow(/at least one/i)
  })

  it('reports the missing fields for the units it did export', async () => {
    const { issues } = await buildBostaWorkbook(
      [operation({ reference: 'DR70700000009', recipientName: '', city: '' })],
      { loadAsset },
    )
    expect(issues).toHaveLength(1)
    expect(issues[0].reference).toBe('DR70700000009')
    expect(issues[0].issues.length).toBeGreaterThan(0)
  }, 120_000)
})
