import { useCallback, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Camera,
  CheckCircle2,
  ImageUp,
  Keyboard,
  Loader2,
  Package,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  ShieldQuestion,
  TriangleAlert,
  Truck,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { QrScanner, decodeImageFile } from '@/components/admin/QrScanner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { MILESTONE_LABELS } from '@/services/constants'
import { formatDateTime } from '@/services/format'
import { parseQrValue } from '@/services/qa'
import { QR_BLOCKED_LABELS } from '@/services/qrState'
import { fetchWorkerQaRecord } from '@/services/workerQa'

const ERROR_COPY = {
  'qa.invalid_public_id': 'That QR does not carry a Dearune public id.',
  'qa.invalid_token': 'That QR carries a token that is not a Dearune token.',
  'qa.not_found': 'No Dearune matches this code. Check that the paper belongs to this studio.',
  'qa.token_mismatch': 'This paper and this Dearune do not match. Do not trust the scan.',
  'worker.forbidden': 'Your access changed. Ask the studio administrator to review your QA permission.',
  'worker.inactive_or_unknown': 'This worker account is no longer active.',
}

function messageOf(error) {
  const text = error instanceof Error ? error.message : String(error ?? '')
  for (const [key, copy] of Object.entries(ERROR_COPY)) {
    if (text.includes(key)) return copy
  }
  if (!navigator.onLine) return 'The device is offline. Reconnect and try the scan again.'
  return text || 'The lookup failed. Please try again.'
}

function Field({ label, value, mono = false, empty = 'Not available' }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
      <dd className={mono ? 'mt-1 break-all font-mono text-sm' : 'mt-1 break-words text-sm'}>
        {value === null || value === undefined || value === '' ? (
          <span className="italic text-muted-foreground">{empty}</span>
        ) : (
          value
        )}
      </dd>
    </div>
  )
}

