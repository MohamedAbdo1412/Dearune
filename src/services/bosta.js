// Bosta shipment upload.
//
// The studio's courier export has to be the workbook Bosta actually accepts,
// so this module does NOT invent a spreadsheet: it loads the real template
// that ships in the repo (`Bosta Upload Template AR V3.5.xlsx`), writes the
// selected units into its upload sheet, and hands back the same workbook. All
// eight sheets, the Arabic headers, the frozen panes and the 21k dropdown
// validations survive untouched — which is exactly why a hand-rolled CSV was
// never going to work.
//
// The template pins the layout: headers live in row 2 of "Add orders here" and
// data starts at row 3. The column map below is copied from that row, so a
// future template version shows up here as a failing test instead of a
// silently mis-aligned upload.
import bostaTemplateUrl from '@/assets/productionDocuments/Bosta Upload Template AR V3.5.xlsx'

export const BOSTA_TEMPLATE_URL = bostaTemplateUrl

export const BOSTA_SHEET = 'Add orders here'
export const BOSTA_HEADER_ROW = 2
export const BOSTA_FIRST_DATA_ROW = 3

// 1-based column index → the field it carries. `header` is the Arabic label
// from the template, kept verbatim so the mapping is auditable.
export const BOSTA_COLUMNS = [
  { column: 1, key: 'customerName', header: '* اسم العميل', required: true },
  { column: 2, key: 'phone', header: '* تليفون', required: true },
  { column: 3, key: 'phone2', header: 'تليفون ثاني' },
  { column: 4, key: 'city', header: '* المدينة', required: true },
  { column: 5, key: 'area', header: 'المنطقة' },
  { column: 6, key: 'address', header: '* العنوان', required: true },
  { column: 7, key: 'landmark', header: 'علامة مميزة' },
  { column: 8, key: 'isWorkAddress', header: 'عنوان عمل؟' },
  { column: 9, key: 'locationLink', header: 'رابط المكان' },
  { column: 10, key: 'notes', header: 'ملاحظات' },
  { column: 12, key: 'codValue', header: 'قيمة التحصيل النقدي' },
  { column: 13, key: 'pieces', header: 'عدد القطع' },
  { column: 14, key: 'description', header: 'وصف الشحنة' },
  { column: 15, key: 'reference', header: 'مرجع الطلب' },
  { column: 16, key: 'shipmentValue', header: 'قيمة الشحنة' },
  { column: 17, key: 'deposit', header: 'مبلغ الديبوزيت' },
  { column: 18, key: 'bostaPoints', header: 'الدفع بواسطة نقاط بوسطة؟' },
  { column: 19, key: 'flexshipFees', header: 'تطبيق رسوم Flexship' },
  { column: 20, key: 'allowOpen', header: 'هل تسمح بفتح الشحنة؟' },
  { column: 21, key: 'brand', header: 'العلامة التجارية' },
  { column: 23, key: 'returnPieces', header: 'عدد قطع المرتجع' },
  { column: 24, key: 'returnDescription', header: 'وصف الشحنة المرتجعة' },
  { column: 26, key: 'shipmentType', header: 'نوع الشحنة' },
]

export const BOSTA_REQUIRED_KEYS = BOSTA_COLUMNS.filter((c) => c.required).map((c) => c.key)

const clean = (value) => String(value ?? '').trim()

// An Egyptian mobile is 11 digits starting 01. Bosta's guide says mobiles
// only, so a landline is worth flagging — but it is the studio's call, not
// ours, so it is reported rather than blocked.
export function phoneWarning(phone) {
  const digits = clean(phone).replace(/[\s\-()+]/g, '')
  if (!digits) return ''
  if (!/^01[0125][0-9]{8}$/.test(digits)) {
    return 'This number is not an 11-digit Egyptian mobile (01xxxxxxxxx)'
  }
  return ''
}

// One unit → one Bosta row. Pure, so the export can be asserted without
// building a workbook.
export function bostaRowValues(operation, { areas = null } = {}) {
  const address = [clean(operation.addressLine1), clean(operation.addressLine2)].filter(Boolean).join(', ')
  const governorate = clean(operation.stateProvince || operation.governorate)
  const city = clean(operation.city)
  const district = clean(operation.district)
  const area = city || district || governorate
  const reference = clean(operation.reference)

  const allowedArea = () => {
    if (!area) return ''
    if (!areas) return area
    if (areas.has(area)) return area
    if (city && areas.has(city)) return city
    if (district && areas.has(district)) return district
    if (governorate && areas.has(governorate)) return governorate
    return ''
  }

  const allowedCity = () => {
    if (governorate && areas) {
      if (areas.has(governorate)) return governorate
    }
    if (governorate) return governorate
    if (city && areas) {
      if (areas.has(city)) return city
    }
    return city || governorate || ''
  }

  return {
    customerName: clean(operation.recipientName),
    phone: clean(operation.customerPhone),
    phone2: '',
    city: allowedCity(),
    area: allowedArea(),
    address,
    landmark: '',
    isWorkAddress: '',
    locationLink: '',
    notes: clean(operation.specialInstructions),
    codValue: '',
    pieces: 1,
    description: reference ? `Dearune letter - ${reference}` : 'Dearune letter',
    reference,
    shipmentValue: '',
    deposit: '',
    bostaPoints: '',
    flexshipFees: '',
    allowOpen: '',
    brand: '',
    returnPieces: '',
    returnDescription: '',
    shipmentType: '',
  }
}

