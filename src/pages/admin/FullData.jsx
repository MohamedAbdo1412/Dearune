import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Columns,
  Download,
  FileSpreadsheet,
  FilterX,
  Loader2Icon,
  RefreshCw,
  Search,
  Settings,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  FULL_DATA_ALL_COLUMNS,
  FULL_DATA_COLUMN_GROUPS,
  FULL_DATA_DEFAULT_VISIBLE,
  FULL_DATA_EMPTY_FILTERS,
  FULL_DATA_SORTS,
  activeFilters,
  fetchAllFullData,
  fetchFullData,
  toCSV,
  toXLSX,
} from '@/services/full-data'
import { OrderDetailSheet } from '@/components/operations/OrderDetailSheet'
import { formatDateTime, formatMoney } from '@/services/format'
import { carrierLabel } from '@/services/carriers'
import { MILESTONE_LABELS } from '@/services/constants'

const PAGE_SIZE = 50
const DEBOUNCE_MS = 300

// Full Data — the administrative master view.
//
// One logical row per Dearune. Server-side filtering, sorting and pagination.
// Exports respect the current filters and column visibility.

export function FullData() {

  const [filters, setFilters] = useState(FULL_DATA_EMPTY_FILTERS)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [sortKey, setSortKey] = useState('newest')
  const [page, setPage] = useState(0)
  const [visibleColumns, setVisibleColumns] = useState(FULL_DATA_DEFAULT_VISIBLE)

  const [rows, setRows] = useState(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)

  const [detail, setDetail] = useState(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const refresh = useCallback(() => setRefreshToken((value) => value + 1), [])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(filters.query), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [filters.query])

  const effectiveFilters = useMemo(
    () => ({ ...filters, query: debouncedQuery }),
    [filters, debouncedQuery],
  )

  useEffect(() => {
    setPage(0)
    setDetail(null)
    setDetailOpen(false)
  }, [effectiveFilters, sortKey])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    fetchFullData({ filters: effectiveFilters, sortKey, page, pageSize: PAGE_SIZE, visibleColumns })
      .then((result) => {
        if (!active) return
        setRows(result.rows)
        setTotal(result.total)
        setLoading(false)
      })
      .catch((err) => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Something went wrong')
        setRows([])
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [effectiveFilters, sortKey, page, visibleColumns, refreshToken])

  const onFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(0)
  }

  const clearFilters = () => {
    setFilters(FULL_DATA_EMPTY_FILTERS)
    setPage(0)
  }

  const onSortChange = (next) => {
    setSortKey(next)
    setPage(0)
  }

  const toggleColumn = (columnKey) => {
    setVisibleColumns((prev) =>
      prev.includes(columnKey) ? prev.filter((c) => c !== columnKey) : [...prev, columnKey],
    )
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1
  const to = Math.min(total, page * PAGE_SIZE + (rows?.length ?? 0))

  const handleExportCSV = async () => {
    try {
      setExporting(true)
      const allRows = await fetchAllFullData({
        filters: effectiveFilters,
        sortKey,
        visibleColumns,
        pageSize: 1000,
      })
      const columns = FULL_DATA_ALL_COLUMNS.filter((c) => visibleColumns.includes(c.key))
      const csv = toCSV(allRows, columns)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Full-Data-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Exported ${allRows.length} rows as CSV`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const handleExportXLSX = async () => {
    try {
      setExporting(true)
      const allRows = await fetchAllFullData({
        filters: effectiveFilters,
        sortKey,
        visibleColumns,
        pageSize: 1000,
      })
      const columns = FULL_DATA_ALL_COLUMNS.filter((c) => visibleColumns.includes(c.key))
      const bytes = await toXLSX(allRows, columns)
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Full-Data-${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Exported ${allRows.length} rows as XLSX`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const openOrder = (order) => {
    setDetail(order)
    setDetailOpen(true)
  }

  const formatCell = (row, column) => {
    const value = row[column.key]
    if (value === null || value === undefined || value === '') return '—'

    switch (column.type) {
      case 'money':
        return formatMoney(value, row.currency)
      case 'datetime':
        return formatDateTime(value)
      case 'boolean':
        return value ? 'Yes' : 'No'
      case 'milestone':
        return MILESTONE_LABELS[value] ?? value
      case 'id':
        return <span className="font-mono text-sm">{value}</span>
      case 'text':
      default:
        if (column.key === 'carrier') return carrierLabel(value)
        if (column.key === 'shipment_state') {
          const labels = { awaiting_shipment: 'Awaiting hand-off', shipped: 'With the carrier', delivered: 'Delivered' }
          return labels[value] ?? value
        }
        return String(value)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl">Full Data</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Excel-like master view of every Dearune order. One row per order — filters, sorting and pagination run on the
            database. Exports respect the current view.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleExportCSV} disabled={exporting || total === 0}>
            <FileSpreadsheet className="size-4" />
            Export CSV ({total})
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportXLSX} disabled={exporting || total === 0}>
            <Download className="size-4" />
            Export XLSX ({total})
          </Button>
          <Button size="sm" variant="ghost" onClick={refresh} title="Refresh">
            <RefreshCw className="size-4" />
            <span className="sr-only">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Column visibility */}
      <Card className="border-dashed">
        <CardContent className="py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-sm font-medium">Visible columns:</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline">
                  <Columns className="size-4" />
                  <span>{visibleColumns.length} columns</span>
                  <Settings className="size-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 max-h-96 overflow-auto p-2" side="bottom" align="start">
                {FULL_DATA_COLUMN_GROUPS.map((group) => (
                  <div key={group.key} className="space-y-1 border-t pt-2 first:border-0 first:pt-0">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{group.label}</p>
                    {group.columns.map((col) => (
                      <label key={col.key} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted">
                        <Checkbox
                          checked={visibleColumns.includes(col.key)}
                          onCheckedChange={() => toggleColumn(col.key)}
                          className="size-3"
                        />
                        <span className="text-sm truncate max-w-[200px]">{col.label}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </PopoverContent>
            </Popover>
            <Button size="sm" variant="ghost" onClick={() => setVisibleColumns(FULL_DATA_DEFAULT_VISIBLE)}>
              Reset to default
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filters.query}
                onChange={(e) => onFilterChange('query', e.target.value)}
                placeholder="Search Dearune ID, Sold ID, recipient, phone, tracking…"
                aria-label="Search orders"
                className="pl-9"
              />
            </div>

            <Select value={sortKey} onValueChange={onSortChange}>
              <SelectTrigger className="w-full lg:w-48" aria-label="Sort orders">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                {FULL_DATA_SORTS.map((sort) => (
                  <SelectItem key={sort.key} value={sort.key}>
                    {sort.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  size="sm"
                  variant={activeFilters(filters).length > 0 ? 'secondary' : 'outline'}
                  aria-expanded={false}
                >
                  <FilterX className="size-4" />
                  Filters
                  {activeFilters(filters).length > 0 && (
                    <span className="rounded-full bg-foreground px-1.5 text-[0.65rem] font-semibold text-background ml-1">
                      {activeFilters(filters).length}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-96 max-h-96 overflow-auto p-3" side="bottom" align="start">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Milestone</Label>
                    <Select value={filters.milestone || ''} onValueChange={(v) => onFilterChange('milestone', v)}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="All milestones" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">All milestones</SelectItem>
                        {Object.entries(MILESTONE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Designer</Label>
                    <Input
                      placeholder="Designer ID or name"
                      value={filters.designerId}
                      onChange={(e) => onFilterChange('designerId', e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Wrapper</Label>
                    <Select value={filters.wrapperType || ''} onValueChange={(v) => onFilterChange('wrapperType', v)}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="All wrappers" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">All wrappers</SelectItem>
                        <SelectItem value="digital">Digital</SelectItem>
                        <SelectItem value="open_letter">Open letter</SelectItem>
                        <SelectItem value="sealed_letter">Sealed letter</SelectItem>
                        <SelectItem value="open_card">Open card</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Carrier</Label>
                    <Select value={filters.carrier || ''} onValueChange={(v) => onFilterChange('carrier', v)}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="All carriers" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">All carriers</SelectItem>
                        <SelectItem value="bosta">Bosta</SelectItem>
                        <SelectItem value="egypt_post">Egypt Post</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Shipment State</Label>
                    <Select value={filters.shipmentState || ''} onValueChange={(v) => onFilterChange('shipmentState', v)}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="All states" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">All states</SelectItem>
                        <SelectItem value="awaiting_shipment">Awaiting hand-off</SelectItem>
                        <SelectItem value="shipped">With the carrier</SelectItem>
                        <SelectItem value="delivered">Delivered</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Refunds</Label>
                    <Select value={filters.refund || ''} onValueChange={(v) => onFilterChange('refund', v)}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Any refund state" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Any refund state</SelectItem>
                        <SelectItem value="any">Any refund</SelectItem>
                        <SelectItem value="refunded">Money returned</SelectItem>
                        <SelectItem value="none">No refunds</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Published</Label>
                    <Select value={filters.messageActive || ''} onValueChange={(v) => onFilterChange('messageActive', v)}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">All</SelectItem>
                        <SelectItem value="yes">Published</SelectItem>
                        <SelectItem value="no">Not published</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Recipient Opened</Label>
                    <Select value={filters.recipientOpened || ''} onValueChange={(v) => onFilterChange('recipientOpened', v)}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="All" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">All</SelectItem>
                        <SelectItem value="yes">Opened</SelectItem>
                        <SelectItem value="no">Never opened</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Paid From</Label>
                    <Input type="date" value={filters.paidFrom} onChange={(e) => onFilterChange('paidFrom', e.target.value)} />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Paid To</Label>
                    <Input type="date" value={filters.paidTo} onChange={(e) => onFilterChange('paidTo', e.target.value)} />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Created From</Label>
                    <Input type="date" value={filters.createdFrom} onChange={(e) => onFilterChange('createdFrom', e.target.value)} />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Created To</Label>
                    <Input type="date" value={filters.createdTo} onChange={(e) => onFilterChange('createdTo', e.target.value)} />
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {activeFilters(filters).length > 0 && (
              <Button size="sm" variant="link" onClick={clearFilters}>
                Clear all
              </Button>
            )}
          </div>

          {activeFilters(filters).length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Active:</span>
              {activeFilters(filters).map(([key, value]) => (
                <span key={key} className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5">
                  <span className="text-muted-foreground">{key}</span>
                  <span className="max-w-40 truncate font-medium">{String(value)}</span>
                  <button type="button" onClick={() => onFilterChange(key, '')} className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                    <FilterX className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="py-4">
          {error ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Loader2Icon className="size-6 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
              <Button size="sm" variant="outline" onClick={refresh}>Try again</Button>
            </div>
          ) : rows === null ? (
            <div className="space-y-2" aria-busy="true" aria-live="polite">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-12 w-full rounded-lg border bg-muted/40" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <FileSpreadsheet className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {Object.values(filters).some((value) => String(value ?? '').trim() !== '')
                  ? 'Nothing matches the current filters.'
                  : 'No orders found.'}
              </p>
              {Object.values(filters).some((value) => String(value ?? '').trim() !== '') ? (
                <Button size="sm" variant="outline" onClick={clearFilters}>Clear filters</Button>
              ) : null}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {FULL_DATA_ALL_COLUMNS.filter((c) => visibleColumns.includes(c.key)).map((column) => (
                      <TableHead key={column.key} className="cursor-pointer select-none" onClick={() => onSortChange(column.key)}>
                        <div className="flex items-center gap-1">
                          <span>{column.label}</span>
                          {sortKey === column.key && <span className="size-3">{FULL_DATA_SORTS.find((s) => s.key === sortKey)?.ascending ? '▲' : '▼'}</span>}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.project_id} onClick={() => openOrder(row)} className="cursor-pointer hover:bg-muted/50">
                      {FULL_DATA_ALL_COLUMNS.filter((c) => visibleColumns.includes(c.key)).map((column) => (
                        <TableCell key={column.key}>
                          {formatCell(row, column)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
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
          <span className="text-xs tabular-nums text-muted-foreground">Page {page + 1} of {pageCount}</span>
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
        onRefund={() => toast.info('Refunds from Full Data — open the order in Operations to record a refund')}
        onPrint={() => toast.info('Print from Full Data — open the order in Operations to print papers')}
        maintenance={false}
      />
    </div>
  )
}