// Carriers — the vocabulary the studio actually ships with.
//
// Two carriers exist today: Bosta (export only) and Egypt Post (the manifest
// the studio receives back from the post office). The shapes are genuinely
// different, so each carrier is described by an ADAPTER rather than by one
// shared "shipment spreadsheet" fantasy:
//
//   * `export`   — how a shipment leaves the studio (Bosta upload workbook).
//   * `manifest` — how a carrier's own document comes back and is mapped onto
//                  the database (Egypt Post only, for now).
//
// Adding Bosta manifests later means adding a parser to `CARRIERS.bosta` — the
// matcher, the preview, the snapshot and the transition it triggers are all
// carrier-agnostic and already live behind the same interface.
//
// Everything here is pure: no React, no Supabase, no file system. The workbook
// reader is the only side-effecting helper and it is kept at the bottom.

// ---------------------------------------------------------------------------
// Egypt Post — the real workbook, read from
// src/assets/productionDocuments/Egypt Post Manifest.xlsx
// ---------------------------------------------------------------------------
//
// The file has one upload sheet ("Sheet1") with sixteen columns in row 1, and
// a second sheet holding the vocabularies the upload sheet validates against:
//
//   sheet   column  meaning                        values
//   Sheet2  A       Service Type                   Door-to-Door | Door-to-Counter
//   Sheet2  B       Service Category                Delivery | Return
//   Sheet2  C       Payment Type                    Pre-Paid | Cash-on-Delivery | CC-on-Delivery | Paid
//   Sheet2  D       Service                         Same Day | Next Day
//   Sheet2  E       City (governorate)              27 upper-case names
//   Sheet2  F       Return                          Door-to-Door | Counter-to-Door
//   Sheet2  G       Package volume                  Small | medium | Large
//
// Sheet1 is shipped EMPTY — it is a template, not a historical manifest. The
// studio fills it in (or the post office sends it back filled), which is why
// the importer must tolerate blank rows, extra columns and numbers arriving as
// text.
export const EGYPT_POST = {
  key: 'egypt_post',
  label: 'Egypt Post',
  short: 'Egypt Post',
  // Column names exactly as they appear in row 1 of the upload sheet.
  columns: [
    { column: 1, key: 'serial', header: 'Package_Serial' },
    { column: 2, key: 'description', header: 'Description' },
    { column: 3, key: 'weight', header: 'Total_Weight' },
    { column: 4, key: 'volume', header: 'Package_volume' },
    { column: 5, key: 'cod', header: 'COD_Value' },
    { column: 6, key: 'notes', header: 'Item_Special_Notes' },
    { column: 7, key: 'recipientName', header: 'Customer_Name' },
    { column: 8, key: 'phone', header: 'Mobile_No' },
    { column: 9, key: 'street', header: 'Street' },
    { column: 10, key: 'city', header: 'City' },
    // The merchant's own reference. The studio writes its canonical Dearune id
    // here, which is what makes a returned manifest matchable at all.
    { column: 11, key: 'reference', header: 'Package_Ref. Number' },
    { column: 12, key: 'merchant', header: 'Merchant_Name' },
    { column: 13, key: 'warehouse', header: 'Warehouse_Name' },
    { column: 14, key: 'pod', header: 'HasPOD' },
    { column: 15, key: 'seller', header: 'SellerName' },
    // The post office's own tracking id.
    { column: 16, key: 'tracking', header: 'Post_Id' },
  ],
  // Vocabularies copied verbatim from Sheet2 of the real workbook, so a
  // manifest that uses a city the post office no longer accepts is reported
  // instead of being silently imported.
  governorates: [
    'CAIRO',
    'GIZA',
    'ALEXANDRIA',
    'BEHIRA',
    'QALIUBIA',
    'GHARBIA',
    'MONOUFIA',
    'DOMITTA',
    'DAKAHLIA',
    'KAFR EL SHEIKH',
    'MARSA MATROUH',
    'ISMAILIA',
    'SUEZ',
    'PORT SAID',
    'SHARKIA',
    'FAYOUM',
    'BANI SWEIF',
    'MENIA',
    'ASSIUT',
    'SOUHAGE',
    'QENA',
    'ASWAN',
    'LOUXOR',
    'RED SEA',
    'NEW VALLLEY',
    'NOURTH SINAI',
    'SOUTH SINAI',
  ],
  volumes: ['Small', 'medium', 'Large', 'Extra Weight'],
  podValues: ['yes', 'no'],
  // A row is worth offering for matching when it carries at least one of these.
  identityHeaders: ['Package_Ref. Number', 'Post_Id'],
  requiredForShipping: ['Mobile_No', 'Street', 'City', 'Post_Id'],
}

