import { useCallback, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronRight,
  Copy,
  ImageUp,
  Keyboard,
  Loader2Icon,
  OctagonAlert,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import { toast } from 'sonner'
import { QrScanner, decodeImageFile } from '@/components/admin/QrScanner'
import { QA_ERROR_KINDS, fetchQaRecord, qaIdentifiers } from '@/services/qa'
import { formatDate, formatDateTime, formatMoney } from '@/services/format'
import { MILESTONE_LABELS } from '@/services/constants'
import { QR_BLOCKED_LABELS } from '@/services/qrState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// QA — the workshop's own answer to "what is this paper?".
//
// Scan the QR that is printed on a Dearune and this screen tells you exactly
// which letter, which designer, which physical unit and which delivery it
// belongs to. The screen is strictly READ-ONLY: it reads through the admin's
// own session, so the database's row level security applies exactly as it
// does everywhere else in the dashboard, and nothing here can change a record.
//
// The QR carries `<publicId>` and a private `<token>`. The token is used only
// to PROVE that the paper and the letter belong together — it is never shown,
// never copied and never stored here.

const NOT_AVAILABLE = 'Not available'
const NOT_ASSIGNED = 'Not assigned'

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

// One label/value pair. A missing value says so plainly; it is never dressed
// up with a placeholder that could be mistaken for real data.
function Field({ label, value, mono = false, empty = NOT_AVAILABLE, className = '' }) {
  const missing = value === null || value === undefined || value === ''
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      {missing ? (
        <p className="text-sm text-muted-foreground italic">{empty}</p>
      ) : (
        <p className={`text-sm break-words ${mono ? 'font-mono' : ''}`}>{value}</p>
      )}
    </div>
  )
}

// A copy button that says so when it has worked.
function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      toast.error('The clipboard is not available in this browser')
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => void copy()}
      title={`Copy ${label}`}
      aria-label={`Copy ${label}`}
    >
      {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
    </Button>
  )
}

// A collapsible group of related fields. Native <details> keeps it accessible
// and keeps it working on a phone with no JavaScript fuss.
function RecordGroup({ title, summary, children, open = false }) {
  return (
    <details open={open} className="group rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-left [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
        <span className="font-heading text-sm font-medium">{title}</span>
        {summary ? <span className="truncate text-xs text-muted-foreground">{summary}</span> : null}
      </summary>
      <div className="border-t px-4 py-4">{children}</div>
    </details>
  )
}

function FieldGrid({ children }) {
  return <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
}

// A short, human line for a unit event. The stored `detail` is a jsonb blob —
// it is never dumped raw; only its well-known keys are read.
function eventDetail(detail) {
  if (!detail || typeof detail !== 'object') return ''
  const known = ['reason', 'note', 'from_status', 'to_status', 'from_project_status']
  const parts = []
  for (const key of known) {
    const value = detail[key]
    if (typeof value === 'string' && value.trim()) parts.push(`${key.replace(/_/g, ' ')}: ${value}`)
  }
  return parts.join(' · ')
}

