import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, BookOpen, FileText, Loader2Icon, Printer, Save, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { currentAccessToken } from '@/lib/supabase'
import { fetchDearune, fetchDearuneEvents, fetchDearuneShipping, fetchSalesForProject, saveDearuneShipping, setDearuneWrapper } from '@/services/dearunes'
import { fetchDesigners } from '@/services/designers'
import { fetchTemplates } from '@/services/templates'
import { isDigital } from '@/services/constants'
import { findWrapper, wrapperLabel } from '@/services/wrappers'
import { getGovernorates, getCitiesForGovernorate } from '@/data/egypt'
import { buildReceiptPdf, buildShippingPdf, downloadPdf } from '@/services/pdf'
import { formatDate, formatDateTime, formatMoney } from '@/services/format'
import { useAppSettings } from '@/hooks/use-app-settings'
import { ProjectBadge } from '@/components/stage-badge'
import { DearuneActions } from '@/components/admin/DearuneActions'
import { WrapperSelect, wrappersForSelect } from '@/components/admin/WrapperSelect'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

const LetterPreview = lazy(() => import('@/components/admin/LetterPreview'))

// One Dearune, in full: what it is, what it sold for, where it is in the
// studio, what it says, and everything that has ever happened to it. This is
// the page "Open message" leads to — there is no public link to copy yet, so
// the admin reads the letter here, behind the admin session.

const EVENT_LABELS = {
  'project.configured': 'Handed over by the designer',
  'project.sold': 'Sold',
  'project.sale.voided': 'Sale voided',
  'project.wrapper': 'Wrapper set',
  'project.manufactured': 'Marked made',
  'project.shipped': 'Marked shipped',
  'project.arrived': 'Marked arrived',
  'project.manufactured.reversed': 'Made step corrected',
  'project.shipped.reversed': 'Shipped step corrected',
  'project.arrived.reversed': 'Arrived step corrected',
  'project.activated': 'Message opened',
  'project.deactivated': 'Message closed',
  'project.shipping': 'Delivery details saved',
  'project.archived': 'Archived',
  'project.restored': 'Restored',
}

const AVAILABILITY_YEARS = 2

function plusYears(fromIso) {
  const date = new Date(fromIso)
  if (Number.isNaN(date.getTime())) return null
  date.setUTCFullYear(date.getUTCFullYear() + AVAILABILITY_YEARS)
  return date.toISOString()
}

const EMPTY_SHIP = {
  recipient_name: '',
  phone: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state_province: '',
  governorate: '',
  district: '',
  postal_code: '',
  country: 'Egypt',
  special_instructions: '',
  tracking_code: '',
  tracking_url: '',
}

// The wrapper's display name for this record — the catalog's copy when it
// is loaded, the shared label table as fallback (legacy / deactivated keys).
function wrapperNameFromCatalog(catalog, key, fallback = 'no wrapper') {
  if (!key) return fallback
  return wrapperLabel(findWrapper(catalog?.wrappers ?? [], key) ?? { key })
}