export const BOSTA = {
  key: 'bosta',
  label: 'Bosta',
  short: 'Bosta',
  // Bosta shipments leave through the upload workbook and come back through
  // Bosta's own dashboard/API, which this codebase does not call. There is no
  // manifest file to parse, so no parser is invented here.
  columns: [],
  manifestNote:
    'Bosta manifests are not imported yet: the studio exports the upload workbook and Bosta reports delivery in its own dashboard. Add a parser here when a real Bosta manifest file exists.',
}

export const CARRIERS = [BOSTA, EGYPT_POST]

export const CARRIER_KEYS = CARRIERS.map((carrier) => carrier.key)

export function carrierDefinition(key) {
  const wanted = String(key ?? '').trim().toLowerCase()
  return CARRIERS.find((carrier) => carrier.key === wanted) ?? null
}

export function carrierLabel(key) {
  return carrierDefinition(key)?.label ?? '—'
}

export function carrierSupportsManifest(key) {
  return carrierDefinition(key)?.key === EGYPT_POST.key
}

// ---------------------------------------------------------------------------
// Reading cells
// ---------------------------------------------------------------------------
// ExcelJS returns a bare value for a plain cell but an object for a formula,
// a hyperlink or rich text. A manifest is a human document, so every cell is
// flattened the same way whether it was typed, pasted or computed.
export function cellText(value) {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text ?? '').join('')
    if (value.text !== undefined && value.hyperlink !== undefined) return String(value.text)
    if (value.result !== undefined) return cellText(value.result)
    if (value.text !== undefined) return String(value.text)
    if (value.error !== undefined) return ''
    return ''
  }
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  return String(value)
}

const clean = (value) => cellText(value).replace(/\u00a0/g, ' ').trim()

// Header names are compared loosely: case, punctuation, spacing and a trailing
// full stop all change between Excel versions and between post offices.
export function normalizeHeader(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[\s._-]+/g, ' ')
    .replace(/[^\p{L}\p{N} ]+/gu, '')
    .trim()
}

// ---------------------------------------------------------------------------
// Egypt Post rows
// ---------------------------------------------------------------------------
/**
 * Map a header row onto keys.
 *
 * @param {Array} headerValues one row of raw cell values
 * @returns {{ map: Record<string, number>, headers: string[], unknown: string[] }}
 */
export function mapHeaders(headerValues, columns = EGYPT_POST.columns) {
  const byNormalized = new Map()
  for (const column of columns) byNormalized.set(normalizeHeader(column.header), column.key)

  const map = {}
  const headers = []
  const unknown = []
  ;(headerValues ?? []).forEach((raw, index) => {
    const header = clean(raw)
    if (!header) return
    headers.push(header)
    const key = byNormalized.get(normalizeHeader(header))
    if (key) map[key] = index + 1
    else unknown.push(header)
  })
  return { map, headers, unknown }
}

/**
 * Turn the upload sheet into manifest rows. Pure: takes raw rows, returns the
 * normalised shape the matcher and the snapshot use.
 *
 * @param {Array<Array>} dataRows rows below the header, one array per row
 * @param {{ map?: Record<string, number>, headerRow?: number }} [options]
 */
