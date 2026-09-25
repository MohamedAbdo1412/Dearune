import { useState } from 'react'
import { Archive, ArchiveRestore, CircleDollarSign, Hammer, Loader2Icon, Lock, LockOpen, PackageCheck, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { archiveDearune, correctSale, correctStep, recordSale, restoreDearune, setDearuneActive, stampDearune } from '@/services/dearunes'
import { isDigital, nextDearuneAction, WRAPPER_LABELS, WRAPPER_TYPES } from '@/services/constants'
import { formatMoney } from '@/services/format'

// Every button that changes a Dearune's state, in one place, so the rules
// read the same whether the admin is looking at a designer's shelf, a
// designer's page, or the Dearune itself:
//
//   * forward actions are disabled while the studio is in maintenance;
//   * corrections (sale / step) only exist while it is ON, because the
//     database only accepts them then;
//   * an unsold Dearune cannot be made, shipped, arrived or opened — the
//     server says so too; the UI just gets there first.
//
// `onChanged` re-reads the record after any successful action.

const STEP_ICONS = { made: Hammer, shipped: Truck, arrived: PackageCheck }

export function DearuneActions({ project, maintenance = false, onChanged, detail = false, catalog = null }) {
  const [saleFor, setSaleFor] = useState(null)
  const [reasonFor, setReasonFor] = useState(null)
  const [busy, setBusy] = useState(false)
  const [saleForm, setSaleForm] = useState({ wrapperType: '', price: '', cost: '' })
  const [reason, setReason] = useState('')

  const changed = () => onChanged?.()

  const run = async (promise, done) => {
    setBusy(true)
    try {
      const result = await promise
      toast.success(done)
      changed()
      return result
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That step could not be saved')
      return null
    } finally {
      setBusy(false)
    }
  }

  // -- Sale dialog ----------------------------------------------------------
  const pricingRow = () => {
    if (!catalog?.pricing || !saleFor) return null
    const template = catalog.templates.find((t) => t.slug === saleFor.template_slug)
    if (!template) return null
    return catalog.pricing.find((p) => p.template_id === template.id && p.wrapper_type === saleForm.wrapperType) ?? null
  }

  const openSale = (p) => {
    setSaleForm({
      wrapperType: p.wrapper_type ?? '',
      price: '',
      cost: '',
    })
    setSaleFor(p)
  }

  const submitSale = async () => {
    const payload = {
      wrapperType: saleForm.wrapperType || null,
      sellingPrice: saleForm.price.trim() === '' ? null : Number(saleForm.price),
      estimatedCost: saleForm.cost.trim() === '' ? null : Number(saleForm.cost),
    }
    if (payload.sellingPrice !== null && !Number.isFinite(payload.sellingPrice)) {
      toast.error('Enter the price as a number')
      return
    }
    if (payload.estimatedCost !== null && !Number.isFinite(payload.estimatedCost)) {
      toast.error('Enter the cost as a number')
      return
    }
    const target = saleFor
    setSaleFor(null)
    await run(recordSale(target.id, payload), 'Sale recorded in Sold Logs')
  }

  // -- Reason dialog --------------------------------------------------------
  const askReason = (p, field, label) => {
    setReason('')
    setReasonFor({ project: p, field, label })
  }

  const submitReason = async () => {
    if (!reason.trim()) {
      toast.error('A reason is required — this is an audit trail')
      return
    }
    const { project: p, field, label } = reasonFor
    setReasonFor(null)
    if (field) await run(correctStep(p.id, field, reason.trim()), `${label} corrected`)
    else await run(correctSale(p.id, reason.trim()), 'Sale voided — the ledger keeps the original entry')
  }

  // -- Primary row action ---------------------------------------------------
  const primary = nextDearuneAction(project)
  // Restore is the one forward-looking action maintenance allows: the studio
  // is paused, but bringing a Dearune back from the shelf is housekeeping.
  const blocked = maintenance && primary !== 'restore'
  const primaryButton = (label, onClick, icon) => (
    <Button size="sm" variant="outline" disabled={busy || blocked} onClick={onClick} title={blocked ? 'Maintenance mode is on — the studio is paused' : undefined}>
      {icon}
      {label}
    </Button>
  )

  const rowAction = () => {
    if (primary === 'sale') return primaryButton('Record sale', () => openSale(project), <CircleDollarSign className="size-4" />)
    if (primary === 'open') return primaryButton('Open message', () => run(setDearuneActive(project.id, true), 'Message opened'), <LockOpen className="size-4" />)
    if (primary === 'restore') return primaryButton('Restore', () => run(restoreDearune(project.id), 'Dearune restored'), <ArchiveRestore className="size-4" />)
    if (primary && STEP_ICONS[primary]) {
      const Icon = STEP_ICONS[primary]
      const labels = { made: 'Mark made', shipped: 'Mark shipped', arrived: 'Mark arrived' }
      return primaryButton(labels[primary], () => run(stampDearune(project.id, `${primary}_at`), `${labels[primary]} — recorded`), <Icon className="size-4" />)
    }
    if (project.message_active && primary === null && !isDigital(project) && project.arrived_at) {
      // Closing is a shut-down, not a studio step: maintenance never blocks it
      // (the server allows it too, and the detail set works the same way).
      return (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => run(setDearuneActive(project.id, false), 'Message closed')}>
          <Lock className="size-4" /> Close message
        </Button>
      )
    }
    return null
  }

  if (!detail) {
    return (
      <>
        {rowAction()}
        <SaleDialog
          open={saleFor !== null}
          project={saleFor}
          form={saleForm}
          setForm={setSaleForm}
          pricingRow={saleForm.wrapperType ? pricingRow() : null}
          onClose={() => setSaleFor(null)}
          onSubmit={submitSale}
          busy={busy}
        />
        <ReasonDialog
          open={reasonFor !== null}
          target={reasonFor}
          value={reason}
          setValue={setReason}
          onClose={() => setReasonFor(null)}
          onSubmit={submitReason}
        />
      </>
    )
  }

  // -- Detail set: everything this Dearune can still do ---------------------
  const sold = Boolean(project.paid_at)
  const physical = sold && !isDigital(project)

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!sold && (
        <Button size="sm" disabled={busy || maintenance} onClick={() => openSale(project)} title={maintenance ? 'Maintenance mode is on — new sales are paused' : undefined}>
          <CircleDollarSign className="size-4" /> Record sale
        </Button>
      )}

      {physical && (
        <>
          {!project.manufactured_at && (
            <Button size="sm" disabled={busy || maintenance} onClick={() => run(stampDearune(project.id, 'manufactured_at'), 'Marked made')} title={maintenance ? 'Maintenance mode is on — production is paused' : undefined}>
              <Hammer className="size-4" /> Mark made
            </Button>
          )}
          {!project.shipped_at && project.manufactured_at && (
            <Button size="sm" disabled={busy || maintenance} onClick={() => run(stampDearune(project.id, 'shipped_at'), 'Marked shipped')} title={maintenance ? 'Maintenance mode is on — production is paused' : undefined}>
              <Truck className="size-4" /> Mark shipped
            </Button>
          )}
          {!project.arrived_at && project.shipped_at && (
            <Button size="sm" disabled={busy || maintenance} onClick={() => run(stampDearune(project.id, 'arrived_at'), 'Marked arrived')} title={maintenance ? 'Maintenance mode is on — production is paused' : undefined}>
              <PackageCheck className="size-4" /> Mark arrived
            </Button>
          )}
        </>
      )}

      {sold && (
        project.message_active ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(setDearuneActive(project.id, false), 'Message closed')}>
            <Lock className="size-4" /> Close message
          </Button>
        ) : (
          <Button size="sm" disabled={busy || maintenance} onClick={() => run(setDearuneActive(project.id, true), 'Message opened')} title={maintenance ? 'Maintenance mode is on — messages cannot be opened' : undefined}>
            <LockOpen className="size-4" /> Open message
          </Button>
        )
      )}

      {maintenance && sold && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => askReason(project, null, 'Sale')}>
          Correct sale…
        </Button>
      )}
      {maintenance && physical && project.arrived_at && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => askReason(project, 'arrived_at', 'Arrived')}>
          Correct arrived…
        </Button>
      )}
      {maintenance && physical && project.shipped_at && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => askReason(project, 'shipped_at', 'Shipped')}>
          Correct shipped…
        </Button>
      )}
      {maintenance && physical && project.manufactured_at && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => askReason(project, 'manufactured_at', 'Made')}>
          Correct made…
        </Button>
      )}

      {!project.archived_at ? (
        <Button size="sm" variant="ghost" disabled={busy || maintenance} onClick={() => run(archiveDearune(project.id), 'Dearune archived')} title={maintenance ? 'Maintenance mode is on — the studio is paused' : undefined}>
          <Archive className="size-4" /> Archive
        </Button>
      ) : (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(restoreDearune(project.id), 'Dearune restored')}>
          <ArchiveRestore className="size-4" /> Restore
        </Button>
      )}

      <SaleDialog
        open={saleFor !== null}
        project={saleFor}
        form={saleForm}
        setForm={setSaleForm}
        pricingRow={saleForm.wrapperType ? pricingRow() : null}
        onClose={() => setSaleFor(null)}
        onSubmit={submitSale}
        busy={busy}
      />
      <ReasonDialog
        open={reasonFor !== null}
        target={reasonFor}
        value={reason}
        setValue={setReason}
        onClose={() => setReasonFor(null)}
        onSubmit={submitReason}
      />
    </div>
  )
}