function Section({ icon: Icon, title, description, children }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-heading text-xl tracking-tight">{title}</h2>
          {description ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function UnitCard({ unit }) {
  return (
    <li className="rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold">{unit.reference}</span>
        <Badge variant="outline">{MILESTONE_LABELS[unit.milestone] ?? unit.milestone ?? '—'}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Unit {unit.unit_index} · created {formatDateTime(unit.created_at)}
        {unit.archived_at ? ' · archived' : ''}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Sold ID <span className="font-mono">{unit.sold_id || '—'}</span>
        {' · '}
        {unit.qr_openable
          ? 'QR will open the letter'
          : QR_BLOCKED_LABELS[unit.qr_blocked_reason] ?? 'QR will not open the letter'}
      </p>
      {unit.notes ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{unit.notes}</p> : null}
    </li>
  )
}

function RecordView({ record }) {
  const project = record.project ?? {}
  const shipping = record.shipping ?? {}
  const units = Array.isArray(record.units) ? record.units : []
  const events = useMemo(() => {
    const combined = [
      ...(Array.isArray(record.events) ? record.events.map((event) => ({ ...event, scope: 'Dearune' })) : []),
      ...(Array.isArray(record.unitEvents) ? record.unitEvents.map((event) => ({ ...event, scope: 'Unit' })) : []),
    ]
    return combined.sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')))
  }, [record])

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.16em] text-primary">Dearune found</p>
            <h2 className="mt-1 font-heading text-2xl tracking-tight">{project.title || 'Untitled Dearune'}</h2>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{project.reference}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {record.tokenVerified === true ? (
              <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="size-3.5" aria-hidden />
                Token verified
              </Badge>
            ) : (
              <Badge variant="outline">
                <ShieldQuestion className="size-3.5" aria-hidden />
                Token not checked
              </Badge>
            )}
            {project.message_active ? <Badge variant="outline">Letter switched on</Badge> : <Badge variant="outline">Letter switched off</Badge>}
          </div>
        </div>
        {record.tokenVerified !== true ? (
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            The scan did not include a token, so this page cannot prove the paper belongs to this
            Dearune. If the printed QR includes a token it will be verified automatically.
          </p>
        ) : null}
      </div>

      <Section icon={Package} title="The Dearune" description="Identity and production state. Prices and the private letter are not part of this record.">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Reference" value={project.reference} mono />
          <Field label="Sold ID" value={project.sold_id} mono />
          <Field label="Milestone" value={MILESTONE_LABELS[project.milestone] ?? project.milestone} />
          <Field label="Wrapper" value={project.wrapper_name || project.wrapper_type || '—'} />
          <Field label="Paper" value={record.template?.name || project.template_slug} />
          <Field label="Paper version" value={project.template_version} />
          <Field label="Designer" value={record.designer ? `${record.designer.name} · ${record.designer.code}` : null} />
          <Field label="Created" value={formatDateTime(project.created_at)} />
          <Field label="Submitted" value={formatDateTime(project.submitted_at)} />
          <Field label="Last updated" value={formatDateTime(project.updated_at)} />
          <Field label="Manufactured" value={formatDateTime(project.manufactured_at)} />
          <Field label="Shipped" value={formatDateTime(project.shipped_at)} />
          <Field label="Arrived" value={formatDateTime(project.arrived_at)} />
        </dl>
      </Section>

      <Section icon={Package} title={`Physical units (${units.length})`} description="The exact pieces carrying this Dearune's QR.">
        {units.length === 0 ? (
          <p className="text-sm text-muted-foreground">No physical units have been opened for this Dearune.</p>
        ) : (
          <ul className="space-y-2">
            {units.map((unit) => (
              <UnitCard key={unit.id} unit={unit} />
            ))}
          </ul>
        )}
      </Section>

      <Section icon={Truck} title="Delivery" description="The shipping record, without label media.">
        {Object.keys(shipping).length === 0 ? (
          <p className="text-sm text-muted-foreground">No delivery record has been saved for this Dearune.</p>
        ) : (
          <>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Recipient" value={shipping.recipient_name} />
              <Field label="Phone" value={shipping.phone} />
              <Field label="Address" value={[shipping.address_line1, shipping.address_line2].filter(Boolean).join(', ') || null} />
              <Field label="City" value={shipping.city} />
              <Field label="State / province" value={shipping.state_province} />
              <Field label="Postal code" value={shipping.postal_code} />
              <Field label="Country" value={shipping.country} />
              <Field label="Courier" value={shipping.provider} />
              <Field label="Tracking" value={shipping.tracking_code} mono />
              <Field label="Instructions" value={shipping.special_instructions} />
            </dl>
            {shipping.tracking_url ? (
              <a
                href={shipping.tracking_url}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Open the tracking link
              </a>
            ) : null}
          </>
        )}
      </Section>

      <Section icon={CheckCircle2} title="Activity" description="A safe action log. It never includes letter contents or financial fields.">
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity has been recorded yet.</p>
        ) : (
          <ol className="space-y-2">
            {events.map((event, index) => (
              <li key={`${event.scope}-${event.action}-${event.createdAt}-${index}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                <span className="font-mono text-xs font-medium">{event.action}</span>
                <span className="text-xs text-muted-foreground">
                  {event.scope} · {event.actorType} · {formatDateTime(event.createdAt)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  )
}

export function WorkerQa() {
  const { session } = useOutletContext()
  const [scanning, setScanning] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [record, setRecord] = useState(null)
  const [error, setError] = useState('')
  const [manual, setManual] = useState('')
  const [uploading, setUploading] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const fileRef = useRef(null)
  const lastLookup = useRef({ value: '', at: 0 })

  const resolve = useCallback(async (raw) => {
    const value = String(raw ?? '').trim()
    if (!value || resolving) return
    const now = Date.now()
    if (lastLookup.current.value === value && now - lastLookup.current.at < 4000) return
    lastLookup.current = { value, at: now }

    const parsed = parseQrValue(value)
    if (!parsed.ok) {
      setRecord(null)
      setError(parsed.reason)
      return
    }

    setResolving(true)
    setError('')
    setScanning(false)
    try {
      const data = await fetchWorkerQaRecord(parsed.publicId, parsed.token)
      setRecord(data)
      toast.success('Dearune found')
    } catch (caught) {
      setRecord(null)
      setError(messageOf(caught))
    } finally {
      setResolving(false)
    }
  }, [resolving])

  const onDetected = useCallback(
    (value) => {
      setScanning(false)
      void resolve(value)
    },
    [resolve],
  )

  const onUpload = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const decoded = await decodeImageFile(file)
      if (!decoded) {
        setError('No QR could be read in that picture. Try a closer, straighter photo.')
        return
      }
      await resolve(decoded)
    } catch {
      setError('That file could not be read as an image. Try a JPEG or PNG of the QR.')
    } finally {
      setUploading(false)
    }
  }

  const reset = () => {
    setRecord(null)
    setError('')
    setManual('')
    setScanning(false)
    setCameraError('')
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">QA desk</p>
          <h1 className="mt-1 font-heading text-3xl tracking-tight">What is this paper?</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Scan the QR to find the Dearune, its physical units and its delivery record. This screen is
            read-only and never shows the private letter, a sale price, a cost or a profit.
          </p>
        </div>
        {record || error ? (
          <Button variant="outline" onClick={reset}>
            <RotateCcw className="size-4" aria-hidden />
            New scan
          </Button>
        ) : null}
      </header>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <div className="flex flex-wrap gap-2">
              {scanning ? (
                <Button variant="outline" onClick={() => setScanning(false)}>
                  <X className="size-4" aria-hidden />
                  Stop camera
                </Button>
              ) : (
                <Button onClick={() => { setCameraError(''); setScanning(true) }}>
                  <Camera className="size-4" aria-hidden />
                  Scan with camera
                </Button>
              )}
              <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImageUp className="size-4" aria-hidden />}
                Upload a photo
              </Button>
              <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={onUpload} aria-label="Upload a QR photo" />
            </div>

            {scanning ? (
              <div className="mt-4">
                <QrScanner running={scanning} onDetected={onDetected} onError={(failure) => setCameraError(failure?.message || 'The camera could not be started.')} />
                {cameraError ? (
                  <p className="mt-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-800 dark:text-amber-200">
                    {cameraError}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 flex min-h-32 items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
                <div>
                  <ScanLine className="mx-auto size-7 text-primary" aria-hidden />
                  <p className="mt-2 text-sm text-muted-foreground">
                    Point the camera at the QR, upload a photo, or type the code below.
                  </p>
                </div>
              </div>
            )}
          </div>

          <form
            className="rounded-2xl border border-border bg-muted/25 p-4"
            onSubmit={(event) => {
              event.preventDefault()
              void resolve(manual)
            }}
          >
            <Label htmlFor="worker-qa-manual" className="flex items-center gap-2">
              <Keyboard className="size-4 text-primary" aria-hidden />
              Type or paste the QR value
            </Label>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              The full message URL, a <span className="font-mono">publicId:token</span> pair, or just the
              public id.
            </p>
            <Input
              id="worker-qa-manual"
              className="mt-3 font-mono text-xs"
              value={manual}
              onChange={(event) => setManual(event.target.value)}
              placeholder="https://…/message/…?token=…"
              autoComplete="off"
            />
            <Button type="submit" className="mt-3 w-full" disabled={resolving || !manual.trim()}>
              {resolving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ScanLine className="size-4" aria-hidden />}
              Resolve code
            </Button>
          </form>
        </div>
      </section>

      {resolving ? (
        <div className="space-y-3">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      ) : null}

      {error && !resolving ? (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="text-sm font-semibold">The scan could not be resolved</p>
            <p className="mt-1 text-sm leading-6">{error}</p>
          </div>
        </div>
      ) : null}

      {!record && !error && !resolving ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center">
          <ShieldCheck className="mx-auto size-7 text-primary" aria-hidden />
          <h2 className="mt-3 font-heading text-xl tracking-tight">Nothing scanned yet</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
            The lookup is read-only. Holding <span className="font-medium text-foreground">qa.view</span> allows
            this safe record; it does not allow changing a unit or seeing studio money.
          </p>
          {session?.worker ? (
            <p className="mt-3 text-xs text-muted-foreground">Signed in as {session.worker.display_name}</p>
          ) : null}
        </div>
      ) : null}

      {record && !resolving ? <RecordView record={record} /> : null}
    </div>
  )
}
