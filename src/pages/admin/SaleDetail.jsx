import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2Icon, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { correctSale, fetchDearune } from '@/services/dearunes'
import { fetchSale } from '@/services/sales'
import { WRAPPER_LABELS } from '@/services/constants'
import { formatDateTime, formatMoney } from '@/services/format'
import { useAppSettings } from '@/hooks/use-app-settings'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

// One ledger row, read-only: what was sold, for how much, against which
// Dearune, and — if it was corrected — why. The only action on this page is
// the maintenance-mode void, which writes `voided` onto this same row; the
// entry's money never changes and the row never disappears.

const STATUS_STYLES = {
  completed: 'bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:text-emerald-400',
  voided: 'bg-destructive/10 text-destructive ring-destructive/20',
}

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status] ?? STATUS_STYLES.completed}`}>
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {status === 'voided' ? 'Voided' : 'Sold'}
    </span>
  )
}

export function SaleDetail() {
  const { saleId } = useParams()
  const { settings } = useAppSettings()
  const maintenance = Boolean(settings?.maintenance_mode)

  const [sale, setSale] = useState(null)
  const [project, setProject] = useState(null)
  const [status, setStatus] = useState('loading')
  const [reason, setReason] = useState('')
  const [voiding, setVoiding] = useState(false)

  const reload = useCallback(async () => {
    setStatus('loading')
    try {
      const row = await fetchSale(saleId)
      setSale(row)
      let projectRow = null
      if (row.project_id) {
        projectRow = await fetchDearune(row.project_id).catch(() => null)
      }
      setProject(projectRow)
      setStatus('ready')
    } catch (err) {
      setStatus('error')
      toast.error(err instanceof Error ? err.message : 'Could not load this sale')
    }
  }, [saleId])

  useEffect(() => {
    void reload()
  }, [reload])

  const voidSale = async () => {
    if (!reason.trim()) {
      toast.error('A reason is required — this is an audit trail')
      return
    }
    if (!sale?.project_id) return
    setVoiding(true)
    try {
      await correctSale(sale.project_id, reason.trim())
      toast.success('Sale voided — the ledger keeps the original entry')
      setReason('')
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not void this sale')
    } finally {
      setVoiding(false)
    }
  }

  if (status === 'loading' && !sale) {
    return <div className="h-64 w-full animate-pulse rounded-lg border bg-muted/40" />
  }

  if (!sale) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Sale not found. <Link className="underline" to="/admin/sold">Back to Sold Logs</Link>
        </CardContent>
      </Card>
    )
  }

  const snapshot = sale.snapshot_data ?? {}
  const legacy = Boolean(sale.legacy_order_id)
  const canVoid = maintenance && sale.status === 'completed' && Boolean(sale.project_id)

  return (
    <div className="space-y-6">
      <div className="min-w-0">
        <Link to="/admin/sold" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Sold Logs
        </Link>
        <h1 className="mt-1 flex flex-wrap items-center gap-3 font-heading text-2xl">
          <span className="font-mono text-xl">{sale.sale_reference}</span>
          <StatusBadge status={sale.status} />
        </h1>
        <p className="text-sm text-muted-foreground">
          {sale.title || 'Untitled'} · sold {formatDateTime(sale.sold_at)}
          {legacy ? ' · carried over from the old Sales screens' : ''}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Selling price</p>
            <p className="text-xl font-semibold tabular-nums">{formatMoney(sale.selling_price, sale.currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Cost estimate</p>
            <p className="text-xl tabular-nums">{formatMoney(sale.estimated_cost, sale.currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Estimated profit</p>
            <p className="text-xl font-semibold tabular-nums">{formatMoney(sale.estimated_profit, sale.currency)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Entry</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Currency" value={sale.currency} />
            <Row label="Wrapper" value={WRAPPER_LABELS[sale.wrapper_type] ?? sale.wrapper_type ?? '—'} />
            <Row label="Paper" value={sale.template_name ?? '—'} />
            <Row label="Designer" value={sale.designer_name ?? '—'} />
            <Row label="Sold at" value={formatDateTime(sale.sold_at)} />
            {sale.voided_at && <Row label="Voided at" value={formatDateTime(sale.voided_at)} />}
            {sale.void_reason && <Row label="Void reason" value={sale.void_reason} />}
            {snapshot.template_version && <Row label="Paper version" value={`v${snapshot.template_version}`} />}
            {snapshot.policy_version && <Row label="Terms version" value={snapshot.policy_version} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Dearune</CardTitle>
            <CardDescription>The record this money was taken for.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {project ? (
              <>
                <Row label="Reference" value={project.reference ?? project.id.slice(0, 8)} />
                <Row label="Recipient" value={project.title || 'Untitled'} />
                <Row label="Status" value={project.paid_at ? 'Sold' : 'Sale was corrected'} />
                <Link
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors hover:border-primary/40"
                  to={`/admin/designers/${project.designer_id}/messages/${project.id}`}
                >
                  Open the Dearune
                  <ArrowLeft className="size-3 rotate-180" />
                </Link>
              </>
            ) : (
              <p className="text-muted-foreground">
                {legacy
                  ? 'A legacy order: its Dearune predates this screen, so there is no project to open. The row stays in the ledger as history.'
                  : 'This entry has no Dearune attached.'}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <ShieldAlert className="size-4" /> Correction
          </CardTitle>
          <CardDescription>
            Available only while maintenance mode is ON. Voiding keeps this entry (money, time and reason untouched) and un-stamps the Dearune so it can be sold again.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sale.status === 'voided' ? (
            <p className="text-sm text-muted-foreground">This entry is already voided and cannot change again.</p>
          ) : canVoid ? (
            <>
              <Label htmlFor="void-reason">Why is this being corrected?</Label>
              <Textarea id="void-reason" className="min-h-[70px]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Wrong price entered, customer cancelled…" />
              <div className="flex justify-end">
                <Button variant="destructive" size="sm" onClick={() => void voidSale()} disabled={voiding}>
                  {voiding && <Loader2Icon className="size-4 animate-spin" />}
                  Void this sale
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {!maintenance
                ? 'Turn maintenance mode on in Settings to correct a sale.'
                : legacy
                  ? 'This entry came from the old Sales screens and has no Dearune to correct — it stays as history.'
                  : 'Nothing to correct on this entry.'}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right">{value}</span>
    </div>
  )
}
