import fs from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  BOSTA,
  CARRIERS,
  EGYPT_POST,
  MANIFEST_STATUS,
  carrierDefinition,
  carrierLabel,
  carrierSupportsManifest,
  cellText,
  egyptPostRowIssues,
  flagDuplicates,
  manifestRowKey,
  mapHeaders,
  normalizeHeader,
  normalizeReference,
  parseEgyptPostRows,
  readEgyptPostWorkbook,
  readManifestWorkbook,
  referenceCandidate,
  summarizeManifest,
} from '../src/services/carriers'

// The Egypt Post adapter is built from the real workbook that ships in the
// repo, so the tests read that workbook rather than a hand-written fixture. A
// future manifest version shows up here as a failing assertion instead of a
// silently mis-aligned import.

const WORKBOOK = path.resolve(process.cwd(), 'src/assets/productionDocuments/Egypt Post Manifest.xlsx')

async function realWorkbook() {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(fs.readFileSync(WORKBOOK))
  return workbook
}

describe('the real Egypt Post workbook', () => {
  // Loading the workbook is the slow part, so it is done once for the whole
  // block; the parser only reads it and never mutates it.
  let workbook

  beforeAll(async () => {
    workbook = await realWorkbook()
  }, 60_000)

  it('is found by its headers rather than by sheet name', async () => {
    const parsed = readEgyptPostWorkbook(workbook)
    expect(parsed).not.toBeNull()
    expect(parsed.sheetName).toBe('Sheet1')
    expect(parsed.headerRow).toBe(1)
    // The shipped file is an empty template: headers, no shipments.
    expect(parsed.rows).toEqual([])
  })

  it('has exactly the sixteen columns the adapter maps', async () => {
    const parsed = readEgyptPostWorkbook(workbook)
    const expected = [
      'Package_Serial',
      'Description',
      'Total_Weight',
      'Package_volume',
      'COD_Value',
      'Item_Special_Notes',
      'Customer_Name',
      'Mobile_No',
      'Street',
      'City',
      'Package_Ref. Number',
      'Merchant_Name',
      'Warehouse_Name',
      'HasPOD',
      'SellerName',
      'Post_Id',
    ]
    expect(parsed.headers).toEqual(expected)
    expect(parsed.columns.every((column) => column.present)).toBe(true)
    expect(parsed.unknownHeaders).toEqual([])
    expect(EGYPT_POST.columns.map((column) => column.header)).toEqual(expected)
  })

  it('carries the governorate vocabulary the sheet validates against', async () => {
    const sheet = workbook.getWorksheet('Sheet2')
    const values = []
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const value = cellText(row.getCell(5).value)
      if (value && value !== 'City') values.push(value)
    })
    expect(values).toEqual(EGYPT_POST.governorates)
    expect(EGYPT_POST.governorates).toContain('CAIRO')
    expect(EGYPT_POST.governorates).toHaveLength(27)
  })

  it('produces no manifest rows for a non-Egypt-Post workbook', async () => {
    const workbook = new ExcelJS.Workbook()
    workbook.addWorksheet('Sheet1').addRow(['Name', 'Phone'])
    expect(readEgyptPostWorkbook(workbook)).toBeNull()
    expect(readManifestWorkbook(workbook, 'bosta')).toBeNull()
  })
})

describe('header mapping', () => {
  it('normalises case, spacing, punctuation and a trailing full stop', () => {
    expect(normalizeHeader(' Package_Ref. Number ')).toBe('package ref number')
    expect(normalizeHeader('POST_ID')).toBe('post id')
    expect(normalizeHeader('Package Volume')).toBe('package volume')
    expect(normalizeHeader('Customer-Name')).toBe('customer name')
  })

  it('maps loose header spellings onto the same keys and reports the rest', () => {
    const { map, headers, unknown } = mapHeaders([
      'package_serial',
      ' customer_name',
      'MOBILE_NO',
      'Package Ref. Number',
      'Post_ID',
      'Something Else',
    ])
    expect(map).toMatchObject({
      serial: 1,
      recipientName: 2,
      phone: 3,
      reference: 4,
      tracking: 5,
    })
    expect(headers).toHaveLength(6)
    expect(unknown).toEqual(['Something Else'])
  })
})

describe('row parsing', () => {
  const map = {
    serial: 1,
    description: 2,
    volume: 3,
    recipientName: 4,
    phone: 5,
    street: 6,
    city: 7,
    reference: 8,
    notes: 9,
    tracking: 10,
  }

  it('turns a data row into the normalised manifest shape', () => {
    const [row] = parseEgyptPostRows(
      [['1', 'Leather journal', 'Small', 'Hana', '01012345678', '12 Nile St', 'CAIRO', 'DR-000021', '', 'EP-1']],
      { map, headerRow: 1 },
    )
    expect(row).toEqual({
      line: 2,
      serial: '1',
      description: 'Leather journal',
      weight: '',
      volume: 'Small',
      cod: '',
      notes: '',
      recipientName: 'Hana',
      phone: '01012345678',
      street: '12 Nile St',
      city: 'CAIRO',
      reference: 'DR-000021',
      merchant: '',
      warehouse: '',
      pod: '',
      seller: '',
      tracking: 'EP-1',
    })
  })

  it('drops blank padding rows but keeps every real line', () => {
    const rows = parseEgyptPostRows(
      [
        [],
        ['1', '', 'Small', 'Hana', '01012345678', '12 Nile St', 'CAIRO', 'DR-000021', '', 'EP-1'],
        ['  ', '', '', '', '', '', '', '', '', ''],
        ['2', '', '', 'Omar', '01000000000', '5 Palm', 'GIZA', 'DR-000022', '', 'EP-2'],
      ],
      { map, headerRow: 1 },
    )
    expect(rows.map((row) => row.line)).toEqual([3, 5])
    expect(rows.map((row) => row.reference)).toEqual(['DR-000021', 'DR-000022'])
  })
})

