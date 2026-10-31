import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Loader2Icon,
  PackageSearch,
  Printer,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAppSettings } from '@/hooks/use-app-settings'
import {
  EMPTY_FILTERS,
  completeMaking,
  deliverOrder,
  fetchDesignerOptions,
  fetchMilestoneCounts,
  fetchOrders,
  fetchUnitIdsForProjects,
  fetchUnopenedCount,
  moveToAfterSale,
  runBulkTransition,
  sectionByKey,
  summarizeBulkResults,
} from '@/services/ops-orders'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { OperationsSectionNav } from '@/components/operations/OperationsSectionNav'
import { OperationsFilterBar } from '@/components/operations/OperationsFilterBar'
import { OrderTable } from '@/components/operations/OrderTable'
import { OrderDetailSheet } from '@/components/operations/OrderDetailSheet'
import { RefundDialog } from '@/components/operations/RefundDialog'
import { ManifestImportDialog } from '@/components/operations/ManifestImportDialog'

const messageOf = (err) => (err instanceof Error ? err.message : 'Something went wrong')

const PAGE_SIZE = 25

// Operations — ONE Dearune, ONE milestone, four subsections.
//
// Every row is the same `projects` record. Making, Shipping, Delivery and
// After-Sale are four questions asked of it, not four copies of it, so an order
// can never be in two places and moving it moves one column instead of
// duplicating a row. The database is the authority on every transition; this
// screen only asks for the next legal step and shows what came back.

