import { useEffect, useState } from 'react'
import { Loader2Icon, Save, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { CARRIERS, carrierLabel } from '@/services/carriers'
import { saveShipment, shipOrder } from '@/services/ops-orders'
import { formatDateTime } from '@/services/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const messageOf = (err) => (err instanceof Error ? err.message : 'Something went wrong')

// The carrier is a FACT, not a default. It is chosen explicitly, saved before
// the parcel leaves, and kept forever — so "who took this?" has one answer.
// Marking shipped is the SAME operation as leaving the Shipping queue: one
// database transition moves the order to Delivery and records the hand-off.

export function ShipmentPanel({ order, onChanged, disabled = false }) {
  const [carrier, setCarrier] = useState(order?.carrier ?? '')
  const [tracking, setTracking] = useState(order?.tracking_code ?? '')
  const [saving, setSaving] = useState(false)
  const [shipping, setShipping] = useState(false)

  useEffect(() => {
    setCarrier(order?.carrier ?? '')
    setTracking(order?.tracking_code ?? '')
  }, [order?.project_id, order?.carrier, order?.tracking_code])

  const alreadyShipped = Boolean(order?.shipment_shipped_at) || ['delivery', 'delivered', 'after_sale'].includes(order?.milestone)

  const save = async () => {
    if (!carrier) {
      toast.error('Choose Bosta or Egypt Post first')
      return
    }
    setSaving(true)
    try {
      await saveShipment(order.project_id, { carrier, tracking: tracking.trim() })
      toast.success('Carrier saved — the order stays in Shipping until it is handed over')
      onChanged?.()
    } catch (err) {
      toast.error(messageOf(err))
    } finally {
      setSaving(false)
    }
  }

  const ship = async () => {
    if (!carrier) {
      toast.error('Choose Bosta or Egypt Post before shipping')
      return
    }
    if (!tracking.trim()) {
      toast.error('A tracking number or carrier reference is required before shipping')
      return
    }
    setShipping(true)
    try {
      await shipOrder(order.project_id, { carrier, tracking: tracking.trim() })
      toast.success('Shipped — the order has moved to Delivery')
      onChanged?.()
    } catch (err) {
      toast.error(messageOf(err))
    } finally {
      setShipping(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Shipment</p>
        {order?.carrier ? (
          <span className="text-xs text-muted-foreground">
            {carrierLabel(order.carrier)}
            {order.tracking_code ? ` · ${order.tracking_code}` : ''}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">No carrier yet</span>
        )}
      </div>

      {alreadyShipped ? (
        <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Handed to {carrierLabel(order.carrier)} as{' '}
          <span className="font-mono text-foreground">{order.tracking_code || '—'}</span>
          {order.shipment_shipped_at ? ` on ${formatDateTime(order.shipment_shipped_at)}` : ''}.
          {order.manifest_id ? ' Imported from a carrier manifest.' : ''}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`carrier-${order.project_id}`}>Carrier</Label>
              <Select value={carrier} onValueChange={setCarrier} disabled={disabled}>
                <SelectTrigger id={`carrier-${order.project_id}`}>
                  <SelectValue placeholder="Choose a carrier" />
                </SelectTrigger>
                <SelectContent>
                  {CARRIERS.map((definition) => (
                    <SelectItem key={definition.key} value={definition.key}>
                      {definition.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`tracking-${order.project_id}`}>Tracking / Post_Id</Label>
              <Input
                id={`tracking-${order.project_id}`}
                value={tracking}
                onChange={(event) => setTracking(event.target.value)}
                placeholder="Carrier tracking number"
                disabled={disabled}
                className="font-mono"
              />
            </div>
          </div>

          {carrier === 'bosta' ? (
            <p className="text-xs text-muted-foreground">
              Bosta reports delivery in its own dashboard. The studio still records the tracking number here so the
              order carries its own history.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void save()} disabled={saving || shipping || disabled}>
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save carrier
            </Button>
            <Button size="sm" onClick={() => void ship()} disabled={shipping || saving || disabled}>
              {shipping ? <Loader2Icon className="size-4 animate-spin" /> : <Truck className="size-4" />}
              Mark shipped
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Marking shipped leaves the Shipping queue and moves the order to Delivery in one step.
          </p>
        </>
      )}
    </div>
  )
}
