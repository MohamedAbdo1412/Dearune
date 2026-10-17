import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  FileSpreadsheet,
  FileText,
  Loader2Icon,
  Printer,
  RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import { qrContent } from '@/services/qr'
import { formatProductionDate, buildQrPaperPdf, buildQrPaperPreview } from '@/services/qrPaper'
import { bostaFilename, buildBostaWorkbook } from '@/services/bosta'
import { fetchOperations, updateOperationContact, updateOperationDesigner } from '@/services/operations'
import { reviewBatch } from '@/services/operationsReview'
import { OPERATIONS_STATUS_LABELS } from '@/services/constants'
import { OperationsBadge } from '@/components/admin/operations-status'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// The review step before anything is produced.
//
// Nothing here is written until the studio presses "Confirm" — the edits sit in
// memory while they move between units, so a half-filled form is never lost by
// clicking the next row. On confirmation the edits are saved against their real
// owners first; only then is the batch built. If any step fails the whole batch
// stays on screen, nothing is downloaded, and nothing is archived.
const messageOf = (err) => (err instanceof Error ? err.message : 'Something went wrong')

const download = (bytes, filename, mime) => {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 5000)
}

const productionFilename = (count) =>
  `Dearune-Production-Papers-${new Date().toISOString().slice(0, 10)}-${count}units.pdf`

