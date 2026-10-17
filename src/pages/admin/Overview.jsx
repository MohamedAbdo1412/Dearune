import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Banknote, Boxes, Package, Users, Wand2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchDearunes } from '@/services/dearunes'
import { fetchSales, sumSales } from '@/services/sales'
import { nextDearuneAction, PROJECT_STAGE_LABELS, PROJECT_STAGE_ORDER, projectStage } from '@/services/constants'
import { formatDateTime, formatMoney } from '@/services/format'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { ProjectBadge } from '@/components/stage-badge'

// The dashboard: what the studio has taken in (EGP, voided sales excluded),
// what it still owes, and what has just happened. Everything here reads the
// same Dearune records the Designers page operates on.

const EVENT_LABELS = {
  'project.configured': 'handed over',
  'project.sold': 'sold',
  'project.sale.voided': 'sale voided',
  'project.wrapper': 'wrapper set',
  'project.manufactured': 'marked made',
  'project.shipped': 'marked shipped',
  'project.arrived': 'marked arrived',
  'project.manufactured.reversed': 'made corrected',
  'project.shipped.reversed': 'shipped corrected',
  'project.arrived.reversed': 'arrived corrected',
  'project.activated': 'message opened',
  'project.deactivated': 'message closed',
  'project.shipping': 'delivery details saved',
  'project.archived': 'archived',
  'project.restored': 'restored',
}

export function Overview() {
  const [projects, setProjects] = useState(null)
  const [sales, setSales] = useState([])
  const [events, setEvents] = useState([])
  const [designerCount, setDesignerCount] = useState(null)
  const [templateCount, setTemplateCount] = useState(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const [projectRows, saleRows] = await Promise.all([fetchDearunes(), fetchSales()])
        if (!active) return
        setProjects(projectRows)
        setSales(saleRows)
      } catch {
        if (active) setProjects([])
      }
      if (supabase) {
        const [d, t, e] = await Promise.all([
          supabase.from('designers').select('id', { count: 'exact', head: true }).is('revoked_at', null),
          supabase.from('templates').select('id', { count: 'exact', head: true }).is('deleted_at', null),
          supabase
            .from('project_events')
            .select('id, project_id, action, created_at')
            .order('created_at', { ascending: false })
            .limit(8),
        ])
        if (active) {
          setDesignerCount(d.count ?? 0)
          setTemplateCount(t.count ?? 0)
          setEvents(e.data ?? [])
        }
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  const rows = projects ?? []
  const activeProjects = rows.filter((p) => !p.archived_at)
  const totals = sumSales(sales, 'EGP')
  const needsAction = activeProjects.filter((p) => nextDearuneAction(p) && nextDearuneAction(p) !== 'restore')
  const waitingToSell = activeProjects.filter((p) => !p.paid_at).length
  const inStudio = activeProjects.filter((p) => p.paid_at && p.wrapper_type !== 'digital' && !p.arrived_at).length

  const byStage = new Map()
  for (const p of rows) byStage.set(projectStage(p), (byStage.get(projectStage(p)) ?? 0) + 1)

  const projectById = new Map(rows.map((p) => [p.id, p]))
  const recent = [...rows].sort((a, b) => Date.parse(b.created_at ?? 0) - Date.parse(a.created_at ?? 0)).slice(0, 6)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            The state of the studio at a glance.
            {designerCount !== null ? ` · ${designerCount} active ${designerCount === 1 ? 'designer' : 'designers'}` : ''}
            {templateCount !== null ? ` · ${templateCount} ${templateCount === 1 ? 'paper' : 'papers'}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/admin/designers">
            <Button variant="outline" size="sm">
              <Users className="size-4" />
              Designers
            </Button>
          </Link>
          <Link to="/admin/sold">
            <Button variant="outline" size="sm">
              <Banknote className="size-4" />
              Sold Logs
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Revenue</CardTitle>
            <Banknote className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {projects === null ? <Skeleton className="h-7 w-28" /> : <p className="text-2xl font-semibold tabular-nums">{formatMoney(totals.revenue, 'EGP')}</p>}
            <p className="mt-1 text-xs text-muted-foreground">EGP · voided sales excluded</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Estimated profit</CardTitle>
            <Wand2 className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {projects === null ? <Skeleton className="h-7 w-28" /> : <p className="text-2xl font-semibold tabular-nums">{formatMoney(totals.profit, 'EGP')}</p>}
            <p className="mt-1 text-xs text-muted-foreground">{totals.count} {totals.count === 1 ? 'sale' : 'sales'} recorded</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Dearunes</CardTitle>
            <Boxes className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {projects === null ? <Skeleton className="h-7 w-16" /> : <p className="text-2xl font-semibold tabular-nums">{activeProjects.length}</p>}
            <p className="mt-1 text-xs text-muted-foreground">{waitingToSell} waiting to be sold · {byStage.get('archived') ?? 0} archived</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Needs action</CardTitle>
            <Package className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {projects === null ? <Skeleton className="h-7 w-16" /> : <p className="text-2xl font-semibold tabular-nums">{needsAction.length}</p>}
            <p className="mt-1 text-xs text-muted-foreground">{inStudio} still in the studio</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">Recent Dearunes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {projects === null ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : recent.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No Dearunes yet — designers hand them over through Create Dearune.</p>
            ) : (
              recent.map((p) => (
                <Link
                  key={p.id}
                  to={`/admin/designers/${p.designer_id}/messages/${p.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2.5 transition-colors hover:border-primary/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      <span className="font-mono text-xs text-muted-foreground">{p.reference ?? p.id.slice(0, 8)}</span>
                      {' · '}{p.title || 'Untitled'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{formatDateTime(p.created_at)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs tabular-nums text-muted-foreground">{p.paid_at ? formatMoney(p.sale_price, p.currency ?? 'EGP') : 'not sold'}</span>
                    <ProjectBadge project={p} />
                    <ArrowUpRight className="size-4 text-muted-foreground" />
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">By stage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {projects === null ? (
                <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : (
                PROJECT_STAGE_ORDER.map((stage) => {
                  const count = byStage.get(stage) ?? 0
                  const total = rows.length
                  const pct = total === 0 ? 0 : Math.round((count / total) * 100)
                  return (
                    <div key={stage} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{PROJECT_STAGE_LABELS[stage]}</span>
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

          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {events.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Nothing has happened yet.</p>
              ) : (
                events.map((event) => {
                  const project = projectById.get(event.project_id)
                  const label = EVENT_LABELS[event.action] ?? event.action
                  return (
                    <div key={event.id} className="text-sm">
                      {project ? (
                        <Link to={`/admin/designers/${project.designer_id}/messages/${project.id}`} className="hover:underline">
                          <span className="font-medium">{project.reference ?? project.id.slice(0, 8)}</span> {label}
                        </Link>
                      ) : (
                        <span>{label}</span>
                      )}
                      <p className="text-xs text-muted-foreground">{formatDateTime(event.created_at)}</p>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
