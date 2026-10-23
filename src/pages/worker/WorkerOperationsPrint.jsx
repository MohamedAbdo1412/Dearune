import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  FileSpreadsheet,
  FileText,
  Loader2,
  Printer,
  RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import { qrContent } from '@/services/qr'
import { buildQrPaperPdf, formatProductionDate } from '@/services/qrPaper'
import { bostaFilename, buildBostaWorkbook } from '@/services/bosta'
import { reviewBatch } from '@/services/operationsReview'
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
import { fetchWorkerOperationsForPrint } from '@/services/workerOperations'

// Worker-side production papers.
//
// The review rules, the paper builder and the Bosta workbook are the same pure
// modules the admin screen uses. The only difference is the data boundary: rows
// arrive from `worker_operations_print`, which is gated by `operations.view` and
// `operations.print`, returns an explicit field list, and never exposes money or
// the letter payload. Nothing is written or archived from this screen.

const messageOf = (error) => (error instanceof Error ? error.message : 'Something went wrong')

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

export function WorkerOperationsPrint() {
  const [params] = useSearchParams()
  const ids = useMemo(
    () =>
      (params.get('ids') ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    [params],
  )

  const [rows, setRows] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [activeId, setActiveId] = useState('')
  const [dateLabel, setDateLabel] = useState(() => formatProductionDate(new Date()))
  const [busy, setBusy] = useState(null)
  const [confirming, setConfirming] = useState(null)
  const [outcome, setOutcome] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const previewRef = useRef(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const data = await fetchWorkerOperationsForPrint(ids.length > 0 ? ids : null)
        if (!active) return
        setRows(data)
        setActiveId(data[0]?.id ?? '')
      } catch (caught) {
        if (active) setLoadError(messageOf(caught))
      }
    })()
    return () => {
      active = false
    }
  }, [ids])

  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    },
    [],
  )

  const selected = useMemo(() => rows ?? [], [rows])
  const review = useMemo(() => reviewBatch(selected), [selected])
  const active = selected.find((row) => row.id === activeId) ?? selected[0] ?? null
  const activeItem = review.items.find((item) => item.operation.id === active?.id) ?? null
  const activeCheck = activeItem?.check ?? null

  const reviewKey = review.items
    .map((item) => `${item.operation.id}:${item.operation.customerPhone}:${item.operation.designerName}`)
    .join('|')

  useEffect(() => {
    if (review.items.length === 0) {
      setPreviewUrl(null)
      setPreviewError('')
      return undefined
    }
    let cancelled = false
    setPreviewBusy(true)
    setPreviewError('')
    const timer = window.setTimeout(async () => {
      try {
        const operations = review.items.map((item) => item.merged)
        const { bytes } = await buildQrPaperPdf(operations, { dateLabel, requireValid: false })
        if (cancelled) return
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
        if (previewRef.current) URL.revokeObjectURL(previewRef.current)
        previewRef.current = url
        setPreviewUrl(url)
      } catch (caught) {
        if (!cancelled) {
          setPreviewUrl(null)
          setPreviewError(messageOf(caught))
        }
      } finally {
        if (!cancelled) setPreviewBusy(false)
      }
    }, 350)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [dateLabel, reviewKey, review.items])

  const confirmPapers = async () => {
    setConfirming(null)
    setBusy('pdf')
    setOutcome(null)
    try {
      const operations = review.items.map((item) => item.merged)
      const { bytes, pageCount, items } = await buildQrPaperPdf(operations, { dateLabel })
      const filename = productionFilename(operations.length)
      download(bytes, filename, 'application/pdf')
      setOutcome({ kind: 'pdf', filename, pageCount, items, count: operations.length })
      toast.success(
        `${pageCount} pages produced for ${operations.length} ${operations.length === 1 ? 'unit' : 'units'}`,
      )
    } catch (caught) {
      toast.error(messageOf(caught))
    } finally {
      setBusy(null)
    }
  }

  const exportBosta = async () => {
    setConfirming(null)
    setBusy('bosta')
    setOutcome(null)
    try {
      const operations = review.items.map((item) => item.merged)
      const { bytes, filename, issues } = await buildBostaWorkbook(operations)
      download(
        bytes,
        filename || bostaFilename(),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      setOutcome({ kind: 'bosta', filename, issues, count: operations.length })
      toast.success(`${operations.length} ${operations.length === 1 ? 'order' : 'orders'} exported`)
    } catch (caught) {
      toast.error(messageOf(caught))
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
          <Loader2 className="size-4 animate-spin" aria-hidden />
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
            written or archived from this screen
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setConfirming('bosta')} disabled={busy !== null}>
            {busy === 'bosta' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileSpreadsheet className="size-4" aria-hidden />}
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
            {busy === 'pdf' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Printer className="size-4" aria-hidden />}
            Confirm &amp; produce
          </Button>
        </div>
      </div>

      {review.blocked.length > 0 || review.warned.length > 0 ? (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm">
          {review.blocked.length > 0 ? (
            <p className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
              <span>
                {review.blocked.length} {review.blocked.length === 1 ? 'unit is' : 'units are'} missing something
                required: {review.blocked.map((item) => item.operation.reference).join(', ')}
              </span>
            </p>
          ) : null}
          {review.warned.length > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {review.warned.length} {review.warned.length === 1 ? 'unit' : 'units'} can be printed, but with a
              caveat — select it to see what.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
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
                className={`flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors ${
                  item.operation.id === active?.id ? 'border-primary/50 bg-primary/10' : 'hover:bg-muted/60'
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
                  {item.check.ok ? (
                    <Check className="size-4 text-emerald-600" aria-hidden />
                  ) : (
                    <AlertTriangle className="size-4 text-amber-600" aria-hidden />
                  )}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {activeItem ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span className="font-mono">{activeItem.operation.reference}</span>
                  <span className="text-muted-foreground">Sold as</span>
                  <span className="font-mono">{activeItem.operation.soldAs}</span>
                  <OperationsBadge status={activeItem.operation.status} />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Customer</dt>
                    <dd className="mt-1">{activeItem.merged.recipientName || '—'}</dd>
                    <dd className="text-xs text-muted-foreground">{activeItem.merged.customerPhone || 'No number'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Designer</dt>
                    <dd className="mt-1">{activeItem.merged.designerName || '—'}</dd>
                    <dd className="text-xs text-muted-foreground">{activeItem.merged.designerCode || '—'}</dd>
                  </div>
                </dl>

                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-56 flex-1">
                    <Label htmlFor="worker-draft-date">Date &amp; time printed on the paper</Label>
                    <Input
                      id="worker-draft-date"
                      value={dateLabel}
                      onChange={(event) => setDateLabel(event.target.value)}
                      className="mt-1"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      This is the moment of printing, not stored data — set for the whole batch.
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setDateLabel(formatProductionDate(new Date()))}>
                    <RotateCcw className="size-4" aria-hidden />
                    Now
                  </Button>
                </div>

                {activeCheck ? (
                  <div className="space-y-1 text-sm">
                    {activeCheck.errors.map((error) => (
                      <p key={error} className="flex items-start gap-2 text-destructive">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                        {error}
                      </p>
                    ))}
                    {activeCheck.warnings.map((warning) => (
                      <p key={warning} className="flex items-start gap-2 text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                        {warning}
                      </p>
                    ))}
                    {activeCheck.ok && activeCheck.warnings.length === 0 ? (
                      <p className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                        <Check className="size-4" aria-hidden />
                        Ready to print.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="rounded-xl border bg-muted/40 px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">This QR opens</p>
                  <p className="break-all font-mono text-xs">{qrContent(activeItem.merged)}</p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardContent className="space-y-2 py-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {previewBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Front then back — the real paper, with this unit's own values.
              </div>
              {previewError ? <p className="text-sm text-destructive">{previewError}</p> : null}
              {previewUrl ? (
                <iframe title="Paper preview" src={previewUrl} className="h-[72vh] w-full rounded-xl border bg-white" />
              ) : null}
              {!previewUrl && !previewError ? (
                <div className="flex h-40 items-center justify-center rounded-xl border bg-muted/40 text-sm text-muted-foreground">
                  Building the preview…
                </div>
              ) : null}
            </CardContent>
          </Card>

          {outcome?.kind === 'pdf' ? (
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
          ) : null}

          {outcome?.kind === 'bosta' ? (
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
          ) : null}
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
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
              The id, the Sold As code, the Designer, the customer number and the date will be exactly as reviewed.
            </p>
            <p className="flex items-start gap-2 text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
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
              <FileText className="size-4" aria-hidden />
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
      <Link to="/worker/operations">
        <ArrowLeft className="size-4" aria-hidden />
        Back to Operations
      </Link>
    </Button>
  )
}
