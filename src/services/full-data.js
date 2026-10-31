// Full Data — the administrative master view of every Dearune order.
//
// This is an Excel-like table over the `ops_full_data` view. It projects
// one logical row per Dearune (no fan-out from units/refunds/events) and
// includes every administrative column the studio needs. Secrets (public_token,
// payload) are never exposed.
//
// Reading is server-side: filtering, sorting and pagination happen in the
// database so thousands of rows behave the same as ten. Exports (CSV/XLSX)
// respect the same filters and permissions.

import { supabase, currentAccessToken, invokeFunction } from '@/lib/supabase'

// Column groups for the Full Data table. Each group is a logical section of
// the spreadsheet. The `key` is used for column visibility toggling.
export const FULL_DATA_COLUMN_GROUPS = [
  {
    key: 'identity',
    label: 'A — Identity',
    columns: [
      { key: 'project_id', label: 'Project UUID', type: 'uuid' },
      { key: 'canonical_id', label: 'Dearune ID', type: 'id' },
      { key: 'sold_id', label: 'Sold ID', type: 'id' },
      { key: 'unit_reference', label: 'Unit ID', type: 'id' },
      { key: 'search_references', label: 'All References', type: 'text' },
    ],
  },
  {
    key: 'customer',
    label: 'B — Customer',
    columns: [
      { key: 'title', label: 'Dearune Name', type: 'text' },
      { key: 'recipient_name', label: 'Recipient (Handed To)', type: 'text' },
      { key: 'customer_phone', label: 'Phone', type: 'phone' },
      { key: 'recipient_phone_alt', label: 'Alt Phone', type: 'phone' },
      { key: 'address_line1', label: 'Address 1', type: 'text' },
      { key: 'address_line2', label: 'Address 2', type: 'text' },
      { key: 'city', label: 'City', type: 'text' },
      { key: 'state_province', label: 'State/Province', type: 'text' },
      { key: 'governorate', label: 'Governorate', type: 'text' },
      { key: 'district', label: 'District', type: 'text' },
      { key: 'postal_code', label: 'Postal Code', type: 'text' },
      { key: 'country', label: 'Country', type: 'text' },
      { key: 'special_instructions', label: 'Special Instructions', type: 'text' },
    ],
  },
  {
    key: 'designer',
    label: 'C — Designer',
    columns: [
      { key: 'designer_id', label: 'Designer UUID', type: 'uuid' },
      { key: 'designer_name', label: 'Designer Name', type: 'text' },
      { key: 'designer_code', label: 'Designer Code', type: 'id' },
    ],
  },
  {
    key: 'product',
    label: 'D — Product',
    columns: [
      { key: 'wrapper_type', label: 'Wrapper', type: 'text' },
      { key: 'template_slug', label: 'Template Slug', type: 'text' },
      { key: 'template_name', label: 'Template Name', type: 'text' },
      { key: 'is_digital', label: 'Digital Only', type: 'boolean' },
      { key: 'unit_count', label: 'Units', type: 'number' },
    ],
  },
  {
    key: 'message',
    label: 'E — Message',
    columns: [
      { key: 'message_active', label: 'Published', type: 'boolean' },
      { key: 'message_protected', label: 'Password Protected', type: 'boolean' },
      { key: 'message_activated_at', label: 'Activated At', type: 'datetime' },
      { key: 'recipient_opened_at', label: 'First Opened At', type: 'datetime' },
      { key: 'recipient_open_count', label: 'Open Count', type: 'number' },
    ],
  },
  {
    key: 'milestones',
    label: 'F — Milestones / Lifecycle',
    columns: [
      { key: 'milestone', label: 'Current Milestone', type: 'milestone' },
      { key: 'milestone_updated_at', label: 'Last Milestone Change', type: 'datetime' },
      { key: 'milestone_updated_by_name', label: 'Changed By', type: 'text' },
      { key: 'paid_at', label: 'Paid At', type: 'datetime' },
      { key: 'manufactured_at', label: 'Manufactured At', type: 'datetime' },
      { key: 'shipped_at', label: 'Shipped At', type: 'datetime' },
      { key: 'arrived_at', label: 'Arrived At', type: 'datetime' },
      { key: 'archived_at', label: 'Archived At', type: 'datetime' },
      { key: 'last_event_at', label: 'Last Event', type: 'datetime' },
      { key: 'last_event_action', label: 'Last Event Action', type: 'text' },
    ],
  },
  {
    key: 'qr',
    label: 'G — QR',
    columns: [
      { key: 'qr_destination', label: 'QR Destination', type: 'text' },
      { key: 'qr_activated', label: 'QR Activated', type: 'boolean' },
      { key: 'qr_openable', label: 'QR Openable', type: 'boolean' },
      { key: 'qr_blocked_reason', label: 'QR Blocked Reason', type: 'text' },
    ],
  },
  {
    key: 'production',
    label: 'H — Production',
    columns: [
      { key: 'created_at', label: 'Order Created', type: 'datetime' },
      { key: 'updated_at', label: 'Order Updated', type: 'datetime' },
      { key: 'submitted_at', label: 'Submitted At', type: 'datetime' },
      { key: 'configured_at', label: 'Configured At', type: 'datetime' },
    ],
  },
  {
    key: 'shipping',
    label: 'I — Shipping',
    columns: [
      { key: 'carrier', label: 'Carrier', type: 'text' },
      { key: 'carrier_reference', label: 'Carrier Reference', type: 'text' },
      { key: 'tracking_code', label: 'Tracking Code', type: 'text' },
      { key: 'manifest_id', label: 'Manifest UUID', type: 'uuid' },
      { key: 'manifest_filename', label: 'Manifest File', type: 'text' },
      { key: 'shipment_state', label: 'Shipment State', type: 'text' },
      { key: 'shipment_shipped_at', label: 'Shipped At (Shipment)', type: 'datetime' },
      { key: 'shipment_delivered_at', label: 'Delivered At (Shipment)', type: 'datetime' },
    ],
  },
  {
    key: 'financial',
    label: 'J — Financial',
    columns: [
      { key: 'currency', label: 'Currency', type: 'text' },
      { key: 'sale_price', label: 'Sale Price', type: 'money' },
      { key: 'estimated_cost', label: 'Estimated Cost', type: 'money' },
      { key: 'refunded_amount', label: 'Refunded Amount', type: 'money' },
      { key: 'refund_count', label: 'Refund Count', type: 'number' },
    ],
  },
  {
    key: 'after-sale',
    label: 'K — After-Sale',
    columns: [
      { key: 'refunded_amount', label: 'Total Refunded', type: 'money' },
      { key: 'refund_count', label: 'Refund Count', type: 'number' },
    ],
  },
  {
    key: 'admin',
    label: 'L — Administrative',
    columns: [
      { key: 'policy_version', label: 'Policy Version', type: 'text' },
      { key: 'template_version', label: 'Template Version', type: 'number' },
    ],
  },
]

