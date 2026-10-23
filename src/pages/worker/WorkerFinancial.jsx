import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Ban,
  Download,
  Loader2,
  PiggyBank,
  ReceiptText,
  RefreshCw,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { formatDateTime, formatMoney } from '@/services/format'
import { downloadFinancialOverviewCsv, fetchWorkerFinancialOverview, voidWorkerSale } from '@/services/workerFinancial'

function messageOf(error) {
  const text = error instanceof Error ? error.message : String(error ?? '')
  if (text.includes('financial.maintenance_required')) {
    return 'Maintenance mode is off. An administrator must switch it on before a sale can be corrected.'
  }
  if (text.includes('financial.production_started')) {
    return 'Production has already started on this Dearune, so the sale cannot be voided. An administrator must correct it from the admin sale screen.'
  }
  if (text.includes('financial.sale_already_voided')) return 'This sale has already been voided.'
  if (text.includes('financial.sale_not_found')) return 'This sale no longer exists.'
  if (text.includes('financial.reason_required')) return 'Please provide a reason of at least 3 characters.'
  if (text.includes('worker.forbidden')) return 'You do not hold both Financial access and correction access.'
  if (text.includes('worker.inactive_or_unknown')) return 'This worker account is no longer active.'
  return text || 'Something went wrong'
}

function SectionHeader({ icon: Icon, title, description, aside }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-4" aria-hidden />
        </span>
        <div>
          <h2 className="font-heading text-xl tracking-tight">{title}</h2>
          {description ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {aside}
    </div>
  )
}

function MoneyTable({ rows, columns, empty = 'No completed sales in this category yet.' }) {
  if (!rows || rows.length === 0) {
    return <p className="mt-4 rounded-xl bg-muted/45 px-3 py-4 text-sm text-muted-foreground">{empty}</p>
  }
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[32rem] text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
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
            <tr key={`${row.currency ?? 'row'}-${index}`} className="border-t border-border/70">
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

function CurrencyCards({ rows, label, format = (row) => formatMoney(row.total, row.currency) }) {
  if (!rows || rows.length === 0) {
    return <p className="mt-4 rounded-xl bg-muted/45 px-3 py-4 text-sm text-muted-foreground">No completed sales yet.</p>
  }
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => (
        <div key={`${row.currency}-${row.label ?? ''}`} className="rounded-xl border border-border bg-muted/25 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label} · {row.currency}</p>
          <p className="mt-1.5 font-heading text-2xl tracking-tight tabular-nums">{format(row)}</p>
          {row.sales !== undefined ? <p className="mt-1 text-xs text-muted-foreground">{row.sales} sale{row.sales === 1 ? '' : 's'}</p> : null}
        </div>
      ))}
    </div>
  )
}

