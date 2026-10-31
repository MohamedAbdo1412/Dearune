import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2Icon, Upload } from 'lucide-react'
import { toast } from 'sonner'
import {
  CARRIERS,
  MANIFEST_STATUS_LABELS,
  carrierSupportsManifest,
  readManifestFile,
  summarizeManifest,
} from '@/services/carriers'
import { commitManifest, previewManifest, resolveOrderReference } from '@/services/ops-orders'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

const messageOf = (err) => (err instanceof Error ? err.message : 'Something went wrong')

const STATUS_VARIANT = {
  matched: 'default',
  already_shipped: 'secondary',
  unmatched: 'outline',
  ambiguous: 'outline',
  duplicate: 'destructive',
  conflict: 'destructive',
  blocked: 'outline',
  invalid: 'destructive',
  shipped: 'default',
  failed: 'destructive',
}

const RESOLVABLE = new Set(['unmatched', 'ambiguous'])

// A carrier manifest is a human document. It is read, matched and PREVIEWED
// before anything is written, the original rows are snapshotted for audit, and
// a row that cannot be settled by its identifiers is resolved by hand — never
// by customer name, and never by silently overwriting an existing shipment.

export function ManifestImportDialog({ open, onOpenChange, onImported }) {
  const [carrier, setCarrier] = useState('egypt_post')
  const [file, setFile] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [preview, setPreview] = useState(null)
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(null)
  const [decisions, setDecisions] = useState({})
  const [typing, setTyping] = useState({})

  const reset = () => {
    setFile(null)
    setParsed(null)
    setPreview(null)
    setResults(null)
    setBusy(null)
    setDecisions({})
    setTyping({})
  }

  const supported = carrierSupportsManifest(carrier)
  const summary = useMemo(() => (preview ? summarizeManifest(preview.rows) : null), [preview])

  const handleFile = async (picked) => {
    if (!picked) return
    setFile(picked)
    setPreview(null)
    setResults(null)
    setDecisions({})
    setBusy('read')
    try {
      const workbook = await readManifestFile(picked, carrier)
      setParsed(workbook)
      if (workbook.rows.length === 0) {
        toast.error('That workbook has no shipment rows')
        setBusy(null)
        return
      }
      setBusy('preview')
      const rows = workbook.rows.map((row) => ({ ...row, governorate: row.city }))
      const response = await previewManifest({
        carrier,
        filename: workbook.filename ?? picked.name,
        sheet: workbook.sheetName,
        rows,
      })
      setPreview({ ...response, rows: response.rows, source: rows })
    } catch (err) {
      toast.error(messageOf(err))
    } finally {
      setBusy(null)
    }
  }

  const resolveRow = async (line) => {
    const typed = typing[line] ?? ''
    if (!typed.trim()) {
      toast.error('Type a Dearune ID, Unit ID or Sold As reference')
      return
    }
    setBusy(`resolve-${line}`)
    try {
      const found = await resolveOrderReference(typed)
      if (!found) {
        toast.error(`${typed} does not belong to any order`)
        return
      }
      if (!['shipping', 'delivery', 'delivered', 'after_sale'].includes(found.milestone)) {
        toast.error(`${found.canonicalId ?? typed} is in ${found.milestone ?? 'no milestone'} — it cannot be shipped yet`)
        return
      }
      setDecisions((prev) => ({ ...prev, [line]: found }))
      toast.success(`Line ${line} will ship ${found.canonicalId ?? typed}`)
    } catch (err) {
      toast.error(messageOf(err))
    } finally {
      setBusy(null)
    }
  }

  const commit = async () => {
    if (!preview) return
    setBusy('commit')
    try {
      const decisionPayload = Object.fromEntries(
        Object.entries(decisions).map(([line, found]) => [line, found.projectId]),
      )
      const response = await commitManifest({
        carrier,
        filename: parsed?.filename ?? file?.name,
        sheet: parsed?.sheetName,
        rows: (preview.source ?? []).map((row) => ({ ...row, governorate: row.city })),
        decisions: decisionPayload,
      })
      setResults(response)
      toast.success(
        response.summary?.failed
          ? `${response.summary.shipped} shipped, ${response.summary.failed} could not be`
          : `${response.summary?.shipped ?? 0} order${response.summary?.shipped === 1 ? '' : 's'} marked shipped`,
      )
      onImported?.()
    } catch (err) {
      toast.error(messageOf(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Import a carrier manifest</DialogTitle>
          <DialogDescription>
            Egypt Post returns a filled-in manifest. Nothing is written until the preview is confirmed, and a row that
            cannot be matched by its identifiers is left for you to resolve.
          </DialogDescription>
        </DialogHeader>

        {!results ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
              <div className="space-y-1.5">
                <Label htmlFor="manifest-carrier">Carrier</Label>
                <Select
                  value={carrier}
                  onValueChange={(next) => {
                    setCarrier(next)
                    reset()
                  }}
                >
                  <SelectTrigger id="manifest-carrier">
                    <SelectValue />
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
                <Label htmlFor="manifest-file">Workbook</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="manifest-file"
                    type="file"
                    accept=".xlsx,.xlsm"
                    disabled={!supported || busy === 'commit'}
                    onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
                  />
                </div>
                {!supported ? (
                  <p className="text-xs text-muted-foreground">
                    {CARRIERS.find((definition) => definition.key === carrier)?.manifestNote}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    The file is read in your browser; only the parsed rows are sent for matching.
                  </p>
                )}
              </div>
            </div>

            {busy === 'read' || busy === 'preview' ? (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" />
                {busy === 'read' ? 'Reading the workbook…' : 'Matching every row against the order register…'}
              </div>
            ) : null}

            {parsed ? (
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{parsed.filename ?? file?.name}</span>
                {' · '}sheet {parsed.sheetName}
                {' · '}header row {parsed.headerRow}
                {' · '}
                {parsed.rows.length} rows
                {parsed.unknownHeaders?.length ? ` · ignored columns: ${parsed.unknownHeaders.join(', ')}` : ''}
              </div>
            ) : null}

            {preview && summary ? (
              <>
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {[
                    ['Matched', summary.matched, 'default'],
                    ['Already shipped', summary.already_shipped, 'secondary'],
                    ['Not found', summary.unmatched, 'outline'],
                    ['Needs a decision', summary.ambiguous, 'outline'],
                    ['Duplicates', summary.duplicate, 'destructive'],
                    ['Conflicts', summary.conflict, 'destructive'],
                  ].map(([label, value, variant]) => (
                    <div key={label} className="rounded-lg border px-3 py-2">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="flex items-center gap-2 font-heading text-lg tabular-nums">
                        {value}
                        <Badge variant={variant} className="h-4 px-1 text-[0.6rem]">
                          {label}
                        </Badge>
                      </p>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">Line</TableHead>
                        <TableHead>Package_Ref</TableHead>
                        <TableHead>Post_Id</TableHead>
                        <TableHead>Recipient</TableHead>
                        <TableHead>Result</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.rows.map((row) => {
                        const decided = decisions[row.line]
                        const status = decided ? 'matched' : row.status
                        return (
                          <TableRow key={row.line} className={cn(status !== 'matched' && status !== 'already_shipped' && 'bg-muted/30')}>
                            <TableCell className="text-xs tabular-nums text-muted-foreground">{row.line}</TableCell>
                            <TableCell className="font-mono text-xs">{row.reference || '—'}</TableCell>
                            <TableCell className="font-mono text-xs">{row.tracking || '—'}</TableCell>
                            <TableCell className="text-xs">
                              <span className="block">{row.recipientName || '—'}</span>
                              <span className="block text-muted-foreground">{row.phone || 'no number'}</span>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-1">
                                  <Badge variant={STATUS_VARIANT[status] ?? 'outline'}>
                                    {decided ? 'Chosen by hand' : MANIFEST_STATUS_LABELS[status] ?? status}
                                  </Badge>
                                  {row.canonicalId ? (
                                    <span className="font-mono text-[0.7rem] text-muted-foreground">{row.canonicalId}</span>
                                  ) : null}
                                </div>
                                <p className="max-w-72 text-xs text-muted-foreground">
                                  {decided ? `Will ship ${decided.canonicalId}` : row.message}
                                </p>
                                {row.issues?.length ? (
                                  <p className="max-w-72 text-xs text-amber-700 dark:text-amber-400">
                                    {row.issues.join(' · ')}
                                  </p>
                                ) : null}
                                {RESOLVABLE.has(row.status) && !decided ? (
                                  <div className="flex items-center gap-1 pt-1">
                                    <Input
                                      value={typing[row.line] ?? ''}
                                      onChange={(event) =>
                                        setTyping((prev) => ({ ...prev, [row.line]: event.target.value }))
                                      }
                                      placeholder="Dearune / Sold ID"
                                      aria-label={`Resolve line ${row.line}`}
                                      className="h-7 w-40 font-mono text-xs"
                                    />
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2 text-xs"
                                      disabled={busy === `resolve-${row.line}`}
                                      onClick={() => void resolveRow(row.line)}
                                    >
                                      {busy === `resolve-${row.line}` ? (
                                        <Loader2Icon className="size-3 animate-spin" />
                                      ) : (
                                        'Resolve'
                                      )}
                                    </Button>
                                  </div>
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>

                <p className="text-xs text-muted-foreground">
                  {summary.committable} row{summary.committable === 1 ? '' : 's'} can be committed. Rows that are not
                  found, duplicated, conflicting or still in Making are never written automatically.
                </p>
              </>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <p className="font-medium">
                {results.summary?.shipped ?? 0} shipped · {results.summary?.alreadyShipped ?? 0} already shipped ·{' '}
                {results.summary?.failed ?? 0} not written
              </p>
              <p className="text-xs text-muted-foreground">Snapshot {results.manifestId} kept for audit.</p>
            </div>
            <div className="max-h-80 overflow-y-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Line</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.results?.map((row) => (
                    <TableRow key={row.line}>
                      <TableCell className="text-xs tabular-nums text-muted-foreground">{row.line}</TableCell>
                      <TableCell className="font-mono text-xs">{row.canonicalId ?? row.projectId ?? '—'}</TableCell>
                      <TableCell>
                        <div className="flex items-start gap-1.5">
                          {row.ok ? (
                            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                          ) : (
                            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                          )}
                          <div>
                            <Badge variant={STATUS_VARIANT[row.status] ?? 'outline'}>{row.status}</Badge>
                            <p className="mt-1 max-w-72 text-xs text-muted-foreground">{row.message}</p>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter>
          {results ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  reset()
                }}
              >
                <Upload className="size-4" />
                Import another
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy === 'commit'}>
                Cancel
              </Button>
              <Button
                onClick={() => void commit()}
                disabled={!preview || busy === 'commit' || (summary?.committable ?? 0) === 0}
              >
                {busy === 'commit' ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="size-4" />
                )}
                Commit {summary?.committable ?? 0} row{summary?.committable === 1 ? '' : 's'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