// Exactly what is missing, in the studio's words. Nothing is invented to fill
// a gap.
export function bostaIssues(operation, { areas = null, areasDropped = false } = {}) {
  const row = bostaRowValues(operation, { areas })
  const issues = []
  for (const column of BOSTA_COLUMNS) {
    if (!column.required) continue
    if (!clean(row[column.key])) issues.push(`${column.header}: missing`)
  }
  const phone = phoneWarning(row.phone)
  if (phone) issues.push(`* تليفون: ${phone}`)
  if (areasDropped && clean(operation.stateProvince)) {
    issues.push(`المنطقة: "${clean(operation.stateProvince)}" is not in Bosta's area list, so it was left blank`)
  }
  return issues
}

export function bostaFileStem(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date)
  const pad = (n) => String(n).padStart(2, '0')
  return `Bosta-Export-${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}-${pad(value.getHours())}${pad(value.getMinutes())}`
}

export function bostaFilename(date = new Date()) {
  return `${bostaFileStem(date)}.xlsx`
}

// The area vocabulary is inside the template itself, so it is read from there
// rather than hard-coded — a new template version brings its own list.
export function readBostaAreas(workbook) {
  const sheet = workbook.getWorksheet('Cities and Areas')
  const areas = new Set()
  const cities = new Set()
  if (!sheet) return { areas, cities }
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const value = clean(cell.value && typeof cell.value === 'object' ? '' : cell.value)
      if (!value) return
      if (rowNumber === 1) cities.add(value)
      areas.add(value)
    })
  })
  return { areas, cities }
}

/**
 * Build the Bosta upload workbook for the selected units.
 *
 * @param {Array} operations  Operations records (selection only)
 * @param {{ projectRoot?: string, loadAsset?: (url: string) => Promise<Uint8Array> }} [options]
 * @returns {Promise<{ bytes: Uint8Array, filename: string, rows: number, items: Array, issues: Array }>}
 */
export async function buildBostaWorkbook(operations, options = {}) {
  const rows = (operations ?? []).filter(Boolean)
  if (rows.length === 0) throw new Error('Select at least one Operations record to export')

  const ExcelJS = (await import('exceljs')).default
  const load = options.loadAsset ?? defaultLoadAsset
  const template = await load(BOSTA_TEMPLATE_URL)

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(template)

  const sheet = workbook.getWorksheet(BOSTA_SHEET)
  if (!sheet) throw new Error(`The Bosta template is missing its "${BOSTA_SHEET}" sheet`)

  const { areas } = readBostaAreas(workbook)

  const items = []
  const issues = []
  let cursor = BOSTA_FIRST_DATA_ROW
  for (const operation of rows) {
    const source = operation.addressLine1 !== undefined ? operation : normalise(operation)
    const dropped = Boolean(clean(source.stateProvince)) && !areas.has(clean(source.stateProvince))
    const values = bostaRowValues(source, { areas })
    for (const column of BOSTA_COLUMNS) {
      const value = values[column.key]
      if (value === '' || value === null || value === undefined) continue
      sheet.getCell(cursor, column.column).value = value
    }
    const itemIssues = bostaIssues(source, { areas, areasDropped: dropped })
    items.push({ id: source.id, reference: source.reference, row: cursor, issues: itemIssues })
    if (itemIssues.length) issues.push({ reference: source.reference, issues: itemIssues })
    cursor += 1
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return {
    bytes: new Uint8Array(buffer),
    filename: bostaFilename(),
    rows: rows.length,
    items,
    issues,
  }
}

function normalise(row) {
  return {
    id: row.id,
    reference: String(row.reference ?? ''),
    status: row.status,
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
  }
}

async function defaultLoadAsset(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not load the Bosta template (${response.status})`)
  return new Uint8Array(await response.arrayBuffer())
}

// Which units a Bosta shipment export can actually carry. The courier needs a
// deliverable address, not a status.
export function bostaEligibility(operation) {
  const issues = bostaIssues(operation)
  return { ok: issues.length === 0, issues }
}
