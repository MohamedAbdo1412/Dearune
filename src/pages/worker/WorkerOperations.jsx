import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  Boxes,
  Download,
  Factory,
  History,
  Loader2,
  MapPin,
  Package,
  Pencil,
  Phone,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Truck,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { hasPermission } from '@/lib/permissions'
import { MILESTONE_LABELS, MILESTONE_ORDER, milestoneRank } from '@/services/constants'
import { formatDateTime } from '@/services/format'
import { OPERATIONS_SORTS } from '@/services/operations'
import {
  archiveWorkerOperations,
  downloadWorkerOperationsCsv,
  ensureWorkerOperations,
  fetchWorkerAssignableDesigners,
  fetchWorkerOperationEvents,
  fetchWorkerOperations,
  fetchWorkerOperationsForExport,
  markWorkerDearuneDelivered,
  markWorkerDearuneManufactured,
  markWorkerDearuneShipped,
  updateWorkerOperation,
  updateWorkerOperationContact,
  updateWorkerOperationDesigner,
} from '@/services/workerOperations'
const ALL = 'all'

function messageOf(error) {
  return error instanceof Error ? error.message : 'Something went wrong'
}

function when(value) {
  return value ? formatDateTime(value) : '—'
}

const timeOf = (value) => {
  const parsed = Date.parse(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : 0
}

// The ONE milestone, read from the row. The worker screen used to rebuild a
// stage from unit timestamps, which disagreed with the admin's stage whenever a
// unit was re-stamped or a shipment was recorded out of order. `projects
// .milestone` is the only stored stage; the unit stamps are production detail.
const milestoneOf = (row) => String(row?.milestone ?? '') || 'configured'

// Which milestone step a worker is allowed to perform. The permission is the
// worker's; the transition itself is the same `ops_*` function the admin calls,
// so both dashboards cannot drift apart.
const WORKER_STEPS = {
  making: { next: 'shipping', action: 'manufactured', permission: 'operations.mark_manufactured' },
  shipping: { next: 'delivery', action: 'shipped', permission: 'operations.mark_shipped' },
  delivery: { next: 'delivered', action: 'delivered', permission: 'operations.mark_delivered' },
}

// The same sort choices the admin screen offers, applied to the worker's safe
// snake_case rows without fetching any extra columns.
function sortWorkerRows(rows, sortKey) {
  const sorted = [...(rows ?? [])]
  const byId = (a, b) => String(a.reference ?? '').localeCompare(String(b.reference ?? ''))
  switch (sortKey) {
    case 'oldest':
      return sorted.sort((a, b) => timeOf(a.created_at) - timeOf(b.created_at) || byId(a, b))
    case 'updated':
      return sorted.sort((a, b) => timeOf(b.updated_at) - timeOf(a.updated_at) || byId(a, b))
    case 'status':
      return sorted.sort(
        (a, b) =>
          milestoneRank(milestoneOf(a)) - milestoneRank(milestoneOf(b)) ||
          timeOf(b.created_at) - timeOf(a.created_at) ||
          byId(a, b),
      )
    case 'id':
      return sorted.sort(byId)
    case 'customer':
      return sorted.sort(
        (a, b) =>
          String(a.recipient_name ?? '').localeCompare(String(b.recipient_name ?? '')) ||
          String(a.customer_phone ?? '').localeCompare(String(b.customer_phone ?? '')) ||
          byId(a, b),
      )
    case 'newest':
    default:
      return sorted.sort((a, b) => timeOf(b.created_at) - timeOf(a.created_at) || byId(a, b))
  }
}

function EmptyState({ title, message, onRetry }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/70 p-8 text-center">
      <span className="mx-auto inline-flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Factory className="size-6" aria-hidden />
      </span>
      <h2 className="mt-4 font-heading text-xl tracking-tight">{title}</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          <RefreshCw className="size-4" aria-hidden />
          Try again
        </Button>
      ) : null}
    </div>
  )
}

function MilestoneActions({ row, permissions, busy, onAdvance }) {
  const milestone = milestoneOf(row)
  const step = WORKER_STEPS[milestone]
  if (row.archived_at) return <p className="text-xs text-muted-foreground">Restore this unit before changing its milestone.</p>
  if (!step) return null
  if (!hasPermission(permissions, step.permission)) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" disabled={busy} onClick={() => onAdvance(row, step.action)}>
        <ArrowRight className="size-4" aria-hidden />
        Advance to {MILESTONE_LABELS[step.next] ?? step.next}
      </Button>
    </div>
  )
}

