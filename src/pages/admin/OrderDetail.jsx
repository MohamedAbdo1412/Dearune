import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { ArrowLeft, FileText, Film, Image as ImageIcon, AudioLines, Loader2Icon, Mail, Printer, Receipt, RotateCcw, Save, ShieldAlert, Truck, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { assignDesigner, fetchAdminOrderDetail, fetchLabelAssetBlob, reverseOrderTimestamp, setOrderTimestamp, softDeleteOrder, toggleMessageActive } from '@/services/orders'
import { authedDriveBlob, initLabelUpload, uploadResumableFile } from '@/services/media'
import { upsertShipping, saveShippingLabel } from '@/services/shipping'
import { supabase, currentAccessToken } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { StageBadge } from '@/components/stage-badge'
import { orderStage, WRAPPER_LABELS, STAGE_LABELS } from '@/services/constants'
import { formatDateTime, formatMoney } from '@/services/format'
import { buildShippingPdf, buildReceiptPdf, downloadPdf } from '@/services/pdf'

const STAMP_FIELDS = ['paid_at', 'manufactured_at', 'shipped_at', 'arrived_at']
const STAMP_LABELS = {
  paid_at: 'Mark paid',
  manufactured_at: 'Mark manufactured',
  shipped_at: 'Mark shipped',
  arrived_at: 'Mark arrived',
}
const STAMP_REVERSE_LABELS = {
  paid_at: 'Unset paid',
  manufactured_at: 'Unset manufactured',
  shipped_at: 'Unset shipped',
  arrived_at: 'Unset arrived',
}

const MEDIA_ICONS = {
  image: ImageIcon,
  audio: AudioLines,
  video: Film,
  file: FileText,
}

export function OrderDetail() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const { maintenance } = useOutletContext()
  const [detail, setDetail] = useState(null)
  const [designers, setDesigners] = useState([])
  const [assignment, setAssignment] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [acting, setActing] = useState({})
  const [confirm, setConfirm] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [shippingForm, setShippingForm] = useState({})
  const [savingShipping, setSavingShipping] = useState(false)
  const [buildingLabel, setBuildingLabel] = useState(false)
  const [labelUrl, setLabelUrl] = useState(null)
  const [messageActive, setMessageActive] = useState(false)
  const [messageToggling, setMessageToggling] = useState(false)
  const previewUrlsRef = useRef([])

  useEffect(() => {
    const urls = previewUrlsRef.current
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [])

  const reload = async () => {
    if (!orderId) return
    try {
      const data = await fetchAdminOrderDetail(orderId)
      setDetail(data)
      setMessageActive(Boolean(data.message?.message_active))
      if (data.shipping) {
        setShippingForm({
          address_line1: data.shipping.address_line1 ?? '',
          address_line2: data.shipping.address_line2 ?? '',
          city: data.shipping.city ?? '',
          state_province: data.shipping.state_province ?? '',
          postal_code: data.shipping.postal_code ?? '',
          country: data.shipping.country ?? '',
          phone: data.shipping.phone ?? '',
          special_instructions: data.shipping.special_instructions ?? '',
          tracking_code: data.shipping.tracking_code ?? '',
          tracking_url: data.shipping.tracking_url ?? '',
        })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load order')
    }
  }

  useEffect(() => {
    void reload()
    void (async () => {
      if (!supabase) return
      const { data } = await supabase.from('designers').select('id, name, code, revoked_at')
      setDesigners(data ?? [])
    })()
  }, [orderId])

  useEffect(() => {
    if (!detail || !detail.shipping?.label_media) {
      setLabelUrl(null)
      return
    }
    const driveFileId = detail.shipping.label_media?.driveFileId
    if (!driveFileId) {
      setLabelUrl(null)
      return
    }
    void (async () => {
      try {
        const blob = await fetchLabelAssetBlob(driveFileId)
        const url = URL.createObjectURL(blob)
        previewUrlsRef.current.push(url)
        setLabelUrl(url)
      } catch {
        setLabelUrl(null)
      }
    })()
  }, [detail?.shipping])

  if (!orderId) return null

  const order = detail?.order
  const isDigital = order?.wrapper_type === 'digital'
  const currentStage = order ? orderStage(order) : null

  const stamp = async (field) => {
    if (order && order[field]) return
    setActing((a) => ({ ...a, [field]: true }))
    try {
      await setOrderTimestamp(orderId, field)
      toast.success(STAMP_LABELS[field])
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Could not ${STAMP_LABELS[field].toLowerCase()}`)
    } finally {
      setActing((a) => ({ ...a, [field]: false }))
    }
  }

  const doAssign = async (designerId) => {
    setAssigning(true)
    try {
      await assignDesigner(orderId, designerId)
      toast.success(designerId ? 'Designer assigned' : 'Designer unassigned')
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update assignment')
    } finally {
      setAssigning(false)
    }
  }

  const saveShipping = async () => {
    setSavingShipping(true)
    try {
      const raw = Object.fromEntries(Object.entries(shippingForm).filter(([, v]) => v.trim() !== ''))
      const input = {
        recipientName: order?.recipient_name ?? null,
        addressLine1: raw.address_line1 ?? '',
        addressLine2: raw.address_line2 ?? null,
        city: raw.city ?? '',
        stateProvince: raw.state_province ?? null,
        postalCode: raw.postal_code ?? '',
        country: raw.country ?? '',
        phone: raw.phone ?? null,
        specialInstructions: raw.special_instructions ?? null,
      }
      await upsertShipping(orderId, input)
      toast.success('Shipping details saved')
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save shipping')
    } finally {
      setSavingShipping(false)
    }
  }

  const generateLabel = async (upload) => {
    if (!detail?.order || !detail.template) return
    if (!shippingForm.city || !shippingForm.postal_code) {
      toast.error('City and postal code are required for a label')
      return
    }
    setBuildingLabel(true)
    try {
      const bytes = await buildShippingPdf({
        orderId,
        recipientName: detail.order.recipient_name ?? '',
        customerName: detail.order.customer_email ?? '',
        templateName: detail.template.name,
        wrapperType: detail.order.wrapper_type ?? '',
        shipping: {
          addressLine1: shippingForm.address_line1 ?? '',
          addressLine2: shippingForm.address_line2 ?? null,
          city: shippingForm.city ?? '',
          stateProvince: shippingForm.state_province ?? null,
          postalCode: shippingForm.postal_code ?? '',
          country: shippingForm.country ?? '',
          phone: shippingForm.phone ?? null,
          specialInstructions: shippingForm.special_instructions ?? null,
        },
        createdDate: detail.order.created_at ?? null,
        dueDate: detail.order.event_date ?? null,
      })
      if (!upload) {
        downloadPdf(bytes, `dearune-label-${orderId}.pdf`)
        toast.success('Shipping label downloaded')
        return
      }
      const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
      const adminToken = await currentAccessToken()
      if (!adminToken) throw new Error('Not signed in')
      const { sessionUrl } = await initLabelUpload({ orderId, fileName: `label-${orderId}.pdf`, sizeBytes: blob.size, adminToken })
      const file = new File([blob], 'label.pdf', { type: 'application/pdf' })
      const uploadResult = await uploadResumableFile(sessionUrl, file)
      if (!uploadResult.fileId) throw new Error('Upload did not return a file id')
      await saveShippingLabel(orderId, uploadResult.fileId)
      toast.success('Label uploaded and saved')
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not build the label')
    } finally {
      setBuildingLabel(false)
    }
  }

  const downloadReceipt = async () => {
    if (!detail?.order || !detail.template) return
    const bytes = await buildReceiptPdf({
      orderId,
      publicId: detail.message?.public_id ?? '—',
      recipientName: detail.order.recipient_name ?? '',
      templateName: detail.template.name,
      wrapperType: detail.order.wrapper_type ?? '',
      price: String(detail.order.snapshot_price ?? 0),
      currency: detail.order.currency ?? 'GBP',
      createdDate: detail.order.created_at ?? new Date().toISOString(),
      customerEmail: detail.order.customer_email,
    })
    downloadPdf(bytes, `dearune-receipt-${orderId}.pdf`)
    toast.success('Receipt downloaded')
  }

  const toggleMessage = async (active) => {
    setMessageToggling(true)
    try {
      await toggleMessageActive(orderId, active)
      setMessageActive(active)
      toast.success(active ? 'Message link enabled' : 'Message link disabled')
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the message link')
    } finally {
      setMessageToggling(false)
    }
  }

  const openMedia = async (m) => {
    if (!m.drive_file_id) return
    try {
      const blob = await authedDriveBlob(m.drive_file_id)
      const url = URL.createObjectURL(blob)
      previewUrlsRef.current.push(url)
      window.open(url, '_blank', 'noopener')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open attachment')
    }
  }

  const doConfirmAction = async () => {
    if (!confirm) return
    setConfirming(true)
    try {
      if (confirm.kind === 'cancel') {
        await setOrderTimestamp(orderId, 'cancelled_at', { reason: 'admin-initiated' })
        toast.success('Order cancelled')
      } else if (confirm.kind === 'delete') {
        await softDeleteOrder(orderId, 'admin-initiated')
        toast.success('Order archived')
        navigate('/admin/orders')
        return
      } else if (confirm.kind === 'reverse') {
        await reverseOrderTimestamp(orderId, confirm.field, { reason: 'maintenance-correction' })
        toast.success(STAMP_REVERSE_LABELS[confirm.field])
      }
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setConfirming(false)
      setConfirm(null)
    }
  }

  const price = Number(detail?.order?.snapshot_price ?? 0)
  const cost = Number(detail?.pricing?.cost ?? 0)
  const marginPct = price > 0 ? Math.round(((price - cost) / price) * 100) : null
  const stampDone = {}
  for (const f of STAMP_FIELDS) stampDone[f] = Boolean(order?.[f])

  const physicalNext = (() => {
    if (!order || order.cancelled_at) return null
    for (const f of STAMP_FIELDS) {
      if (!order[f]) return f
    }
    return null
  })()

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/admin/orders">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="size-4" />
            Orders
          </Button>
        </Link>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <h1 className="truncate font-heading text-2xl">{order?.recipient_name || 'Order'}</h1>
          {order && <StageBadge order={order} publishedAt={detail?.message?.published_at ?? null} />}
        </div>
      </div>

      {detail === null ? (
        <Card><CardContent className="space-y-3 p-6">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </CardContent></Card>
      ) : order === undefined ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <ShieldAlert className="size-8 text-muted-foreground" />
            <p className="font-heading text-lg">Order not found</p>
            <p className="text-sm text-muted-foreground">It may have been archived.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* A — Customer & gift */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">Customer &amp; gift</CardTitle>
              <CardDescription>
                Order <span className="font-mono text-xs">{order.id}</span> · created {formatDateTime(order.created_at)}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div><Label className="text-muted-foreground">Customer email</Label><p className="font-medium">{order.customer_email || '—'}</p></div>
              <div><Label className="text-muted-foreground">Phone</Label><p className="font-medium">{order.customer_phone || '—'}</p></div>
              <div><Label className="text-muted-foreground">Occasion</Label><p className="font-medium">{order.occasion || '—'}</p></div>
              <div><Label className="text-muted-foreground">Event date</Label><p className="font-medium">{order.event_date ? formatDateTime(order.event_date) : '—'}</p></div>
              <div className="sm:col-span-2"><Label className="text-muted-foreground">Message from the customer</Label><p className="text-sm">{order.recipient_message || '—'}</p></div>
              <div><Label className="text-muted-foreground">Notes</Label><p className="whitespace-pre-wrap text-sm">{order.notes || '—'}</p></div>
            </CardContent>
          </Card>

          {/* B — Item & pricing */}
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="font-heading text-lg">Item</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div><Label className="text-muted-foreground">Template</Label><p className="font-medium">{detail.template?.name ?? '—'}</p></div>
                <div><Label className="text-muted-foreground">Wrapper</Label><p className="font-medium">{WRAPPER_LABELS[order.wrapper_type] ?? order.wrapper_type}</p></div>
                <div><Label className="text-muted-foreground">Price charged</Label><p className="font-semibold tabular-nums">{formatMoney(String(order.snapshot_price ?? 0), order.currency ?? 'GBP')}</p></div>
                <div><Label className="text-muted-foreground">Cost estimate</Label><p className="tabular-nums text-muted-foreground">{detail.pricing?.cost != null ? formatMoney(String(detail.pricing.cost), order.currency ?? 'GBP') : '—'}</p></div>
                {marginPct != null && <div className="sm:col-span-2"><Label className="text-muted-foreground">Est. margin</Label><p className="font-medium tabular-nums">{marginPct}%</p></div>}
              </CardContent>
            </Card>

            {/* C — Designer */}
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-lg">Designer</CardTitle>
                <CardDescription>Who writes this message?</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {detail.designer ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{detail.designer.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{detail.designer.code}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => void doAssign(null)}>Unassign</Button>
                  </div>
                ) : (
                  <div>
                    <Select value={assignment} onValueChange={setAssignment}>
                      <SelectTrigger><SelectValue placeholder="Choose a designer" /></SelectTrigger>
                      <SelectContent>
                        {designers.filter((d) => !d.revoked_at).map((d) => (
                          <SelectItem key={d.id} value={d.id}>{d.name} · {d.code}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button className="mt-2 w-full" size="sm" disabled={!assignment || assigning} onClick={() => void doAssign(assignment)}>
                      {assigning ? <Loader2Icon className="size-4 animate-spin" /> : <Mail className="size-4" />}
                      Assign
                    </Button>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  The designer writes and publishes the message from their studio.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* D — Message status */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">Message</CardTitle>
              <CardDescription>
                Public page: {detail.message?.public_id ? (
                  <a className="underline underline-offset-4" href={`${window.location.origin}/message/${detail.message.public_id}`} target="_blank" rel="noreferrer">
                    /message/{detail.message.public_id}
                  </a>
                ) : 'not yet published'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-lg border bg-muted/30 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Locked</p>
                  <p className="text-sm font-medium">{detail.message?.locked_at ? formatDateTime(detail.message.locked_at) : 'No'}</p>
                </div>
                <div className="rounded-lg border bg-muted/30 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Published</p>
                  <p className="text-sm font-medium">{detail.message?.published_at ? formatDateTime(detail.message.published_at) : 'No'}</p>
                </div>
                <div className="rounded-lg border bg-muted/30 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Attachments</p>
                  <p className="text-sm font-medium">{detail.media.length}</p>
                </div>
                <div className="rounded-lg border bg-muted/30 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Opens</p>
                  <p className="text-sm font-medium">
                    {detail.message?.open_count ?? 0}
                    {detail.message?.first_opened_at ? ` · ${formatDateTime(detail.message.first_opened_at)}` : ''}
                  </p>
                </div>
              </div>
              {detail.message ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-heading text-lg">{detail.message.headline || 'No headline'}</p>
                    {detail.message.body && <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-foreground/85">{detail.message.body}</p>}
                    {detail.message.signature && <p className="mt-3 font-heading text-sm">{detail.message.signature}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Public page enabled</p>
                      <p className="text-xs text-muted-foreground">{detail.message.public_id ? `/${detail.message.public_id}` : ''}</p>
                    </div>
                    <Switch
                      checked={messageActive}
                      disabled={messageToggling || !detail.message?.public_id}
                      onCheckedChange={(v) => void toggleMessage(v)}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No message draft exists for this order yet.</p>
              )}
              {detail.media.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {detail.media.map((m) => {
                    const Icon = MEDIA_ICONS[m.media_type] ?? FileText
                    return (
                      <span
                        key={m.id}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1 text-xs transition-colors hover:border-primary/50"
                        onClick={() => void openMedia(m)}
                        title={m.drive_file_id ? 'Open attachment' : ''}
                      >
                        <Icon className="size-3" /> {m.original_filename ?? m.drive_file_id ?? m.media_type}
                      </span>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* E — Production */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">Production</CardTitle>
              <CardDescription>Current stage: {currentStage ? STAGE_LABELS[currentStage] ?? currentStage : '—'}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2">
              {!isDigital ? (
                <>
                  {STAMP_FIELDS.map((field) => {
                    const disabled = maintenance || Boolean(order.cancelled_at) || stampDone[field] || Boolean(order.deleted_at)
                    const isNext = physicalNext === field
                    return (
                      <div key={field} className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant={stampDone[field] ? 'outline' : isNext ? 'default' : 'ghost'}
                          disabled={disabled}
                          onClick={() => void stamp(field)}
                        >
                          {stampDone[field] ? 'Done' : acting[field] ? <Loader2Icon className="size-4 animate-spin" /> : <Truck className="size-4" />}
                          {STAMP_LABELS[field]}
                          {stampDone[field] && order[field] && <span className="ml-1 text-[10px] opacity-70">{formatDateTime(order[field] ?? '')}</span>}
                        </Button>
                        {stampDone[field] && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            disabled={!maintenance || Boolean(order.cancelled_at) || Boolean(order.deleted_at)}
                            title={maintenance ? STAMP_REVERSE_LABELS[field] : 'Available in maintenance mode'}
                            onClick={() => setConfirm({ kind: 'reverse', field, label: STAMP_REVERSE_LABELS[field] })}
                          >
                            {acting[`reverse-${field}`] ? <Loader2Icon className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
                          </Button>
                        )}
                      </div>
                    )
                  })}
                  <div className="ml-2 flex items-center gap-2 border-l pl-3">
                    <Button size="sm" variant="destructive" onClick={() => setConfirm({ kind: 'cancel', label: 'cancel' })} disabled={maintenance || Boolean(order.cancelled_at) || Boolean(order.deleted_at)}>
                      Cancel order
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'delete', label: 'delete' })} disabled={maintenance || Boolean(order.deleted_at)}>
                      <X className="size-4" /> Archive
                    </Button>
                  </div>
                </>
              ) : (
                <div className="w-full space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant={order.paid_at ? 'outline' : 'default'} disabled={maintenance || Boolean(order.cancelled_at) || Boolean(order.paid_at) || Boolean(order.deleted_at)} onClick={() => void stamp('paid_at')}>
                        {order.paid_at ? 'Paid' : <><Truck className="size-4" /> Mark paid</>}
                        {order.paid_at && <span className="ml-1 text-[10px] opacity-70">{formatDateTime(order.paid_at)}</span>}
                      </Button>
                      {order.paid_at && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          disabled={!maintenance || Boolean(order.cancelled_at) || Boolean(order.deleted_at)}
                          title={maintenance ? 'Unset paid' : 'Available in maintenance mode'}
                          onClick={() => setConfirm({ kind: 'reverse', field: 'paid_at', label: 'Unset paid' })}
                        >
                          {acting['reverse-paid_at'] ? <Loader2Icon className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
                        </Button>
                      )}
                    </div>
                    <span className="text-sm text-muted-foreground">
                      Digital messages are delivered the moment the designer publishes them — no manufacturing or shipping steps.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 border-t pt-3">
                    <Button size="sm" variant="destructive" onClick={() => setConfirm({ kind: 'cancel', label: 'cancel' })} disabled={maintenance || Boolean(order.cancelled_at) || Boolean(order.deleted_at)}>
                      Cancel order
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'delete', label: 'delete' })} disabled={maintenance || Boolean(order.deleted_at)}>
                      <X className="size-4" /> Archive
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* F — Shipping */}
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-lg">Shipping</CardTitle>
                <CardDescription>{isDigital ? 'No physical delivery for digital messages.' : 'Address, tracking, and the prep label.'}</CardDescription>
              </CardHeader>
              {!isDigital && (
                <CardContent className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="ad1">Address line 1</Label>
                      <Input id="ad1" value={shippingForm.address_line1 ?? ''} onChange={(e) => setShippingForm({ ...shippingForm, address_line1: e.target.value })} />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="ad2">Address line 2</Label>
                      <Input id="ad2" value={shippingForm.address_line2 ?? ''} onChange={(e) => setShippingForm({ ...shippingForm, address_line2: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="city">City</Label>
                      <Input id="city" value={shippingForm.city ?? ''} onChange={(e) => setShippingForm({ ...shippingForm, city: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="state">State / province</Label>
                      <Input id="state" value={shippingForm.state_province ?? ''} onChange={(e) => setShippingForm({ ...shippingForm, state_province: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="postal">Postal code</Label>
                      <Input id="postal" value={shippingForm.postal_code ?? ''} onChange={(e) => setShippingForm({ ...shippingForm, postal_code: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="country">Country</Label>
                      <Input id="country" value={shippingForm.country ?? ''} onChange={(e) => setShippingForm({ ...shippingForm, country: e.target.value })} />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="phone">Phone</Label>
                      <Input id="phone" value={shippingForm.phone ?? ''} onChange={(e) => setShippingForm({ ...shippingForm, phone: e.target.value })} />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="instructions">Special instructions</Label>
                      <Textarea className="min-h-[60px]" id="instructions" value={shippingForm.special_instructions ?? ''} onChange={(e) => setShippingForm({ ...shippingForm, special_instructions: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="tracking-code">Tracking code</Label>
                      <Input id="tracking-code" value={shippingForm.tracking_code ?? ''} onChange={(e) => setShippingForm({ ...shippingForm, tracking_code: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="tracking-url">Tracking URL</Label>
                      <Input id="tracking-url" value={shippingForm.tracking_url ?? ''} onChange={(e) => setShippingForm({ ...shippingForm, tracking_url: e.target.value })} />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <Button size="sm" onClick={() => void saveShipping()} disabled={savingShipping}>
                      {savingShipping ? <Loader2Icon className="size-4 animate-spin" /> : <Save className="size-4" />} Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void generateLabel(false)} disabled={buildingLabel}>
                      {buildingLabel ? <Loader2Icon className="size-4 animate-spin" /> : <Printer className="size-4" />} Generate label
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void generateLabel(true)} disabled={buildingLabel || maintenance}>
                      <Upload className="size-4" /> Save label
                    </Button>
                    {labelUrl && (
                      <a href={labelUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs underline underline-offset-4">
                        <FileText className="size-3.5" /> Saved label
                      </a>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>

            {/* G — Receipt */}
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-lg">Receipt</CardTitle>
                <CardDescription>Send this to the customer as proof of purchase.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-start gap-3">
                <div className="grid w-full grid-cols-2 gap-3">
                  <div className="rounded-lg border bg-muted/30 px-3 py-2"><p className="text-xs text-muted-foreground">Charged</p><p className="text-sm font-medium tabular-nums">{formatMoney(String(order.snapshot_price ?? 0), order.currency ?? 'GBP')}</p></div>
                  <div className="rounded-lg border bg-muted/30 px-3 py-2"><p className="text-xs text-muted-foreground">Currency</p><p className="text-sm font-medium">{order.currency ?? 'GBP'}</p></div>
                </div>
                <Button size="sm" variant="outline" onClick={() => void downloadReceipt()}>
                  <Receipt className="size-4" />
                  Download receipt PDF
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* H — Events */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">History</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {detail.events.length === 0 ? (
                <p className="text-sm text-muted-foreground">No events recorded.</p>
              ) : (
                <ol className="relative space-y-4 border-l pl-6">
                  {[...detail.events].reverse().map((ev) => (
                    <li key={ev.id} className="relative">
                      <span className="absolute -left-[31px] top-1 size-2.5 rounded-full border-2 border-background bg-primary" />
                      <p className="text-sm font-medium">{ev.action}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(ev.created_at)} · {ev.actor_type}{(ev.actor_id && detail.designer?.id === ev.actor_id) ? ` · ${detail.designer.name}` : ''}</p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(open) => { if (!open) setConfirm(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">
              {confirm?.kind === 'cancel' ? 'Cancel this order?' : confirm?.kind === 'delete' ? 'Archive this order?' : 'Confirm this correction?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === 'cancel'
                ? 'Cancelling removes the order from production and stops its message from ever being delivered. This cannot be undone.'
                : confirm?.kind === 'delete'
                  ? 'The order will be hidden from the dashboard. This is reversible, but the order leaves your active list immediately.'
                  : `This un-sets the "${STAMP_REVERSE_LABELS[confirm.field]?.replace('Unset ', '')}" timestamp. Only available in maintenance mode to correct mistakes.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirming}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirming || (confirm?.kind === 'cancel' && maintenance) || (confirm?.kind === 'delete' && maintenance)}
              onClick={(e) => { e.preventDefault(); void doConfirmAction() }}
            >
              {confirming ? 'Working…' : confirm?.kind === 'cancel' ? 'Cancel order' : confirm?.kind === 'delete' ? 'Archive' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}