export function parseEgyptPostRows(dataRows, { map = mapHeaders(EGYPT_POST.columns.map((c) => c.header)).map, headerRow = 1 } = {}) {
  const rows = []
  ;(dataRows ?? []).forEach((values, index) => {
    const at = (key) => {
      const column = map[key]
      if (!column) return ''
      return clean(values?.[column - 1])
    }

    const row = {
      line: headerRow + index + 1,
      serial: at('serial'),
      description: at('description'),
      weight: at('weight'),
      volume: at('volume'),
      cod: at('cod'),
      notes: at('notes'),
      recipientName: at('recipientName'),
      phone: at('phone'),
      street: at('street'),
      city: at('city'),
      reference: at('reference'),
      merchant: at('merchant'),
      warehouse: at('warehouse'),
      pod: at('pod'),
      seller: at('seller'),
      tracking: at('tracking'),
    }

    // A fully blank row is padding, not a shipment. Excel leaves thousands of
    // them behind after a paste.
    if (Object.entries(row).every(([key, value]) => key === 'line' || value === '')) return
    rows.push(row)
  })
  return rows
}

// What is missing for Egypt Post to accept the parcel. These are warnings on
// the preview (the row can still be resolved), but they are reported so a
// blank Street or Mobile_No never ships silently.
export function egyptPostRowIssues(row) {
  const issues = []
  if (!row.phone) issues.push('Mobile_No is missing')
  else if (!/^01[0-9]{9}$/.test(row.phone.replace(/[\s-]/g, ''))) issues.push(`Mobile_No "${row.phone}" is not an 11-digit Egyptian mobile`)
  if (!row.street) issues.push('Street is missing')
  if (!row.city) issues.push('City is missing')
  else if (!EGYPT_POST.governorates.includes(row.city.toUpperCase())) {
    issues.push(`City "${row.city}" is not one of Egypt Post's governorates`)
  }
  if (!row.tracking) issues.push('Post_Id (tracking) is missing')
  if (!row.reference) issues.push('Package_Ref. Number (Dearune id) is missing')
  if (row.volume && !EGYPT_POST.volumes.includes(row.volume)) {
    issues.push(`Package_volume "${row.volume}" is not one of ${EGYPT_POST.volumes.join(' / ')}`)
  }
  if (row.pod && !EGYPT_POST.podValues.includes(row.pod.toLowerCase())) {
    issues.push(`HasPOD "${row.pod}" must be yes or no`)
  }
  return issues
}

// ---------------------------------------------------------------------------
// Matching keys
// ---------------------------------------------------------------------------
// The canonical id, its unit form, the Sold As form and the sale ledger
// reference can all appear in Package_Ref. Number. They are normalised the same
// way the database stores them, so `dr-000021`, `DR-000021 ` and `DR000021`
// resolve to one candidate — but nothing is ever *rewritten*.
export function normalizeReference(value) {
  return clean(value).replace(/\s+/g, '').toUpperCase()
}

export const REFERENCE_KINDS = ['canonical', 'unit', 'sold', 'sale', 'legacy']

export function referenceCandidate(value) {
  const normalized = normalizeReference(value)
  if (!normalized) return ''
  // `SOL-DR70700000011` and `SOL-DR-70700000011` are the same sold reference.
  return normalized.startsWith('SOL-') ? `SOL-${normalized.slice(4).replace(/-/g, '')}` : normalized
}

// Two rows in one file that claim the same Dearune or the same tracking number
// are a document error the studio must fix, not a race to resolve.
export function manifestRowKey(row) {
  const reference = referenceCandidate(row.reference)
  if (reference) return `ref:${reference}`
  const tracking = normalizeReference(row.tracking)
  if (tracking) return `track:${tracking}`
  return `line:${row.line}`
}

// ---------------------------------------------------------------------------
// Row statuses — shared by the server preview and the screen
// ---------------------------------------------------------------------------
export const MANIFEST_STATUS = {
  MATCHED: 'matched',
  ALREADY_SHIPPED: 'already_shipped',
  UNMATCHED: 'unmatched',
  AMBIGUOUS: 'ambiguous',
  DUPLICATE: 'duplicate',
  CONFLICT: 'conflict',
  BLOCKED: 'blocked',
  INVALID: 'invalid',
}