// Flattened column list for the query builder.
export const FULL_DATA_ALL_COLUMNS = FULL_DATA_COLUMN_GROUPS.flatMap((group) => group.columns)

export const FULL_DATA_DEFAULT_VISIBLE = [
  'canonical_id',
  'sold_id',
  'title',
  'recipient_name',
  'customer_phone',
  'designer_name',
  'designer_code',
  'wrapper_type',
  'template_slug',
  'is_digital',
  'message_active',
  'milestone',
  'milestone_updated_at',
  'carrier',
  'tracking_code',
  'shipment_state',
  'sale_price',
  'currency',
  'refunded_amount',
  'created_at',
]

const SEARCH_COLUMNS = [
  'canonical_id',
  'sold_id',
  'title',
  'recipient_name',
  'customer_phone',
  'designer_name',
  'designer_code',
  'tracking_code',
  'carrier_reference',
  'city',
  'governorate',
]

export function sanitizeSearch(value) {
  return String(value ?? '')
    .replace(/[,()*%_\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export const FULL_DATA_SORTS = [
  { key: 'newest', label: 'Newest first', column: 'created_at' },
  { key: 'oldest', label: 'Oldest first', column: 'created_at', ascending: true },
  { key: 'updated', label: 'Recently updated', column: 'updated_at' },
  { key: 'id', label: 'Dearune ID', column: 'canonical_id', ascending: true },
  { key: 'sold', label: 'Sold ID', column: 'sold_id', ascending: true },
  { key: 'customer', label: 'Recipient', column: 'recipient_name', ascending: true },
  { key: 'designer', label: 'Designer', column: 'designer_name', ascending: true },
  { key: 'milestone', label: 'Milestone', column: 'milestone', ascending: true },
  { key: 'carrier', label: 'Carrier', column: 'carrier', ascending: true },
  { key: 'delivered', label: 'Delivered on', column: 'shipment_delivered_at' },
  { key: 'refunded', label: 'Refunded amount', column: 'refunded_amount' },
  { key: 'price', label: 'Sale price', column: 'sale_price' },
  { key: 'paid', label: 'Paid on', column: 'paid_at' },
  { key: 'activated', label: 'Message activated', column: 'message_activated_at' },
  { key: 'opened', label: 'First opened', column: 'recipient_opened_at' },
]

export function sortDefinition(key) {
  const found = FULL_DATA_SORTS.find((sort) => sort.key === key)
  return found ?? { key: 'newest', label: 'Newest first', column: 'created_at' }
}

export const FULL_DATA_EMPTY_FILTERS = {
  query: '',
  milestone: '',
  designerId: '',
  wrapperType: '',
  carrier: '',
  shipmentState: '',
  refund: '',
  messageActive: '',
  recipientOpened: '',
  paidFrom: '',
  paidTo: '',
  createdFrom: '',
  createdTo: '',
}

export function activeFilters(filters) {
  return Object.entries(filters ?? {}).filter(([, value]) => String(value ?? '').trim() !== '')
}

function text(value) {
  return String(value ?? '').trim()
}

function dayStart(value) {
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function dayEnd(value) {
  const date = new Date(`${value}T23:59:59.999`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function applyFullDataFilters(query, { filters = {}, sortKey = 'newest', visibleColumns = [] } = {}) {
  const search = sanitizeSearch(filters.query)
  if (search) {
    const pattern = `%${search}%`
    query = query.or(SEARCH_COLUMNS.map((column) => `${column}.ilike.${pattern}`).join(','))
  }

  if (text(filters.milestone)) query = query.eq('milestone', text(filters.milestone))
  if (text(filters.designerId)) query = query.eq('designer_id', text(filters.designerId))
  if (text(filters.wrapperType)) query = query.eq('wrapper_type', text(filters.wrapperType))
  if (text(filters.carrier)) query = query.eq('carrier', text(filters.carrier))
  if (text(filters.shipmentState)) query = query.eq('shipment_state', text(filters.shipmentState))
  if (text(filters.refund) === 'any') query = query.gt('refund_count', 0)
  if (text(filters.refund) === 'none') query = query.eq('refund_count', 0)
  if (text(filters.refund) === 'refunded') query = query.gt('refunded_amount', 0)
  if (text(filters.messageActive) === 'yes') query = query.eq('message_active', true)
  if (text(filters.messageActive) === 'no') query = query.eq('message_active', false)
  if (text(filters.recipientOpened) === 'yes') query = query.not('recipient_opened_at', 'is', null)
  if (text(filters.recipientOpened) === 'no') query = query.is('recipient_opened_at', null)

  const paidFrom = dayStart(filters.paidFrom)
  const paidTo = dayEnd(filters.paidTo)
  if (paidFrom) query = query.gte('paid_at', paidFrom)
  if (paidTo) query = query.lte('paid_at', paidTo)

  const createdFrom = dayStart(filters.createdFrom)
  const createdTo = dayEnd(filters.createdTo)
  if (createdFrom) query = query.gte('created_at', createdFrom)
  if (createdTo) query = query.lte('created_at', createdTo)

  const sort = sortDefinition(sortKey)
  const ascending = Boolean(sort.ascending)
  query = query.order(sort.column, { ascending, nullsFirst: false })
  query = query.order('project_id', { ascending: true })

  return query
}

export async function fetchFullData({
  filters = {},
  sortKey = 'newest',
  page = 0,
  pageSize = 50,
  visibleColumns = [],
} = {}) {
  if (!supabase) throw new Error('Supabase is not configured')

  // Build the column list: always include project_id for row identity,
  // plus the visible columns the user has selected.
  const columns = ['project_id', ...new Set([...FULL_DATA_DEFAULT_VISIBLE, ...visibleColumns])].join(', ')

  const from = page * pageSize
  const to = from + pageSize - 1

  let query = supabase.from('ops_full_data').select(columns, { count: 'exact' })
  query = applyFullDataFilters(query, { filters, sortKey })

  const { data, error, count } = await query.range(from, to)
  if (error) throw error
  return { rows: data ?? [], total: count ?? 0, page, pageSize }
}

export async function fetchAllFullData({ filters = {}, sortKey = 'newest', visibleColumns = [], pageSize = 1000 } = {}) {
  if (!supabase) throw new Error('Supabase is not configured')
  const allRows = []
  let page = 0
  while (true) {
    const { rows, total } = await fetchFullData({ filters, sortKey, page, pageSize, visibleColumns })
    if (rows.length === 0) break
    allRows.push(...rows)
    if (allRows.length >= total) break
    page += 1
  }
  return allRows
}

// Export as CSV (for spreadsheet compatibility)
export function toCSV(rows, columns) {
  if (!rows?.length) return ''
  const header = columns.map((c) => `"${c.label.replace(/"/g, '""')}"`).join(',')
  const lines = rows.map((row) =>
    columns
      .map((c) => {
        const value = row[c.key] ?? ''
        if (value === null || value === undefined) return ''
        const str = String(value).replace(/"/g, '""')
        return `"${str}"`
      })
      .join(','),
  )
  return [header, ...lines].join('\n')
}

// Export as XLSX (preserves formatting, types, frozen headers)
export async function toXLSX(rows, columns, options = {}) {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Full Data', {
    views: [{ state: 'frozen', ySplit: 1, activeCell: 'A2' }],
  })

  // Header row
  sheet.addRow(columns.map((c) => c.label))
  sheet.getRow(1).font = { bold: true }
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } }

  // Data rows
  for (const row of rows ?? []) {
    sheet.addRow(columns.map((c) => {
      const value = row[c.key]
      if (c.type === 'money' && typeof value === 'number') return value / 100 // Store as decimal for currency format
      if (c.type === 'datetime' && value) return new Date(value)
      if (c.type === 'boolean') return value === true
      return value ?? ''
    }))
  }

  // Column widths and formats
  columns.forEach((c, i) => {
    const col = sheet.getColumn(i + 1)
    col.width = Math.max(c.label.length + 2, 12)
    if (c.type === 'money') col.numFmt = '#,##0.00'
    if (c.type === 'datetime') col.numFmt = 'yyyy-mm-dd hh:mm:ss'
  })

  // Auto-filter
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return new Uint8Array(buffer)
}