import { useEffect, useState } from 'react'
import { ImagePlus, Loader2Icon, Plus, Save } from 'lucide-react'
import { toast } from 'sonner'
import { currentAccessToken } from '@/lib/supabase'
import {
  createWrapper,
  fetchWrapperTypes,
  isWrapperStoragePath,
  removeWrapperPhoto,
  resolveWrapperPhotoUrl,
  updateWrapper,
  uploadWrapperPhoto,
} from '@/services/wrappers'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppSettings } from '@/hooks/use-app-settings'

// The wrapper catalog itself: what a Dearune can be sent as. Each row owns
// its copy (English + Arabic), photo, BASE price/cost and display order;
// the Templates page decides which papers offer it and any per-paper price
// override. Deactivating (rather than deleting) keeps history readable —
// Dearunes already sold in this wrapper still show it.
//
// Photos are uploaded through the `designer-media` edge function into the
// private `designer-drafts` bucket under `wrappers/<key>/…`, so the object
// path is what is stored in `image_url` and every view resolves it to a
// short-lived signed URL.

const KEY_RE = /^[a-z][a-z0-9_]{0,29}$/

const emptyDraft = {
  key: '',
  name: '',
  name_ar: '',
  description: '',
  description_ar: '',
  base_price: '0',
  production_cost: '0',
  display_order: '0',
  estimated_production_days: '7',
}

