import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronDown, Copy, Download, Loader2Icon, Plus, RotateCcw, ShieldOff, ShieldCheck, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { activateDesigner, createDesigner, fetchDesigners, resetPasscode, revokeDesigner } from '@/services/designers'
import { fetchDearunes } from '@/services/dearunes'
import { fetchSales, sumSales } from '@/services/sales'
import { downloadShippingCsv, fetchShipments } from '@/services/shipping'
import { fetchTemplates } from '@/services/templates'
import { projectStage, PROJECT_STAGE_LABELS, PROJECT_STAGE_ORDER } from '@/services/constants'
import { formatDateTime, formatMoney } from '@/services/format'
import { useAppSettings } from '@/hooks/use-app-settings'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { DearuneList } from '@/components/admin/DearuneList'

// Designers is the studio's operations page: one account per designer, and
// under it every Dearune that designer has handed over — configured, sold,
// made, shipped, delivered — each with the next step the studio owes it.
// Sales, messages and production all live here instead of a separate Orders
// screen, because the Dearune is the thing being operated on.

const STAGE_TABS = ['all', ...PROJECT_STAGE_ORDER]

function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="break-all font-mono text-sm">{value}</p>
      </div>
      <Button variant="ghost" size="icon" onClick={() => void copy()}>
        {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
      </Button>
    </div>
  )
}

