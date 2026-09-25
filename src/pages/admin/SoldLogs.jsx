import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Search } from 'lucide-react'
import { toast } from 'sonner'
import { fetchSales, downloadSalesCsv, sumSales } from '@/services/sales'
import { formatDateTime, formatMoney } from '@/services/format'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

// Sold Logs: the money ledger. One immutable row per transaction, voided
// entries kept forever with their reason. Nothing here can be edited from
// the browser — the edge function is the only writer, and this screen only
// reads and exports.

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

export function SoldLogs() {
  const [rows, setRows] = useState(null)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('all')

  const reload = async () => {
    try {
      setRows(await fetchSales())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load Sold Logs')
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  const filtered = useMemo(() => {
    if (!rows) return []
    const q = query.trim().toLowerCase()
    return rows.filter((s) => {
      if (tab !== 'all' && s.status !== tab) return false
      if (!q) return true
      const snapshot = s.snapshot_data ?? {}
      const haystack = [
        s.sale_reference,
        s.title,
        s.designer_name,
        s.template_name,
        snapshot.reference,
        s.legacy_order_id,
        s.void_reason,
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [rows, query, tab])

  const totals = sumSales(rows ?? [], 'EGP')

  const exportCsv = () => {
    try {
      downloadSalesCsv(filtered)
      toast.success(`Exported ${filtered.length} ${filtered.length === 1 ? 'entry' : 'entries'}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl">Sold Logs</h1>
          <p className="text-sm text-muted-foreground">
            Every transaction, immutable. Voided entries stay for the audit trail and never count towards totals.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows}>
          <Download className="size-4" />
          Export CSV
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Sales</p>
            <p className="text-xl font-semibold tabular-nums">{rows === null ? '—' : totals.count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Revenue</p>
            <p className="text-xl font-semibold tabular-nums">{rows === null ? '—' : formatMoney(totals.revenue, 'EGP')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Estimated profit</p>
            <p className="text-xl font-semibold tabular-nums">{rows === null ? '—' : formatMoney(totals.profit, 'EGP')}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="completed">Sold</TabsTrigger>
            <TabsTrigger value="voided">Voided</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search reference, recipient, designer…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {rows === null ? 'Loading…' : `${filtered.length} ${filtered.length === 1 ? 'entry' : 'entries'}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {rows === null ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-12 w-full rounded-lg border bg-muted/40" />)}</div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {rows.length === 0 ? 'No sales recorded yet.' : 'Nothing matches the current filters.'}
            </p>
          ) : (
            filtered.map((sale) => {
              const snapshot = sale.snapshot_data ?? {}
              return (
                <Link
                  key={sale.id}
                  to={`/admin/sold/${sale.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2.5 transition-colors hover:border-primary/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      <span className="font-mono text-xs text-muted-foreground">{sale.sale_reference}</span>
                      {' · '}{sale.title || 'Untitled'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDateTime(sale.sold_at)}
                      {sale.designer_name ? ` · ${sale.designer_name}` : ''}
                      {sale.template_name ? ` · ${sale.template_name}` : ''}
                      {snapshot.reference ? ` · ${snapshot.reference}` : ''}
                      {sale.legacy_order_id && !snapshot.reference ? ' · legacy order' : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={`text-sm tabular-nums ${sale.status === 'voided' ? 'text-muted-foreground line-through' : 'font-medium'}`}>
                      {formatMoney(sale.selling_price, sale.currency)}
                    </span>
                    <StatusBadge status={sale.status} />
                  </div>
                </Link>
              )
            })
          )}
        </CardContent>
      </Card>

      {rows?.some((s) => s.status === 'voided') && (
        <p className="text-xs text-muted-foreground">
          Voided entries keep their original money and reason — they are excluded from revenue and profit above.
        </p>
      )}
      {rows?.some((s) => s.currency !== 'EGP') && (
        <p className="text-xs text-muted-foreground">
          Rows from the old Sales screens keep the currency they were recorded in; totals are summed in EGP only.
        </p>
      )}
    </div>
  )
}
