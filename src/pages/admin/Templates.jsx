import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2Icon, Plus, Save } from 'lucide-react'
import { toast } from 'sonner'
import { fetchTemplates, updateTemplate } from '@/services/templates'
import { findOption, saveTemplateWrapperOption, wrapperLabel } from '@/services/wrappers'
import { DISPLAY_STATES, DISPLAY_STATE_META, getCatalogItemState } from '@/services/catalog'
import { templateMiniFor } from '@/templates'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppSettings } from '@/hooks/use-app-settings'

const rowKey = (templateId, wrapperId) => `${templateId}:${wrapperId}`

// Which wrappers each paper OFFERS, at which price — plus, in each card's
// header, the paper's own merchandising: Enabled (hidden from Create when
// off), Display state (Normal / New / Not Available Now) and Display order
// (the order Create renders). The shelf line beside the name previews the
// exact frontend result: `Visible • New • Order #1` or `Hidden`.
//
// The rows come from the wrapper catalog (`template_wrapper_options` joined
// to `wrapper_types`): turning "Offered" on creates the option row, turning
// it off keeps it (a Dearune already using that wrapper keeps its price)
// but stops the wrapper appearing in Create. Price fields are OVERRIDES —
// empty means "use the wrapper's base price", which is what every other
// screen resolves through `resolveWrapperPrice`. The legacy
// `template_pricing` table is frozen and no longer edited here.

