import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  Boxes,
  Factory,
  Loader2,
  MapPin,
  Package,
  PauseCircle,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Truck,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { OperationsBadge } from '@/components/admin/operations-status'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { hasPermission } from '@/lib/permissions'
import { formatDateTime } from '@/services/format'
import {
  OPERATIONS_STATUS_LABELS,
  OPERATIONS_STATUS_ORDER,
  OPERATIONS_STATUS_SHORT,
  nextOperationsStatus,
} from '@/services/constants'
import {
  archiveWorkerOperations,
  ensureWorkerOperations,
  fetchWorkerOperations,
  setWorkerOperationStatus,
  updateWorkerOperation,
  updateWorkerOperationContact,
} from '@/services/workerOperations'

const ALL = 'all'

function messageOf(error) {
  return error instanceof Error ? error.message : 'Something went wrong'
}

function when(value) {
  return value ? formatDateTime(value) : '—'
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

function StatusActions({ row, permissions, busy, onAdvance, onAction, onResume }) {
  const [resume, setResume] = useState('information_verified')
  const canUpdate = hasPermission(permissions, 'operations.update_status')
  const next = nextOperationsStatus(row.status)
  if (!canUpdate) return null
  if (row.archived_at) return <p className="text-xs text-muted-foreground">Restore this unit before changing its status.</p>
  if (row.status === 'delivered' || row.status === 'cancelled') return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      {row.status === 'on_hold' ? (
        <>
          <Select value={resume} onValueChange={setResume}>
            <SelectTrigger className="h-9 w-[13rem]">
              <SelectValue placeholder="Resume at…" />
            </SelectTrigger>
            <SelectContent>
              {OPERATIONS_STATUS_ORDER.filter((status) => !['on_hold', 'cancelled'].includes(status)).map((status) => (
                <SelectItem key={status} value={status}>
                  {OPERATIONS_STATUS_SHORT[status] ?? status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" disabled={busy} onClick={() => onResume(row, resume)}>
            <RotateCcw className="size-4" aria-hidden />
            Resume
          </Button>
        </>
      ) : next ? (
        <Button size="sm" disabled={busy} onClick={() => onAdvance(row, next)}>
          <ArrowRight className="size-4" aria-hidden />
          Advance to {OPERATIONS_STATUS_SHORT[next] ?? next}
        </Button>
      ) : null}
      <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction(row, 'on_hold')}>
        <PauseCircle className="size-4" aria-hidden />
        Hold
      </Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction(row, 'cancelled')}>
        <XCircle className="size-4" aria-hidden />
        Cancel
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

  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState(ALL)
  const [showArchived, setShowArchived] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [detail, setDetail] = useState(null)
  const [statusDialog, setStatusDialog] = useState(null)
  const [reason, setReason] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [phone, setPhone] = useState('')
  const [holdReason, setHoldReason] = useState('')
  const [cancelReason, setCancelReason] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const data = await fetchWorkerOperations(true)
      setRows(data)
      setDetail((current) => (current ? data.find((row) => row.id === current.id) ?? null : null))
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
    for (const row of scoped) next[row.status] = (next[row.status] ?? 0) + 1
    return next
  }, [scoped])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return scoped
      .filter((row) => statusFilter === ALL || row.status === statusFilter)
      .filter((row) => {
        if (!needle) return true
        return [
          row.reference,
          row.project_reference,
          row.project_title,
          row.designer_name,
          row.recipient_name,
          row.city,
          row.tracking_code,
          row.customer_phone,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle))
      })
      .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
  }, [scoped, query, statusFilter])

  const projectUnits = useMemo(() => {
    const map = new Map()
    for (const row of rows ?? []) {
      map.set(row.project_id, (map.get(row.project_id) ?? 0) + 1)
    }
    return map
  }, [rows])

  const refresh = async () => {
    await load()
  }

  const advance = async (row, status) => {
    setBusyId(row.id)
    try {
      await setWorkerOperationStatus(row.id, status)
      toast.success(`Moved to ${OPERATIONS_STATUS_LABELS[status] ?? status}`)
      await load()
    } catch (caught) {
      toast.error(messageOf(caught))
    } finally {
      setBusyId('')
    }
  }

  const openAction = (row, status) => {
    setStatusDialog({ row, status })
    setReason('')
  }

  const confirmAction = async () => {
    if (!statusDialog) return
    const { row, status } = statusDialog
    if (!reason.trim()) {
      toast.error('Please say why this unit is being held or cancelled')
      return
    }
    setBusyId(row.id)
    try {
      await setWorkerOperationStatus(row.id, status, reason.trim())
      toast.success(status === 'on_hold' ? 'Unit placed on hold' : 'Unit cancelled')
      setStatusDialog(null)
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
    setHoldReason(row.on_hold_reason ?? '')
    setCancelReason(row.cancelled_reason ?? '')
    setEditOpen(true)
  }

  const saveEdit = async () => {
    if (!detail) return
    setBusyId(detail.id)
    try {
      await updateWorkerOperation(detail.id, {
        notes,
        onHoldReason: holdReason,
        cancelledReason: cancelReason,
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

  const addUnit = async (row) => {
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
        <Button variant="outline" onClick={refresh}>
          <RefreshCw className="size-4" aria-hidden />
          Refresh
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'In the workshop', value: scoped.filter((row) => !['delivered', 'cancelled', 'on_hold'].includes(row.status)).length },
          { label: 'On hold', value: counts.on_hold ?? 0 },
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
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[13rem]" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses ({counts[ALL] ?? 0})</SelectItem>
              {OPERATIONS_STATUS_ORDER.map((status) => (
                <SelectItem key={status} value={status}>
                  {OPERATIONS_STATUS_LABELS[status]} ({counts[status] ?? 0})
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
            {showArchived ? 'Hiding nothing' : 'Show archive'}
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={query || statusFilter !== ALL ? 'No units match this view' : 'No production units yet'}
          message={
            query || statusFilter !== ALL
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
                      <OperationsBadge status={row.status} label={OPERATIONS_STATUS_LABELS[row.status]} />
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-muted-foreground">
                      <p>{row.recipient_name || 'No recipient name'}</p>
                      <p className="mt-0.5">{row.city || 'No city'} {row.tracking_code ? `· ${row.tracking_code}` : ''}</p>
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      <Button size="sm" variant="outline" onClick={() => setDetail(row)}>
                        Open
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:hidden">
            {visible.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setDetail(row)}
                className="rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs font-semibold">{row.reference}</p>
                    <p className="mt-1 truncate font-medium">{row.project_title || 'Untitled Dearune'}</p>
                  </div>
                  <OperationsBadge status={row.status} label={OPERATIONS_STATUS_SHORT[row.status]} />
                </div>
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>Unit {row.unit_index}</span>
                  <span>{row.designer_name || 'Unassigned'}</span>
                  {row.city ? <span>{row.city}</span> : null}
                  {row.archived_at ? <span className="text-primary">Archived</span> : null}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <Sheet open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
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
                  <OperationsBadge status={detail.status} label={OPERATIONS_STATUS_LABELS[detail.status]} />
                  {detail.archived_at ? <Badge variant="outline">Archived</Badge> : null}
                  {detail.paid_at ? <Badge variant="outline">Sold</Badge> : null}
                  {detail.qr_ready ? <Badge className="bg-primary/10 text-primary">QR ready</Badge> : null}
                </div>

                {canEdit || canManage || canCreate ? (
                  <div className="rounded-2xl border border-border bg-muted/30 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Actions</p>
                    <div className="mt-3">
                      <StatusActions
                        row={detail}
                        permissions={permissions}
                        busy={busyId === detail.id}
                        onAdvance={advance}
                        onAction={openAction}
                        onResume={(row, status) => advance(row, status)}
                      />
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
                    <dd className="mt-1">{detail.designer_name || 'Unassigned'} {detail.designer_code ? `· ${detail.designer_code}` : ''}</dd>
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
                    <dd className="mt-1">{detail.wrapper_type || '—'}</dd>
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
                  {detail.on_hold_reason ? (
                    <p className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                      On hold: {detail.on_hold_reason}
                    </p>
                  ) : null}
                  {detail.cancelled_reason ? (
                    <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      Cancelled: {detail.cancelled_reason}
                    </p>
                  ) : null}
                </div>

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
            {detail?.status === 'on_hold' ? (
              <div className="space-y-2">
                <Label htmlFor="worker-hold-reason">Hold reason</Label>
                <Textarea
                  id="worker-hold-reason"
                  value={holdReason}
                  onChange={(event) => setHoldReason(event.target.value)}
                  rows={2}
                  maxLength={300}
                />
              </div>
            ) : null}
            {detail?.status === 'cancelled' ? (
              <div className="space-y-2">
                <Label htmlFor="worker-cancel-reason">Cancellation reason</Label>
                <Textarea
                  id="worker-cancel-reason"
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                  rows={2}
                  maxLength={300}
                />
              </div>
            ) : null}
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

      <Dialog open={Boolean(statusDialog)} onOpenChange={(open) => !open && setStatusDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {statusDialog?.status === 'on_hold' ? 'Place this unit on hold' : 'Cancel this unit'}
            </DialogTitle>
            <DialogDescription>
              The reason is recorded in the unit timeline and the studio audit log. It is not sent
              to the customer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="worker-status-reason">Reason</Label>
            <Textarea
              id="worker-status-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={300}
              placeholder={statusDialog?.status === 'on_hold' ? 'Waiting for the customer to confirm the address…' : 'The customer cancelled this order…'}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialog(null)} disabled={Boolean(busyId)}>
              Keep as is
            </Button>
            <Button
              variant={statusDialog?.status === 'cancelled' ? 'destructive' : 'default'}
              onClick={confirmAction}
              disabled={Boolean(busyId)}
            >
              {busyId ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {statusDialog?.status === 'on_hold' ? 'Place on hold' : 'Cancel unit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
