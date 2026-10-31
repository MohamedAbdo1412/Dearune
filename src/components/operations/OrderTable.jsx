import { ChevronRight, Loader2Icon, Printer } from 'lucide-react'
import { formatDateTime, formatMoney } from '@/services/format'
import { carrierLabel } from '@/services/carriers'
import { QR_BLOCKED_LABELS } from '@/services/qrState'
import {
  MILESTONE_LABELS,
  isDelivered,
  nextAction,
  refundState,
  rowStateClass,
  shipmentStateLabel,
} from '@/services/ops-orders'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

// One row per order — the same record in every subsection. The columns change
// with the stage because the question changes: Making asks what still needs a
// paper, Shipping asks which carrier, Delivery asks whether it arrived,
// After-Sale asks what was returned. The order underneath never changes.

const MILESTONE_VARIANT = {
  making: 'outline',
  shipping: 'outline',
  delivery: 'secondary',
  delivered: 'default',
  after_sale: 'outline',
}

function MilestoneBadge({ order }) {
  return (
    <Badge variant={MILESTONE_VARIANT[order.milestone] ?? 'outline'}>{MILESTONE_LABELS[order.milestone] ?? '—'}</Badge>
  )
}

function IdCell({ order }) {
  return (
    <span className="block">
      <span className="block font-mono text-sm">{order.canonical_id || '—'}</span>
      <span className="block text-xs text-muted-foreground">
        {order.unit_reference || 'no unit'}
        {Number(order.unit_count) > 1 ? ` +${Number(order.unit_count) - 1}` : ''}
      </span>
    </span>
  )
}

function RecipientCell({ order }) {
  return (
    <span className="block">
      <span className="block truncate text-sm">{order.recipient_name || '—'}</span>
      <span className="block truncate text-xs text-muted-foreground">{order.customer_phone || 'no number on file'}</span>
    </span>
  )
}

