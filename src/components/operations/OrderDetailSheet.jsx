import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Loader2Icon, Printer, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { carrierLabel } from '@/services/carriers'
import { formatDateTime, formatMoney } from '@/services/format'
import {
  MILESTONE_LABELS,
  REFUND_STATUS_LABELS,
  completeMaking,
  deliverOrder,
  fetchOrder,
  fetchOrderReferences,
  fetchOrderTimeline,
  isDelivered,
  moveToAfterSale,
  refundState,
  shipmentStateLabel,
} from '@/services/ops-orders'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { ShipmentPanel } from './ShipmentPanel'

const messageOf = (err) => (err instanceof Error ? err.message : 'Something went wrong')

const REFERENCE_KIND_LABELS = {
  canonical: 'Dearune ID',
  unit: 'Unit ID',
  sold: 'Sold As',
  sale: 'Sale ledger',
  legacy: 'Legacy reference',
}

const EVENT_LABELS = {
  'order.milestone': 'Moved',
  'order.contact.updated': 'Phone corrected',
  'order.designer.updated': 'Designer corrected',
  'order.refund.recorded': 'Refund recorded',
  'operations.making_completed': 'Making completed',
  'operations.making_started': 'Making started',
  'operations.updated': 'Note corrected',
  'operations.archived': 'Archived',
  'operations.restored': 'Restored',
}

function eventText(event) {
  const label = EVENT_LABELS[event.action] ?? event.action
  if (event.action === 'order.milestone' && event.detail?.to) {
    return `${label} to ${MILESTONE_LABELS[event.detail.to] ?? event.detail.to}`
  }
  if (event.detail?.reason) return `${label} · ${event.detail.reason}`
  return label
}