export const MANIFEST_STATUS_LABELS = {
  matched: 'Matched',
  already_shipped: 'Already shipped',
  unmatched: 'Not found',
  ambiguous: 'Needs a decision',
  duplicate: 'Duplicate in file',
  conflict: 'Conflicting tracking',
  blocked: 'Not in Shipping',
  invalid: 'Invalid row',
}

// Rows that can be committed as they stand.
export const MANIFEST_COMMITTABLE = [MANIFEST_STATUS.MATCHED, MANIFEST_STATUS.ALREADY_SHIPPED]

/**
 * Flag duplicates inside the file before anything touches the database.
 * The first occurrence keeps the row; every later one is reported so the
 * studio can decide which line is real.
 */
export function flagDuplicates(rows) {
  const seen = new Map()
  return rows.map((row) => {
    const key = manifestRowKey(row)
    const first = seen.get(key)
    if (!first || key.startsWith('line:')) {
      seen.set(key, row.line)
      return { ...row, status: row.status ?? MANIFEST_STATUS.MATCHED, duplicateOf: null }
    }
    return {
      ...row,
      status: MANIFEST_STATUS.DUPLICATE,
      duplicateOf: first,
      message: `Same identifier as line ${first}`,
    }
  })
}

export function summarizeManifest(rows) {
  const summary = {
    total: rows.length,
    matched: 0,
    already_shipped: 0,
    unmatched: 0,
    ambiguous: 0,
    duplicate: 0,
    conflict: 0,
    blocked: 0,
    invalid: 0,
    committable: 0,
  }
  for (const row of rows) {
    if (row.status in summary) summary[row.status] += 1
    if (MANIFEST_COMMITTABLE.includes(row.status)) summary.committable += 1
  }
  return summary
}

// ---------------------------------------------------------------------------
// Workbook reading (the only impure helper)
// ---------------------------------------------------------------------------
function rowValues(row) {
  const values = []
  row.eachCell({ includeEmpty: true }, (cell, column) => {
    values[column - 1] = cell.value
  })
  return values
}

/**
 * Find the Egypt Post upload sheet and read its rows. The sheet is located by
 * its headers rather than by name, because a manifest exported by the post
 * office is not always called "Sheet1".
 */
export function readEgyptPostWorkbook(workbook) {
  const wanted = ['Customer_Name', 'Mobile_No']

  for (const sheet of workbook.worksheets) {
    for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount || 0, 10); rowNumber += 1) {
      const headerValues = rowValues(sheet.getRow(rowNumber))
      const text = headerValues.map((value) => normalizeHeader(value))
      const hasAll = wanted.every((header) => text.includes(normalizeHeader(header)))
      if (!hasAll) continue

      const { map, headers, unknown } = mapHeaders(headerValues)
      const dataRows = []
      for (let at = rowNumber + 1; at <= sheet.rowCount; at += 1) {
        dataRows.push(rowValues(sheet.getRow(at)))
      }
      return {
        sheetName: sheet.name,
        headerRow: rowNumber,
        headers,
        unknownHeaders: unknown,
        columns: EGYPT_POST.columns.map((column) => ({ ...column, present: Boolean(map[column.key]) })),
        rows: parseEgyptPostRows(dataRows, { map, headerRow: rowNumber }),
      }
    }
  }
  return null
}

export function readManifestWorkbook(workbook, carrierKey) {
  if (carrierKey === EGYPT_POST.key) return readEgyptPostWorkbook(workbook)
  return null
}

/**
 * Read a manifest the administrator picked from disk. The workbook is parsed in
 * the browser so nothing is uploaded until the preview is confirmed, and the
 * carrier decides which parser runs — Bosta has none yet, and says so.
 */
export async function readManifestFile(file, carrierKey) {
  if (!carrierSupportsManifest(carrierKey)) {
    throw new Error(carrierDefinition(carrierKey)?.manifestNote ?? 'That carrier has no manifest format')
  }
  const buffer = await file.arrayBuffer()
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const parsed = readManifestWorkbook(workbook, carrierKey)
  if (!parsed) {
    throw new Error(
      'No upload sheet was found. The Egypt Post manifest needs a row with Customer_Name and Mobile_No headers.',
    )
  }
  return { ...parsed, filename: file.name }
}