function ActionButton({ order, onAction, onOpen, busy }) {
  const action = nextAction(order)
  if (order.milestone === 'making') {
    return (
      <Button size="sm" variant="outline" onClick={() => onOpen(order)} title="Open the order to finish Making">
        Open
        <ChevronRight className="size-4" />
      </Button>
    )
  }
  if (!action) {
    return (
      <Button size="sm" variant="ghost" onClick={() => onOpen(order)}>
        View
        <ChevronRight className="size-4" />
      </Button>
    )
  }
  const needsDetails = action.key === 'ship'
  return (
    <Button
      size="sm"
      variant={needsDetails ? 'outline' : 'default'}
      disabled={busy}
      onClick={() => (needsDetails ? onOpen(order) : onAction(action.key, order))}
    >
      {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
      {action.label}
    </Button>
  )
}

export function OrderTable({
  section,
  rows,
  selected,
  allSelected = false,
  onSelectAll,
  onToggle,
  onOpen,
  onAction,
  busyId = null,
  onPrint,
}) {
  const showCarrier = section === 'shipping' || section === 'delivery' || section === 'after-sale'
  const showRefund = section === 'after-sale' || section === 'delivery'
  const showMaking = section === 'making'

  return (
    <>
      {/* ---- phones: cards, because a wide table would need sideways scrolling */}
      <div className="space-y-2 md:hidden">
        <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked={allSelected} onCheckedChange={onSelectAll} aria-label="Select every visible order" />
            Select all
          </label>
          <span className="text-xs text-muted-foreground">{selected.size} selected</span>
        </div>
        {rows.map((order) => {
          const refund = refundState(order)
          return (
            <div
              key={order.project_id}
              data-state={selected.has(order.project_id) ? 'selected' : undefined}
              className={cn('rounded-lg border bg-background p-3', rowStateClass(order))}
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={selected.has(order.project_id)}
                  onCheckedChange={() => onToggle(order.project_id)}
                  aria-label={`Select ${order.canonical_id}`}
                  className="mt-1"
                />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => onOpen(order)}
                    className="block w-full text-left"
                    aria-label={`Open ${order.canonical_id}`}
                  >
                    <span className="block break-all font-mono text-sm">{order.canonical_id}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {order.unit_reference || 'no unit'}
                      {order.title ? ` · ${order.title}` : ''}
                    </span>
                  </button>
                </div>
                <MilestoneBadge order={order} />
              </div>

              <div className="mt-2 space-y-1 border-t pt-2 text-sm">
                <p className="min-w-0 break-words">
                  <span className="text-muted-foreground">Recipient · </span>
                  {order.recipient_name || '—'}
                  <span className="block text-xs text-muted-foreground">{order.customer_phone || 'no number on file'}</span>
                </p>
                {showCarrier && (
                  <p className="text-xs text-muted-foreground">
                    {carrierLabel(order.carrier)}
                    {order.tracking_code ? ` · ${order.tracking_code}` : ''}
                    {' · '}
                    {shipmentStateLabel(order)}
                  </p>
                )}
                {showRefund && refund.key !== 'none' && (
                  <p className="text-xs text-muted-foreground">
                    {refund.label}
                    {Number(order.refunded_amount) > 0
                      ? ` · ${formatMoney(order.refunded_amount, order.currency)}`
                      : ''}
                  </p>
                )}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-xs text-muted-foreground">
                    {order.milestone_updated_at ? `moved ${formatDateTime(order.milestone_updated_at)}` : 'not moved yet'}
                  </span>
                  <span className="flex items-center gap-1">
                    {showMaking && onPrint ? (
                      <Button size="sm" variant="ghost" onClick={() => onPrint(order)} title="Print this order's papers">
                        <Printer className="size-4" />
                        <span className="sr-only">Print papers</span>
                      </Button>
                    ) : null}
                    <ActionButton
                      order={order}
                      onAction={onAction}
                      onOpen={onOpen}
                      busy={busyId === order.project_id}
                    />
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ---- wide screens: the table -------------------------------------- */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={allSelected} onCheckedChange={onSelectAll} aria-label="Select every visible order" />
              </TableHead>
              <TableHead>Dearune</TableHead>
              <TableHead>Recipient</TableHead>
              <TableHead className="hidden lg:table-cell">Designer</TableHead>
              {showMaking ? <TableHead className="hidden xl:table-cell">Units</TableHead> : null}
              {showCarrier ? <TableHead>Shipment</TableHead> : null}
              {showRefund ? <TableHead className="hidden lg:table-cell">Refunds</TableHead> : null}
              <TableHead className="hidden sm:table-cell">Moved</TableHead>
              <TableHead className="w-32 text-right">Next</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((order) => {
              const refund = refundState(order)
              return (
                <TableRow
                  key={order.project_id}
                  data-state={selected.has(order.project_id) ? 'selected' : undefined}
                  className={rowStateClass(order)}
                >
                  <TableCell>
                    <Checkbox
                      checked={selected.has(order.project_id)}
                      onCheckedChange={() => onToggle(order.project_id)}
                      aria-label={`Select ${order.canonical_id}`}
                    />
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => onOpen(order)}
                      className="text-left"
                      aria-label={`Open ${order.canonical_id}`}
                    >
                      <IdCell order={order} />
                    </button>
                  </TableCell>
                  <TableCell>
                    <RecipientCell order={order} />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span className="block truncate text-sm">{order.designer_name || '—'}</span>
                    <span className="block truncate text-xs text-muted-foreground">{order.designer_code || ''}</span>
                  </TableCell>
                  {showMaking ? (
                    <TableCell className="hidden xl:table-cell">
                      <span className="text-sm tabular-nums">{Number(order.unit_count) || 0}</span>
                      <Badge
                        variant={order.qr_openable ? 'outline' : 'destructive'}
                        className="ml-2"
                        title={order.qr_blocked_reason ? QR_BLOCKED_LABELS[order.qr_blocked_reason] : 'Scanning the printed QR opens the letter'}
                      >
                        {order.qr_openable ? 'QR ready' : 'QR blocked'}
                      </Badge>
                    </TableCell>
                  ) : null}
                  {showCarrier ? (
                    <TableCell>
                      <span className="block truncate text-sm">
                        {order.carrier ? carrierLabel(order.carrier) : 'No carrier yet'}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {order.tracking_code || 'no tracking'}
                        {' · '}
                        {isDelivered(order) ? `delivered ${formatDateTime(order.shipment_delivered_at)}` : shipmentStateLabel(order)}
                      </span>
                    </TableCell>
                  ) : null}
                  {showRefund ? (
                    <TableCell className="hidden lg:table-cell">
                      <span className="block text-sm">{refund.label}</span>
                      {Number(order.refunded_amount) > 0 ? (
                        <span className="block text-xs tabular-nums text-muted-foreground">
                          {formatMoney(order.refunded_amount, order.currency)}
                        </span>
                      ) : null}
                    </TableCell>
                  ) : null}
                  <TableCell className="hidden text-xs tabular-nums text-muted-foreground sm:table-cell">
                    {order.milestone_updated_at ? formatDateTime(order.milestone_updated_at) : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {showMaking && onPrint ? (
                        <Button size="sm" variant="ghost" onClick={() => onPrint(order)} title="Print this order's papers">
                          <Printer className="size-4" />
                          <span className="sr-only">Print papers</span>
                        </Button>
                      ) : null}
                      <ActionButton
                        order={order}
                        onAction={onAction}
                        onOpen={onOpen}
                        busy={busyId === order.project_id}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