export function Designers() {
  const { settings } = useAppSettings()
  const maintenance = Boolean(settings?.maintenance_mode)
  const [designers, setDesigners] = useState(null)
  const [projects, setProjects] = useState(null)
  const [sales, setSales] = useState([])
  const [catalog, setCatalog] = useState(null)
  const [open, setOpen] = useState(() => new Set())
  const [query, setQuery] = useState('')
  const [stage, setStage] = useState('all')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [credentials, setCredentials] = useState(null)
  const [actingId, setActingId] = useState(null)
  const [newPasscode, setNewPasscode] = useState(null)
  const [exportingShipments, setExportingShipments] = useState(false)

  const reload = async () => {
    try {
      const [designerRows, projectRows, saleRows] = await Promise.all([
        fetchDesigners(),
        fetchDearunes(),
        fetchSales(),
      ])
      setDesigners(designerRows)
      setProjects(projectRows)
      setSales(saleRows)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load the studio')
    }
  }

  useEffect(() => {
    void reload()
    void fetchTemplates().then(setCatalog).catch(() => setCatalog(null))
  }, [])

  const create = async () => {
    if (!name.trim()) { toast.error('Give the designer a name'); return }
    setBusy(true)
    try {
      const result = await createDesigner(name.trim())
      setCredentials({ name: result.designer.name, code: result.code, passcode: result.passcode })
      setName('')
      setCreating(false)
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create designer')
    } finally {
      setBusy(false)
    }
  }

  const act = async (designerId, action) => {
    setActingId(designerId)
    setNewPasscode(null)
    try {
      if (action === 'reset-passcode') {
        const result = await resetPasscode(designerId)
        if (result.passcode) setNewPasscode(result.passcode)
        toast.success('New passcode generated')
      } else if (action === 'revoke') {
        await revokeDesigner(designerId)
        toast.success('Designer revoked')
      } else {
        await activateDesigner(designerId)
        toast.success('Designer activated')
      }
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActingId(null)
    }
  }

  const paperFor = (slug) => catalog?.templates?.find((t) => t.slug === slug)?.name ?? ''

  const filteredProjects = useMemo(() => {
    if (!projects) return []
    const q = query.trim().toLowerCase()
    return projects.filter((p) => {
      if (stage !== 'all' && projectStage(p) !== stage) return false
      if (!q) return true
      const haystack = [
        p.title,
        p.reference,
        p.id,
        paperFor(p.template_slug),
        designers?.find((d) => d.id === p.designer_id)?.name,
        designers?.find((d) => d.id === p.designer_id)?.code,
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(q)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, query, stage, designers, catalog])

  const visibleDesigners = useMemo(() => {
    if (!designers) return []
    const q = query.trim().toLowerCase()
    if (!q) return designers
    const matchedIds = new Set(filteredProjects.map((p) => p.designer_id))
    return designers.filter(
      (d) => matchedIds.has(d.id) || d.name.toLowerCase().includes(q) || String(d.code ?? '').includes(q),
    )
  }, [designers, query, filteredProjects])

  const statsFor = (designerId) => {
    const theirs = (projects ?? []).filter((p) => p.designer_id === designerId)
    const ids = new Set(theirs.map((p) => p.id))
    const mine = sales.filter((s) => ids.has(s.project_id))
    const { revenue, count } = sumSales(mine, 'EGP')
    return { dearunes: theirs.length, sold: count, revenue }
  }

  const toggle = (designerId) => {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(designerId)) next.delete(designerId)
      else next.add(designerId)
      return next
    })
  }

  // The shipping manifest: every Dearune with delivery details on file.
  const exportShipments = async () => {
    if (exportingShipments) return
    setExportingShipments(true)
    try {
      const shipments = await fetchShipments()
      if (!shipments.length) {
        toast.error('No delivery details have been entered yet')
        return
      }
      downloadShippingCsv(shipments)
      toast.success('Shipping CSV downloaded')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not build the shipping CSV')
    } finally {
      setExportingShipments(false)
    }
  }

  // Same figures as Sold Logs: every completed row in the ledger, legacy
  // carry-over included, voided excluded, summed in EGP only.
  const totalSold = sumSales(sales, 'EGP')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl">Designers</h1>
          <p className="text-sm text-muted-foreground">
            The people who write the words — and every Dearune they have handed over.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          New designer
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Dearunes</p>
            <p className="text-xl font-semibold tabular-nums">{projects === null ? '—' : projects.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Sold</p>
            <p className="text-xl font-semibold tabular-nums">{projects === null ? '—' : totalSold.count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Revenue</p>
            <p className="text-xl font-semibold tabular-nums">{projects === null ? '—' : formatMoney(totalSold.revenue, 'EGP')}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs value={stage} onValueChange={setStage} className="min-w-0 overflow-x-auto">
          <TabsList className="w-max">
            {STAGE_TABS.map((value) => (
              <TabsTrigger key={value} value={value} className="capitalize">
                {value === 'all' ? 'All' : PROJECT_STAGE_LABELS[value]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <Button variant="outline" size="sm" onClick={() => void exportShipments()} disabled={exportingShipments}>
            {exportingShipments ? <Loader2Icon className="size-4 animate-spin" /> : <Download className="size-4" />}
            Shipping CSV
          </Button>
          <div className="relative w-full md:w-72">
            <Input
              placeholder="Search designer, code, recipient, reference…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-3"
            />
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {designers === null ? 'Loading…' : `${designers.length} ${designers.length === 1 ? 'designer' : 'designers'}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {designers === null ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 w-full rounded-lg border bg-muted/40" />)}</div>
          ) : visibleDesigners.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nothing matches the current filters.</p>
          ) : (
            visibleDesigners.map((d) => {
              const stats = statsFor(d.id)
              const isOpen = open.has(d.id)
              const theirs = filteredProjects.filter((p) => p.designer_id === d.id)
              return (
                <div key={d.id} className="rounded-lg border bg-background">
                  <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => toggle(d.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      aria-expanded={isOpen}
                    >
                      <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {d.name}
                          <code className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">{d.code}</code>
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {stats.dearunes} {stats.dearunes === 1 ? 'Dearune' : 'Dearunes'}
                          {' · '}{stats.sold} sold
                          {' · '}{formatMoney(stats.revenue, 'EGP')}
                          {' · '}{d.last_login_at ? `last seen ${formatDateTime(d.last_login_at)}` : 'never signed in'}
                        </p>
                      </div>
                    </button>

                    <div className="flex w-full shrink-0 flex-wrap items-center gap-1 sm:w-auto">
                      {d.revoked_at ? <Badge variant="destructive">Revoked</Badge> : <Badge variant="outline" className="text-emerald-700 dark:text-emerald-400">Active</Badge>}
                      <Button asChild size="sm" variant="ghost" title="Open designer page">
                        <Link to={`/admin/designers/${d.id}`}>Open</Link>
                      </Button>
                      <Button size="sm" variant="ghost" disabled={actingId === d.id} onClick={() => void act(d.id, 'reset-passcode')} title="Reset passcode">
                        {actingId === d.id ? <Loader2Icon className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                        <span className="sr-only">Reset passcode</span>
                      </Button>
                      {d.revoked_at ? (
                        <Button size="sm" variant="outline" disabled={actingId === d.id} onClick={() => void act(d.id, 'activate')}>
                          <ShieldCheck className="size-4" /> Activate
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" disabled={actingId === d.id || maintenance} onClick={() => void act(d.id, 'revoke')}>
                          <ShieldOff className="size-4" /> Revoke
                        </Button>
                      )}
                    </div>
                  </div>

                  {isOpen && (
                    <div className="border-t bg-muted/20 px-3 py-3">
                      <DearuneList
                        projects={theirs}
                        catalog={catalog}
                        maintenance={maintenance}
                        onChanged={() => void reload()}
                        basePath={`/admin/designers/${d.id}/messages`}
                        empty={stage === 'all' && !query ? 'No Dearunes handed over yet.' : 'No Dearunes match the current filters.'}
                      />
                    </div>
                  )}
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      <Dialog open={creating} onOpenChange={(open2) => { if (!open2) setCreating(false) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">New designer</DialogTitle>
            <DialogDescription>Generated a unique 6-digit code. You will hand them their passcode in the next step.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="designer-name">Name</Label>
            <Input id="designer-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Able Ansel" onKeyDown={(e) => { if (e.key === 'Enter') void create() }} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={() => void create()} disabled={busy}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={credentials !== null || newPasscode !== null} onOpenChange={(open2) => { if (!open2) { setCredentials(null); setNewPasscode(null) } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">
              {newPasscode ? 'New passcode' : credentials ? `${credentials.name}'s credentials` : ''}
            </DialogTitle>
            <DialogDescription>
              Shown once. Share it privately and never store it afterwards.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {credentials && (
              <>
                <CopyField label="Sign-in code" value={credentials.code} />
                <CopyField label="One-time passcode" value={credentials.passcode} />
              </>
            )}
            {newPasscode && <CopyField label="New passcode" value={newPasscode} />}
            {credentials && <p className="text-xs text-muted-foreground">Designer: <span className="font-medium text-foreground">{credentials.name}</span>. The old passcode (if any) no longer works.</p>}
          </div>
          <DialogFooter>
            <Button onClick={() => { setCredentials(null); setNewPasscode(null) }}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
