import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Banknote, ClipboardList, MailPlus, Package, Users } from 'lucide-react'
import { fetchAdminOrders } from '@/services/orders'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { StageBadge } from '@/components/stage-badge'
import { orderStage, STAGE_LABELS, WRAPPER_LABELS } from '@/services/constants'
import { formatMoney, formatDate } from '@/services/format'

export function Overview() {
  const [orders, setOrders] = useState(null)
  const [designerCount, setDesignerCount] = useState(null)
  const [templateCount, setTemplateCount] = useState(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const rows = await fetchAdminOrders()
        if (!active) return
        setOrders(rows)
      } catch {
        if (active) setOrders([])
      }
      if (supabase) {
        const [d, t] = await Promise.all([
          supabase.from('designers').select('id', { count: 'exact', head: true }).eq('revoked_at', null),
          supabase.from('templates').select('id', { count: 'exact', head: true }).is('deleted_at', null),
        ])
        if (active) {
          setDesignerCount(d.count ?? 0)
          setTemplateCount(t.count ?? 0)
        }
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  const revenueUncancelled = orders?.reduce((sum, o) => {
    if (o.cancelled_at) return sum
    return sum + (Number(o.snapshot_price) || 0)
  }, 0)

  const byStage = new Map()
  for (const o of orders ?? []) {
    const stage = orderStage(o)
    byStage.set(stage, (byStage.get(stage) ?? 0) + 1)
  }

  const needsAction = orders?.filter((o) => {
    const stage = orderStage(o)
    return stage === 'in-production' || stage === 'pending'
  }) ?? []

  const recent = orders?.slice(0, 6) ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl">Overview</h1>
          <p className="text-sm text-muted-foreground">The state of the studio at a glance.</p>
        </div>
        <Link to="/admin/orders">
          <Button variant="outline" size="sm">
            <ClipboardList className="size-4" />
            All orders
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Revenue</CardTitle>
            <Banknote className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {orders === null ? <Skeleton className="h-7 w-24" /> : <p className="text-2xl font-semibold">{formatMoney(String(revenueUncancelled ?? 0))}</p>}
            <p className="mt-1 text-xs text-muted-foreground">excluding cancelled · {orders?.filter((o) => o.paid_at).length ?? 0} paid</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Orders</CardTitle>
            <MailPlus className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {orders === null ? <Skeleton className="h-7 w-16" /> : <p className="text-2xl font-semibold">{orders.length}</p>}
            <p className="mt-1 text-xs text-muted-foreground">{byStage.get('delivered') ?? 0} delivered</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Needs action</CardTitle>
            <Package className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {orders === null ? <Skeleton className="h-7 w-12" /> : <p className="text-2xl font-semibold">{needsAction.length}</p>}
            <p className="mt-1 text-xs text-muted-foreground">not yet published or in production</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Designers & templates</CardTitle>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{designerCount ?? '—'}</p>
            <p className="mt-1 text-xs text-muted-foreground">{templateCount ?? '—'} active templates</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">Recent orders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {orders === null ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : recent.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No orders yet — create the first sale.</p>
            ) : (
              recent.map((o) => (
                <Link
                  key={o.id}
                  to={`/admin/orders/${o.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2.5 transition-colors hover:border-primary/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{o.recipient_name || 'Untitled'}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {o.template?.name} · {WRAPPER_LABELS[o.wrapper_type] ?? o.wrapper_type} · {formatDate(o.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs tabular-nums text-muted-foreground">{o.cancelled_at ? '—' : formatMoney(String(o.snapshot_price ?? 0))}</span>
                    <StageBadge order={o} />
                    <ArrowUpRight className="size-4 text-muted-foreground" />
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">By stage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {orders === null ? (
              <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : (
              [...Object.entries(STAGE_LABELS)].map(([stage, label]) => {
                const count = byStage.get(stage) ?? 0
                const total = orders.length
                const pct = total === 0 ? 0 : Math.round((count / total) * 100)
                return (
                  <div key={stage} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium tabular-nums">{count}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}