// Default-exported on purpose: this page is loaded with `lazy()` in App.jsx,
// and React resolves a lazy component from the module's `default` export.
export default function OperationsPrint() {
  const [params] = useSearchParams()
  const ids = useMemo(
    () => (params.get('ids') ?? '').split(',').map((id) => id.trim()).filter(Boolean),
    [params],
  )

  const [rows, setRows] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [activeId, setActiveId] = useState(null)
  const [dateLabel, setDateLabel] = useState(() => formatProductionDate(new Date()))
  const [busy, setBusy] = useState(null)
  const [confirming, setConfirming] = useState(null)
  const [outcome, setOutcome] = useState(null)

  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [previewError, setPreviewError] = useState(null)
  const previewRef = useRef(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const all = await fetchOperations({ includeArchived: true })
        if (!active) return
        const wanted = all.filter((row) => ids.includes(row.id))
        setRows(wanted)
        setActiveId(wanted[0]?.id ?? null)
      } catch (err) {
        if (active) setLoadError(messageOf(err))
      }
    })()
    return () => {
      active = false
    }
  }, [ids])

  // A generated preview is a blob; drop it when the screen goes away.
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    },
    [],
  )

  // Keep the loaded rows as a stable list so the batch is only re-judged when
  // the rows or the drafts actually change.
  const selected = useMemo(() => rows ?? [], [rows])

  // The batch, judged as a whole: every item with its merged values and its
  // verdict, plus the split between printable and blocked.
  const review = useMemo(() => reviewBatch(selected, drafts), [selected, drafts])

  // The live preview is generated on a timer, so it reads the latest verdict
  // from a ref rather than closing over a stale one.
  const reviewRef = useRef(review)
  useEffect(() => {
    reviewRef.current = review
  })

  const active = selected.find((row) => row.id === activeId) ?? selected[0] ?? null
  const activeKey = active?.id ?? ''
  const activeItem = review.items.find((item) => item.operation.id === activeKey) ?? null
  const activeCheck = activeItem?.check ?? null
  const activeDraft = activeItem?.merged ?? active
  const draftKey = JSON.stringify(drafts[activeKey] ?? {})
  const draftCount = Object.keys(drafts).length

  // A live preview of the real paper, built from the exact values the PDF will
  // use — including this unit's own QR destination.
  useEffect(() => {
    if (!activeKey) {
      setPreviewUrl(null)
      setPreviewError(null)
      return undefined
    }
    let cancelled = false
    setPreviewBusy(true)
    setPreviewError(null)
    const timer = window.setTimeout(async () => {
      try {
        const item = reviewRef.current.items.find((entry) => entry.operation.id === activeKey)
        if (!item) return
        const { bytes } = await buildQrPaperPreview(item.merged, { dateLabel })
        if (cancelled) return
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
        if (previewRef.current) URL.revokeObjectURL(previewRef.current)
        previewRef.current = url
        setPreviewUrl(url)
      } catch (err) {
        if (!cancelled) {
          setPreviewUrl(null)
          setPreviewError(messageOf(err))
        }
      } finally {
        if (!cancelled) setPreviewBusy(false)
      }
    }, 350)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [activeKey, dateLabel, draftKey])

  const setDraftField = (id, field, value) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [field]: value } }))
  }

  // Bound to whichever unit is in front, so a field can never be written to a
  // row that is no longer selected.
  const draftField = (field) => (event) => {
    if (!active) return
    setDraftField(active.id, field, event.target.value)
  }

  const discardDraft = (id) => {
    setDrafts((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    toast.info('Reverted to what is on file')
  }

  // Edits are written to the entity that actually owns each field, so the
  // paper, the manifest and the Dearune can never disagree afterwards.
  const persistEdits = async () => {
    for (const item of review.items) {
      const { operation, draft, changedFields } = item
      if (!draft || changedFields.length === 0) continue
      if (changedFields.includes('customerPhone')) {
        await updateOperationContact(operation.projectId, draft.customerPhone ?? '')
      }
      if (changedFields.includes('designerName') || changedFields.includes('designerCode')) {
        await updateOperationDesigner(operation.projectId, {
          designerName: draft.designerName ?? operation.designerName,
          designerCode: draft.designerCode ?? operation.designerCode,
        })
      }
    }
  }

  const confirmPapers = async () => {
    setConfirming(null)
    setBusy('pdf')
    setOutcome(null)
    try {
      await persistEdits()
      const operations = review.items.map((item) => item.merged)
      const { bytes, pageCount, items } = await buildQrPaperPdf(operations, { dateLabel })
      const filename = productionFilename(operations.length)
      download(bytes, filename, 'application/pdf')
      setOutcome({ kind: 'pdf', filename, pageCount, items, count: operations.length })
      toast.success(
        `${pageCount} pages produced for ${operations.length} ${operations.length === 1 ? 'unit' : 'units'}`,
      )
    } catch (err) {
      // Nothing is claimed and nothing is archived: the batch is exactly where
      // it was and can be tried again.
      toast.error(messageOf(err))
    } finally {
      setBusy(null)
    }
  }

  const exportBosta = async () => {
    setConfirming(null)
    setBusy('bosta')
    setOutcome(null)
    try {
      await persistEdits()
      const operations = review.items.map((item) => item.merged)
      const { bytes, filename, issues } = await buildBostaWorkbook(operations)
      download(
        bytes,
        filename || bostaFilename(),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      setOutcome({ kind: 'bosta', filename, issues, count: operations.length })
      toast.success(`${operations.length} ${operations.length === 1 ? 'order' : 'orders'} exported`)
    } catch (err) {
      toast.error(messageOf(err))
    } finally {
      setBusy(null)
    }
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <BackLink />
        <p className="text-sm text-destructive">{loadError}</p>
      </div>
    )
  }

  if (rows === null) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          Loading the selected units…
        </div>
      </div>
    )
  }

  if (selected.length === 0) {
    return (
      <div className="space-y-4">
        <BackLink />
        <p className="text-sm text-muted-foreground">
          Nothing was selected. Choose units on the Operations screen and press “Print papers”.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <BackLink />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl">Review before printing</h1>
          <p className="text-sm text-muted-foreground">
            {selected.length} {selected.length === 1 ? 'unit' : 'units'} · exactly 2 A4 pages each · nothing is
            written or archived until you confirm
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setConfirming('bosta')} disabled={busy !== null}>
            {busy === 'bosta' ? <Loader2Icon className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
            Bosta manifest
          </Button>
          <Button
            size="sm"
            onClick={() => setConfirming('pdf')}
            disabled={busy !== null || review.blocked.length > 0}
            title={
              review.blocked.length > 0 ? `${review.blocked.length} unit(s) cannot be printed yet` : undefined
            }
          >
            {busy === 'pdf' ? <Loader2Icon className="size-4 animate-spin" /> : <Printer className="size-4" />}
            Confirm &amp; produce
          </Button>
        </div>
      </div>

      {(review.blocked.length > 0 || review.warned.length > 0) && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm">
          {review.blocked.length > 0 && (
            <p className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" />
              <span>
                {review.blocked.length} {review.blocked.length === 1 ? 'unit is' : 'units are'} missing something
                required: {review.blocked.map((item) => item.operation.reference).join(', ')}
              </span>
            </p>
          )}
          {review.warned.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {review.warned.length} {review.warned.length === 1 ? 'unit' : 'units'} can be printed, but with a
              caveat — select it to see what.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
        {/* the batch, in the order it will be printed */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">The batch</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {review.items.map((item, index) => (
              <button
                key={item.operation.id}
                type="button"
                onClick={() => setActiveId(item.operation.id)}
                className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                  item.operation.id === activeKey ? 'border-primary/50 bg-secondary' : 'hover:bg-muted/60'
                }`}
              >
                <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">{index + 1}.</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-sm">{item.operation.reference}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.merged.recipientName || 'no customer name'}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {item.edited && <span className="size-1.5 rounded-full bg-amber-500" title="Edited" />}
                  {item.check.ok ? (
                    <Check className="size-4 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="size-4 text-amber-600" />
                  )}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* the unit in front of you */}
        <div className="space-y-4">
          {activeItem && (
            <Card>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span className="font-mono">{activeItem.operation.reference}</span>
                  <span className="text-muted-foreground">Sold as</span>
                  <span className="font-mono">{activeItem.operation.soldAs}</span>
                  <OperationsBadge
                    status={activeItem.operation.status}
                    label={OPERATIONS_STATUS_LABELS[activeItem.operation.status]}
                  />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="draft-customer">Customer number</Label>
                    <Input
                      id="draft-customer"
                      value={activeDraft?.customerPhone ?? ''}
                      onChange={draftField('customerPhone')}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="draft-designer">Designer name</Label>
                    <Input
                      id="draft-designer"
                      value={activeDraft?.designerName ?? ''}
                      onChange={draftField('designerName')}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="draft-designer-id">Designer ID</Label>
                    <Input
                      id="draft-designer-id"
                      value={activeDraft?.designerCode ?? ''}
                      onChange={draftField('designerCode')}
                      className="mt-1"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-56 flex-1">
                    <Label htmlFor="draft-date">Date &amp; time printed on the paper</Label>
                    <Input
                      id="draft-date"
                      value={dateLabel}
                      onChange={(e) => setDateLabel(e.target.value)}
                      className="mt-1"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      This is the moment of printing, not stored data — set for the whole batch.
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setDateLabel(formatProductionDate(new Date()))}>
                    <RotateCcw className="size-4" />
                    Now
                  </Button>
                  {activeItem.edited && (
                    <Button variant="outline" size="sm" onClick={() => discardDraft(activeKey)}>
                      Discard edits
                    </Button>
                  )}
                </div>

                {activeCheck && (
                  <div className="space-y-1 text-sm">
                    {activeCheck.errors.map((error) => (
                      <p key={error} className="flex items-start gap-2 text-destructive">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                        {error}
                      </p>
                    ))}
                    {activeCheck.warnings.map((warning) => (
                      <p key={warning} className="flex items-start gap-2 text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                        {warning}
                      </p>
                    ))}
                    {activeCheck.ok && activeCheck.warnings.length === 0 && (
                      <p className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                        <Check className="size-4" />
                        Ready to print.
                      </p>
                    )}
                  </div>
                )}

                {activeDraft && (
                  <div className="rounded-lg border bg-muted/40 px-3 py-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">This QR opens</p>
                    <p className="break-all font-mono text-xs">{qrContent(activeDraft)}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="space-y-2 py-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {previewBusy && <Loader2Icon className="size-4 animate-spin" />}
                Front then back — the real paper, with this unit's own values.
              </div>
              {previewError && <p className="text-sm text-destructive">{previewError}</p>}
              {previewUrl && (
                <iframe title="Paper preview" src={previewUrl} className="h-[72vh] w-full rounded-lg border bg-white" />
              )}
              {!previewUrl && !previewError && (
                <div className="flex h-40 items-center justify-center rounded-lg border bg-muted/40 text-sm text-muted-foreground">
                  Building the preview…
                </div>
              )}
            </CardContent>
          </Card>

          {outcome?.kind === 'pdf' && (
            <Card>
              <CardContent className="space-y-2 py-4">
                <p className="text-sm font-medium">Produced {outcome.filename}</p>
                <ul className="space-y-1">
                  {outcome.items.map((item, index) => (
                    <li key={item.id} className="text-xs text-muted-foreground">
                      <span className="font-mono text-foreground">{item.reference}</span>
                      {' · '}pages {index * 2 + 1}–{index * 2 + 2}
                      {' · '}QR → <span className="font-mono">{item.qrContent}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {outcome?.kind === 'bosta' && (
            <Card>
              <CardContent className="space-y-2 py-4">
                <p className="text-sm font-medium">
                  Exported {outcome.filename} · {outcome.count} {outcome.count === 1 ? 'order' : 'orders'}
                </p>
                {outcome.issues?.length > 0 ? (
                  <>
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      Bosta may reject these — fields are missing on file:
                    </p>
                    <ul className="space-y-1">
                      {outcome.issues.map((issue) => (
                        <li key={issue.reference} className="text-xs text-muted-foreground">
                          <span className="font-mono text-foreground">{issue.reference}</span>
                          {': '}
                          {issue.issues.join('; ')}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-sm text-emerald-700 dark:text-emerald-400">
                    Every required field was on file — nothing was invented.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">
              {confirming === 'bosta' ? 'Export the Bosta manifest' : 'Produce the papers'}
            </DialogTitle>
            <DialogDescription>
              {confirming === 'bosta'
                ? `A Bosta-ready workbook for ${selected.length} ${selected.length === 1 ? 'order' : 'orders'}, built from Bosta's own template.`
                : `${selected.length * 2} A4 pages — the front and back of each of ${selected.length} ${selected.length === 1 ? 'unit' : 'units'}, in the order listed.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              The id, the Sold As code, the Designer, the customer number and the date will be exactly as reviewed.
            </p>
            {draftCount > 0 && (
              <p className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                Your {draftCount} edited {draftCount === 1 ? 'unit' : 'units'} will be saved before the file is
                built.
              </p>
            )}
            <p className="flex items-start gap-2 text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              Nothing is archived here. Archiving stays a separate, deliberate step on the Operations screen.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              Go back
            </Button>
            <Button
              onClick={() => {
                if (confirming === 'bosta') void exportBosta()
                else void confirmPapers()
              }}
            >
              <FileText className="size-4" />
              {confirming === 'bosta' ? 'Export manifest' : `Produce ${selected.length * 2} pages`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function BackLink() {
  return (
    <Button asChild size="sm" variant="ghost" className="-ml-2">
      <Link to="/admin/operations">
        <ArrowLeft className="size-4" />
        Back to Operations
      </Link>
    </Button>
  )
}
