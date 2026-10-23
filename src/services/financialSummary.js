import { saleDearuneLabel } from '@/services/sales'

// The admin's Financial page and the worker's Financial RPC must agree about
// what counts as money. This module only shapes rows the admin can already
// read through the existing admin RLS; it adds no new access and makes no
// write. The worker's numbers are computed inside Postgres instead.

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

function monthOf(value) {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 7)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function pushGrouped(map, key, currency, amounts) {
  const id = `${key}|${currency}`
  const current = map.get(id) ?? {
    key,
    currency,
    total: 0,
    cost: 0,
    profit: 0,
    sales: 0,
  }
  current.total = round2(current.total + (Number(amounts.revenue) || 0))
  current.cost = round2(current.cost + (Number(amounts.cost) || 0))
  current.profit = round2(current.profit + (Number(amounts.profit) || 0))
  current.sales += 1
  map.set(id, current)
}

function withMargin(row) {
  return {
    ...row,
    margin: row.total > 0 ? round2((row.profit / row.total) * 100) : 0,
  }
}

export function buildAdminFinancialOverview({ sales = [], projects = [], designers = [], currency = 'EGP' } = {}) {
  const completed = sales.filter((sale) => sale.status === 'completed')
  const totalMap = new Map()
  const monthMap = new Map()
  const designerMap = new Map()
  const wrapperMap = new Map()

  for (const sale of completed) {
    const code = sale.currency || currency
    const amounts = {
      revenue: sale.selling_price,
      cost: sale.estimated_cost,
      profit: sale.estimated_profit,
    }
    const designer = sale.designer_name || 'Unattributed'
    const wrapper = sale.wrapper_type || 'Unspecified'
    pushGrouped(totalMap, 'total', code, amounts)
    pushGrouped(monthMap, monthOf(sale.sold_at), code, amounts)
    pushGrouped(designerMap, designer, code, amounts)
    pushGrouped(wrapperMap, wrapper, code, amounts)
  }

  const totals = [...totalMap.values()].sort((a, b) => a.currency.localeCompare(b.currency)).map(withMargin)

  const designerNames = new Map((designers ?? []).map((designer) => [designer.id, designer.name]))
  const customerPayables = (projects ?? [])
    .filter((project) => project.sale_price !== null && project.sale_price !== undefined && !project.archived_at)
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
    .slice(0, 200)
    .map((project) => ({
      projectId: project.id,
      reference: project.reference,
      title: project.title,
      designerName: designerNames.get(project.designer_id) ?? '—',
      amount: Number(project.sale_price) || 0,
      currency: project.currency || currency,
      paidAt: project.paid_at,
      outstanding: !project.paid_at,
      createdAt: project.created_at,
    }))

  const payments = [...(sales ?? [])]
    .sort((a, b) => String(b.sold_at ?? '').localeCompare(String(a.sold_at ?? '')))
    .slice(0, 200)
    .map((sale) => ({
      saleId: sale.id,
      saleReference: sale.sale_reference || saleDearuneLabel(sale),
      projectId: sale.project_id,
      title: sale.title || sale.snapshot_data?.title || '—',
      designerName: sale.designer_name || sale.snapshot_data?.designer_name || '—',
      amount: Number(sale.selling_price) || 0,
      currency: sale.currency || currency,
      status: sale.status,
      soldAt: sale.sold_at,
      voidedAt: sale.voided_at,
    }))

  return {
    generatedAt: new Date().toISOString(),
    currency,
    revenue: {
      totals: totals.map((row) => ({
        currency: row.currency,
        total: row.total,
        sales: row.sales,
      })),
      byMonth: [...monthMap.values()]
        .map((row) => ({ month: row.key, currency: row.currency, total: row.total, sales: row.sales }))
        .sort((a, b) => b.month.localeCompare(a.month) || a.currency.localeCompare(b.currency)),
      byDesigner: [...designerMap.values()]
        .map((row) => ({ name: row.key, currency: row.currency, total: row.total, sales: row.sales }))
        .sort((a, b) => b.total - a.total || a.currency.localeCompare(b.currency)),
    },
    costs: {
      totals: totals.map((row) => ({
        currency: row.currency,
        total: row.cost,
        sales: row.sales,
      })),
      byWrapper: [...wrapperMap.values()]
        .map((row) => ({ wrapperType: row.key, currency: row.currency, total: row.cost, sales: row.sales }))
        .sort((a, b) => b.total - a.total || a.currency.localeCompare(b.currency)),
    },
    profit: {
      totals: totals.map((row) => ({
        currency: row.currency,
        total: row.profit,
        margin: row.margin,
        sales: row.sales,
      })),
      byMonth: [...monthMap.values()]
        .map((row) => ({ month: row.key, currency: row.currency, total: row.profit }))
        .sort((a, b) => b.month.localeCompare(a.month) || a.currency.localeCompare(b.currency)),
    },
    customerPayables,
    payments,
  }
}
