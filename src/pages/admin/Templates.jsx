import { useEffect, useState } from 'react'
import { Loader2Icon, Save } from 'lucide-react'
import { toast } from 'sonner'
import { fetchTemplates, updatePricingRow } from '@/services/templates'
import { WRAPPER_LABELS, WRAPPER_TYPES } from '@/services/constants'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppSettings } from '@/hooks/use-app-settings'

export function Templates() {
  const { settings } = useAppSettings()
  const maintenance = Boolean(settings?.maintenance_mode)
  const [templates, setTemplates] = useState(null)
  const [pricing, setPricing] = useState(null)
  const [draft, setDraft] = useState({})
  const [savingId, setSavingId] = useState(null)

  const reload = async () => {
    try {
      const data = await fetchTemplates()
      setTemplates(data.templates)
      setPricing(data.pricing)
      const next = {}
      for (const p of data.pricing) {
        next[p.id] = { price: String(p.price), cost: String(p.cost ?? '') }
      }
      setDraft(next)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load templates')
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  const saveRow = async (pricingId) => {
    const value = draft[pricingId]
    if (!value) return
    setSavingId(pricingId)
    try {
      await updatePricingRow(pricingId, {
        price: Number(value.price),
        cost: value.cost === '' ? 0 : Number(value.cost),
      })
      toast.success('Pricing updated')
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update pricing')
    } finally {
      setSavingId(null)
    }
  }

  const priceFor = (templateId, wrapper) =>
    pricing?.find((p) => p.template_id === templateId && p.wrapper_type === wrapper)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Templates</h1>
        <p className="text-sm text-muted-foreground">The paper, the layout, and what it costs. Price edits are blocked during maintenance.</p>
      </div>

      {templates === null ? (
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}</div>
      ) : templates.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">No templates yet. Apply the seed migration to create them.</CardContent></Card>
      ) : (
        <div className="space-y-6">
          {templates.map((t) => (
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
                <div
                  className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
                >
                  {WRAPPER_TYPES.map((wrapper) => {
                    const row = priceFor(t.id, wrapper)
                    const value = row ? draft[row.id] : undefined
                    return (
                      <div key={wrapper} className="space-y-2 rounded-lg border bg-muted/20 p-3">
                        <Label className="text-sm">{WRAPPER_LABELS[wrapper]}</Label>
                        {!row ? (
                          <p className="text-xs text-muted-foreground">No pricing row</p>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 space-y-1">
                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Price</span>
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={value?.price ?? ''}
                                  disabled={maintenance}
                                  onChange={(e) => setDraft((d) => ({ ...d, [row.id]: { price: e.target.value, cost: d[row.id]?.cost ?? String(row.cost ?? '') } }))}
                                />
                              </div>
                              <div className="flex-1 space-y-1">
                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Cost</span>
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={value?.cost ?? ''}
                                  disabled={maintenance}
                                  placeholder="—"
                                  onChange={(e) => setDraft((d) => ({ ...d, [row.id]: { price: d[row.id]?.price ?? String(row.price), cost: e.target.value } }))}
                                />
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">
                                Margin {Number(row.price) > 0 ? Math.round(((Number(row.price) - Number(row.cost ?? 0)) / Number(row.price)) * 100) : 0}%
                              </span>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={maintenance || savingId === row.id || value?.price === String(row.price) && value?.cost === String(row.cost ?? '')}
                                onClick={() => void saveRow(row.id)}
                              >
                                {savingId === row.id ? <Loader2Icon className="size-4 animate-spin" /> : <Save className="size-4" />}
                                Save
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
                <p className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                  <span>Layout <code className="font-mono">{(t.print_config?.page?.width) ?? '595.28'} × {(t.print_config?.page?.height) ?? '841.89'} pt</code></span>
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="px-1 text-xs text-muted-foreground">
        {maintenance ? 'Maintenance mode on — editing is disabled.' : 'Prices below are charged at sale time and snapshotted onto each order.'}
      </p>
    </div>
  )
}