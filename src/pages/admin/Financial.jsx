import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Download,
  Loader2,
  PiggyBank,
  ReceiptText,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppSettings } from '@/hooks/use-app-settings'
import { formatDateTime, formatMoney } from '@/services/format'
import { fetchDearunes } from '@/services/dearunes'
import { fetchDesigners } from '@/services/designers'
import { buildAdminFinancialOverview } from '@/services/financialSummary'
import { fetchSales } from '@/services/sales'
import { downloadFinancialOverviewCsv } from '@/services/workerFinancial'

function SectionHeader({ icon: Icon, title, description, aside }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-4" aria-hidden />
        </span>
        <div>
          <h2 className="font-heading text-xl">{title}</h2>
          {description ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {aside}
    </div>
  )
}

function DataTable({ rows, columns, empty }) {
  if (!rows || rows.length === 0) {
    return <p className="mt-4 rounded-xl bg-muted/40 px-3 py-4 text-sm text-muted-foreground">{empty}</p>
  }
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[34rem] text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.align === 'right' ? 'px-3 py-2.5 text-right font-medium' : 'px-3 py-2.5 font-medium'}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.currency}-${row.month ?? row.name ?? row.wrapperType ?? row.saleId ?? row.projectId ?? index}`} className="border-t">
              {columns.map((column) => (
                <td key={column.key} className={column.align === 'right' ? 'px-3 py-2.5 text-right tabular-nums' : 'px-3 py-2.5'}>
                  {column.render ? column.render(row) : (row[column.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Financial() {
  const { settings } = useAppSettings()
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [sales, projects, designers] = await Promise.all([fetchSales(), fetchDearunes(), fetchDesigners()])
      setOverview(
        buildAdminFinancialOverview({
          sales,
          projects,
          designers,
          currency: settings?.currency || 'EGP',
        }),
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The financial summary could not be loaded')
    } finally {
      setLoading(false)
    }
  }, [settings?.currency])

  useEffect(() => {
    load()
  }, [load])

  const combinedTotals = useMemo(() => {
    if (!overview) return []
    const currencies = new Set([
      ...overview.revenue.totals.map((row) => row.currency),
      ...overview.costs.totals.map((row) => row.currency),
      ...overview.profit.totals.map((row) => row.currency),
    ])
    return [...currencies].sort().map((currency) => {
      const revenue = overview.revenue.totals.find((row) => row.currency === currency)
      const costs = overview.costs.totals.find((row) => row.currency === currency)
      const profit = overview.profit.totals.find((row) => row.currency === currency)
      return {
        currency,
        revenue: revenue?.total ?? 0,
        sales: revenue?.sales ?? 0,
        costs: costs?.total ?? 0,
        profit: profit?.total ?? 0,
        margin: profit?.margin ?? 0,
      }
    })
  }, [overview])

  const exportCsv = () => {
    if (!overview) return
    setExporting(true)
    try {
      // The CSV is built from the rows already on the screen, never from a
      // second, wider query.
      downloadFinancialOverviewCsv(overview)
      toast.success('Financial CSV downloaded')
    } catch {
      toast.error('The download could not be prepared')
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    )
  }

  if (error || !overview) {
    return (
      <div className="rounded-2xl border border-dashed bg-card/60 p-10 text-center">
        <Wallet className="mx-auto size-8 text-muted-foreground" aria-hidden />
        <h1 className="mt-4 font-heading text-xl">Financials could not be loaded</h1>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">{error}</p>
        <Button className="mt-4" onClick={load}>
          <RefreshCw className="size-4" aria-hidden />
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl">Financial</h1>
            <Badge variant="outline">Independent section</Badge>
          </div>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
            Studio revenue, estimated costs, profit, customer payables and the payment ledger. This page
            is admin-only and separate from Operations, QA and Designers.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="size-4" aria-hidden />
            Refresh
          </Button>
          <Button size="sm" onClick={exportCsv} disabled={exporting}>
            {exporting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
            Export CSV
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">Studio currency: {overview.currency}</Badge>
        <Badge variant="outline">{overview.payments.length} ledger rows</Badge>
        <Badge variant="outline">{overview.customerPayables.length} customer payables</Badge>
        <span className="text-xs text-muted-foreground">Generated {formatDateTime(overview.generatedAt)}</span>
      </div>

      {combinedTotals.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-card/60 px-4 py-6 text-sm text-muted-foreground">
          No completed sales yet. Once a sale is recorded, revenue, cost and profit appear here.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {combinedTotals.map((row) => (
            <section key={row.currency} className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Currency</p>
                <Badge variant="outline">{row.currency}</Badge>
              </div>
              <dl className="mt-3 space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-xs text-muted-foreground">Revenue</dt>
                  <dd className="font-medium tabular-nums">{formatMoney(row.revenue, row.currency)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-xs text-muted-foreground">Estimated cost</dt>
                  <dd className="text-sm tabular-nums">{formatMoney(row.costs, row.currency)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-2 border-t pt-2">
                  <dt className="text-xs text-muted-foreground">Estimated profit</dt>
                  <dd className="text-sm font-medium tabular-nums">
                    {formatMoney(row.profit, row.currency)}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">({row.margin.toFixed(2)}%)</span>
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-muted-foreground">{row.sales} completed sale{row.sales === 1 ? '' : 's'}</p>
            </section>
          ))}
        </div>
      )}

      <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
        <SectionHeader
          icon={TrendingUp}
          title="Revenue"
          description="Completed sales only. Voided rows stay in the ledger for audit and never count as revenue."
          aside={
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/sold">Open Sold Logs</Link>
            </Button>
          }
        />
        <DataTable
          rows={overview.revenue.byMonth}
          empty="No completed sales yet."
          columns={[
            { key: 'month', label: 'Month' },
            { key: 'currency', label: 'Currency' },
            { key: 'total', label: 'Revenue', align: 'right', render: (row) => formatMoney(row.total, row.currency) },
            { key: 'sales', label: 'Sales', align: 'right' },
          ]}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
          <SectionHeader
            icon={TrendingDown}
            title="Costs"
            description="Estimated production cost recorded with each completed sale."
          />
          <DataTable
            rows={overview.costs.totals}
            empty="No costs recorded yet."
            columns={[
              { key: 'currency', label: 'Currency' },
              { key: 'total', label: 'Estimated cost', align: 'right', render: (row) => formatMoney(row.total, row.currency) },
              { key: 'sales', label: 'Sales', align: 'right' },
            ]}
          />
        </section>

        <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
          <SectionHeader
            icon={PiggyBank}
            title="Profit"
            description="Estimated profit and margin. This is a derived figure, not a payment."
          />
          <DataTable
            rows={overview.profit.totals}
            empty="No completed sales yet."
            columns={[
              { key: 'currency', label: 'Currency' },
              { key: 'total', label: 'Estimated profit', align: 'right', render: (row) => formatMoney(row.total, row.currency) },
              { key: 'margin', label: 'Margin', align: 'right', render: (row) => `${Number(row.margin ?? 0).toFixed(2)}%` },
            ]}
          />
        </section>
      </div>

      <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
        <SectionHeader
          icon={Users}
          title="Customer payables"
          description="The sale price on each active Dearune and whether it has been paid."
        />
        <DataTable
          rows={overview.customerPayables}
          empty="No active Dearune currently carries a customer amount."
          columns={[
            { key: 'reference', label: 'Dearune', render: (row) => <span className="font-mono text-xs">{row.reference}</span> },
            { key: 'title', label: 'Title' },
            { key: 'designerName', label: 'Designer' },
            { key: 'amount', label: 'Amount', align: 'right', render: (row) => formatMoney(row.amount, row.currency) },
            {
              key: 'outstanding',
              label: 'Status',
              render: (row) =>
                row.outstanding ? (
                  <Badge variant="outline" className="border-amber-500/30 text-amber-700 dark:text-amber-300">Outstanding</Badge>
                ) : (
                  <Badge variant="outline" className="border-emerald-600/20 text-emerald-700 dark:text-emerald-400">
                    Paid {formatDateTime(row.paidAt)}
                  </Badge>
                ),
            },
          ]}
        />
      </section>

      <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
        <SectionHeader
          icon={ReceiptText}
          title="Payments"
          description="The sale ledger, newest first. Voided rows are kept and marked."
          aside={
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/sold">Sold Logs</Link>
            </Button>
          }
        />
        <DataTable
          rows={overview.payments}
          empty="No payments recorded yet."
          columns={[
            {
              key: 'saleReference',
              label: 'Sale',
              render: (row) =>
                row.saleId ? (
                  <Link to={`/admin/sold/${row.saleId}`} className="font-mono text-xs underline-offset-4 hover:underline">
                    {row.saleReference}
                  </Link>
                ) : (
                  <span className="font-mono text-xs">{row.saleReference}</span>
                ),
            },
            { key: 'title', label: 'Dearune' },
            { key: 'designerName', label: 'Designer' },
            { key: 'amount', label: 'Amount', align: 'right', render: (row) => formatMoney(row.amount, row.currency) },
            {
              key: 'status',
              label: 'Status',
              render: (row) => (
                <Badge
                  variant="outline"
                  className={
                    row.status === 'voided'
                      ? 'border-destructive/25 text-destructive'
                      : 'border-emerald-600/20 text-emerald-700 dark:text-emerald-400'
                  }
                >
                  {row.status}
                </Badge>
              ),
            },
            { key: 'soldAt', label: 'Sold', render: (row) => formatDateTime(row.soldAt) },
          ]}
        />
      </section>

      <div className="rounded-xl border bg-muted/25 p-3.5 text-xs leading-5 text-muted-foreground">
        Worker Financial access is granted separately in Users and never widens admin access. The worker
        screens read a purpose-built database function that omits every category the worker was not
        granted; they do not query these admin tables.
      </div>
    </div>
  )
}