export function Wrappers() {
  const { settings } = useAppSettings()
  const maintenance = Boolean(settings?.maintenance_mode)
  const [wrappers, setWrappers] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [photoUrls, setPhotoUrls] = useState({})
  const [savingId, setSavingId] = useState(null)
  const [photoBusyId, setPhotoBusyId] = useState(null)
  const [adding, setAdding] = useState(false)
  const [newWrapper, setNewWrapper] = useState(emptyDraft)
  const [creating, setCreating] = useState(false)

  const reload = async () => {
    try {
      const rows = await fetchWrapperTypes()
      setWrappers(rows)
      const next = {}
      for (const row of rows) {
        next[row.id] = {
          name: row.name ?? '',
          name_ar: row.name_ar ?? '',
          description: row.description ?? '',
          description_ar: row.description_ar ?? '',
          base_price: String(row.base_price ?? 0),
          production_cost: String(row.production_cost ?? 0),
          display_order: String(row.display_order ?? 0),
          estimated_production_days: String(row.estimated_production_days ?? 7),
        }
      }
      setDrafts(next)
      void resolvePhotos(rows)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load the wrapper catalog')
    }
  }

  const resolvePhotos = async (rows) => {
    const token = await currentAccessToken().catch(() => null)
    if (!token) return
    const entries = await Promise.all(
      rows.map(async (row) => [
        row.id,
        row.image_url ? await resolveWrapperPhotoUrl(row.image_url, token) : null,
      ]),
    )
    setPhotoUrls(Object.fromEntries(entries))
  }

  useEffect(() => {
    void reload()
  }, [])

  const setField = (id, patch) => {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }))
  }

  const save = async (row) => {
    const draft = drafts[row.id]
    if (!draft) return
    setSavingId(row.id)
    try {
      await updateWrapper(row.id, {
        name: draft.name.trim(),
        name_ar: draft.name_ar.trim(),
        description: draft.description.trim(),
        description_ar: draft.description_ar.trim(),
        base_price: Number(draft.base_price) || 0,
        production_cost: Number(draft.production_cost) || 0,
        display_order: Number(draft.display_order) || 0,
        estimated_production_days: Number(draft.estimated_production_days) || 0,
      })
      toast.success('Wrapper saved')
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the wrapper')
    } finally {
      setSavingId(null)
    }
  }

  const toggleActive = async (row, active) => {
    setSavingId(row.id)
    try {
      await updateWrapper(row.id, { active })
      toast.success(active ? `${row.name} is offered again` : `${row.name} deactivated — existing Dearunes keep it`)
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change the wrapper')
    } finally {
      setSavingId(null)
    }
  }

  const onPickPhoto = async (row, file) => {
    if (!file) return
    const token = await currentAccessToken().catch(() => null)
    if (!token) {
      toast.error('Not signed in')
      return
    }
    setPhotoBusyId(row.id)
    try {
      const previous = row.image_url
      const path = await uploadWrapperPhoto(row.key, file, token)
      await updateWrapper(row.id, { image_url: path })
      if (previous && isWrapperStoragePath(previous) && previous !== path) {
        await removeWrapperPhoto(previous, token).catch(() => null)
      }
      toast.success('Photo updated')
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not upload the photo')
    } finally {
      setPhotoBusyId(null)
    }
  }

  const onRemovePhoto = async (row) => {
    const token = await currentAccessToken().catch(() => null)
    if (!token) return
    setPhotoBusyId(row.id)
    try {
      if (isWrapperStoragePath(row.image_url)) await removeWrapperPhoto(row.image_url, token)
      await updateWrapper(row.id, { image_url: '' })
      toast.success('Photo removed')
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove the photo')
    } finally {
      setPhotoBusyId(null)
    }
  }

  const create = async () => {
    const key = newWrapper.key.trim()
    if (!KEY_RE.test(key)) {
      toast.error('Key: lowercase letters, digits and underscores, starting with a letter (e.g. keepsake_box)')
      return
    }
    if (!newWrapper.name.trim()) {
      toast.error('A name is needed')
      return
    }
    setCreating(true)
    try {
      await createWrapper({
        key,
        name: newWrapper.name.trim(),
        name_ar: newWrapper.name_ar.trim(),
        description: newWrapper.description.trim(),
        description_ar: newWrapper.description_ar.trim(),
        base_price: Number(newWrapper.base_price) || 0,
        production_cost: Number(newWrapper.production_cost) || 0,
        display_order: Number(newWrapper.display_order) || 0,
        estimated_production_days: Number(newWrapper.estimated_production_days) || 0,
      })
      toast.success(`${newWrapper.name.trim()} added to the catalog`)
      setAdding(false)
      setNewWrapper(emptyDraft)
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add the wrapper')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl">Wrappers</h1>
          <p className="text-sm text-muted-foreground">How a Dearune is sent: its copy, photo and base price. Which papers offer it — and any price override — lives on the Templates page.</p>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> Add wrapper
        </Button>
      </div>

      {wrappers === null ? (
        <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-56 w-full" />)}</div>
      ) : wrappers.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">No wrappers yet — add the first one.</CardContent></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {wrappers.map((row) => {
            const draft = drafts[row.id] ?? {}
            const busy = savingId === row.id
            const photoBusy = photoBusyId === row.id
            const key = row.id
            return (
              <Card key={key} className={row.active ? '' : 'opacity-70'}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="flex items-center gap-2 font-heading text-lg">
                        <span className="truncate">{row.name}</span>
                        {!row.active && <Badge variant="secondary">Inactive</Badge>}
                      </CardTitle>
                      <CardDescription className="font-mono text-xs">{row.key}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{row.active ? 'Active' : 'Off'}</span>
                      <Switch
                        checked={row.active}
                        disabled={busy}
                        onCheckedChange={(checked) => void toggleActive(row, checked)}
                        aria-label={`Activate ${row.name}`}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-4">
                    <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border bg-muted">
                      {photoUrls[row.id] ? (
                        <img src={photoUrls[row.id]} alt={row.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <ImagePlus className="size-5" />
                        </div>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
                      <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
                        {photoBusy ? <Loader2Icon className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
                        {photoBusy ? 'Uploading…' : 'Upload photo'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={photoBusy || maintenance}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            e.target.value = ''
                            if (file) void onPickPhoto(row, file)
                          }}
                        />
                      </label>
                      {row.image_url && (
                        <button
                          className="w-fit text-xs text-destructive underline-offset-2 hover:underline disabled:opacity-50"
                          disabled={photoBusy || maintenance}
                          onClick={() => void onRemovePhoto(row)}
                        >
                          Remove photo
                        </button>
                      )}
                      <p className="truncate text-[10px] text-muted-foreground">{row.image_url || 'no photo yet'}</p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor={`name-${key}`} className="text-xs">Name (EN)</Label>
                      <Input id={`name-${key}`} value={draft.name ?? ''} disabled={maintenance} onChange={(e) => setField(key, { name: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`name-ar-${key}`} className="text-xs">الاسم (AR)</Label>
                      <Input id={`name-ar-${key}`} dir="rtl" lang="ar" value={draft.name_ar ?? ''} disabled={maintenance} onChange={(e) => setField(key, { name_ar: e.target.value })} />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor={`desc-${key}`} className="text-xs">Description (EN)</Label>
                      <Textarea id={`desc-${key}`} className="min-h-[54px]" value={draft.description ?? ''} disabled={maintenance} onChange={(e) => setField(key, { description: e.target.value })} />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor={`desc-ar-${key}`} className="text-xs">الوصف (AR)</Label>
                      <Textarea id={`desc-ar-${key}`} dir="rtl" lang="ar" className="min-h-[54px]" value={draft.description_ar ?? ''} disabled={maintenance} onChange={(e) => setField(key, { description_ar: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`price-${key}`} className="text-xs">Base price</Label>
                      <Input id={`price-${key}`} type="number" min={0} step="0.01" value={draft.base_price ?? ''} disabled={maintenance} onChange={(e) => setField(key, { base_price: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`cost-${key}`} className="text-xs">Base cost</Label>
                      <Input id={`cost-${key}`} type="number" min={0} step="0.01" value={draft.production_cost ?? ''} disabled={maintenance} onChange={(e) => setField(key, { production_cost: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`order-${key}`} className="text-xs">Display order</Label>
                      <Input id={`order-${key}`} type="number" value={draft.display_order ?? ''} disabled={maintenance} onChange={(e) => setField(key, { display_order: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`days-${key}`} className="text-xs">Production days</Label>
                      <Input id={`days-${key}`} type="number" min={0} value={draft.estimated_production_days ?? ''} disabled={maintenance} onChange={(e) => setField(key, { estimated_production_days: e.target.value })} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-muted-foreground">Prices here are the fallback; Templates can override per paper.</p>
                    <Button size="sm" variant="outline" disabled={busy || maintenance} onClick={() => void save(row)}>
                      {busy ? <Loader2Icon className="size-4 animate-spin" /> : <Save className="size-4" />}
                      Save
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <p className="px-1 text-xs text-muted-foreground">
        {maintenance ? 'Maintenance mode on — editing is disabled.' : 'Deactivating keeps this wrapper for Dearunes already sent with it; it stops appearing in Create.'}
      </p>

      <Dialog open={adding} onOpenChange={(next) => { if (!next) setAdding(false) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">Add a wrapper</DialogTitle>
            <DialogDescription>The key is permanent — it names the wrapper everywhere (and its photo folder).</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="new-key" className="text-xs">Key</Label>
              <Input id="new-key" placeholder="keepsake_box" value={newWrapper.key} onChange={(e) => setNewWrapper({ ...newWrapper, key: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-name" className="text-xs">Name (EN)</Label>
              <Input id="new-name" value={newWrapper.name} onChange={(e) => setNewWrapper({ ...newWrapper, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-name-ar" className="text-xs">الاسم (AR)</Label>
              <Input id="new-name-ar" dir="rtl" lang="ar" value={newWrapper.name_ar} onChange={(e) => setNewWrapper({ ...newWrapper, name_ar: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-price" className="text-xs">Base price</Label>
              <Input id="new-price" type="number" min={0} step="0.01" value={newWrapper.base_price} onChange={(e) => setNewWrapper({ ...newWrapper, base_price: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-cost" className="text-xs">Base cost</Label>
              <Input id="new-cost" type="number" min={0} step="0.01" value={newWrapper.production_cost} onChange={(e) => setNewWrapper({ ...newWrapper, production_cost: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-order" className="text-xs">Display order</Label>
              <Input id="new-order" type="number" value={newWrapper.display_order} onChange={(e) => setNewWrapper({ ...newWrapper, display_order: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-days" className="text-xs">Production days</Label>
              <Input id="new-days" type="number" min={0} value={newWrapper.estimated_production_days} onChange={(e) => setNewWrapper({ ...newWrapper, estimated_production_days: e.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="new-desc" className="text-xs">Description (EN)</Label>
              <Textarea id="new-desc" className="min-h-[54px]" value={newWrapper.description} onChange={(e) => setNewWrapper({ ...newWrapper, description: e.target.value })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="new-desc-ar" className="text-xs">الوصف (AR)</Label>
              <Textarea id="new-desc-ar" dir="rtl" lang="ar" className="min-h-[54px]" value={newWrapper.description_ar} onChange={(e) => setNewWrapper({ ...newWrapper, description_ar: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
            <Button onClick={() => void create()} disabled={creating}>
              {creating ? <Loader2Icon className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Add wrapper
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
