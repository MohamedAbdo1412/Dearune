// Egypt Post manifest export.
// Loads the real template that ships in the repo (`Egypt Post Manifest.xlsx`),
// writes the selected units into its sheet, and hands back the same workbook.
import egyptPostTemplateUrl from '@/assets/productionDocuments/Egypt Post Manifest.xlsx'

export const EGYPT_POST_TEMPLATE_URL = egyptPostTemplateUrl

export const EGYPT_POST_SHEET = 'Sheet1'
export const EGYPT_POST_HEADER_ROW = 1
export const EGYPT_POST_FIRST_DATA_ROW = 2

// 1-based column index → the field it carries. `header` is the English label
// from the template, kept verbatim so the mapping is auditable.
export const EGYPT_POST_COLUMNS = [
  { column: 1, key: 'packageSerial', header: 'Package_Serial', required: false },
  { column: 2, key: 'description', header: 'Description', required: false },
  { column: 3, key: 'totalWeight', header: 'Total_Weight', required: false },
  { column: 4, key: 'packageVolume', header: 'Package_volume', required: false },
  { column: 5, key: 'codValue', header: 'COD_Value', required: true },
  { column: 6, key: 'itemSpecialNotes', header: 'Item_Special_Notes', required: false },
  { column: 7, key: 'customerName', header: 'Customer_Name', required: true },
  { column: 8, key: 'mobileNo', header: 'Mobile_No', required: true },
  { column: 9, key: 'street', header: 'Street', required: true },
  { column: 10, key: 'city', header: 'City', required: true },
  { column: 11, key: 'packageRefNumber', header: 'Package_Ref. Number', required: true },
  { column: 12, key: 'merchantName', header: 'Merchant_Name', required: false },
  { column: 13, key: 'warehouseName', header: 'Warehouse_Name', required: false },
  { column: 14, key: 'hasPOD', header: 'HasPOD', required: false },
  { column: 15, key: 'sellerName', header: 'SellerName', required: false },
  { column: 16, key: 'postId', header: 'Post_Id', required: true },
]

export const EGYPT_POST_REQUIRED_KEYS = EGYPT_POST_COLUMNS.filter((c) => c.required).map((c) => c.key)

const clean = (value) => String(value ?? '').trim()

// One unit → one Egypt Post row. Pure, so the export can be asserted without
// building a workbook.
export function egyptPostRowValues(operation) {
  const address = [clean(operation.addressLine1), clean(operation.addressLine2)].filter(Boolean).join(', ')
  const reference = clean(operation.reference)

  return {
    packageSerial: '', // Will be set by row number
    description: operation.title ?? 'Dearune letter',
    totalWeight: 0.1,
    packageVolume: 'Small',
    codValue: Number(operation.sale_price ?? 0),
    itemSpecialNotes: clean(operation.specialInstructions),
    customerName: clean(operation.recipientName),
    mobileNo: clean(operation.customerPhone),
    street: address,
    city: clean(operation.city),
    packageRefNumber: reference,
    merchantName: 'Dearune Studio',
    warehouseName: 'Main Warehouse',
    hasPOD: 'yes',
    sellerName: 'Dearune Studio',
    postId: clean(operation.trackingCode ?? operation.carrierReference),
  }
}

// Check for missing required fields
export function egyptPostIssues(operation) {
  const issues = []
  const values = egyptPostRowValues(operation)

  if (!values.customerName) issues.push('Missing customer name')
  if (!values.mobileNo) issues.push('Missing mobile number')
  if (!values.street) issues.push('Missing street address')
  if (!values.city) issues.push('Missing city')
  if (!values.packageRefNumber) issues.push('Missing package reference')
  if (!values.postId) issues.push('Missing tracking code / carrier reference')
  if (!values.codValue || values.codValue <= 0) issues.push('Missing or invalid COD value')

  return issues
}

export function egyptPostEligibility(operation) {
  const issues = egyptPostIssues(operation)
  return { ok: issues.length === 0, issues }
}

// An Egyptian mobile is 11 digits starting 01.
export function phoneWarning(phone) {
  const digits = clean(phone).replace(/[\s\-()+]/g, '')
  if (!digits) return ''
  if (!/^01[0125][0-9]{8}$/.test(digits)) {
    return 'This number is not an 11-digit Egyptian mobile (01xxxxxxxxx)'
  }
  return ''
}

/**
 * Build the Egypt Post manifest workbook for the selected units.
 *
 * @param {Array} operations  Operations records (selection only)
 * @param {{ loadAsset?: (url: string) => Promise<Uint8Array> }} [options]
 * @returns {Promise<{ bytes: Uint8Array, filename: string, rows: number, items: Array, issues: Array }>}
 */
export async function buildEgyptPostWorkbook(operations, options = {}) {
  const rows = (operations ?? []).filter(Boolean)
  if (rows.length === 0) throw new Error('Select at least one Operations record to export')

  const ExcelJS = (await import('exceljs')).default
  const load = options.loadAsset ?? defaultLoadAsset
  const template = await load(EGYPT_POST_TEMPLATE_URL)

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(template)

  const sheet = workbook.getWorksheet(EGYPT_POST_SHEET)
  if (!sheet) throw new Error(`The Egypt Post template is missing its "${EGYPT_POST_SHEET}" sheet`)

  const items = []
  const issues = []
  let cursor = EGYPT_POST_FIRST_DATA_ROW
  for (const operation of rows) {
    const source = operation.addressLine1 !== undefined ? operation : normalise(operation)
    const values = egyptPostRowValues(source)
    values.packageSerial = cursor - EGYPT_POST_FIRST_DATA_ROW + 1

    for (const column of EGYPT_POST_COLUMNS) {
      const value = values[column.key]
      if (value === '' || value === null || value === undefined) continue
      sheet.getCell(cursor, column.column).value = value
    }

    const itemIssues = egyptPostIssues(source)
    items.push({ id: source.id, reference: source.reference, row: cursor, issues: itemIssues })
    if (itemIssues.length) issues.push({ reference: source.reference, issues: itemIssues })
    cursor += 1
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return {
    bytes: new Uint8Array(buffer),
    filename: egyptPostFilename(),
    rows: rows.length,
    items,
    issues,
  }
}

function normalise(row) {
  return {
    id: row.id,
    reference: String(row.reference ?? ''),
    recipientName: row.recipient_name ?? '',
    customerPhone: row.customer_phone ?? '',
    addressLine1: row.address_line1 ?? '',
    addressLine2: row.address_line2 ?? '',
    city: row.city ?? '',
    stateProvince: row.state_province ?? row.governorate ?? '',
    district: row.district ?? '',
    postalCode: row.postal_code ?? '',
    country: row.country ?? '',
    specialInstructions: row.special_instructions ?? '',
    sale_price: row.sale_price,
    title: row.title,
    trackingCode: row.tracking_code,
    carrierReference: row.carrier_reference,
  }
}

async function defaultLoadAsset(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not load the Egypt Post template (${response.status})`)
  return new Uint8Array(await response.arrayBuffer())
}

function egyptPostFilename(date = new Date()) {
  const d = date.toISOString().slice(0, 10)
  return `Egypt-Post-Manifest-Export-${d}.xlsx`
}