export function Operations({ section = 'making' }) {
  const definition = sectionByKey(section)
  const navigate = useNavigate()
  const { settings } = useAppSettings()
  const maintenance = Boolean(settings?.maintenance_mode)

  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [sortKey, setSortKey] = useState('newest')
  const [page, setPage] = useState(0)

  const [rows, setRows] = useState(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)

  const [counts, setCounts] = useState(null)
  const [unopenedCount, setUnopenedCount] = useState(0)
  const [designers, setDesigners] = useState([])
  const [selected, setSelected] = useState(() => new Set())
  const [busyId, setBusyId] = useState(null)
  const [bulkAction, setBulkAction] = useState(null)
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const [bulkResults, setBulkResults] = useState(null)

  const [detail, setDetail] = useState(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [refundFor, setRefundFor] = useState(null)
  const [deliverTarget, setDeliverTarget] = useState(null)
  const [manifestOpen, setManifestOpen] = useState(false)

  const refresh = useCallback(() => setRefreshToken((value) => value + 1), [])

  // Typing is instant; the query it becomes is debounced, so a section with
  // thousands of orders is not queried once per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(filters.query), 300)
    return () => clearTimeout(timer)
  }, [filters.query])

  const effectiveFilters = useMemo(
    () => ({ ...filters, query: debouncedQuery }),
    [filters, debouncedQuery],
  )

  useEffect(() => {
    setPage(0)
    setSelected(new Set())
    setDetail(null)
    setDetailOpen(false)
  }, [section])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    fetchOrders({ section, filters: effectiveFilters, sortKey, page, pageSize: PAGE_SIZE })
      .then((result) => {
        if (!active) return
        setRows(result.rows)
        setTotal(result.total)
        setLoading(false)
      })
      .catch((err) => {
        if (!active) return
        setError(messageOf(err))
        setRows([])
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [section, effectiveFilters, sortKey, page, refreshToken])

  useEffect(() => {
    let active = true
    fetchMilestoneCounts()
      .then((next) => active && setCounts(next))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [refreshToken])

  useEffect(() => {
    let active = true
    fetchDesignerOptions()
      .then((next) => active && setDesigners(next))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    fetchUnopenedCount()
      .then((count) => active && setUnopenedCount(count))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [refreshToken])

  const onFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(0)
  }

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS)
    setPage(0)
  }

  const onSortChange = (next) => {
    setSortKey(next)
    setPage(0)
  }

  const toggle = (projectId) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }

  const visibleIds = (rows ?? []).map((row) => row.project_id)
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id))
  const selectedRows = (rows ?? []).filter((row) => selected.has(row.project_id))

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) for (const id of visibleIds) next.delete(id)
      else for (const id of visibleIds) next.add(id)
      return next
    })
  }

  const openOrder = (order) => {
    setDetail(order)
    setDetailOpen(true)
  }

  const runOn = async (order, fn, message) => {
    setBusyId(order.project_id)
    try {
      await fn()
      toast.success(message)
      refresh()
    } catch (err) {
      toast.error(messageOf(err))
      refresh()
    } finally {
      setBusyId(null)
    }
  }

  const onAction = (key, order) => {
    if (key === 'deliver') {
      setDeliverTarget(order)
      return
    }
    if (key === 'making-complete') {
      void runOn(order, () => completeMaking(order.project_id, 'Making complete'), 'Moved to Shipping')
      return
    }
    if (key === 'after-sale') {
      void runOn(order, () => moveToAfterSale(order.project_id, 'Delivered order moved to After-Sale'), 'Moved to After-Sale')
    }
  }

  // Bulk actions — each section gets the actions appropriate to its stage.
  const bulkActionConfig = {
    making: [
      { key: 'making-complete', label: 'Mark made', transition: 'making-complete', reason: 'Bulk making complete' },
    ],
    shipping: [
      { key: 'export-egypt-post', label: 'Export Egypt Post manifest', transition: 'manifest-export', carrier: 'egypt_post' },
      { key: 'export-bosta', label: 'Export Bosta upload', transition: 'manifest-export', carrier: 'bosta' },
      { key: 'ship', label: 'Mark shipped', transition: 'ship', requireTracking: true },
    ],
    delivery: [
      { key: 'deliver', label: 'Mark delivered', transition: 'deliver', reason: 'Bulk delivered' },
    ],
    'after-sale': [
      { key: 'refund', label: 'Record refunds…', transition: 'record-refund-bulk' },
    ],
    unopened: [],
  }

  const startBulkAction = (action) => {
    if (selectedRows.length === 0) return
    setBulkAction(action)
    setBulkConfirm(true)
  }

  const executeBulkAction = async () => {
    if (!bulkAction || selectedRows.length === 0) return
    setBulkConfirm(false)
    setBulkResults(null)

    const projectIds = selectedRows.map((order) => order.project_id)

    try {
      let result
      if (bulkAction.transition === 'manifest-export') {
        // Manifest export uses a different flow — open the export dialog
        // For now, we'll handle this in the dialog component
        toast.info('Opening manifest export…')
        setBulkAction(null)
        return
      }
      if (bulkAction.transition === 'record-refund-bulk') {
        // Refund bulk opens a dialog for per-order amounts
        toast.info('Opening bulk refund dialog…')
        setBulkAction(null)
        return
      }
      if (bulkAction.transition === 'ship') {
        // Shipping requires carrier and tracking per order — validate first
        const missingTracking = selectedRows.filter((order) => !order.tracking_code && !order.carrier_reference)
        if (missingTracking.length > 0) {
          toast.error(`${missingTracking.length} order(s) missing tracking number`)
          setBulkResults({
            summary: `${selectedRows.length - missingTracking.length} ready, ${missingTracking.length} missing tracking`,
            failed: missingTracking.map((order) => ({ project_id: order.project_id, error: 'Missing tracking' })),
          })
          return
        }
        // Group by carrier for the bulk call
        const byCarrier = selectedRows.reduce((acc, order) => {
          const carrier = order.carrier || 'bosta'
          if (!acc[carrier]) acc[carrier] = []
          acc[carrier].push({ projectId: order.project_id, tracking: order.tracking_code || order.carrier_reference })
          return acc
        }, {})
        const allResults = []
        for (const [carrier, orders] of Object.entries(byCarrier)) {
          result = await runBulkTransition(orders.map((o) => o.projectId), 'ship', { carrier, tracking: orders.map((o) => o.tracking) })
          allResults.push(...(result.results ?? []))
        }
        setBulkResults(summarizeBulkResults(allResults))
      } else {
        result = await runBulkTransition(projectIds, bulkAction.transition, { reason: bulkAction.reason })
        setBulkResults(summarizeBulkResults(result.results ?? []))
      }
      if (result?.results) {
        toast.success(result.results.filter((r) => r.ok).length > 0 ? 'Bulk action completed' : 'Bulk action completed with errors')
      }
      refresh()
      setSelected(new Set())
    } catch (err) {
      toast.error(messageOf(err))
    } finally {
      setBulkAction(null)
    }
  }

  const clearBulkResults = () => {
    setBulkResults(null)
  }

  const printOrders = async (orders) => {
    const active = (orders ?? []).filter((order) => !order.archived_at)
    if (active.length === 0) {
      toast.error('Select at least one active order to print')
      return
    }
    try {
      const units = await fetchUnitIdsForProjects(active.map((order) => order.project_id))
      if (units.length === 0) {
        toast.error('Those orders have no printable unit yet')
        return
      }
      navigate(`/admin/operations/print?ids=${units.map((unit) => unit.id).join(',')}`)
    } catch (err) {
      toast.error(messageOf(err))
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1
  const to = Math.min(total, page * PAGE_SIZE + (rows?.length ?? 0))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl">Operations</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{definition.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {section === 'shipping' ? (
            <Button size="sm" variant="outline" onClick={() => setManifestOpen(true)} disabled={maintenance}>
              <FileSpreadsheet className="size-4" />
              Import manifest
            </Button>
          ) : null}
          {section === 'making' ? (
            <Button size="sm" onClick={() => void printOrders(selectedRows)} disabled={selectedRows.length === 0}>
              <Printer className="size-4" />
              Print papers ({selectedRows.length})
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={refresh} title="Refresh">
            <RefreshCw className="size-4" />
            <span className="sr-only">Refresh</span>
          </Button>
        </div>
      </div>

      <OperationsSectionNav activeKey={section} counts={counts} unopenedCount={unopenedCount} />

      <OperationsFilterBar
        section={section}
        filters={filters}
        onFilterChange={onFilterChange}
        onClear={clearFilters}
        sortKey={sortKey}
        onSortChange={onSortChange}
        designers={designers}
        total={rows === null ? undefined : total}
      />

      {selectedRows.length > 0 ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2.5">
            <span className="text-sm text-muted-foreground">{selectedRows.length} selected</span>
            <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
              {section === 'making' ? (
                <Button size="sm" onClick={() => void printOrders(selectedRows)}>
                  <Printer className="size-4" />
                  Print papers
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Clear selection
              </Button>
            </div>
          </div>
          {bulkActionConfig[section]?.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-primary/5 px-3 py-2.5">
              <span className="text-sm font-medium text-primary">Bulk actions:</span>
              {bulkActionConfig[section].map((action) => (
                <Button
                  key={action.key}
                  size="sm"
                  variant="outline"
                  onClick={() => startBulkAction(action)}
                  disabled={maintenance}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <Card>
        <CardContent className="py-4">
          {error ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <AlertTriangle className="size-6 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
              <Button size="sm" variant="outline" onClick={refresh}>
                Try again
              </Button>
            </div>
          ) : rows === null ? (
            <div className="space-y-2" aria-busy="true" aria-live="polite">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-12 w-full rounded-lg border bg-muted/40" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <PackageSearch className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {Object.values(filters).some((value) => String(value ?? '').trim() !== '')
                  ? 'Nothing matches the current filters.'
                  : section === 'making'
                    ? 'No orders are in Making. A paid physical Dearune enters the workshop when its Operations record is opened.'
                    : section === 'shipping'
                      ? 'Nothing is waiting for a carrier. Finishing Making moves an order here.'
                      : section === 'delivery'
                        ? 'No parcels are with a carrier right now.'
                        : 'No orders have been moved to After-Sale yet.'}
              </p>
              {Object.values(filters).some((value) => String(value ?? '').trim() !== '') ? (
                <Button size="sm" variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : null}
            </div>
          ) : (
            <OrderTable
              section={section}
              rows={rows}
              selected={selected}
              allSelected={allSelected}
              onSelectAll={toggleAll}
              onToggle={toggle}
              onOpen={openOrder}
              onAction={onAction}
              busyId={busyId}
              onPrint={(order) => void printOrders([order])}
            />
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {rows === null || rows.length === 0
            ? total > 0
              ? `${total} orders match`
              : 'No orders'
            : `Showing ${from}–${to} of ${total}`}
          {' · '}Every transition records the operator and the time; the database refuses any move that skips a stage.
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((value) => Math.max(0, value - 1))}
            disabled={page === 0 || loading}
          >
            <ChevronLeft className="size-4" />
            Previous
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground">
            Page {page + 1} of {pageCount}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((value) => value + 1)}
            disabled={page + 1 >= pageCount || loading}
          >
            Next
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <OrderDetailSheet
        order={detail}
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open)
          if (!open) setDetail(null)
        }}
        onChanged={refresh}
        onRefund={(order) => setRefundFor(order)}
        onPrint={(order) => void printOrders([order])}
        maintenance={maintenance}
      />

      <RefundDialog
        order={refundFor}
        open={refundFor !== null}
        onOpenChange={(open) => {
          if (!open) setRefundFor(null)
        }}
        onRecorded={refresh}
      />

      <ManifestImportDialog
        open={manifestOpen}
        onOpenChange={setManifestOpen}
        onImported={refresh}
      />

      <AlertDialog
        open={deliverTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeliverTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deliverTarget ? `Mark ${deliverTarget.canonical_id} as delivered?` : 'Mark this order delivered?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This records the arrival time and your name, and changes the order&apos;s colour from the saved state. The
              order stays in Delivery — nothing is archived.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(busyId)}>Back</AlertDialogCancel>
            <AlertDialogAction
              disabled={Boolean(busyId)}
              onClick={(event) => {
                event.preventDefault()
                const order = deliverTarget
                setDeliverTarget(null)
                if (order) {
                  void runOn(order, () => deliverOrder(order.project_id, { reason: 'Delivered to recipient' }), 'Marked delivered')
                }
              }}
            >
              {busyId ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Confirm delivered
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {bulkConfirm && bulkAction && (
        <AlertDialog
          open={bulkConfirm}
          onOpenChange={(open) => {
            if (!open) setBulkConfirm(false)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm bulk action: {bulkAction.label}</AlertDialogTitle>
              <AlertDialogDescription>
                This will apply <strong>{bulkAction.label}</strong> to <strong>{selectedRows.length}</strong> selected order(s).
                Each order is processed individually — you will see per-order success or failure with reasons.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setBulkConfirm(false)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void executeBulkAction()}>
                Confirm {bulkAction.label}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {bulkResults && (
        <AlertDialog open={true} onOpenChange={clearBulkResults}>
          <AlertDialogContent className="max-w-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Bulk action result</AlertDialogTitle>
              <AlertDialogDescription>{bulkResults.summary}</AlertDialogDescription>
            </AlertDialogHeader>
            {bulkResults.failures.length > 0 && (
              <div className="mt-4 max-h-60 overflow-auto space-y-2">
                {bulkResults.failures.map((failure, index) => (
                  <div key={index} className="rounded-md border bg-destructive/10 p-3 text-sm">
                    <p className="font-medium">{failure.project_id}</p>
                    <p className="text-destructive">{failure.error ?? failure.message}</p>
                  </div>
                ))}
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogAction onClick={clearBulkResults}>Dismiss</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
