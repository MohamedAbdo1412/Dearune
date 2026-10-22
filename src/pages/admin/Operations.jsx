import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  Loader2Icon,
  PackageSearch,
  PlayCircle,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Undo2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAppSettings } from '@/hooks/use-app-settings'
import {
  OPERATIONS_STATUS_LABELS,
  OPERATIONS_STATUS_ORDER,
  OPERATIONS_STATUS_SHORT,
  isOperationsTerminal,
  nextOperationsStatus,
} from '@/services/constants'
import {
  OPERATIONS_SORTS,
  archiveOperations,
  fetchOperationEvents,
  fetchOperations,
  restoreOperations,
  setOperationStatus,
  statusCounts,
  updateOperation,
  updateOperationContact,
  viewOperations,
} from '@/services/operations'
import { formatDateTime } from '@/services/format'
import { OperationsBadge } from '@/components/admin/operations-status'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

// Operations — the production line for the physical units themselves.
//
// One Dearune that was sold as three bottles is THREE records here, each with
// its own canonical id, its own place on the line and its own paper. Nothing
// on this screen can create an id, change one, or delete a unit: archiving is
// a visibility flag, and the database refuses any status move that is not on
// the workshop's own schedule.
const ALL = 'all'

const messageOf = (err) => (err instanceof Error ? err.message : 'Something went wrong')

// A status change the database turned down (someone else moved the unit, or
// the requested step is not next) is worth saying precisely, not as a generic
// failure.
const isConflict = (err) => err?.status === 409 && Boolean(err?.payload?.conflict)

