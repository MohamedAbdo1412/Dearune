import { useState } from 'react'
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react'
import { WRAPPER_LABELS } from '@/services/constants'
import { ORDER_SORTS, activeFilters } from '@/services/ops-orders'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

// Filtering, sorting and searching happen in the DATABASE, not in the browser.
// This bar only builds the query the service sends, so a section with ten
// thousand orders behaves exactly like one with ten — and the active filters
// are always visible, never a hidden state the reader has to remember.

const ALL = 'all'

const FILTER_LABELS = {
  query: 'Search',
  carrier: 'Carrier',
  governorate: 'Governorate',
  city: 'City',
  designerId: 'Designer',
  wrapperType: 'Wrapper',
  refund: 'Refunds',
  shipment: 'Shipment',
  qr: 'QR',
  archived: 'Archive',
  paidFrom: 'Paid from',
  paidTo: 'Paid to',
  movedFrom: 'Moved from',
  movedTo: 'Moved to',
}

const SELECT_FILTERS = {
  refund: [
    { value: 'any', label: 'Any refund' },
    { value: 'refunded', label: 'Money returned' },
    { value: 'none', label: 'No refunds' },
  ],
  shipment: [
    { value: 'awaiting_shipment', label: 'Awaiting hand-off' },
    { value: 'shipped', label: 'With the carrier' },
    { value: 'delivered', label: 'Delivered' },
  ],
  qr: [
    { value: 'ready', label: 'Ready to scan' },
    { value: 'blocked', label: 'Not ready' },
  ],
  archived: [
    { value: 'hide', label: 'Active only' },
    { value: 'only', label: 'Archived only' },
  ],
}

function FilterSelect({ id, label, value, onChange, options, allLabel }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select value={value || ALL} onValueChange={(next) => onChange(next === ALL ? '' : next)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={allLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function OperationsFilterBar({
  section,
  filters,
  onFilterChange,
  onClear,
  sortKey,
  onSortChange,
  designers = [],
  total,
}) {
  const [open, setOpen] = useState(false)
  const active = activeFilters(filters)

  const set = (key) => (value) => onFilterChange(key, value)

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.query}
            onChange={(event) => set('query')(event.target.value)}
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
            {ORDER_SORTS.map((sort) => (
              <SelectItem key={sort.key} value={sort.key}>
                {sort.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant={open || active.length > 0 ? 'secondary' : 'outline'}
          onClick={() => setOpen((next) => !next)}
          aria-expanded={open}
          className="justify-between lg:w-auto"
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="size-4" />
            Filters
            {active.length > 0 ? (
              <span className="rounded-full bg-foreground px-1.5 text-[0.65rem] font-semibold text-background">
                {active.length}
              </span>
            ) : null}
          </span>
          <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
        </Button>
      </div>

      {open && (
        <div className="grid gap-3 rounded-xl border bg-muted/30 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterSelect
            id={`filter-designer-${section}`}
            label="Designer"
            value={filters.designerId}
            onChange={set('designerId')}
            allLabel="Every designer"
            options={designers.map((designer) => ({
              value: designer.id,
              label: designer.code ? `${designer.name} · ${designer.code}` : designer.name,
            }))}
          />

          <FilterSelect
            id={`filter-wrapper-${section}`}
            label="Wrapper"
            value={filters.wrapperType}
            onChange={set('wrapperType')}
            allLabel="Every wrapper"
            options={Object.entries(WRAPPER_LABELS).map(([value, label]) => ({ value, label }))}
          />

          <FilterSelect
            id={`filter-carrier-${section}`}
            label="Carrier"
            value={filters.carrier}
            onChange={set('carrier')}
            allLabel="Every carrier"
            options={[
              { value: 'bosta', label: 'Bosta' },
              { value: 'egypt_post', label: 'Egypt Post' },
            ]}
          />

          <FilterSelect
            id={`filter-shipment-${section}`}
            label="Shipment"
            value={filters.shipment}
            onChange={set('shipment')}
            allLabel="Every shipment state"
            options={SELECT_FILTERS.shipment}
          />

          <div className="space-y-1.5">
            <Label htmlFor={`filter-city-${section}`} className="text-xs text-muted-foreground">
              City
            </Label>
            <Input
              id={`filter-city-${section}`}
              value={filters.city}
              onChange={(event) => set('city')(event.target.value)}
              placeholder="e.g. Nasr City"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`filter-governorate-${section}`} className="text-xs text-muted-foreground">
              Governorate
            </Label>
            <Input
              id={`filter-governorate-${section}`}
              value={filters.governorate}
              onChange={(event) => set('governorate')(event.target.value)}
              placeholder="e.g. CAIRO"
            />
          </div>

          <FilterSelect
            id={`filter-refund-${section}`}
            label="Refunds"
            value={filters.refund}
            onChange={set('refund')}
            allLabel="Any refund state"
            options={SELECT_FILTERS.refund}
          />

          <FilterSelect
            id={`filter-qr-${section}`}
            label="QR"
            value={filters.qr}
            onChange={set('qr')}
            allLabel="Any QR state"
            options={SELECT_FILTERS.qr}
          />

          <div className="space-y-1.5">
            <Label htmlFor={`filter-paid-from-${section}`} className="text-xs text-muted-foreground">
              Paid from
            </Label>
            <Input
              id={`filter-paid-from-${section}`}
              type="date"
              value={filters.paidFrom}
              onChange={(event) => set('paidFrom')(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`filter-paid-to-${section}`} className="text-xs text-muted-foreground">
              Paid to
            </Label>
            <Input
              id={`filter-paid-to-${section}`}
              type="date"
              value={filters.paidTo}
              onChange={(event) => set('paidTo')(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`filter-moved-from-${section}`} className="text-xs text-muted-foreground">
              Moved from
            </Label>
            <Input
              id={`filter-moved-from-${section}`}
              type="date"
              value={filters.movedFrom}
              onChange={(event) => set('movedFrom')(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`filter-moved-to-${section}`} className="text-xs text-muted-foreground">
              Moved to
            </Label>
            <Input
              id={`filter-moved-to-${section}`}
              type="date"
              value={filters.movedTo}
              onChange={(event) => set('movedTo')(event.target.value)}
            />
          </div>

          <FilterSelect
            id={`filter-archived-${section}`}
            label="Archive"
            value={filters.archived}
            onChange={set('archived')}
            allLabel="Active and archived"
            options={SELECT_FILTERS.archived}
          />
        </div>
      )}

      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Filters:</span>
          {active.map(([key, value]) => (
            <span
              key={key}
              className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5"
            >
              <span className="text-muted-foreground">{FILTER_LABELS[key] ?? key}</span>
              <span className="max-w-40 truncate font-medium">{String(value)}</span>
              <button
                type="button"
                aria-label={`Clear ${FILTER_LABELS[key] ?? key}`}
                onClick={() => onFilterChange(key, '')}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <Button type="button" variant="link" size="sm" className="h-auto px-1 text-xs" onClick={onClear}>
            Clear all
          </Button>
          {typeof total === 'number' ? (
            <span className="ml-auto text-muted-foreground">
              {total} {total === 1 ? 'order' : 'orders'} match
            </span>
          ) : null}
        </div>
      )}
    </div>
  )
}