describe('row issues', () => {
  const good = {
    phone: '01012345678',
    street: '12 Nile St',
    city: 'CAIRO',
    tracking: 'EP-1',
    reference: 'DR-000021',
    volume: 'Small',
    pod: 'yes',
  }

  it('accepts a complete Egypt Post row', () => {
    expect(egyptPostRowIssues(good)).toEqual([])
  })

  it('reports each missing or malformed field instead of silently shipping it', () => {
    const issues = egyptPostRowIssues({
      phone: '12345',
      street: '',
      city: 'CAIRO',
      tracking: '',
      reference: '',
      volume: 'Huge',
      pod: 'maybe',
    })
    expect(issues).toContain('Mobile_No "12345" is not an 11-digit Egyptian mobile')
    expect(issues).toContain('Street is missing')
    expect(issues).toContain('Post_Id (tracking) is missing')
    expect(issues).toContain('Package_Ref. Number (Dearune id) is missing')
    expect(issues).toContain('Package_volume "Huge" is not one of Small / medium / Large / Extra Weight')
    expect(issues).toContain('HasPOD "maybe" must be yes or no')
  })

  it('reports a governorate the post office does not accept', () => {
    expect(egyptPostRowIssues({ ...good, city: 'ATLANTIS' })).toContain(
      'City "ATLANTIS" is not one of Egypt Post\'s governorates',
    )
  })
})

describe('reference normalisation', () => {
  it('treats the same identifier typed differently as one candidate', () => {
    expect(normalizeReference(' dr-000021 ')).toBe('DR-000021')
    expect(normalizeReference('DR 000021')).toBe('DR000021')
    expect(normalizeReference(null)).toBe('')
  })

  it('normalises both Sold As spellings to the same canonical form', () => {
    expect(referenceCandidate('SOL-DR70700000011')).toBe('SOL-DR70700000011')
    expect(referenceCandidate('sol-dr-70700000011')).toBe('SOL-DR70700000011')
    expect(referenceCandidate('DR70700000011')).toBe('DR70700000011')
  })

  it('keys a row by its Dearune id first and its tracking number second', () => {
    expect(manifestRowKey({ line: 2, reference: 'dr-000021', tracking: 'EP-1' })).toBe('ref:DR-000021')
    expect(manifestRowKey({ line: 2, reference: '', tracking: 'ep-1' })).toBe('track:EP-1')
    expect(manifestRowKey({ line: 7, reference: '', tracking: '' })).toBe('line:7')
  })
})

describe('manifest statuses', () => {
  it('flags the second row with the same identifier without dropping it', () => {
    const rows = flagDuplicates([
      { line: 2, reference: 'DR-000021', tracking: 'EP-1' },
      { line: 3, reference: 'DR-000021', tracking: 'EP-2' },
      { line: 4, reference: 'DR-000022', tracking: 'EP-3' },
    ])
    expect(rows[0].status).toBe(MANIFEST_STATUS.MATCHED)
    expect(rows[1].status).toBe(MANIFEST_STATUS.DUPLICATE)
    expect(rows[1].duplicateOf).toBe(2)
    expect(rows[2].status).toBe(MANIFEST_STATUS.MATCHED)
  })

  it('summarises a preview in one place, including blocked rows', () => {
    const summary = summarizeManifest([
      { status: MANIFEST_STATUS.MATCHED },
      { status: MANIFEST_STATUS.ALREADY_SHIPPED },
      { status: MANIFEST_STATUS.UNMATCHED },
      { status: MANIFEST_STATUS.AMBIGUOUS },
      { status: MANIFEST_STATUS.DUPLICATE },
      { status: MANIFEST_STATUS.CONFLICT },
      { status: MANIFEST_STATUS.BLOCKED },
      { status: MANIFEST_STATUS.INVALID },
    ])
    expect(summary).toEqual({
      total: 8,
      matched: 1,
      already_shipped: 1,
      unmatched: 1,
      ambiguous: 1,
      duplicate: 1,
      conflict: 1,
      blocked: 1,
      invalid: 1,
      committable: 2,
    })
  })
})

describe('carrier registry', () => {
  it('describes only the carriers that exist', () => {
    expect(CARRIERS.map((carrier) => carrier.key)).toEqual(['bosta', 'egypt_post'])
    expect(carrierDefinition('EGYPT_POST')?.key).toBe('egypt_post')
    expect(carrierDefinition('aramex')).toBeNull()
    expect(carrierLabel('bosta')).toBe('Bosta')
    expect(carrierLabel('aramex')).toBe('—')
  })

  it('offers a manifest parser for Egypt Post only, and says so for Bosta', () => {
    expect(carrierSupportsManifest('egypt_post')).toBe(true)
    expect(carrierSupportsManifest('bosta')).toBe(false)
    expect(BOSTA.manifestNote).toMatch(/not imported yet/)
  })
})