export function OrderDetailSheet({
  order: initial,
  open,
  onOpenChange,
  onChanged,
  onRefund,
  onPrint,
  maintenance = false,
}) {
  const [order, setOrder] = useState(initial)
  const [references, setReferences] = useState([])
  const [timeline, setTimeline] = useState([])
  const [refunds, setRefunds] = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(null)
  const [confirmDeliver, setConfirmDeliver] = useState(false)

  const projectId = initial?.project_id

  const load = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const [fresh, refs, history] = await Promise.all([
        fetchOrder(projectId),
        fetchOrderReferences(projectId),
        fetchOrderTimeline(projectId),
      ])
      setOrder((prev) => fresh ?? prev)
      setReferences(refs)
      setTimeline(history.events ?? [])
      setRefunds(history.refunds ?? [])
    } catch (err) {
      toast.error(messageOf(err))
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (!open) return
    setOrder(initial)
    setReferences([])
    setTimeline([])
    setRefunds([])
    void load()
  }, [open, initial, load])

  const refreshAll = async () => {
    await load()
    onChanged?.()
  }

  const run = async (key, fn, message) => {
    setBusy(key)
    try {
      await fn()
      toast.success(message)
      await refreshAll()
    } catch (err) {
      toast.error(messageOf(err))
      await refreshAll()
    } finally {
      setBusy(null)
    }
  }

  if (!order) return null

  const refund = refundState(order)
  const delivered = isDelivered(order)

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl">
          <SheetHeader className="border-b px-5 py-4">
            <SheetTitle className="flex flex-wrap items-center gap-2 font-mono">
              {order.canonical_id}
              <Badge variant={delivered ? 'default' : 'outline'}>
                {MILESTONE_LABELS[order.milestone] ?? order.milestone ?? '—'}
              </Badge>
              {order.archived_at ? <Badge variant="outline">Archived</Badge> : null}
            </SheetTitle>
            <SheetDescription>
              {order.title || 'Dearune'}
              {order.unit_reference ? ` · ${order.unit_reference}` : ''}
              {order.designer_name ? ` · ${order.designer_name}` : ''}
              {order.designer_code ? ` (${order.designer_code})` : ''}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5 px-5 py-4">
            {/* ---- what this order is -------------------------------------- */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Recipient</p>
                <p className="text-sm">{order.recipient_name || '—'}</p>
                <p className="text-xs text-muted-foreground">{order.customer_phone || 'no number on file'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Sale</p>
                <p className="text-sm">
                  {order.sale_price ? formatMoney(order.sale_price, order.currency) : 'not recorded'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {order.paid_at ? `paid ${formatDateTime(order.paid_at)}` : 'not paid yet'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Address</p>
                <p className="text-sm">
                  {[order.address_line1, order.address_line2, order.city, order.governorate]
                    .filter(Boolean)
                    .join(', ') || '—'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Refunds</p>
                <p className="text-sm">{refund.label}</p>
                <p className="text-xs text-muted-foreground">
                  {Number(order.refunded_amount) > 0
                    ? `${formatMoney(order.refunded_amount, order.currency)} returned`
                    : 'nothing returned'}
                </p>
              </div>
            </div>

            {/* ---- identifiers --------------------------------------------- */}
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Identifiers</p>
              <ul className="mt-1.5 space-y-1">
                {references.length === 0 ? (
                  <li className="text-xs text-muted-foreground">Loading…</li>
                ) : (
                  references.map((reference) => (
                    <li key={reference.id} className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-muted-foreground">{REFERENCE_KIND_LABELS[reference.kind] ?? reference.kind}</span>
                      <span className="font-mono">{reference.value}</span>
                    </li>
                  ))
                )}
              </ul>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Every identifier above resolves to this one order. None of them is ever rewritten.
              </p>
            </div>

            <Separator />

            {/* ---- stage actions ------------------------------------------- */}
            {order.milestone === 'making' && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Making</p>
                <p className="text-xs text-muted-foreground">
                  Printing, QR, assembly and QC happen here. Finishing Making hands the order to Shipping; the papers and
                  production history stay attached.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={busy === 'making' || maintenance}
                    onClick={() => void run('making', () => completeMaking(order.project_id, 'Making complete'), 'Moved to Shipping')}
                  >
                    {busy === 'making' ? <Loader2Icon className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                    Finish Making
                  </Button>
                  {onPrint ? (
                    <Button size="sm" variant="outline" onClick={() => onPrint(order)}>
                      <Printer className="size-4" />
                      Print papers
                    </Button>
                  ) : null}
                </div>
              </div>
            )}

            {order.milestone === 'shipping' && (
              <>
                <ShipmentPanel order={order} onChanged={() => void refreshAll()} disabled={maintenance} />
                <Separator />
              </>
            )}

            {['delivery', 'delivered'].includes(order.milestone) && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Delivery</p>
                <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  {carrierLabel(order.carrier)}
                  {order.tracking_code ? ` · ${order.tracking_code}` : ''} · {shipmentStateLabel(order)}
                  {order.shipment_shipped_at ? ` · shipped ${formatDateTime(order.shipment_shipped_at)}` : ''}
                  {order.shipment_delivered_at ? ` · delivered ${formatDateTime(order.shipment_delivered_at)}` : ''}
                </div>
                <div className="flex flex-wrap gap-2">
                  {!delivered ? (
                    <Button
                      size="sm"
                      disabled={busy === 'deliver' || maintenance}
                      onClick={() => setConfirmDeliver(true)}
                    >
                      {busy === 'deliver' ? <Loader2Icon className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                      Mark delivered
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={busy === 'after-sale' || maintenance}
                      onClick={() =>
                        void run('after-sale', () => moveToAfterSale(order.project_id, 'Delivered order moved to After-Sale'), 'Moved to After-Sale')
                      }
                    >
                      {busy === 'after-sale' ? <Loader2Icon className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                      Move to After-Sale
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  A delivered order stays in Delivery with its delivered colour until it is moved to After-Sale.
                </p>
              </div>
            )}

            {order.milestone === 'after_sale' && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">After-Sale</p>
                <p className="text-xs text-muted-foreground">
                  Refunds, complaints and corrections stay on this same record — never a second copy of the order.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRefund?.(order)}
                  disabled={maintenance}
                >
                  <Undo2 className="size-4" />
                  Record a refund
                </Button>
              </div>
            )}

            <Separator />

            {/* ---- refunds ------------------------------------------------- */}
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Refund history</p>
              {refunds.length === 0 ? (
                <p className="mt-1.5 text-xs text-muted-foreground">No refunds recorded on this order.</p>
              ) : (
                <ul className="mt-1.5 space-y-2">
                  {refunds.map((entry) => (
                    <li key={entry.id} className="rounded-lg border px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{formatMoney(entry.amount, entry.currency)}</span>
                        <Badge variant={entry.status === 'manual' || entry.status === 'completed' ? 'secondary' : 'outline'}>
                          {REFUND_STATUS_LABELS[entry.status] ?? entry.status}
                        </Badge>
                      </div>
                      <p className="mt-1 text-muted-foreground">{entry.reason}</p>
                      <p className="mt-1 text-muted-foreground">
                        {entry.method ? `${entry.method.replace('_', ' ')}` : 'method not recorded'}
                        {entry.reference ? ` · ${entry.reference}` : ''} · {formatDateTime(entry.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* ---- history ------------------------------------------------- */}
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Timeline</p>
              {loading && timeline.length === 0 ? (
                <p className="mt-1.5 text-xs text-muted-foreground">Loading…</p>
              ) : timeline.length === 0 ? (
                <p className="mt-1.5 text-xs text-muted-foreground">No history yet.</p>
              ) : (
                <ul className="mt-1.5 space-y-1.5">
                  {timeline.map((event) => (
                    <li key={event.id} className="flex items-start justify-between gap-3 text-xs">
                      <span className={cn('text-muted-foreground')}>{eventText(event)}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{formatDateTime(event.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <Link className="underline" to={`/admin/designers/${order.designer_id}/messages/${order.project_id}`}>
                Open the Dearune in the Designer workspace
              </Link>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDeliver} onOpenChange={setConfirmDeliver}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark {order.canonical_id} as delivered?</AlertDialogTitle>
            <AlertDialogDescription>
              This records the arrival time and your name, changes the order&apos;s colour from the saved state, and
              keeps it in Delivery. It does not archive the order.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === 'deliver'}>Back</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy === 'deliver'}
              onClick={(event) => {
                event.preventDefault()
                setConfirmDeliver(false)
                void run('deliver', () => deliverOrder(order.project_id, { reason: 'Delivered to recipient' }), 'Marked delivered')
              }}
            >
              Confirm delivered
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