export function Templates() {
  const { settings } = useAppSettings()
  const maintenance = Boolean(settings?.maintenance_mode)
  const [templates, setTemplates] = useState(null)
  const [wrappers, setWrappers] = useState([])
  const [options, setOptions] = useState([])
  const [draft, setDraft] = useState({})
  const [savingKey, setSavingKey] = useState(null)
  const [orderDraft, setOrderDraft] = useState({})
  const [savingTemplateId, setSavingTemplateId] = useState(null)

  const reload = async () => {
    try {
      const data = await fetchTemplates()
      setTemplates(data.templates)
      setWrappers(data.wrappers)
      setOptions(data.options)
      const next = {}
      for (const option of data.options) {
        next[rowKey(option.template_id, option.wrapper_id)] = {
          enabled: option.enabled !== false,
          price: option.price_override == null ? '' : String(option.price_override),
          cost: option.cost_override == null ? '' : String(option.cost_override),
        }
      }
      setDraft(next)
      const orders = {}
      for (const template of data.templates) orders[template.id] = String(template.sort_order ?? 0)
      setOrderDraft(orders)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load templates')
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  // One row-level save for the header controls (activation, display state,
  // order). RLS keeps the write admin-only; Create picks it up on its next
  // archive fetch.
  const saveTemplateRow = async (template, patch) => {
    setSavingTemplateId(template.id)
    try {
      await updateTemplate(template.id, patch)
      if ('enabled' in patch) {
        toast.success(patch.enabled ? `${template.name} is on the shelf` : `${template.name} is hidden from Create`)
      } else if ('display_state' in patch) {
        toast.success(`${template.name}: ${DISPLAY_STATE_META[patch.display_state]?.label ?? patch.display_state}`)
      } else {
        toast.success('Display order saved')
      }
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save this paper')
    } finally {
      setSavingTemplateId(null)
    }
  }

  const orderIsClean = (template) =>
    String(template.sort_order ?? 0) === String(Number(orderDraft[template.id] ?? '') || 0)

  const blankDraft = () => ({ enabled: true, price: '', cost: '' })

  const draftFor = (templateId, wrapper) => draft[rowKey(templateId, wrapper.id)] ?? {
    enabled: false,
    price: '',
    cost: '',
  }

  const originalFor = (templateId, wrapper) => {
    const option = findOption(options, templateId, wrapper.id)
    return {
      exists: Boolean(option),
      enabled: option ? option.enabled !== false : false,
      price: option?.price_override == null ? '' : String(option.price_override),
      cost: option?.cost_override == null ? '' : String(option.cost_override),
    }
  }

  const setField = (templateId, wrapperId, patch) => {
    setDraft((current) => {
      const key = rowKey(templateId, wrapperId)
      const existing = current[key] ?? blankDraft()
      return { ...current, [key]: { ...existing, ...patch } }
    })
  }

  const saveRow = async (templateId, wrapper) => {
    const key = rowKey(templateId, wrapper.id)
    const value = draft[key] ?? blankDraft()
    setSavingKey(key)
    try {
      await saveTemplateWrapperOption({
        templateId,
        wrapperId: wrapper.id,
        enabled: value.enabled,
        priceOverride: value.price.trim() === '' ? null : Number(value.price),
        costOverride: value.cost.trim() === '' ? null : Number(value.cost),
      })
      toast.success('Offering saved')
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save this offering')
    } finally {
      setSavingKey(null)
    }
  }

  // Effective values for display: the override when present, the wrapper's
  // base price otherwise — exactly what the designer's stage will charge.
  const effective = (value, base) => {
    const num = Number(value === '' || value == null ? base : value)
    return Number.isFinite(num) && num >= 0 ? num : 0
  }

  const currency = 'EGP'

  const rowsFor = !templates
    ? []
    : templates.map((template) => ({
        template,
        item: getCatalogItemState(template),
        Mini: templateMiniFor(template.slug),
        rows: wrappers.map((wrapper) => {
          const value = draftFor(template.id, wrapper)
          const original = originalFor(template.id, wrapper)
          const price = effective(value.price, wrapper.base_price)
          const cost = effective(value.cost, wrapper.production_cost)
          const dirty =
            value.enabled !== original.enabled ||
            value.price !== original.price ||
            value.cost !== original.cost
          return { wrapper, value, original, price, cost, dirty }
        }),
      }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl">Templates</h1>
          <p className="text-sm text-muted-foreground">
            The paper, its shelf life, and the wrappers it can be sent in. Enabled / Display state / Order are exactly what Create renders — switching one here changes the archive designers open next time they fetch it.
          </p>
        </div>
        <Button size="sm" variant="outline" asChild>
          <Link to="/admin/wrappers">
            <Plus className="size-4" /> Manage wrappers
          </Link>
        </Button>
      </div>

      {templates === null ? (
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}</div>
      ) : templates.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">No templates yet. Apply the seed migration to create them.</CardContent></Card>
      ) : (
        <div className="space-y-6">
          {rowsFor.map(({ template: t, item, Mini, rows }) => (
            <Card key={t.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="hidden h-20 w-14 shrink-0 overflow-hidden rounded-md border bg-muted/40 sm:grid sm:place-items-center">
                      {Mini ? (
                        <div className="grid h-full w-full place-items-center p-1 [&_svg]:max-h-full [&_svg]:max-w-full">
                          <Mini />
                        </div>
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="font-heading text-xl">{t.name}</CardTitle>
                      <CardDescription className="font-mono text-xs">/{t.slug}</CardDescription>
                      <p className="mt-1 text-[11px] text-muted-foreground">{item.summary}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`enabled-${t.id}`}
                        checked={t.enabled !== false}
                        disabled={maintenance || savingTemplateId === t.id}
                        onCheckedChange={(checked) => void saveTemplateRow(t, { enabled: checked })}
                        aria-label={`Show ${t.name} in Create`}
                      />
                      <Label htmlFor={`enabled-${t.id}`} className="cursor-pointer text-xs text-muted-foreground">
                        {t.enabled !== false ? 'Enabled' : 'Hidden'}
                      </Label>
                    </div>
                    <Select
                      value={t.display_state ?? 'normal'}
                      onValueChange={(value) => void saveTemplateRow(t, { display_state: value })}
                      disabled={maintenance || savingTemplateId === t.id}
                    >
                      <SelectTrigger className="h-8 w-full text-xs sm:w-[172px]" aria-label={`Display state for ${t.name}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DISPLAY_STATES.map((state) => (
                          <SelectItem key={state} value={state}>
                            {DISPLAY_STATE_META[state].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Label htmlFor={`order-${t.id}`} className="text-xs text-muted-foreground">
                        Order
                      </Label>
                      <Input
                        id={`order-${t.id}`}
                        type="number"
                        className="h-8 w-20 text-xs"
                        value={orderDraft[t.id] ?? ''}
                        disabled={maintenance}
                        onChange={(e) => setOrderDraft((current) => ({ ...current, [t.id]: e.target.value }))}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2"
                        disabled={maintenance || savingTemplateId === t.id || orderIsClean(t)}
                        onClick={() => void saveTemplateRow(t, { sort_order: Number(orderDraft[t.id]) || 0 })}
                        aria-label={`Save display order for ${t.name}`}
                      >
                        {savingTemplateId === t.id ? (
                          <Loader2Icon className="size-3.5 animate-spin" />
                        ) : (
                          <Save className="size-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {wrappers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No wrappers in the catalog yet.</p>
                ) : (
                  <div className="space-y-2">
                    <div className="hidden gap-4 px-1 text-[10px] uppercase tracking-wide text-muted-foreground md:grid md:grid-cols-[minmax(0,1.4fr)_88px_minmax(0,1fr)_minmax(0,1fr)_110px_92px]">
                      <span>Wrapper</span>
                      <span className="text-center">Offered</span>
                      <span>Price override</span>
                      <span>Cost override</span>
                      <span className="text-right">Charged</span>
                      <span />
                    </div>
                    {rows.map(({ wrapper, value, original, price, cost, dirty }) => {
                      const key = rowKey(t.id, wrapper.id)
                      const saving = savingKey === key
                      const margin = price > 0 ? Math.round(((price - cost) / price) * 100) : 0
                      return (
                        <div
                          key={wrapper.id}
                          className="grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-[minmax(0,1.4fr)_88px_minmax(0,1fr)_minmax(0,1fr)_110px_92px] md:items-center"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {wrapperLabel(wrapper)}
                              {!wrapper.active && <Badge variant="secondary" className="ml-2 align-middle">Hidden</Badge>}
                            </p>
                            <p className="truncate font-mono text-[11px] text-muted-foreground">
                              {wrapper.key} · base {Number(wrapper.base_price ?? 0)} / cost {Number(wrapper.production_cost ?? 0)}
                            </p>
                          </div>

                          <div className="flex justify-center">
                            <Switch
                              checked={value.enabled}
                              disabled={maintenance}
                              onCheckedChange={(checked) => setField(t.id, wrapper.id, { enabled: checked })}
                              aria-label={`Offer ${wrapperLabel(wrapper)} on ${t.name}`}
                            />
                          </div>

                          <div className="space-y-1">
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={value.price}
                              placeholder={String(Number(wrapper.base_price ?? 0))}
                              disabled={maintenance}
                              onChange={(e) => setField(t.id, wrapper.id, { price: e.target.value })}
                            />
                            <p className="text-[10px] text-muted-foreground">empty = base {Number(wrapper.base_price ?? 0)}</p>
                          </div>

                          <div className="space-y-1">
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={value.cost}
                              placeholder={String(Number(wrapper.production_cost ?? 0))}
                              disabled={maintenance}
                              onChange={(e) => setField(t.id, wrapper.id, { cost: e.target.value })}
                            />
                            <p className="text-[10px] text-muted-foreground">empty = base {Number(wrapper.production_cost ?? 0)}</p>
                          </div>

                          <div className="text-left md:text-right">
                            <p className="text-sm font-semibold tabular-nums">{value.enabled ? `${price} ${currency}` : '—'}</p>
                            <p className="text-[10px] text-muted-foreground">{value.enabled ? `margin ${margin}%` : 'not offered'}</p>
                          </div>

                          <div className="flex justify-start md:justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={maintenance || saving || !dirty}
                              onClick={() => void saveRow(t.id, wrapper)}
                            >
                              {saving ? <Loader2Icon className="size-4 animate-spin" /> : <Save className="size-4" />}
                              {original.exists ? 'Save' : 'Offer'}
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
                <p className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                  <span>Layout <code className="font-mono">{(t.print_config?.page?.width) ?? '595.28'} × {(t.print_config?.page?.height) ?? '841.89'} pt</code></span>
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="px-1 text-xs text-muted-foreground">
        {maintenance
          ? 'Maintenance mode on — editing is disabled.'
          : 'Prices are charged at sale time and snapshotted onto each sale. Wrappers themselves (names, photos, base prices) live under Manage wrappers.'}
      </p>
    </div>
  )
}
