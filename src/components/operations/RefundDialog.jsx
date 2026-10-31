import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2Icon, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { REFUND_METHODS, REFUND_STATUSES, recordRefund } from '@/services/ops-orders'
import { formatMoney } from '@/services/format'
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
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

const messageOf = (err) => (err instanceof Error ? err.message : 'Something went wrong')

function newKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `refund-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

// A refund is RECORDED, never invented.
//
// There is no payment provider in this codebase, so this dialog says so
// plainly: it writes an administrative ledger entry carrying the amount,
// reason, method, reference, operator and time. The same request cannot be
// recorded twice — the key is minted once per dialog and the database has a
// unique constraint behind it — and it can never exceed what the Dearune sold
// for.

export function RefundDialog({ order, open, onOpenChange, onRecorded }) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [method, setMethod] = useState('cash')
  const [reference, setReference] = useState('')
  const [status, setStatus] = useState('manual')
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [idempotencyKey, setIdempotencyKey] = useState(newKey)

  useEffect(() => {
    if (!open) return
    setAmount('')
    setReason('')
    setMethod('cash')
    setReference('')
    setStatus('manual')
    setIdempotencyKey(newKey())
  }, [open, order?.project_id])

  const salePrice = Number(order?.sale_price ?? 0)
  const refunded = Number(order?.refunded_amount ?? 0)
  const remaining = useMemo(() => (salePrice > 0 ? salePrice - refunded : null), [salePrice, refunded])

  const numericAmount = Number(amount)
  const amountError =
    amount.trim() === '' || !Number.isFinite(numericAmount) || numericAmount <= 0
      ? 'Enter an amount greater than zero'
      : remaining !== null && numericAmount > remaining
        ? `That would exceed the ${formatMoney(remaining, order?.currency)} still refundable`
        : null
  const reasonError = reason.trim().length < 3 ? 'A reason of at least 3 characters is required' : null

  const submit = () => {
    if (amountError) {
      toast.error(amountError)
      return
    }
    if (reasonError) {
      toast.error(reasonError)
      return
    }
    setConfirming(true)
  }

  const record = async () => {
    setSaving(true)
    try {
      await recordRefund(order.project_id, {
        amount: numericAmount,
        reason: reason.trim(),
        method,
        reference: reference.trim() || null,
        status,
        idempotencyKey,
      })
      toast.success(
        status === 'pending'
          ? 'Refund request recorded — money has NOT been returned yet'
          : 'Refund recorded against this order',
      )
      setConfirming(false)
      onOpenChange(false)
      onRecorded?.()
    } catch (err) {
      toast.error(messageOf(err))
    } finally {
      setSaving(false)
    }
  }

  if (!order) return null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record a refund</DialogTitle>
            <DialogDescription>
              {order.canonical_id}
              {order.unit_reference ? ` · ${order.unit_reference}` : ''} · sold for{' '}
              {salePrice > 0 ? formatMoney(salePrice, order.currency) : 'an unrecorded amount'}
              {refunded > 0 ? `, already refunded ${formatMoney(refunded, order.currency)}` : ''}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="refund-amount">Amount</Label>
                <Input
                  id="refund-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0.00"
                  aria-invalid={Boolean(amount) && Boolean(amountError)}
                />
                {remaining !== null ? (
                  <p className="text-xs text-muted-foreground">Up to {formatMoney(remaining, order.currency)} remains.</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="refund-method">Method</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger id="refund-method">
                    <SelectValue placeholder="How the money went back" />
                  </SelectTrigger>
                  <SelectContent>
                    {REFUND_METHODS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="refund-reason">Reason</Label>
              <Textarea
                id="refund-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why the money was returned"
                aria-invalid={Boolean(reason) && Boolean(reasonError)}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="refund-reference">Reference</Label>
                <Input
                  id="refund-reference"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder="Transfer / receipt number"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="refund-status">State</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger id="refund-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REFUND_STATUSES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-lg border bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                This records a refund by hand. No payment provider is connected, so nothing here moves money — it keeps
                the studio&apos;s own ledger honest.
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              <Undo2 className="size-4" />
              Record refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Record {formatMoney(numericAmount || 0, order.currency)} as refunded?</AlertDialogTitle>
            <AlertDialogDescription>
              {order.canonical_id} · {order.unit_reference || 'order'}. This is permanent, carries your name and the
              time, and can never exceed what was sold.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Back</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); void record() }} disabled={saving}>
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Confirm refund
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