export function MessageDetail() {
  const { designerId, projectId } = useParams()
  const { settings } = useAppSettings()
  const maintenance = Boolean(settings?.maintenance_mode)

  const [project, setProject] = useState(null)
  const [events, setEvents] = useState([])
  const [shipping, setShipping] = useState(null)
  const [sales, setSales] = useState([])
  const [designers, setDesigners] = useState([])
  const [catalog, setCatalog] = useState(null)
  const [token, setToken] = useState(null)
  const [status, setStatus] = useState('loading')
  const [shipForm, setShipForm] = useState(EMPTY_SHIP)
  const [savingShip, setSavingShip] = useState(false)
  const [savingWrapper, setSavingWrapper] = useState(false)
  const [printing, setPrinting] = useState(null)
  const [showLetter, setShowLetter] = useState(false)

  const reload = useCallback(async () => {
    setStatus('loading')
    try {
      const [row, eventRows, shipRow, saleRows, designerRows] = await Promise.all([
        fetchDearune(projectId),
        fetchDearuneEvents(projectId),
        fetchDearuneShipping(projectId),
        fetchSalesForProject(projectId),
        fetchDesigners().catch(() => []),
      ])
      setProject(row)
      setEvents(eventRows)
      setShipping(shipRow)
      setSales(saleRows)
      setDesigners(designerRows)
      setStatus('ready')
    } catch (err) {
      setStatus('error')
      toast.error(err instanceof Error ? err.message : 'Could not load this Dearune')
    }
  }, [projectId])

  useEffect(() => {
    void reload()
    void fetchTemplates().then(setCatalog).catch(() => setCatalog(null))
    void currentAccessToken().then(setToken).catch(() => setToken(null))
  }, [reload])

  useEffect(() => {
    if (shipping) {
      setShipForm({
        ...EMPTY_SHIP,
        recipient_name: shipping.recipient_name ?? project?.title ?? '',
        phone: shipping.phone ?? '',
        address_line1: shipping.address_line1 ?? '',
        address_line2: shipping.address_line2 ?? '',
        city: shipping.city ?? '',
        state_province: shipping.state_province ?? shipping.governorate ?? '',
        governorate: shipping.governorate ?? shipping.state_province ?? '',
        district: shipping.district ?? '',
        postal_code: shipping.postal_code ?? '',
        country: shipping.country ?? 'Egypt',
        special_instructions: shipping.special_instructions ?? '',
        tracking_code: shipping.tracking_code ?? '',
        tracking_url: shipping.tracking_url ?? '',
      })
    }
  }, [shipping])

  if (status === 'loading' && !project) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (status === 'error' && !project) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          This Dearune could not be loaded.{' '}
          <Link className="underline" to={`/admin/designers/${designerId}`}>Back to the designer</Link>
        </CardContent>
      </Card>
    )
  }

  if (!project) return null

  const designer = designers.find((d) => d.id === project.designer_id)
  const paper = catalog?.templates?.find((t) => t.slug === project.template_slug)
  const activeSale = sales.find((s) => s.status === 'completed') ?? null
  const voidedSales = sales.filter((s) => s.status === 'voided')
  const digital = isDigital(project)
  const expiresAt = project.first_activated_at ? plusYears(project.first_activated_at) : null

  const stageSteps = [
    { label: 'Configured', at: project.configured_at ?? project.submitted_at },
    { label: 'Sold', at: project.paid_at },
    { label: 'Made', at: project.manufactured_at, na: digital },
    { label: 'Shipped', at: project.shipped_at, na: digital },
    {
      label: 'Delivered',
      at: digital ? (project.message_active ? project.first_activated_at : null) : project.arrived_at,
      pending: digital && !project.message_active && Boolean(project.paid_at),
    },
  ]

  const saveWrapper = async (value) => {
    if (!value) return
    setSavingWrapper(true)
    try {
      await setDearuneWrapper(project.id, value)
      toast.success('What this Dearune is has been saved')
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the wrapper')
    } finally {
      setSavingWrapper(false)
    }
  }

  const saveShipping = async () => {
    setSavingShip(true)
    try {
      await saveDearuneShipping(project.id, {
        recipientName: (shipForm.recipient_name || project.title || '').trim() || null,
        addressLine1: shipForm.address_line1.trim(),
        addressLine2: shipForm.address_line2.trim() || null,
        city: shipForm.city.trim(),
        stateProvince: (shipForm.state_province || shipForm.governorate).trim() || null,
        governorate: (shipForm.governorate || shipForm.state_province).trim() || null,
        district: shipForm.district.trim() || null,
        postalCode: shipForm.postal_code.trim() || null,
        country: (shipForm.country || 'Egypt').trim() || 'Egypt',
        phone: shipForm.phone.trim() || null,
        specialInstructions: shipForm.special_instructions.trim() || null,
        trackingCode: shipForm.tracking_code.trim() || null,
        trackingUrl: shipForm.tracking_url.trim() || null,
      })
      toast.success('Delivery details saved')
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save delivery details')
    } finally {
      setSavingShip(false)
    }
  }

  // README feature: the admin generates the shipping label + receipt PDFs.
  // Both read the values on screen, so what is printed is what is shown.
  const printShippingLabel = async () => {
    const line1 = shipForm.address_line1.trim()
    const city = shipForm.city.trim()
    if (!line1 || !city) {
      toast.error('An address and a city are needed before the label can be printed')
      return
    }
    setPrinting('label')
    try {
      const bytes = await buildShippingPdf({
        shipping: {
          addressLine1: line1,
          addressLine2: shipForm.address_line2.trim() || undefined,
          city,
          stateProvince: shipForm.state_province.trim() || undefined,
          postalCode: shipForm.postal_code.trim(),
          country: shipForm.country.trim(),
          specialInstructions: shipForm.special_instructions.trim() || undefined,
        },
        recipientName: shipForm.recipient_name.trim() || project.title || 'Recipient',
        orderId: String(project.reference ?? project.id),
        templateName: String(paper?.name ?? project.template_slug),
        wrapperType: String(wrapperNameFromCatalog(catalog, project.wrapper_type)),
        customerName: String(designer?.name ?? '—'),
        createdDate: project.created_at ?? project.submitted_at,
        dueDate: project.manufactured_at ?? project.paid_at,
      })
      downloadPdf(bytes, `dearune-${project.reference ?? project.id.slice(0, 8)}-shipping-label.pdf`)
      toast.success('Shipping label downloaded')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not build the shipping label')
    } finally {
      setPrinting(null)
    }
  }

  const printReceipt = async () => {
    if (!activeSale) return
    setPrinting('receipt')
    try {
      const bytes = await buildReceiptPdf({
        orderId: String(project.reference ?? project.id),
        createdDate: activeSale.sold_at,
        recipientName: shipForm.recipient_name.trim() || project.title || 'Recipient',
        templateName: String(paper?.name ?? project.template_slug),
        wrapperType: String(wrapperNameFromCatalog(catalog, activeSale.wrapper_type ?? project.wrapper_type)),
        publicId: String(project.public_id ?? '—'),
        price: Number(activeSale.selling_price) || 0,
        currency: activeSale.currency ?? 'EGP',
        customerEmail: undefined,
      })
      downloadPdf(bytes, `dearune-${project.reference ?? project.id.slice(0, 8)}-receipt.pdf`)
      toast.success('Receipt downloaded')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not build the receipt')
    } finally {
      setPrinting(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/admin/designers/${designerId}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> {designer?.name ?? 'Designer'}
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 font-heading text-2xl">
            <span className="font-mono text-xl">{project.reference ?? project.id.slice(0, 8)}</span>
            <span className="truncate">{project.title || 'Untitled'}</span>
            <ProjectBadge project={project} />
          </h1>
          <p className="text-sm text-muted-foreground">
            {paper?.name ?? project.template_slug}
            {project.template_version ? ` v${project.template_version}` : ''}
            {' · '}
            {wrapperNameFromCatalog(catalog, project.wrapper_type, 'wrapper not chosen')}
            {' · '}
            {digital ? 'digital' : 'physical'}
            {' · handed over '}{formatDateTime(project.configured_at ?? project.submitted_at)}
          </p>
          <p className="text-xs text-muted-foreground">receipt · <span className="break-all font-mono">{project.public_id}</span></p>
        </div>
        <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
          <DearuneActions project={project} maintenance={maintenance} onChanged={() => void reload()} detail catalog={catalog} />
          <Button size="sm" variant="outline" onClick={() => setShowLetter((v) => !v)}>
            <BookOpen className="size-4" />
            {showLetter ? 'Hide the letter' : 'Read the letter'}
          </Button>
        </div>
      </div>

      {showLetter && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">The letter as it will be printed</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>}>
              <LetterPreview project={project} token={token} />
            </Suspense>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-wrap gap-2">
            {stageSteps.map((step) => (
              <li
                key={step.label}
                className={`rounded-lg border px-3 py-2 text-sm ${step.at ? 'bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-600/20 dark:text-emerald-400' : step.na ? 'text-muted-foreground opacity-60' : step.pending ? 'bg-amber-500/10 text-amber-700 ring-1 ring-amber-600/20 dark:text-amber-400' : 'bg-muted/40 text-muted-foreground'}`}
              >
                <span className="font-medium">{step.label}</span>
                <span className="ml-2 text-xs">
                  {step.na ? 'not applicable' : step.at ? formatDateTime(step.at) : step.pending ? 'waiting to be opened' : '—'}
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Sale</CardTitle>
            <CardDescription>Paid = Sold. The entry below is immutable — corrections void it and write a new one.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!project.paid_at && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Not sold yet. Recording the sale snapshots the wrapper, price and cost into Sold Logs.</p>
                <div className="space-y-2">
                  <Label>What is this Dearune?</Label>
                  <WrapperSelect
                    wrappers={wrappersForSelect(catalog)}
                    currentKey={project.wrapper_type ?? ''}
                    value={project.wrapper_type ?? ''}
                    onChange={(v) => void saveWrapper(v)}
                    disabled={savingWrapper || maintenance || Boolean(project.paid_at)}
                    placeholder={savingWrapper ? 'Saving…' : 'Choose a wrapper'}
                  />
                  <p className="text-xs text-muted-foreground">Also chosen inside the Record sale dialog — setting it here first lets you see the listed price.</p>
                </div>
              </div>
            )}

            {activeSale && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Selling price</p>
                    <p className="text-sm font-semibold tabular-nums">{formatMoney(activeSale.selling_price, activeSale.currency)}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Cost estimate</p>
                    <p className="text-sm tabular-nums">{formatMoney(activeSale.estimated_cost, activeSale.currency)}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Estimated profit</p>
                    <p className="text-sm font-semibold tabular-nums">{formatMoney(activeSale.estimated_profit, activeSale.currency)}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {activeSale.sale_reference} · sold {formatDateTime(activeSale.sold_at)}
                  {' · '}{wrapperNameFromCatalog(catalog, activeSale.wrapper_type)}
                  {activeSale.designer_name ? ` · ${activeSale.designer_name}` : ''}
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                  <Button size="sm" variant="outline" onClick={() => void printReceipt()} disabled={printing !== null}>
                    {printing === 'receipt' ? <Loader2Icon className="size-4 animate-spin" /> : <FileText className="size-4" />}
                    Receipt (PDF)
                  </Button>
                  <Link className="underline" to={`/admin/sold/${activeSale.id}`}>See it in Sold Logs</Link>
                </div>
              </div>
            )}

            {voidedSales.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Voided entries</p>
                {voidedSales.map((s) => (
                  <p key={s.id} className="text-xs text-muted-foreground">
                    {s.sale_reference} · {formatMoney(s.selling_price, s.currency)} · {s.void_reason ?? 'no reason recorded'}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Message</CardTitle>
            <CardDescription>Opening starts the two-year reading window; closing and reopening never resets it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="shrink-0 text-muted-foreground">State</span>
              <span className="min-w-0 text-right font-medium">{project.message_active ? 'Open' : 'Sealed'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="shrink-0 text-muted-foreground">First opened</span>
              <span className="min-w-0 break-words text-right">{project.first_activated_at ? formatDateTime(project.first_activated_at) : 'never'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="shrink-0 text-muted-foreground">Reads until</span>
              <span className="min-w-0 break-words text-right">{expiresAt ? formatDate(expiresAt) : '—'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="shrink-0 text-muted-foreground">Terms accepted</span>
              <span className="min-w-0 break-words text-right">
                {project.policies_accepted_at ? `${project.policy_version || 'version unknown'} · ${formatDate(project.policies_accepted_at)}` : '—'}
              </span>
            </div>
            {!project.paid_at && (
              <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                A message can only be opened once the Dearune is sold.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {!digital && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Truck className="size-4" /> Delivery details
            </CardTitle>
            <CardDescription>
              Address form is always available. Fill in delivery details for physical Dearunes.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ship-recipient">Recipient name</Label>
              <Input id="ship-recipient" value={shipForm.recipient_name || project?.title || ''} onChange={(e) => setShipForm({ ...shipForm, recipient_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ship-phone">Phone</Label>
              <Input id="ship-phone" value={shipForm.phone} onChange={(e) => setShipForm({ ...shipForm, phone: e.target.value })} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ship-address">Street & building</Label>
              <Input id="ship-address" value={shipForm.address_line1} onChange={(e) => setShipForm({ ...shipForm, address_line1: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ship-address2">Apartment / floor (optional)</Label>
              <Input id="ship-address2" value={shipForm.address_line2} onChange={(e) => setShipForm({ ...shipForm, address_line2: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ship-district">District / neighborhood</Label>
              <Input id="ship-district" value={shipForm.district} onChange={(e) => setShipForm({ ...shipForm, district: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ship-governorate">Governorate</Label>
              <Select
                value={shipForm.governorate || shipForm.state_province || ''}
                onValueChange={(v) => {
                  setShipForm({ ...shipForm, governorate: v, state_province: v, city: '' })
                }}
              >
                <SelectTrigger id="ship-governorate">
                  <SelectValue placeholder="Select governorate" />
                </SelectTrigger>
                <SelectContent>
                  {getGovernorates().map((g) => (
                    <SelectItem key={g.id} value={g.name_en || g.name_ar}>
                      {g.name_ar} / {g.name_en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="mt-1"
                placeholder="Or enter manually"
                value={shipForm.governorate || shipForm.state_province || ''}
                onChange={(e) => setShipForm({ ...shipForm, governorate: e.target.value, state_province: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ship-city">City / Markaz</Label>
              <Select
                value={shipForm.city || ''}
                onValueChange={(v) => setShipForm({ ...shipForm, city: v })}
                disabled={!((shipForm.governorate || shipForm.state_province) && getCitiesForGovernorate(shipForm.governorate || shipForm.state_province).length > 0)}
              >
                <SelectTrigger id="ship-city">
                  <SelectValue placeholder="Select city" />
                </SelectTrigger>
                <SelectContent>
                  {getCitiesForGovernorate(shipForm.governorate || shipForm.state_province).map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="mt-1"
                placeholder="Or enter manually"
                value={shipForm.city}
                onChange={(e) => setShipForm({ ...shipForm, city: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ship-postal">Postal code (optional)</Label>
              <Input id="ship-postal" value={shipForm.postal_code} onChange={(e) => setShipForm({ ...shipForm, postal_code: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ship-country">Country</Label>
              <Input id="ship-country" value={shipForm.country} onChange={(e) => setShipForm({ ...shipForm, country: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ship-tracking">Tracking code</Label>
              <Input id="ship-tracking" value={shipForm.tracking_code} onChange={(e) => setShipForm({ ...shipForm, tracking_code: e.target.value })} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ship-notes">Special instructions</Label>
              <Textarea id="ship-notes" className="min-h-[60px]" value={shipForm.special_instructions} onChange={(e) => setShipForm({ ...shipForm, special_instructions: e.target.value })} />
            </div>
            <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
              <Button size="sm" variant="outline" onClick={() => void printShippingLabel()} disabled={printing !== null}>
                {printing === 'label' ? <Loader2Icon className="size-4 animate-spin" /> : <Printer className="size-4" />}
                Shipping label (PDF)
              </Button>
              <Button size="sm" onClick={() => void saveShipping()} disabled={savingShip}>
                {savingShip ? <Loader2Icon className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save delivery details
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing has happened to this Dearune yet.</p>
          ) : (
            <ol className="space-y-2">
              {events.map((event) => (
                <li key={event.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span>{EVENT_LABELS[event.action] ?? event.action}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(event.created_at)}</span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