function Timeline({ events, emptyText }) {
  if (!events || events.length === 0) {
    return <p className="text-sm text-muted-foreground italic">{emptyText}</p>
  }
  return (
    <ul className="space-y-1.5">
      {events.map((event) => (
        <li key={event.id} className="text-sm">
          <span className="font-mono text-xs">{event.action}</span>
          <span className="text-xs text-muted-foreground">
            {' · '}
            {event.actorType}
            {' · '}
            {formatDateTime(event.createdAt)}
          </span>
          {eventDetail(event.detail) ? (
            <p className="text-xs text-muted-foreground">{eventDetail(event.detail)}</p>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Error banners — one per kind, because they are not the same problem
// ---------------------------------------------------------------------------

const ERROR_TONES = {
  [QA_ERROR_KINDS.INVALID]: {
    icon: TriangleAlert,
    title: 'That is not a Dearune QR',
    tone: 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200',
  },
  [QA_ERROR_KINDS.NOT_FOUND]: {
    icon: OctagonAlert,
    title: 'No record for this code',
    tone: 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200',
  },
  [QA_ERROR_KINDS.TOKEN_MISMATCH]: {
    icon: OctagonAlert,
    title: 'The paper and the letter do not match',
    tone: 'border-destructive/40 bg-destructive/10 text-destructive',
  },
  [QA_ERROR_KINDS.FORBIDDEN]: {
    icon: ShieldCheck,
    title: 'Not allowed',
    tone: 'border-destructive/40 bg-destructive/10 text-destructive',
  },
  [QA_ERROR_KINDS.NETWORK]: {
    icon: TriangleAlert,
    title: 'The archive could not be reached',
    tone: 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200',
  },
  [QA_ERROR_KINDS.LOOKUP_FAILED]: {
    icon: OctagonAlert,
    title: 'The lookup failed',
    tone: 'border-destructive/40 bg-destructive/10 text-destructive',
  },
}

function ErrorBanner({ error }) {
  const tone = ERROR_TONES[error?.kind] ?? ERROR_TONES[QA_ERROR_KINDS.LOOKUP_FAILED]
  const Icon = tone.icon
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${tone.tone}`} role="alert">
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium">{tone.title}</p>
        <p className="text-sm break-words">{error.message}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The record itself
// ---------------------------------------------------------------------------

function IdentityCard({ record }) {
  const identifiers = useMemo(() => qaIdentifiers(record), [record])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading">What this paper is</CardTitle>
        <CardDescription>
          The identifiers the workshop reads out loud. Each one copies on its own.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {identifiers.map((item) => {
            const missing = !item.value
            if (item.tone === 'primary') {
              return (
                <div
                  key={item.key}
                  className="rounded-xl border-2 border-primary/40 bg-primary/5 p-4 sm:col-span-2 lg:col-span-1"
                >
                  <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">{item.label}</p>
                  {missing ? (
                    <p className="mt-1 text-lg italic text-muted-foreground">{NOT_AVAILABLE}</p>
                  ) : (
                    <p className="mt-1 font-mono text-xl leading-tight font-semibold break-all text-foreground sm:text-2xl">
                      {item.value}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">{item.hint}</p>
                  {!missing && (
                    <div className="mt-2 -ml-2">
                      <CopyButton value={item.value} label={item.label} />
                    </div>
                  )}
                </div>
              )
            }
            return (
              <div key={item.key} className="rounded-xl border bg-muted/40 p-4">
                <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">{item.label}</p>
                {missing ? (
                  <p className="mt-1 font-mono text-lg italic text-muted-foreground">{NOT_ASSIGNED}</p>
                ) : (
                  <p className="mt-1 font-mono text-lg leading-tight break-all">{item.value}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">{item.hint}</p>
                {!missing && (
                  <div className="mt-2 -ml-2">
                    <CopyButton value={item.value} label={item.label} />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {record.token.present && record.token.verified ? (
            <Badge variant="secondary" className="gap-1">
              <ShieldCheck className="size-3" />
              Token verified — this paper belongs to this letter
            </Badge>
          ) : record.token.present ? (
            <Badge variant="destructive" className="gap-1">
              <OctagonAlert className="size-3" />
              Token does not match
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1">
              <TriangleAlert className="size-3" />
              Scanned without a token — the paper was not proven
            </Badge>
          )}
          {record.project.messageActive ? (
            <Badge variant="secondary">Letter is switched on</Badge>
          ) : (
            <Badge variant="outline">Letter is switched off</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function RecordSections({ record }) {
  const letter = record.letter
  const shipping = record.shipping
  const sale = record.sale

  return (
    <div className="space-y-3">
      <RecordGroup title="Identity" summary={record.project.title || record.project.reference} open>
        <FieldGrid>
          <Field label="Dearune reference" value={record.project.reference} mono />
          <Field label="Title" value={record.project.title} empty="No title" />
          <Field label="Milestone" value={MILESTONE_LABELS[record.project.milestone] ?? record.project.milestone} />
          <Field label="Paper" value={record.template?.name || record.project.templateSlug} empty="No paper chosen" />
          <Field label="Paper version" value={record.project.templateVersion} />
          <Field label="Wrapper" value={record.project.wrapperName ?? record.project.wrapperType ?? 'No wrapper'} empty="No wrapper" />
          <Field label="Currency" value={record.project.currency} />
          <Field label="Created" value={formatDateTime(record.project.createdAt)} />
          <Field label="Configured" value={formatDateTime(record.project.configuredAt)} />
          <Field label="Submitted" value={formatDateTime(record.project.submittedAt)} />
          <Field label="Last updated" value={formatDateTime(record.project.updatedAt)} />
        </FieldGrid>
      </RecordGroup>

      <RecordGroup title="Message" summary={letter ? `${letter.body.length} characters` : 'no letter body'}>
        {letter ? (
          <div className="space-y-4">
            <FieldGrid>
              <Field label="Language" value={letter.language === 'ar' ? 'Arabic' : 'English'} />
              <Field label="From" value={letter.senderName} empty="No sender name" />
              <Field label="Greeting" value={letter.greeting} empty="No greeting" />
              <Field label="Closing" value={letter.closing} empty="No closing" />
            </FieldGrid>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Body</p>
              <p className="mt-1 rounded-lg border bg-muted/30 p-3 text-sm leading-relaxed whitespace-pre-wrap break-words">
                {letter.body}
              </p>
            </div>
            <Field
              label="Password protection"
              value={letter.passwordSet ? 'On — the public reader asks for a password' : 'Off'}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            This record has no readable letter body — the message was never saved, or it was saved in a shape this
            screen cannot read.
          </p>
        )}
      </RecordGroup>

      <RecordGroup title="Designer" summary={record.designer?.name}>
        {record.designer ? (
          <FieldGrid>
            <Field label="Name" value={record.designer.name} empty="No name" />
            <Field label="Designer ID" value={record.designer.code} mono />
            <Field label="Access" value={record.designer.revoked ? 'Revoked' : 'Active'} />
            <Field label="Revoked on" value={formatDateTime(record.designer.revokedAt)} />
            <Field label="Last sign-in" value={formatDateTime(record.designer.lastLoginAt)} />
            <Field label="Designer since" value={formatDate(record.designer.createdAt)} />
          </FieldGrid>
        ) : (
          <p className="text-sm text-muted-foreground italic">No designer is assigned to this Dearune.</p>
        )}
      </RecordGroup>

      <RecordGroup title="Physical product" summary={`${record.units.length} unit${record.units.length === 1 ? '' : 's'}`}>
        {record.units.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No physical unit has been created for this Dearune yet.
          </p>
        ) : (
          <div className="space-y-4">
            {record.units.map((unit) => (
              <div key={unit.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-sm font-semibold break-all">
                    {unit.reference || NOT_AVAILABLE}
                  </p>
                  <Badge variant="outline">{MILESTONE_LABELS[unit.milestone] ?? unit.milestone ?? '—'}</Badge>
                </div>
                <FieldGrid className="mt-3">
                  <Field label="Unit" value={unit.unitIndex} />
                  <Field label="Sold ID" value={unit.soldId} empty="No Sold ID recorded" />
                  <Field label="Archived" value={unit.archived ? `Yes — ${formatDate(unit.archivedAt)}` : 'No'} />
                  <Field label="Notes" value={unit.notes} empty="No notes" />
                  <Field label="On hold reason" value={unit.onHoldReason} empty="Not on hold" />
                  <Field label="Cancellation reason" value={unit.cancelledReason} empty="Not cancelled" />
                  <Field label="Letter switched on" value={unit.messageActive ? 'Yes' : 'No'} />
                  <Field label="Letter password-protected" value={unit.messageProtected ? 'Yes' : 'No'} />
                  <Field label="QR has a destination" value={unit.qr?.destination ? 'Yes' : 'No'} />
                  <Field
                    label="QR will open the letter"
                    value={unit.qr?.openable ? 'Yes' : `No — ${QR_BLOCKED_LABELS[unit.qr?.blockedReason] ?? 'blocked'}`}
                  />
                  <Field label="Paid" value={formatDateTime(unit.paidAt)} />
                  <Field label="Created" value={formatDateTime(unit.createdAt)} />
                  <Field label="Updated" value={formatDateTime(unit.updatedAt)} />
                </FieldGrid>
                <div className="mt-3 border-t pt-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Unit history</p>
                  <div className="mt-2">
                    <Timeline events={unit.events} emptyText="No history recorded for this unit yet." />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </RecordGroup>

      <RecordGroup title="Production & order" summary={sale?.reference}>
        <div className="space-y-4">
          {sale ? (
            <FieldGrid>
              <Field label="Sale reference" value={sale.reference} mono />
              <Field label="Sold at" value={formatDateTime(sale.soldAt)} />
              <Field label="Sale status" value={sale.status} />
              <Field label="Selling price" value={formatMoney(sale.sellingPrice, sale.currency)} />
              <Field label="Estimated cost" value={formatMoney(sale.estimatedCost, sale.currency)} />
              <Field label="Estimated profit" value={formatMoney(sale.estimatedProfit, sale.currency)} />
              <Field label="Paper" value={sale.templateName} empty="No paper" />
              <Field label="Wrapper" value={sale.wrapperName ?? sale.wrapperType ?? 'No wrapper'} empty="No wrapper" />
              <Field label="Designer" value={sale.designerName} empty={NOT_ASSIGNED} />
            </FieldGrid>
          ) : (
            <p className="text-sm text-muted-foreground italic">No sale has been recorded for this Dearune.</p>
          )}

          <div className="border-t pt-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Dearune stamps</p>
            <FieldGrid className="mt-2">
              <Field label="Paid" value={formatDateTime(record.project.paidAt)} />
              <Field label="Made" value={formatDateTime(record.project.manufacturedAt)} />
              <Field label="Shipped" value={formatDateTime(record.project.shippedAt)} />
              <Field label="Arrived" value={formatDateTime(record.project.arrivedAt)} />
              <Field label="First opened" value={formatDateTime(record.project.firstActivatedAt)} />
              <Field label="Archived" value={formatDateTime(record.project.archivedAt)} />
              <Field label="Policy version" value={record.project.policyVersion} />
              <Field label="Policies accepted" value={formatDateTime(record.project.policiesAcceptedAt)} />
            </FieldGrid>
          </div>

          {record.voidedSales.length > 0 && (
            <div className="border-t pt-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Voided sales</p>
              <ul className="mt-2 space-y-1.5">
                {record.voidedSales.map((row) => (
                  <li key={row.id} className="text-sm">
                    <span className="font-mono text-xs">{row.reference}</span>
                    <span className="text-xs text-muted-foreground">
                      {' · '}
                      sold {formatDateTime(row.soldAt)}
                      {' · '}
                      voided {formatDateTime(row.voidedAt)}
                    </span>
                    {row.voidReason ? (
                      <p className="text-xs text-muted-foreground">Reason: {row.voidReason}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </RecordGroup>

      <RecordGroup title="Shipping & delivery" summary={shipping?.recipientName}>
        {shipping ? (
          <FieldGrid>
            <Field label="Recipient" value={shipping.recipientName} empty="No recipient name" />
            <Field label="Phone" value={shipping.phone} empty="No number on file" />
            <Field label="Address" value={shipping.addressLine1} empty="No address" />
            <Field label="Address line 2" value={shipping.addressLine2} empty="No second line" />
            <Field label="City" value={shipping.city} />
            <Field label="State / province" value={shipping.stateProvince} />
            <Field label="Postal code" value={shipping.postalCode} />
            <Field label="Country" value={shipping.country} />
            <Field label="Courier" value={shipping.provider} empty="No courier chosen" />
            <Field label="Tracking code" value={shipping.trackingCode} mono empty="No tracking code" />
            <Field label="Tracking link" value={shipping.trackingUrl} empty="No tracking link" />
            <Field label="Special instructions" value={shipping.specialInstructions} empty="None" />
          </FieldGrid>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No delivery details have been entered for this Dearune.
          </p>
        )}
      </RecordGroup>

      <RecordGroup title="Media & additional details" summary={`${record.media.photos.length + (record.media.audio ? 1 : 0)} file(s)`}>
        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Attached media</p>
            {record.media.photos.length === 0 && !record.media.audio ? (
              <p className="mt-1 text-sm text-muted-foreground italic">No photos and no voice note are attached.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {record.media.photos.map((photo, index) => (
                  <li key={`${photo.path}-${index}`} className="text-sm">
                    <span className="break-all">{photo.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {' · '}
                      photo {index + 1} · {photo.type}
                    </span>
                  </li>
                ))}
                {record.media.audio ? (
                  <li className="text-sm">
                    <span className="break-all">{record.media.audio.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {' · '}
                      voice note · {record.media.audio.type}
                    </span>
                  </li>
                ) : null}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              The files themselves live in a private bucket and are never opened from this screen — only what is
              attached is listed here.
            </p>
          </div>

          <div className="border-t pt-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Activity trail</p>
            <div className="mt-2">
              <Timeline events={record.projectEvents} emptyText="No activity has been recorded for this Dearune." />
            </div>
          </div>
        </div>
      </RecordGroup>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

export function QaScanner() {
  const [scanning, setScanning] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [record, setRecord] = useState(null)
  const [error, setError] = useState(null)
  const [manual, setManual] = useState('')
  const [uploading, setUploading] = useState(false)
  const [cameraError, setCameraError] = useState(null)
  const fileRef = useRef(null)
  const busyRef = useRef(false)
  const lastLookupRef = useRef({ value: '', at: 0 })

  // The one path every source of a code takes: scan, upload or typing.
  const resolve = useCallback(async (raw) => {
    const value = String(raw ?? '').trim()
    if (!value) return
    // The same paper sitting in front of the lens must not fire the lookup
    // over and over — one scan, one read.
    const now = Date.now()
    if (busyRef.current) return
    if (lastLookupRef.current.value === value && now - lastLookupRef.current.at < 5000) return
    lastLookupRef.current = { value, at: now }
    busyRef.current = true
    setResolving(true)
    setError(null)
    try {
      const next = await fetchQaRecord(value)
      setRecord(next)
      setScanning(false)
      toast.success('Record found')
    } catch (err) {
      setRecord(null)
      setError({
        kind: err?.kind ?? QA_ERROR_KINDS.LOOKUP_FAILED,
        message: err?.message ?? 'The lookup failed.',
      })
    } finally {
      busyRef.current = false
      setResolving(false)
    }
  }, [])

  // A QR has been read by the camera: stop the camera and go look it up.
  const onDetected = useCallback(
    (value) => {
      setScanning(false)
      void resolve(value)
    },
    [resolve],
  )

  const onUpload = useCallback(
    async (event) => {
      const file = event?.target?.files?.[0]
      if (file) {
        setUploading(true)
        try {
          const decoded = await decodeImageFile(file)
          if (!decoded) {
            setError({
              kind: QA_ERROR_KINDS.INVALID,
              message: 'No QR could be read in that picture. Try a closer, straighter photo.',
            })
          } else {
            await resolve(decoded)
          }
        } catch {
          setError({
            kind: QA_ERROR_KINDS.INVALID,
            message: 'That file could not be read as an image. Try a JPEG or PNG of the QR.',
          })
        } finally {
          setUploading(false)
          if (fileRef.current) fileRef.current.value = ''
        }
      }
    },
    [resolve],
  )

  const reset = useCallback(() => {
    setRecord(null)
    setError(null)
    setManual('')
    setScanning(false)
    setCameraError(null)
    lastLookupRef.current = { value: '', at: 0 }
  }, [])

  const startScan = () => {
    reset()
    setScanning(true)
  }

  const stopScan = () => {
    setScanning(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl">QA</h1>
          <p className="text-sm text-muted-foreground">
            Scan the QR on a printed Dearune to see the letter, the designer, the physical unit and the delivery
            behind it. Everything on this page is read-only.
          </p>
        </div>
        {record ? (
          <Button variant="outline" size="sm" onClick={startScan}>
            <RotateCcw className="size-4" />
            Scan another
          </Button>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="font-heading">Camera</CardTitle>
            <CardDescription>
              The camera is only opened when you ask for it, and it closes the moment you leave this page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <QrScanner running={scanning} onDetected={onDetected} onError={(failure) => setCameraError(failure)} />

            <div className="flex flex-wrap items-center gap-2">
              {scanning ? (
                <Button variant="outline" size="sm" onClick={stopScan}>
                  <ScanLine className="size-4" />
                  Stop camera
                </Button>
              ) : (
                <Button size="sm" onClick={startScan}>
                  <ScanLine className="size-4" />
                  Start scan
                </Button>
              )}
              {resolving ? (
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2Icon className="size-4 animate-spin" />
                  Looking it up…
                </span>
              ) : null}
            </div>

            <p className="text-xs text-muted-foreground">
              The picture never leaves this device — the code is decoded here and only the code is looked up.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-heading">No camera? Use one of these</CardTitle>
            <CardDescription>
              Both routes run the exact same check, so the answer you get is the same answer.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {cameraError ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>The camera is not available right now — use one of these instead.</span>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="qa-upload">Upload a photo of the QR</Label>
              <input
                ref={fileRef}
                id="qa-upload"
                type="file"
                accept="image/*"
                className="block w-full min-w-0 text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border file:bg-background file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground"
                onChange={(event) => void onUpload(event)}
                disabled={uploading}
              />
              {uploading ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2Icon className="size-4 animate-spin" />
                  Reading the picture…
                </p>
              ) : (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ImageUp className="size-4 shrink-0" />
                  A JPEG or PNG of the code is enough.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="qa-manual">Type the code by hand</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="qa-manual"
                  value={manual}
                  onChange={(event) => setManual(event.target.value)}
                  placeholder="Paste the link, or the code"
                  className="min-w-0 flex-1"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void resolve(manual)
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void resolve(manual)}
                  disabled={!manual.trim() || resolving}
                  className="shrink-0"
                >
                  <Keyboard className="size-4" />
                  Look up
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Accepts the printed link, the public id on its own, or the public id and its code together.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {error ? <ErrorBanner error={error} /> : null}

      {record ? (
        <div className="space-y-4">
          {record.warnings.length > 0 && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Worth knowing</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-amber-900 dark:text-amber-200">
                {record.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          <IdentityCard record={record} />
          <RecordSections record={record} />
        </div>
      ) : null}
    </div>
  )
}

export default QaScanner