export function WorkerOperations() {
  const { session } = useOutletContext()
  const permissions = session.permissions
  const canEdit = hasPermission(permissions, 'operations.edit')
  const canManage = hasPermission(permissions, 'operations.manage')
  const canCreate = hasPermission(permissions, 'operations.create')
  const canAssign = hasPermission(permissions, 'operations.assign') || hasPermission(permissions, 'operations.edit')
  const canViewDetails = hasPermission(permissions, 'operations.view_details')
  const canPrint = hasPermission(permissions, 'operations.print')
  const canExport = hasPermission(permissions, 'operations.export')
  const canViewDesigners = hasPermission(permissions, 'designers.view')

  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState('newest')
  const [milestoneFilter, setMilestoneFilter] = useState(ALL)
  const [showArchived, setShowArchived] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [busyId, setBusyId] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [timeline, setTimeline] = useState(null)
  const [detail, setDetail] = useState(null)
  const [editOpen, setEditOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [phone, setPhone] = useState('')
  const [assignOpen, setAssignOpen] = useState(false)
  const [designers, setDesigners] = useState([])
  const [designerId, setDesignerId] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const data = await fetchWorkerOperations(true)
      setRows(data)
      setDetail((current) => (current ? data.find((row) => row.id === current.id) ?? null : null))
      setSelected((current) => {
        const live = new Set(data.map((row) => row.id))
        return new Set([...current].filter((id) => live.has(id)))
      })
    } catch (caught) {
      setError(messageOf(caught))
      setRows((current) => current ?? [])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const scoped = useMemo(
    () => (rows ?? []).filter((row) => (showArchived ? true : !row.archived_at)),
    [rows, showArchived],
  )

  const counts = useMemo(() => {
    const next = { [ALL]: scoped.length }
    for (const milestone of MILESTONE_ORDER) {
      next[milestone] = scoped.filter((row) => milestoneOf(row) === milestone).length
    }
    return next
  }, [scoped])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = scoped
      .filter((row) => milestoneFilter === ALL || milestoneOf(row) === milestoneFilter)
      .filter((row) => {
        if (!needle) return true
        return [
          row.reference,
          row.project_reference,
          row.project_title,
          row.designer_name,
          row.designer_code,
          row.recipient_name,
          row.city,
          row.tracking_code,
          row.customer_phone,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle))
      })
    return sortWorkerRows(filtered, sortKey)
  }, [scoped, query, milestoneFilter, sortKey])

  const projectUnits = useMemo(() => {
    const map = new Map()
    for (const row of rows ?? []) {
      map.set(row.project_id, (map.get(row.project_id) ?? 0) + 1)
    }
    return map
  }, [rows])

  const visibleIds = useMemo(() => visible.map((row) => row.id), [visible])
  const selectedRows = useMemo(
    () => (rows ?? []).filter((row) => selected.has(row.id)),
    [rows, selected],
  )
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id))
  const printable = selectedRows.filter((row) => !row.archived_at)

  const toggle = (id) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelected((current) => {
      const next = new Set(current)
      if (allSelected) for (const id of visibleIds) next.delete(id)
      else for (const id of visibleIds) next.add(id)
      return next
    })
  }

  const refresh = async () => {
    await load()
  }

  const advance = async (row, status) => {
    setBusyId(row.id)
    try {
      if (status === 'manufactured') {
        await markWorkerDearuneManufactured(row.project_id)
        toast.success('Marked manufactured')
      } else if (status === 'shipped') {
        await markWorkerDearuneShipped(row.project_id)
        toast.success('Marked shipped')
      } else if (status === 'delivered') {
        await markWorkerDearuneDelivered(row.project_id)
        toast.success('Marked delivered')
      } else {
        throw new Error('Unsupported milestone')
      }
      await load()
    } catch (caught) {
      toast.error(messageOf(caught))
    } finally {
      setBusyId('')
    }
  }

  const openEdit = (row) => {
    setNotes(row.notes ?? '')
    setPhone(row.customer_phone ?? '')
    setEditOpen(true)
  }

  const saveEdit = async () => {
    if (!detail) return
    setBusyId(detail.id)
    try {
      await updateWorkerOperation(detail.id, {
        notes,
      })
      if ((detail.customer_phone ?? '') !== phone) {
        await updateWorkerOperationContact(detail.project_id, phone)
      }
      toast.success('Operational details saved')
      setEditOpen(false)
      await load()
    } catch (caught) {
      toast.error(messageOf(caught))
    } finally {
      setBusyId('')
    }
  }

  const archive = async (row, shouldArchive) => {
    setBusyId(row.id)
    try {
      await archiveWorkerOperations([row.id], shouldArchive)
      toast.success(shouldArchive ? 'Unit archived' : 'Unit restored')
      await load()
    } catch (caught) {
      toast.error(messageOf(caught))
    } finally {
      setBusyId('')
    }
  }

  const archiveSelected = async (shouldArchive) => {
    if (selectedRows.length === 0 || bulkBusy) return
    setBulkBusy(true)
    try {
      await archiveWorkerOperations(selectedRows.map((row) => row.id), shouldArchive)
      toast.success(
        `${shouldArchive ? 'Archived' : 'Restored'} ${selectedRows.length} ${
          selectedRows.length === 1 ? 'unit' : 'units'
        }`,
      )
      setSelected(new Set())
      await load()
    } catch (caught) {
      toast.error(messageOf(caught))
    } finally {
      setBulkBusy(false)
    }
  }

  const openDetail = (row) => {
    setDetail(row)
    setTimeline(null)
  }

  // Re-read the timeline whenever the open unit changes, including after a
  // status/edit action replaced the row. The RPC is gated by `view_details`;
  // without it the panel simply stays hidden.
  useEffect(() => {
    if (!detail || !canViewDetails) return undefined
    let active = true
    setTimeline(null)
    void (async () => {
      try {
        const events = await fetchWorkerOperationEvents(detail.id)
        if (active) setTimeline(events)
      } catch (caught) {
        if (active) {
          setTimeline([])
          toast.error(messageOf(caught))
        }
      }
    })()
    return () => {
      active = false
    }
  }, [detail, canViewDetails])

  const exportCsv = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const data = await fetchWorkerOperationsForExport(showArchived)
      downloadWorkerOperationsCsv(data)
      toast.success(`Exported ${data.length} ${data.length === 1 ? 'unit' : 'units'}`)
    } catch (caught) {
      toast.error(messageOf(caught))
    } finally {
      setExporting(false)
    }
  }

  const addUnit = async (row) => {
    if (!canCreate && !canManage) return
    setBusyId(row.id)
    try {
      const count = projectUnits.get(row.project_id) ?? 1
      await ensureWorkerOperations(row.project_id, count + 1)
      toast.success('Another production unit opened')
      await load()
    } catch (caught) {
      toast.error(messageOf(caught))
    } finally {
      setBusyId('')
    }
  }

  const openAssign = useCallback(async (row) => {
    if (!canAssign) return
    setDesignerId(row.designer_id || '')
    setAssignOpen(true)
    if (designers.length === 0) {
      try {
        const list = await fetchWorkerAssignableDesigners()
        setDesigners(Array.isArray(list) ? list : [])
      } catch {
        // ignore
      }
    }
  }, [canAssign, designers.length])

  const saveAssign = useCallback(async () => {
    if (!detail || !canAssign || !designerId) return
    setBusyId(detail.id)
    try {
      await updateWorkerOperationDesigner(detail.project_id, designerId)
      toast.success('Designer assigned')
      setAssignOpen(false)
      await load()
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : messageOf(caught))
    } finally {
      setBusyId('')
    }
  }, [canAssign, detail, designerId, load])

  if (rows === null) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  if (error && rows.length === 0) {
    return (
      <EmptyState
        title="Operations could not be loaded"
        message={error}
        onRetry={refresh}
      />
    )
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Operations</p>
          <h1 className="mt-1 font-heading text-3xl tracking-tight">The workshop line</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Units, statuses and delivery details. Prices, costs and customer financial records are
            not part of this workspace and are never loaded here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canPrint ? (
            <Button asChild variant="outline">
              <Link to="/worker/operations/print">
                <Printer className="size-4" aria-hidden />
                Print papers
              </Link>
            </Button>
          ) : null}
          {canExport ? (
            <Button variant="outline" onClick={exportCsv} disabled={exporting}>
              {exporting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Download className="size-4" aria-hidden />
              )}
              Export CSV
            </Button>
          ) : null}
          <Button variant="outline" onClick={refresh}>
            <RefreshCw className="size-4" aria-hidden />
            Refresh
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Pending', value: counts.pending ?? 0 },
          { label: 'Sold', value: counts.sold ?? 0 },
          { label: 'Manufactured', value: counts.manufactured ?? 0 },
          { label: 'Shipped', value: counts.shipped ?? 0 },
          { label: 'Delivered', value: counts.delivered ?? 0 },
          { label: 'Archived', value: (rows ?? []).filter((row) => row.archived_at).length },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-border bg-card px-4 py-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{stat.label}</p>
            <p className="mt-2 font-heading text-3xl tracking-tight">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search unit, Dearune, designer, city or tracking…"
            className="pl-9"
            aria-label="Search operations"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={sortKey} onValueChange={setSortKey}>
            <SelectTrigger className="w-[11rem]" aria-label="Sort operations">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPERATIONS_SORTS.map((sort) => (
                <SelectItem key={sort.key} value={sort.key}>
                  {sort.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={milestoneFilter} onValueChange={setMilestoneFilter}>
            <SelectTrigger className="w-[13rem]" aria-label="Filter by milestone">
              <SelectValue placeholder="Milestones" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All ({counts[ALL] ?? 0})</SelectItem>
              {MILESTONE_ORDER.map((milestone) => (
                <SelectItem key={milestone} value={milestone}>
                  {MILESTONE_LABELS[milestone]} ({counts[milestone] ?? 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant={showArchived ? 'default' : 'outline'}
            onClick={() => setShowArchived((value) => !value)}
          >
            <Archive className="size-4" aria-hidden />
            {showArchived ? 'Hide archive' : 'Show archived'}
          </Button>
        </div>
      </div>

      {selectedRows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-muted/40 px-3 py-2.5">
          <span className="text-sm text-muted-foreground">
            {selectedRows.length} selected
          </span>
          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
            {canManage && showArchived && selectedRows.some((row) => row.archived_at) ? (
              <Button
                size="sm"
                variant="outline"
                disabled={bulkBusy}
                onClick={() => archiveSelected(false)}
              >
                {bulkBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArchiveRestore className="size-4" aria-hidden />}
                Restore selected
              </Button>
            ) : null}
            {canManage ? (
              <Button
                size="sm"
                variant="outline"
                disabled={bulkBusy || selectedRows.every((row) => row.archived_at)}
                onClick={() => archiveSelected(true)}
              >
                {bulkBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Archive className="size-4" aria-hidden />}
                Archive selected
              </Button>
            ) : null}
            {canPrint ? (
              <Button asChild size="sm" variant="outline">
                <Link
                  to={`/worker/operations/print${
                    printable.length > 0 ? `?ids=${printable.map((row) => row.id).join(',')}` : ''
                  }`}
                >
                  <Printer className="size-4" aria-hidden />
                  Print papers
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          title={query || milestoneFilter !== ALL ? 'No units match this view' : 'No production units yet'}
          message={
            query || milestoneFilter !== ALL
              ? 'Clear the search or status filter to see the rest of the workshop.'
              : 'Units appear here after a physical Dearune is sold. If a unit is missing, ask the studio administrator to open it.'
          }
        />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="w-10 px-3 py-3 font-medium">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      aria-label="Select every visible unit"
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">Unit</th>
                  <th className="px-4 py-3 font-medium">Dearune</th>
                  <th className="px-4 py-3 font-medium">Designer</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Delivery</th>
                  <th className="px-4 py-3 font-medium text-right">Open</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id} className="border-t border-border/70 transition-colors hover:bg-muted/35">
                    <td className="px-3 py-3 align-top">
                      <Checkbox
                        checked={selected.has(row.id)}
                        onCheckedChange={() => toggle(row.id)}
                        aria-label={`Select ${row.reference}`}
                      />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="font-mono text-xs font-semibold tracking-tight">{row.reference}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Unit {row.unit_index}</p>
                      {row.archived_at ? <Badge variant="outline" className="mt-1 text-[0.65rem]">Archived</Badge> : null}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="font-medium">{row.project_title || 'Untitled Dearune'}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{row.project_reference}</p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p>{row.designer_name || 'Unassigned'}</p>
                      {row.designer_code ? <p className="mt-0.5 text-xs text-muted-foreground">{row.designer_code}</p> : null}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline">{MILESTONE_LABELS[milestoneOf(row)] ?? milestoneOf(row)}</Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-muted-foreground">
                      <p>{row.recipient_name || 'No recipient name'}</p>
                      <p className="mt-0.5">{row.city || 'No city'} {row.tracking_code ? `· ${row.tracking_code}` : ''}</p>
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      <Button size="sm" variant="outline" onClick={() => void openDetail(row)}>
                        Open
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:hidden">
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-muted/40 px-3 py-2">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select every visible unit"
                />
                Select all
              </label>
              <span className="text-xs text-muted-foreground">{selectedRows.length} selected</span>
            </div>
            {visible.map((row) => (
              <div
                key={row.id}
                className="rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/30"
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={selected.has(row.id)}
                    onCheckedChange={() => toggle(row.id)}
                    aria-label={`Select ${row.reference}`}
                    className="mt-1"
                  />
                  <button
                    type="button"
                    onClick={() => void openDetail(row)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs font-semibold">{row.reference}</p>
                        <p className="mt-1 truncate font-medium">{row.project_title || 'Untitled Dearune'}</p>
                      </div>
                      <Badge variant="outline">{MILESTONE_LABELS[milestoneOf(row)]}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>Unit {row.unit_index}</span>
                      <span>{row.designer_name || 'Unassigned'}</span>
                      {row.city ? <span>{row.city}</span> : null}
                      {row.archived_at ? <span className="text-primary">Archived</span> : null}
                    </div>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Sheet
        open={Boolean(detail)}
        onOpenChange={(open) => {
          if (!open) {
            setDetail(null)
            setTimeline(null)
          }
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {detail ? (
            <>
              <SheetHeader>
                <p className="font-mono text-xs font-semibold text-primary">{detail.reference}</p>
                <SheetTitle className="font-heading text-2xl">
                  {detail.project_title || 'Untitled Dearune'}
                </SheetTitle>
                <SheetDescription>
                  Unit {detail.unit_index} · {detail.project_reference}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-5 space-y-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{MILESTONE_LABELS[milestoneOf(detail)] ?? milestoneOf(detail)}</Badge>
                  {detail.archived_at ? <Badge variant="outline">Archived</Badge> : null}
                  {detail.qr_openable ? <Badge className="bg-primary/10 text-primary">QR ready</Badge> : null}
                </div>

                {canEdit || canManage || canCreate ? (
                  <div className="rounded-2xl border border-border bg-muted/30 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Actions</p>
                    <div className="mt-3">
                      <MilestoneActions
                        row={detail}
                        permissions={permissions}
                        busy={busyId === detail.id}
                        onAdvance={advance}
                      />
                      {canViewDesigners && detail.designer_id && detail.project_id && (
                        <Button
                          size="sm"
                          variant="outline"
                          asChild
                          onClick={(e) => {
                            e.stopPropagation()
                          }}
                        >
                          <Link to={`/worker/designers/${detail.designer_id}`}>
                            <UserRound className="size-4" aria-hidden />
                            View Dearune
                          </Link>
                        </Button>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {canEdit ? (
                        <Button size="sm" variant="outline" onClick={() => openEdit(detail)}>
                          <Pencil className="size-4" aria-hidden />
                          Edit details
                        </Button>
                      ) : null}
                      {canManage ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === detail.id}
                          onClick={() => archive(detail, !detail.archived_at)}
                        >
                          {detail.archived_at ? (
                            <ArchiveRestore className="size-4" aria-hidden />
                          ) : (
                            <Archive className="size-4" aria-hidden />
                          )}
                          {detail.archived_at ? 'Restore' : 'Archive'}
                        </Button>
                      ) : null}
                      {canCreate || canManage ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === detail.id}
                          onClick={() => addUnit(detail)}
                        >
                          <Plus className="size-4" aria-hidden />
                          Open another unit
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <dl className="grid gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Designer</dt>
                    <dd className="mt-1 flex items-center justify-between gap-2">
                      <span>
                        {canViewDesigners && detail.designer_id ? (
                          <Link
                            to={`/worker/designers/${detail.designer_id}`}
                            className="underline decoration-primary/40 underline-offset-4 hover:text-primary"
                          >
                            {detail.designer_name || 'Unassigned'}
                          </Link>
                        ) : (
                          detail.designer_name || 'Unassigned'
                        )}{' '}
                        {detail.designer_code ? `· ${detail.designer_code}` : ''}
                      </span>
                      {canAssign ? (
                        <Button size="sm" variant="ghost" onClick={() => openAssign(detail)}>
                          <UserRound className="size-4" aria-hidden />
                          Assign
                        </Button>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Created</dt>
                    <dd className="mt-1">{when(detail.created_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Template</dt>
                    <dd className="mt-1">{detail.template_slug || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Wrapper</dt>
                    <dd className="mt-1">{detail.wrapper_name || detail.wrapper_type || '—'}</dd>
                  </div>
                </dl>

                <div className="rounded-2xl border border-border p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <Phone className="size-4 text-primary" aria-hidden />
                    Delivery
                  </h3>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Recipient</dt>
                      <dd className="text-right">{detail.recipient_name || '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Phone</dt>
                      <dd className="text-right">{detail.customer_phone || '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Address</dt>
                      <dd className="max-w-[60%] text-right">
                        {[detail.address_line1, detail.address_line2, detail.city, detail.state_province, detail.postal_code, detail.country]
                          .filter(Boolean)
                          .join(', ') || '—'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Tracking</dt>
                      <dd className="text-right">{detail.tracking_code || '—'}</dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-2xl border border-border p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <Boxes className="size-4 text-primary" aria-hidden />
                    Notes
                  </h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                    {detail.notes || 'No notes on this unit.'}
                  </p>
                </div>

                {canViewDetails ? (
                  <div className="rounded-2xl border border-border p-4">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      <History className="size-4 text-primary" aria-hidden />
                      Unit history
                    </h3>
                    {timeline === null ? (
                      <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                        Loading the timeline…
                      </p>
                    ) : timeline.length === 0 ? (
                      <p className="mt-2 text-xs text-muted-foreground">No history recorded yet.</p>
                    ) : (
                      <ol className="mt-3 space-y-2">
                        {timeline.map((event) => (
                          <li key={event.id} className="flex gap-3 text-xs">
                            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                            <div className="min-w-0">
                              <p className="font-mono text-[0.7rem] text-foreground">{event.action}</p>
                              <p className="mt-0.5 text-muted-foreground">
                                {event.actorType ? `${event.actorType} · ` : ''}
                                {formatDateTime(event.createdAt)}
                              </p>
                              {event.detail && Object.keys(event.detail).length > 0 ? (
                                <p className="mt-0.5 break-words text-[0.7rem] text-muted-foreground">
                                  {Object.entries(event.detail)
                                    .filter(([, value]) => value !== null && value !== undefined && value !== '')
                                    .map(([key, value]) =>
                                      `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`,
                                    )
                                    .join(' · ')}
                                </p>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                ) : null}

                <div className="grid gap-2 text-xs text-muted-foreground">
                  <p className="flex items-center gap-2"><Package className="size-3.5" aria-hidden /> {detail.public_id}</p>
                  <p className="flex items-center gap-2"><MapPin className="size-3.5" aria-hidden /> {detail.city || 'No city recorded'}</p>
                  <p className="flex items-center gap-2"><Truck className="size-3.5" aria-hidden /> {detail.provider || 'No courier recorded'}</p>
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit operational details</DialogTitle>
            <DialogDescription>
              Notes and the phone printed on the paper. Financial fields are not editable here.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="worker-notes">Unit notes</Label>
              <Textarea
                id="worker-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={4}
                maxLength={2000}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="worker-phone">Customer phone</Label>
              <Input
                id="worker-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                maxLength={30}
                inputMode="tel"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={Boolean(busyId)}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={Boolean(busyId)}>
              {busyId ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Save details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign designer</DialogTitle>
            <DialogDescription>Change the designer attached to this Dearune. This uses your designer access.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="worker-assign-designer">Designer</Label>
            <Select value={designerId} onValueChange={setDesignerId}>
              <SelectTrigger id="worker-assign-designer">
                <SelectValue placeholder="Select a designer" />
              </SelectTrigger>
              <SelectContent>
                {designers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name} · {d.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={Boolean(busyId)}>
              Cancel
            </Button>
            <Button onClick={saveAssign} disabled={Boolean(busyId) || !designerId}>
              {busyId ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