export function Operations() {
  const { settings } = useAppSettings()
  const maintenance = Boolean(settings?.maintenance_mode)
  const navigate = useNavigate()

  const [rows, setRows] = useState(null)
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState('newest')
  const [statusFilter, setStatusFilter] = useState(ALL)
  const [showArchived, setShowArchived] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [actingId, setActingId] = useState(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [detail, setDetail] = useState(null)
  const [timeline, setTimeline] = useState(null)
  const [notesDraft, setNotesDraft] = useState('')
  const [phoneDraft, setPhoneDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [reasonFor, setReasonFor] = useState(null)
  const [reason, setReason] = useState('')

  const reload = useCallback(async () => {
    try {
      setRows(await fetchOperations({ includeArchived: true }))
    } catch (err) {
      toast.error(messageOf(err))
      setRows((prev) => prev ?? [])
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  // The default screen is the work in front of you: active units, newest
  // first. The archive is one switch away and is never mixed in by accident.
  const visible = useMemo(
    () =>
      viewOperations(rows ?? [], {
        sortKey,
        query,
        status: statusFilter === ALL ? '' : statusFilter,
        includeArchived: showArchived,
      }),
    [rows, sortKey, query, statusFilter, showArchived],
  )

  // Counts follow the same scope as the list: the archive is only counted when
  // it is on screen, so a figure never refers to rows the studio cannot see.
  const activeRows = useMemo(() => (rows ?? []).filter((row) => !row.archived), [rows])
  const scoped = useMemo(() => (showArchived ? rows ?? [] : activeRows), [rows, activeRows, showArchived])
  const counts = useMemo(() => statusCounts(scoped), [scoped])
  const activeCounts = useMemo(() => statusCounts(activeRows), [activeRows])
  const activeCount = activeRows.length
  const readyToPrint = activeCounts.ready_to_print

  const visibleIds = visible.map((row) => row.id)
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id))
  const selectedRows = useMemo(() => (rows ?? []).filter((row) => selected.has(row.id)), [rows, selected])

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) for (const id of visibleIds) next.delete(id)
      else for (const id of visibleIds) next.add(id)
      return next
    })
  }

  const afterWrite = async (fn, successMessage) => {
    try {
      await fn()
      if (successMessage) toast.success(successMessage)
      await reload()
      return true
    } catch (err) {
      // A unit that moved under us, or a step that is not the next one, is a
      // conflict rather than a failure — say so, then show the true state.
      toast.error(isConflict(err) ? 'Someone else moved that unit first — the list has been refreshed' : messageOf(err))
      await reload()
      return false
    }
  }

  const advance = async (row) => {
    const next = nextOperationsStatus(row.status)
    if (!next) return
    setActingId(row.id)
    await afterWrite(
      () => setOperationStatus(row.id, next),
      `${row.reference} moved to ${OPERATIONS_STATUS_LABELS[next]}`,
    )
    setActingId(null)
  }

  const bulk = async (fn, successMessage) => {
    if (selectedRows.length === 0 || bulkBusy) return
    setBulkBusy(true)
    await afterWrite(fn, successMessage)
    setBulkBusy(false)
  }

  const archiveSelected = () =>
    bulk(
      () => archiveOperations([...selected]),
      `Archived ${selectedRows.length} ${selectedRows.length === 1 ? 'unit' : 'units'}`,
    )

  const restoreSelected = () =>
    bulk(
      () => restoreOperations([...selected]),
      `Restored ${selectedRows.length} ${selectedRows.length === 1 ? 'unit' : 'units'}`,
    )

  const printable = selectedRows.filter((row) => !row.archived)

  const printSelection = () => {
    if (printable.length === 0) {
      toast.error('Select at least one active unit to print')
      return
    }
    navigate(`/admin/operations/print?ids=${printable.map((row) => row.id).join(',')}`)
  }

  const openDetail = async (row) => {
    setDetail(row)
    setNotesDraft(row.notes ?? '')
    setPhoneDraft(row.customerPhone ?? '')
    setTimeline(null)
    try {
      setTimeline(await fetchOperationEvents(row.id))
    } catch {
      setTimeline([])
    }
  }

  const saveDetail = async () => {
    if (!detail) return
    setSaving(true)
    const saved = await afterWrite(async () => {
      await updateOperation(detail.id, { notes: notesDraft })
      // The phone belongs to the Dearune's own delivery row, so it is saved
      // against its real owner rather than copied onto the unit.
      if ((phoneDraft ?? '') !== (detail.customerPhone ?? '')) {
        await updateOperationContact(detail.projectId, phoneDraft)
      }
      return null
    }, 'Saved')
    setSaving(false)
    if (saved) {
      setDetail((prev) => (prev ? { ...prev, notes: notesDraft, customerPhone: phoneDraft } : prev))
    }
  }

  const askReason = (row, status) => {
    setReasonFor({ row, status })
    setReason('')
  }

  const confirmReason = async () => {
    const target = reasonFor
    if (!target) return
    if (!reason.trim()) {
      toast.error(`A reason is required to ${target.status === 'cancelled' ? 'cancel' : 'hold'} a unit`)
      return
    }
    setReasonFor(null)
    setActingId(target.row.id)
    await afterWrite(
      () => setOperationStatus(target.row.id, target.status, reason.trim()),
      `${target.row.reference} — ${OPERATIONS_STATUS_LABELS[target.status]}`,
    )
    setActingId(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl">Operations</h1>
          <p className="text-sm text-muted-foreground">
            One record per physical unit — its canonical id, its place on the workshop line, its paper and its QR.
          </p>
        </div>
        <Button size="sm" onClick={printSelection} disabled={printable.length === 0 || bulkBusy}>
          <Printer className="size-4" />
          Print papers ({printable.length})
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Active units</p>
            <p className="text-xl font-semibold tabular-nums">{rows === null ? '—' : activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Waiting to print</p>
            <p className="text-xl font-semibold tabular-nums">{rows === null ? '—' : readyToPrint}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Archived</p>
            <p className="text-xl font-semibold tabular-nums">
              {rows === null ? '—' : rows.length - activeCount}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative w-full sm:min-w-56 sm:flex-1 lg:max-w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search id, Sold As, customer, designer…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={sortKey} onValueChange={setSortKey}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              {OPERATIONS_SORTS.map((sort) => (
                <SelectItem key={sort.key} value={sort.key}>
                  {sort.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {OPERATIONS_STATUS_ORDER.map((status) => (
                <SelectItem key={status} value={status}>
                  {OPERATIONS_STATUS_LABELS[status]}
                  {rows !== null ? ` (${counts[status] ?? 0})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={showArchived} onCheckedChange={setShowArchived} />
            Show archived
          </label>
          <Button variant="ghost" size="icon" onClick={() => void reload()} title="Refresh">
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>

      {selectedRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2.5">
          <span className="text-sm text-muted-foreground">
            {selectedRows.length} selected
          </span>
          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
            {showArchived && selectedRows.some((row) => row.archived) && (
              <Button size="sm" variant="outline" disabled={bulkBusy || maintenance} onClick={() => void restoreSelected()}>
                {bulkBusy ? <Loader2Icon className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
                Unarchive
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={bulkBusy || maintenance} onClick={() => void archiveSelected()}>
              {bulkBusy ? <Loader2Icon className="size-4 animate-spin" /> : <Archive className="size-4" />}
              Archive selected
            </Button>
            <Button size="sm" onClick={printSelection}>
              <Printer className="size-4" />
              Print papers
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {rows === null
              ? 'Loading…'
              : `${visible.length} ${visible.length === 1 ? 'unit' : 'units'}${
                  showArchived ? ' (archive shown)' : ' on the line'
                }`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows === null ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 w-full rounded-lg border bg-muted/40" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <PackageSearch className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {query || statusFilter !== ALL || showArchived
                  ? 'Nothing matches the current filters.'
                  : 'No units on the line yet. Units are created the moment a physical Dearune is paid for.'}
              </p>
            </div>
          ) : (
            <>
              {/* On a phone the table would need a sideways scroll to be read,
                  so the same rows are laid out as cards instead. */}
              <div className="space-y-2 md:hidden">
                <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
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
                {visible.map((row) => {
                  const next = nextOperationsStatus(row.status)
                  return (
                    <div key={row.id} className="rounded-lg border bg-background p-3">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selected.has(row.id)}
                          onCheckedChange={() => toggle(row.id)}
                          aria-label={`Select ${row.reference}`}
                          className="mt-1"
                        />
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => void openDetail(row)}
                            className="block w-full text-left"
                            aria-label={`Open ${row.reference}`}
                          >
                            <span className="block break-all font-mono text-sm">{row.reference}</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {row.soldAs}
                              {' · '}unit {row.unitIndex}
                              {row.archived ? ' · archived' : ''}
                            </span>
                          </button>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {next && !row.archived && !isOperationsTerminal(row.status) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={actingId === row.id || maintenance}
                              onClick={() => void advance(row)}
                              title={`Move to ${OPERATIONS_STATUS_LABELS[next]}`}
                            >
                              {actingId === row.id ? (
                                <Loader2Icon className="size-4 animate-spin" />
                              ) : (
                                <PlayCircle className="size-4" />
                              )}
                              <span className="sr-only">{`Move to ${OPERATIONS_STATUS_LABELS[next]}`}</span>
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Open unit"
                            onClick={() => void openDetail(row)}
                          >
                            <ChevronRight className="size-4" />
                            <span className="sr-only">Open unit</span>
                          </Button>
                        </div>
                      </div>

                      <div className="mt-2 space-y-1.5 border-t pt-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <OperationsBadge status={row.status} label={OPERATIONS_STATUS_SHORT[row.status] ?? row.status} />
                          <span className="text-xs text-muted-foreground">updated {formatDateTime(row.updatedAt)}</span>
                        </div>
                        {row.status === 'on_hold' && row.onHoldReason && (
                          <p className="text-xs text-muted-foreground">{row.onHoldReason}</p>
                        )}
                        <p className="min-w-0 break-words text-sm">
                          <span className="text-muted-foreground">Customer · </span>
                          {row.recipientName || '—'}
                          <span className="block text-xs text-muted-foreground">
                            {row.customerPhone || 'no number on file'}
                          </span>
                        </p>
                        <p className="min-w-0 break-words text-sm">
                          <span className="text-muted-foreground">Designer · </span>
                          {row.designerName || '—'}
                          <span className="block text-xs text-muted-foreground">{row.designerCode}</span>
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={toggleAll}
                          aria-label="Select every visible unit"
                        />
                      </TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="hidden md:table-cell">Customer</TableHead>
                      <TableHead className="hidden lg:table-cell">Designer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden sm:table-cell">Updated</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((row) => {
                      const next = nextOperationsStatus(row.status)
                      return (
                        <TableRow key={row.id} data-state={selected.has(row.id) ? 'selected' : undefined}>
                          <TableCell>
                            <Checkbox
                              checked={selected.has(row.id)}
                              onCheckedChange={() => toggle(row.id)}
                              aria-label={`Select ${row.reference}`}
                            />
                          </TableCell>
                          <TableCell>
                            <button
                              type="button"
                              onClick={() => void openDetail(row)}
                              className="text-left"
                              aria-label={`Open ${row.reference}`}
                            >
                              <span className="block font-mono text-sm">{row.reference}</span>
                              <span className="block text-xs text-muted-foreground">
                                {row.soldAs}
                                {' · '}unit {row.unitIndex}
                                {row.archived ? ' · archived' : ''}
                              </span>
                            </button>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <span className="block truncate text-sm">{row.recipientName || '—'}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {row.customerPhone || 'no number on file'}
                            </span>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <span className="block truncate text-sm">{row.designerName || '—'}</span>
                            <span className="block truncate text-xs text-muted-foreground">{row.designerCode}</span>
                          </TableCell>
                          <TableCell>
                            <OperationsBadge status={row.status} label={OPERATIONS_STATUS_SHORT[row.status] ?? row.status} />
                            {row.status === 'on_hold' && row.onHoldReason && (
                              <span className="mt-1 block max-w-56 truncate text-xs text-muted-foreground">
                                {row.onHoldReason}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="hidden text-xs tabular-nums text-muted-foreground sm:table-cell">
                            {formatDateTime(row.updatedAt)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              {next && !row.archived && !isOperationsTerminal(row.status) && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={actingId === row.id || maintenance}
                                  onClick={() => void advance(row)}
                                  title={`Move to ${OPERATIONS_STATUS_LABELS[next]}`}
                                >
                                  {actingId === row.id ? (
                                    <Loader2Icon className="size-4 animate-spin" />
                                  ) : (
                                    <PlayCircle className="size-4" />
                                  )}
                                  <span className="sr-only">{`Move to ${OPERATIONS_STATUS_LABELS[next]}`}</span>
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Open unit"
                                onClick={() => void openDetail(row)}
                              >
                                <ChevronRight className="size-4" />
                                <span className="sr-only">Open unit</span>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Archiving only hides a unit from this list — it never deletes it, never mints a new id, and never happens
        on its own when you export. {activeCount > 0 ? `${activeCount} units on the line.` : ''}
      </p>

      {/* ---- one unit, up close ------------------------------------------- */}
      <Sheet open={detail !== null} onOpenChange={(open) => { if (!open) setDetail(null) }}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="font-mono">{detail?.reference}</SheetTitle>
            <SheetDescription>
              Sold as <span className="font-mono">{detail?.soldAs}</span>
              {' · '}unit {detail?.unitIndex}
              {' · '}Dearune{' '}
              <Link className="underline" to={`/admin/designers/${detail?.designerId}/messages/${detail?.projectId}`}>
                {detail?.projectTitle || 'open'}
              </Link>
            </SheetDescription>
          </SheetHeader>

          {detail && (
            <div className="mt-4 space-y-5 px-4 pb-6">
              <div className="flex flex-wrap items-center gap-2">
                <OperationsBadge status={detail.status} label={OPERATIONS_STATUS_LABELS[detail.status] ?? detail.status} />
                {detail.archived && <span className="text-xs text-muted-foreground">Archived</span>}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="unit-notes">Notes</Label>
                  <Textarea
                    id="unit-notes"
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    placeholder="Anything the workshop should know"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="unit-phone">Customer number</Label>
                  <Input
                    id="unit-phone"
                    value={phoneDraft}
                    onChange={(e) => setPhoneDraft(e.target.value)}
                    placeholder="01xxxxxxxxx"
                    className="mt-1"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Saved on the Dearune's own delivery row, so the paper and the manifest always agree.
                  </p>
                </div>
              </div>

              <Button size="sm" onClick={() => void saveDetail()} disabled={saving}>
                {saving ? <Loader2Icon className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                Save changes
              </Button>

              <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                The canonical id <span className="font-mono">{detail.reference}</span> is read-only. It is minted by
                the database, never regenerated and never reused.
              </div>

              {detail.status === 'on_hold' && detail.onHoldReason && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">On Hold reason</p>
                  <p className="text-sm">{detail.onHoldReason}</p>
                </div>
              )}
              {detail.status === 'cancelled' && detail.cancelledReason && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Cancellation reason</p>
                  <p className="text-sm">{detail.cancelledReason}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {nextOperationsStatus(detail.status) && !detail.archived && (
                  <Button
                    size="sm"
                    disabled={actingId === detail.id || maintenance}
                    onClick={() => void advance(detail).then(() => setDetail(null))}
                  >
                    <PlayCircle className="size-4" />
                    Move to {OPERATIONS_STATUS_LABELS[nextOperationsStatus(detail.status)]}
                  </Button>
                )}
                {!isOperationsTerminal(detail.status) && !detail.archived && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actingId === detail.id || maintenance}
                      onClick={() => askReason(detail, 'on_hold')}
                    >
                      Put on hold
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actingId === detail.id || maintenance}
                      onClick={() => askReason(detail, 'cancelled')}
                    >
                      <X className="size-4" />
                      Cancel unit
                    </Button>
                  </>
                )}
                {detail.archived ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={bulkBusy || maintenance}
                    onClick={() => void afterWrite(() => restoreOperations([detail.id]), 'Restored — same id, no new record')}
                  >
                    <ArchiveRestore className="size-4" />
                    Unarchive
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={bulkBusy || maintenance}
                    onClick={() => void afterWrite(() => archiveOperations([detail.id]), 'Archived')}
                  >
                    <Archive className="size-4" />
                    Archive
                  </Button>
                )}
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">History</p>
                <ul className="mt-2 space-y-1.5">
                  {(timeline ?? []).map((event) => (
                    <li key={event.id} className="text-xs text-muted-foreground">
                      <span className="font-mono">{event.action}</span>
                      {' · '}
                      {formatDateTime(event.created_at)}
                    </li>
                  ))}
                  {timeline && timeline.length === 0 && <li className="text-xs text-muted-foreground">No history yet.</li>}
                  {timeline === null && <li className="text-xs text-muted-foreground">Loading…</li>}
                </ul>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ---- holding or cancelling always needs a reason -------------------- */}
      <Dialog open={reasonFor !== null} onOpenChange={(open) => { if (!open) setReasonFor(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">
              {reasonFor?.status === 'cancelled' ? 'Cancel this unit' : 'Put this unit on hold'}
            </DialogTitle>
            <DialogDescription>
              {reasonFor?.reference} — this stops the unit on the line. Give the workshop a reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="unit-reason">Reason</Label>
            <Textarea
              id="unit-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                reasonFor?.status === 'cancelled'
                  ? 'Why is this unit being cancelled?'
                  : 'Why is this unit being held?'
              }
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void confirmReason() }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReasonFor(null)}>Keep as is</Button>
            <Button onClick={() => void confirmReason()} disabled={!reason.trim()}>
              {reasonFor?.status === 'cancelled' ? 'Cancel unit' : 'Put on hold'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
