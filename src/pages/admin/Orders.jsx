import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Download, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { fetchAdminOrders, adminCreateOrder } from '@/services/orders'
import { fetchTemplates } from '@/services/templates'
import { exportShippingCsv } from '@/services/shipping'
import { currentAccessToken } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StageBadge } from '@/components/stage-badge'
import { orderStage, WRAPPER_LABELS, WRAPPER_TYPES } from '@/services/constants'
import { formatMoney, formatDateTime } from '@/services/format'
import { createOrderSchema } from '@/services/validation'

const STAGES = ['all', 'pending', 'in-production', 'manufactured', 'shipped', 'delivered', 'cancelled']

export function Orders() {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('all')
  const [templateChoices, setTemplateChoices] = useState(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    email: '',
    recipient_name: '',
    template_id: '',
    wrapper_type: 'digital',
    occasion: '',
    delivery_date: '',
    customer_notes: '',
    designer_code: '',
  })

  const reload = async () => {
    try {
      setRows(await fetchAdminOrders())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load orders')
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  const filtered = useMemo(() => {
    if (!rows) return []
    const q = query.trim().toLowerCase()
    return rows.filter((o) => {
      const stage = orderStage(o)
      if (tab !== 'all' && stage !== tab) return false
      if (!q) return true
      const haystack = [o.recipient_name, o.customer_email, o.template?.name, o.designer?.name, o.message?.public_id, o.id].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [rows, query, tab])

  const openNewSale = () => {
    void (async () => {
      setCreating(true)
      try {
        const data = await fetchTemplates()
        setTemplateChoices({ templates: data.templates, pricing: data.pricing })
        setForm((f) => ({ ...f, template_id: data.templates[0]?.id ?? '' }))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not load templates')
        setCreating(false)
      }
    })()
  }

  const totalFor = (templateId, wrapper) => {
    if (!templateChoices) return null
    const row = templateChoices.pricing.find((p) => p.template_id === templateId && p.wrapper_type === wrapper)
    if (!row) return null
    return Number(row.price) || null
  }

  const create = async () => {
    const payload = {
      customerEmail: form.email.trim() || null,
      customerPhone: null,
      recipientName: form.recipient_name.trim(),
      templateId: form.template_id,
      wrapperType: form.wrapper_type,
      occasion: form.occasion.trim() || null,
      eventDate: form.delivery_date || null,
      recipientMessage: form.customer_notes.trim() || null,
      designerCode: form.designer_code.trim() || null,
    }
    const parsed = createOrderSchema.safeParse(payload)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      toast.error(first ? `${first.path.join('.')}: ${first.message}` : 'Check the form')
      return
    }
    setBusy(true)
    try {
      const adminToken = await currentAccessToken()
      if (!adminToken) throw new Error('Not signed in')
      const result = await adminCreateOrder(adminToken, parsed.data)
      toast.success(`Sale recorded — ${result.publicId}`)
      setCreating(false)
      await reload()
      navigate(`/admin/orders/${result.orderId}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create order')
    } finally {
      setBusy(false)
    }
  }

  const exportCsv = async () => {
    try {
      const blob = await exportShippingCsv()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'dearune-shipping.csv'
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Shipping CSV downloaded')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed')
    }
  }

  const previewPrice = form.template_id ? totalFor(form.template_id, form.wrapper_type) : null
  const currentPricing = templateChoices?.pricing.find((p) => p.template_id === form.template_id && p.wrapper_type === form.wrapper_type)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl">Orders</h1>
          <p className="text-sm text-muted-foreground">Every sale, from first payment to final delivery.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void exportCsv()}>
            <Download className="size-4" />
            Shipping CSV
          </Button>
          <Button size="sm" onClick={openNewSale}>
            <Plus className="size-4" />
            New sale
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs value={tab} onValueChange={(v) => setTab(v)}>
          <TabsList className="flex-wrap">
            {STAGES.map((stage) => (
              <TabsTrigger key={stage} value={stage} className="capitalize">{stage === 'in-production' ? 'Production' : stage}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search recipient, designer, order id…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? 'order' : 'orders'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {rows === null ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {rows.length === 0 ? 'No orders yet. Start the first sale.' : 'Nothing matches the current filters.'}
            </p>
          ) : (
            filtered.map((o) => (
              <Link
                key={o.id}
                to={`/admin/orders/${o.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2.5 transition-colors hover:border-primary/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{o.recipient_name || 'Untitled'}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {o.template?.name} · {WRAPPER_LABELS[o.wrapper_type] ?? o.wrapper_type}
                    {o.designer ? ` · ${o.designer.name}` : ''} · {formatDateTime(o.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="hidden text-xs tabular-nums text-muted-foreground sm:block">
                    {o.cancelled_at ? '—' : formatMoney(String(o.snapshot_price ?? 0))}
                  </span>
                  <StageBadge order={o} />
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={creating} onOpenChange={(open) => { if (!open) setCreating(false) }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">New sale</DialogTitle>
            <DialogDescription>Record a new order for a customer. The message gets written by the assigned designer.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="order-email">Customer email</Label>
                <Input id="order-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="customer@example.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="order-recipient">Recipient name</Label>
                <Input id="order-recipient" value={form.recipient_name} onChange={(e) => setForm({ ...form, recipient_name: e.target.value })} placeholder="Who is it for?" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Template</Label>
                <Select value={form.template_id} onValueChange={(v) => setForm({ ...form, template_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templateChoices?.templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Wrapper</Label>
                <Select value={form.wrapper_type} onValueChange={(v) => setForm({ ...form, wrapper_type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WRAPPER_TYPES.map((wt) => (
                      <SelectItem key={wt} value={wt}>{WRAPPER_LABELS[wt]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="order-occasion">Occasion</Label>
                <Input id="order-occasion" value={form.occasion} onChange={(e) => setForm({ ...form, occasion: e.target.value })} placeholder="Birthday, anniversary…" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="order-delivery">Delivery / event date</Label>
                <Input id="order-delivery" type="date" value={form.delivery_date} onChange={(e) => setForm({ ...form, delivery_date: e.target.value })} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="order-notes">Message to the recipient</Label>
              <Textarea id="order-notes" value={form.customer_notes} onChange={(e) => setForm({ ...form, customer_notes: e.target.value })} placeholder="What should the designer write? This briefs their draft." className="min-h-[70px]" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="order-designer">Designer code (optional)</Label>
              <Input id="order-designer" inputMode="numeric" maxLength={6} value={form.designer_code} onChange={(e) => setForm({ ...form, designer_code: e.target.value.replace(/\D/g, '') })} placeholder="6-digit code, or leave to assign later" />
            </div>

            {currentPricing && (
              <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3">
                <span className="text-sm text-muted-foreground">Price</span>
                <span className="font-semibold tabular-nums">{formatMoney(String(currentPricing.price), 'GBP')}</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={() => void create()} disabled={busy || !templateChoices || previewPrice === null}>
              {busy ? 'Recording…' : 'Create order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}