export function WorkerFinancial() {
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [voidTarget, setVoidTarget] = useState(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true)
    setError('')
    try {
      const data = await fetchWorkerFinancialOverview()
      setOverview(data)
    } catch (caught) {
      setError(messageOf(caught))
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const granted = useMemo(() => {
    if (!overview) return []
    return [
      overview.revenue && 'Revenue',
      overview.costs && 'Costs',
      overview.profit && 'Profit',
      overview.customerPayables && 'Customer payables',
      overview.payments && 'Payments',
    ].filter(Boolean)
  }, [overview])

  const exportCsv = () => {
    if (!overview?.canExport) return
    setExporting(true)
    try {
      downloadFinancialOverviewCsv(overview)
      toast.success('CSV prepared from the figures you can see')
    } catch {
      toast.error('The download could not be prepared')
    } finally {
      setExporting(false)
    }
  }

  const confirmVoid = async () => {
    if (!voidTarget) return
    if (reason.trim().length < 3) {
      toast.error('Please provide a reason of at least 3 characters')
      return
    }
    setBusy(true)
    try {
      await voidWorkerSale(voidTarget.saleId, reason.trim())
      toast.success('Sale voided and recorded in the audit log')
      setVoidTarget(null)
      setReason('')
      await load({ quiet: true })
    } catch (caught) {
      toast.error(messageOf(caught))
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }

  if (error && !overview) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/70 p-8 text-center">
        <span className="mx-auto inline-flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Wallet className="size-6" aria-hidden />
        </span>
        <h1 className="mt-4 font-heading text-xl tracking-tight">Financials could not be loaded</h1>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" className="mt-4" onClick={() => load()}>
          <RefreshCw className="size-4" aria-hidden />
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Financial</p>
          <h1 className="mt-1 font-heading text-3xl tracking-tight">What the studio shared</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Each section below appears because that exact category was granted. Amounts are grouped by
            currency; adding different currencies together would be misleading.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => load()}>
            <RefreshCw className="size-4" aria-hidden />
            Refresh
          </Button>
          {overview?.canExport ? (
            <Button onClick={exportCsv} disabled={exporting}>
              {exporting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
              Export CSV
            </Button>
          ) : null}
        </div>
      </header>

      {error ? (
        <p role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="border-primary/20 text-primary">
          Studio currency: {overview?.currency ?? '—'}
        </Badge>
        {granted.map((label) => (
          <Badge key={label} variant="outline">{label}</Badge>
        ))}
        {overview?.canManage ? (
          <Badge variant="outline" className="border-amber-500/30 text-amber-700 dark:text-amber-300">
            Corrections available in maintenance mode
          </Badge>
        ) : null}
      </div>

      {granted.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/70 p-8 text-center">
          <ShieldAlert className="mx-auto size-7 text-primary" aria-hidden />
          <h2 className="mt-3 font-heading text-xl tracking-tight">No financial categories yet</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
            Financial access is open, but none of revenue, costs, profit, customer payables or payments
            has been granted. Open categories reveal nothing by themselves.
          </p>
        </div>
      ) : null}

      {overview?.revenue ? (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <SectionHeader
            icon={TrendingUp}
            title="Revenue"
            description="Money taken from completed sales, grouped by currency."
          />
          <CurrencyCards rows={overview.revenue.totals} label="Revenue" />
          {overview.revenue.byMonth?.length ? (
            <>
              <h3 className="mt-6 text-sm font-semibold">By month</h3>
              <MoneyTable
                rows={overview.revenue.byMonth}
                columns={[
                  { key: 'month', label: 'Month' },
                  { key: 'currency', label: 'Currency' },
                  { key: 'total', label: 'Revenue', align: 'right', render: (row) => formatMoney(row.total, row.currency) },
                  { key: 'sales', label: 'Sales', align: 'right' },
                ]}
              />
            </>
          ) : null}
          {overview.revenue.byDesigner?.length ? (
            <>
              <h3 className="mt-6 text-sm font-semibold">By designer</h3>
              <MoneyTable
                rows={overview.revenue.byDesigner}
                columns={[
                  { key: 'name', label: 'Designer' },
                  { key: 'currency', label: 'Currency' },
                  { key: 'total', label: 'Revenue', align: 'right', render: (row) => formatMoney(row.total, row.currency) },
                  { key: 'sales', label: 'Sales', align: 'right' },
                ]}
              />
            </>
          ) : null}
        </section>
      ) : null}

      {overview?.costs ? (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <SectionHeader
            icon={TrendingDown}
            title="Costs"
            description="Estimated production costs recorded with each completed sale."
          />
          <CurrencyCards rows={overview.costs.totals} label="Estimated cost" />
          {overview.costs.byWrapper?.length ? (
            <>
              <h3 className="mt-6 text-sm font-semibold">By wrapper</h3>
              <MoneyTable
                rows={overview.costs.byWrapper}
                columns={[
                  { key: 'wrapperType', label: 'Wrapper' },
                  { key: 'currency', label: 'Currency' },
                  { key: 'total', label: 'Estimated cost', align: 'right', render: (row) => formatMoney(row.total, row.currency) },
                  { key: 'sales', label: 'Sales', align: 'right' },
                ]}
              />
            </>
          ) : null}
        </section>
      ) : null}

      {overview?.profit ? (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <SectionHeader
            icon={PiggyBank}
            title="Profit"
            description="Estimated profit and margin from completed sales."
          />
          <CurrencyCards
            rows={overview.profit.totals}
            label="Estimated profit"
            format={(row) => `${formatMoney(row.total, row.currency)} · ${Number(row.margin ?? 0).toFixed(2)}%`}
          />
          {overview.profit.byMonth?.length ? (
            <>
              <h3 className="mt-6 text-sm font-semibold">By month</h3>
              <MoneyTable
                rows={overview.profit.byMonth}
                columns={[
                  { key: 'month', label: 'Month' },
                  { key: 'currency', label: 'Currency' },
                  { key: 'total', label: 'Estimated profit', align: 'right', render: (row) => formatMoney(row.total, row.currency) },
                ]}
              />
            </>
          ) : null}
        </section>
      ) : null}

      {overview?.customerPayables ? (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <SectionHeader
            icon={Users}
            title="Customer payables"
            description="What each customer owes for a Dearune, and whether it has been paid. This category does not include revenue, cost or profit."
          />
          <MoneyTable
            rows={overview.customerPayables}
            empty="No Dearunes currently carry a customer amount."
            columns={[
              { key: 'reference', label: 'Dearune', render: (row) => <span className="font-mono text-xs">{row.reference}</span> },
              { key: 'title', label: 'Title' },
              { key: 'designerName', label: 'Designer' },
              { key: 'amount', label: 'Customer payable', align: 'right', render: (row) => formatMoney(row.amount, row.currency) },
              {
                key: 'outstanding',
                label: 'Status',
                render: (row) =>
                  row.outstanding ? (
                    <Badge variant="outline" className="border-amber-500/30 text-amber-700 dark:text-amber-300">Outstanding</Badge>
                  ) : (
                    <Badge variant="outline" className="border-emerald-500/30 text-emerald-700 dark:text-emerald-300">Paid {formatDateTime(row.paidAt)}</Badge>
                  ),
              },
            ]}
          />
        </section>
      ) : null}

      {overview?.payments ? (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <SectionHeader
            icon={ReceiptText}
            title="Payments"
            description="The sale ledger. Voided rows stay visible; a correction never deletes the record."
            aside={
              overview.canManage ? (
                <Badge variant="outline" className="w-fit border-amber-500/30 text-amber-700 dark:text-amber-300">
                  Manage corrections
                </Badge>
              ) : null
            }
          />
          <MoneyTable
            rows={overview.payments}
            empty="No payments have been recorded yet."
            columns={[
              { key: 'saleReference', label: 'Sale', render: (row) => <span className="font-mono text-xs">{row.saleReference}</span> },
              { key: 'title', label: 'Dearune' },
              { key: 'designerName', label: 'Designer' },
              { key: 'amount', label: 'Amount', align: 'right', render: (row) => formatMoney(row.amount, row.currency) },
              {
                key: 'status',
                label: 'Status',
                render: (row) => (
                  <Badge variant="outline" className={row.status === 'voided' ? 'border-destructive/30 text-destructive' : 'border-emerald-500/30 text-emerald-700 dark:text-emerald-300'}>
                    {row.status}
                  </Badge>
                ),
              },
              { key: 'soldAt', label: 'Sold', render: (row) => formatDateTime(row.soldAt) },
              {
                key: 'actions',
                label: '',
                align: 'right',
                render: (row) =>
                  overview.canManage && row.status === 'completed' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setVoidTarget(row)
                        setReason('')
                      }}
                    >
                      <Ban className="size-3.5" aria-hidden />
                      Void
                    </Button>
                  ) : row.voidedAt ? (
                    <span className="text-xs text-muted-foreground">{formatDateTime(row.voidedAt)}</span>
                  ) : null,
              },
            ]}
          />
          {overview.canManage ? (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-800 dark:text-amber-200">
              <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Voiding is only possible while the studio has maintenance mode on, mirrors the admin
              reversal rule, and is recorded in the audit log with your worker account.
            </p>
          ) : null}
        </section>
      ) : null}

      <Dialog open={Boolean(voidTarget)} onOpenChange={(open) => !open && setVoidTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void this sale?</DialogTitle>
            <DialogDescription>
              {voidTarget
                ? `${voidTarget.saleReference} · ${formatMoney(voidTarget.amount, voidTarget.currency)}. The sale is marked voided, never deleted, and the reason is recorded in the audit log.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="worker-void-reason">Reason</Label>
            <Textarea
              id="worker-void-reason"
              rows={3}
              maxLength={300}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain the correction for the studio record…"
            />
            <p className="text-xs text-muted-foreground">At least 3 characters. This is not shown to the customer.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidTarget(null)} disabled={busy}>Keep the sale</Button>
            <Button variant="destructive" onClick={confirmVoid} disabled={busy || reason.trim().length < 3}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Ban className="size-4" aria-hidden />}
              Void sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
