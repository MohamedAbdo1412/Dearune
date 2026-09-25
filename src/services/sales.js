import { supabase } from '@/lib/supabase'

// The Sold Logs ledger: one immutable row per transaction. Rows are created
// (and, in maintenance mode, VOIDED) only by the `admin-dearunes` edge
// function — nothing in this file ever writes to `sales_log`.

export async function fetchSales() {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase
    .from('sales_log')
    .select('*')
    .order('sold_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function fetchSale(saleId) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.from('sales_log').select('*').eq('id', saleId).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Sale not found')
  return data
}

// The Dearune a sale belongs to, as a readable reference: the project's own
// DR- reference when we have it, the legacy order id for sales carried over
// from the old Sales screens, otherwise the raw id.
export function saleDearuneLabel(sale) {
  const snapshot = sale?.snapshot_data ?? {}
  return snapshot.reference || sale?.legacy_order_id || sale?.project_id || '—'
}

export function isActiveSale(sale) {
  return sale?.status === 'completed'
}

// Totals for one currency. Voided sales never count — they are kept for
// audit, not for revenue.
export function sumSales(sales, currency) {
  let revenue = 0
  let profit = 0
  let count = 0
  for (const sale of sales ?? []) {
    if (!isActiveSale(sale)) continue
    if (currency && sale.currency !== currency) continue
    revenue += Number(sale.selling_price) || 0
    profit += Number(sale.estimated_profit) || 0
    count += 1
  }
  return { revenue: Math.round(revenue * 100) / 100, profit: Math.round(profit * 100) / 100, count }
}

function csvCell(value) {
  if (value === null || value === undefined) return ''
  let str = String(value)
  if (/[",\n\r]/.test(str)) str = `"${str.replace(/"/g, '""')}"`
  return str
}

export const SALES_CSV_HEADERS = [
  'Reference',
  'Status',
  'Sold at',
  'Currency',
  'Selling price',
  'Estimated cost',
  'Estimated profit',
  'Dearune',
  'Title / recipient',
  'Designer',
  'Template',
  'Wrapper',
  'Voided at',
  'Void reason',
  'Source',
]

// Exported as a pure function so the exact bytes can be asserted in tests:
// Arabic titles must survive, which is why the caller prefixes a UTF-8 BOM.
export function salesCsv(sales) {
  const lines = [SALES_CSV_HEADERS.map(csvCell).join(',')]
  for (const sale of sales ?? []) {
    const snapshot = sale.snapshot_data ?? {}
    lines.push(
      [
        sale.sale_reference,
        sale.status,
        sale.sold_at,
        sale.currency,
        sale.selling_price,
        sale.estimated_cost,
        sale.estimated_profit,
        saleDearuneLabel(sale),
        sale.title,
        sale.designer_name,
        sale.template_name,
        sale.wrapper_type,
        sale.voided_at,
        sale.void_reason,
        snapshot.source === 'legacy-order' ? 'legacy order' : 'dearune',
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return lines.join('\r\n')
}

export function salesCsvBlob(sales) {
  // UTF-8 BOM: without it, spreadsheet apps read Arabic titles as mojibake.
  return new Blob(['\uFEFF' + salesCsv(sales)], { type: 'text/csv;charset=utf-8' })
}

export function downloadSalesCsv(sales, filename = 'dearune-sold-logs.csv') {
  const blob = salesCsvBlob(sales)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
