import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2Icon, Plus, Save } from 'lucide-react'
import { toast } from 'sonner'
import { fetchTemplates } from '@/services/templates'
import { findOption, saveTemplateWrapperOption, wrapperLabel } from '@/services/wrappers'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppSettings } from '@/hooks/use-app-settings'

// Which wrappers each paper OFFERS, at which price.
//
// The rows come from the wrapper catalog (`template_wrapper_options` joined
// to `wrapper_types`): turning "Offered" on creates the option row, turning
// it off keeps it (a Dearune already using that wrapper keeps its price)
// but stops the wrapper appearing in Create. Price fields are OVERRIDES —
// empty means "use the wrapper's base price", which is what every other
// screen resolves through `resolveWrapperPrice`. The legacy
// `template_pricing` table is frozen and no longer edited here.

const rowKey = (templateId, wrapperId) => `${templateId}:${wrapperId}`

export function Templates() {
  const { settings } = useAppSettings()
  const maintenance = Boolean(settings?.maintenance_mode)
  const [templates, setTemplates] = useState(null)
  const [wrappers, setWrappers] = useState([])
  const [options, setOptions] = useState([])
  const [draft, setDraft] = useState({})
  const [savingKey, setSavingKey] = useState(null)

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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load templates')
    }
  }

  useEffect(() => {
    void reload()
  }, [])

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
          <p className="text-sm text-muted-foreground">The paper, the layout, and the wrappers it can be sent in. Price edits are blocked during maintenance.</p>
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
          {rowsFor.map(({ template: t, rows }) => (
            <Card key={t.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="font-heading text-xl">{t.name}</CardTitle>
                    <CardDescription className="font-mono text-xs">/{t.slug}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.enabled ? <Badge variant="outline" className="text-emerald-700 dark:text-emerald-400">Enabled</Badge> : <Badge variant="secondary">Disabled</Badge>}
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
                              {!wrapper.active && <Badge variant="secondary" className="ml-2 align-middle">Inactive</Badge>}
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

                          <div className="text-right">
                            <p className="text-sm font-semibold tabular-nums">{value.enabled ? `${price} ${currency}` : '—'}</p>
                            <p className="text-[10px] text-muted-foreground">{value.enabled ? `margin ${margin}%` : 'not offered'}</p>
                          </div>

                          <div className="flex justify-end">
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
