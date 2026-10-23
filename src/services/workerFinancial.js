import { workerRpc } from '@/services/workerRpc'

// The overview is filtered inside Postgres. A worker with only
// `financial.view_customer_payables` receives the `customerPayables` key and
// no revenue, cost, profit or payment key at all.
export async function fetchWorkerFinancialOverview() {
  return workerRpc('worker_financial_overview')
}

export async function voidWorkerSale(saleId, reason) {
  return workerRpc('worker_void_sale', { p_sale_id: saleId, p_reason: reason })
}

function csvCell(value) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function csvRows(rows) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
}

/**
 * Build a CSV from the overview the server already returned. Exporting never
 * calls a broader endpoint: it cannot reveal a section the worker was not
 * granted. The caller must also hold `financial.export`.
 */
export function financialOverviewCsv(overview) {
  const lines = []
  lines.push(['Dearune financial export'])
  lines.push(['Generated', overview?.generatedAt ?? ''])
  lines.push(['Studio currency', overview?.currency ?? ''])

  if (overview?.revenue) {
    lines.push([])
    lines.push(['Revenue by currency'])
    lines.push(['Currency', 'Revenue', 'Sales'])
    for (const row of overview.revenue.totals ?? []) lines.push([row.currency, row.total, row.sales])
    if (overview.revenue.byMonth?.length) {
      lines.push([])
      lines.push(['Revenue by month'])
      lines.push(['Month', 'Currency', 'Revenue', 'Sales'])
      for (const row of overview.revenue.byMonth) lines.push([row.month, row.currency, row.total, row.sales])
    }
  }

  if (overview?.costs) {
    lines.push([])
    lines.push(['Costs by currency'])
    lines.push(['Currency', 'Estimated cost', 'Sales'])
    for (const row of overview.costs.totals ?? []) lines.push([row.currency, row.total, row.sales])
    if (overview.costs.byWrapper?.length) {
      lines.push([])
      lines.push(['Costs by wrapper'])
      lines.push(['Wrapper', 'Currency', 'Estimated cost', 'Sales'])
      for (const row of overview.costs.byWrapper) lines.push([row.wrapperType, row.currency, row.total, row.sales])
    }
  }

  if (overview?.profit) {
    lines.push([])
    lines.push(['Profit by currency'])
    lines.push(['Currency', 'Estimated profit', 'Margin %', 'Sales'])
    for (const row of overview.profit.totals ?? []) lines.push([row.currency, row.total, row.margin, row.sales])
    if (overview.profit.byMonth?.length) {
      lines.push([])
      lines.push(['Profit by month'])
      lines.push(['Month', 'Currency', 'Estimated profit'])
      for (const row of overview.profit.byMonth) lines.push([row.month, row.currency, row.total])
    }
  }

  if (overview?.customerPayables) {
    lines.push([])
    lines.push(['Customer payables'])
    lines.push(['Reference', 'Title', 'Designer', 'Amount', 'Currency', 'Paid at', 'Outstanding'])
    for (const row of overview.customerPayables) {
      lines.push([row.reference, row.title, row.designerName, row.amount, row.currency, row.paidAt, row.outstanding ? 'yes' : 'no'])
    }
  }

  if (overview?.payments) {
    lines.push([])
    lines.push(['Payments'])
    lines.push(['Sale reference', 'Dearune', 'Title', 'Designer', 'Amount', 'Currency', 'Status', 'Sold at', 'Voided at'])
    for (const row of overview.payments) {
      lines.push([
        row.saleReference,
        row.projectId,
        row.title,
        row.designerName,
        row.amount,
        row.currency,
        row.status,
        row.soldAt,
        row.voidedAt,
      ])
    }
  }

  return csvRows(lines)
}

export function downloadFinancialOverviewCsv(overview) {
  const csv = financialOverviewCsv(overview)
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `dearune-financial-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