// What this Dearune physically is + what it sold for. The wrapper decides the
// price (one pricing row per paper + wrapper), so the ledger snapshot starts
// here. `pricingRow` is the already-looked-up row (or null when the paper has
// no price for the chosen wrapper) — never a function.
function SaleDialog({ open, project, form, setForm, pricingRow, onClose, onSubmit, busy }) {
  const suggested = pricingRow
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Record the sale</DialogTitle>
          <DialogDescription>
            {project?.reference ? `${project.reference} · ` : ''}Paid = Sold. The price and cost are snapshotted into Sold Logs and never change again.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>What is this Dearune?</Label>
            <Select value={form.wrapperType || undefined} onValueChange={(v) => setForm({ ...form, wrapperType: v })}>
              <SelectTrigger><SelectValue placeholder="Choose a wrapper" /></SelectTrigger>
              <SelectContent>
                {WRAPPER_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>{WRAPPER_LABELS[type]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sale-price">Selling price</Label>
              <Input id="sale-price" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder={suggested ? String(suggested.price) : '0.00'} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sale-cost">Cost estimate</Label>
              <Input id="sale-cost" inputMode="decimal" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder={suggested ? String(suggested.cost ?? 0) : '0.00'} />
            </div>
          </div>

          {form.wrapperType && (
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                {suggested ? 'Listed price' : 'No listed price for this wrapper'}
              </span>
              <span className="tabular-nums font-medium">{suggested ? formatMoney(suggested.price, 'EGP') : 'type one'}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void onSubmit()} disabled={busy || !form.wrapperType}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : <CircleDollarSign className="size-4" />}
            Record sale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Corrections live in the audit trail: no reason, no change.
function ReasonDialog({ open, target, value, setValue, onClose, onSubmit }) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Correct {target?.label?.toLowerCase() ?? 'this'}…</DialogTitle>
          <DialogDescription>
            Maintenance mode is on, so this correction is allowed. The reason is stored with the record — nothing is deleted.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reason">Why?</Label>
          <Textarea id="reason" className="min-h-[70px]" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Wrong price entered, order cancelled, stamped by mistake…" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void onSubmit()}>Apply correction</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
