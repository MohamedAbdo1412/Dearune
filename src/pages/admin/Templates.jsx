import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Loader2Icon, Plus, Save, Image, Edit2, Eye, X, AlertCircle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { fetchTemplates, updateTemplate, createTemplate, updateTemplateIdentity, updateTemplatePreview } from '@/services/templates'
import { findOption, saveTemplateWrapperOption, wrapperLabel } from '@/services/wrappers'
import { DISPLAY_STATES, DISPLAY_STATE_META, getCatalogItemState } from '@/services/catalog'
import { templateMiniFor, listTemplates, getCurrentTemplateVersion, setCurrentTemplateVersion, getTemplateVersions, isVersionRegistered } from '@/templates'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppSettings } from '@/hooks/use-app-settings'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { optimizeAndThumbnail } from '@/lib/image-optimizer'
import { cn } from '@/lib/utils'
import { currentAccessToken } from '@/lib/supabase'

const rowKey = (templateId, wrapperId) => `${templateId}:${wrapperId}`

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
  const [versionDraft, setVersionDraft] = useState({})
  const [savingVersionSlug, setSavingVersionSlug] = useState(null)
  const [availableVersions, setAvailableVersions] = useState({})
  
  // New template creation/editing state
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    slug: '',
    description: '',
    display_name: '',
    public_path: '',
    display_state: 'normal',
    enabled: true,
  })
  const [editForm, setEditForm] = useState({})
  const [savingNew, setSavingNew] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  
  // Image upload state
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [previewImage, setPreviewImage] = useState(null)
  const [thumbnailPreview, setThumbnailPreview] = useState(null)
  const [uploadError, setUploadError] = useState('')

  const reload = useCallback(async () => {
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
      try {
        const versionsMap = {}
        const versionDraftMap = {}
        for (const template of data.templates) {
          const versions = getTemplateVersions(template.slug)
          versionsMap[template.slug] = versions
          versionDraftMap[template.slug] = String(getCurrentTemplateVersion(template.slug) || versions[0] || 1)
        }
        setAvailableVersions(versionsMap)
        setVersionDraft(versionDraftMap)
      } catch (e) {}
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load templates')
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

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

  const saveTemplateVersion = async (template) => {
    const slug = template.slug
    const version = Number(versionDraft[slug])
    if (!version) return
    if (!isVersionRegistered(slug, version)) {
      toast.error('Selected version is not registered')
      return
    }
    setSavingVersionSlug(slug)
    try {
      setCurrentTemplateVersion(slug, version)
      if (template?.id) {
        await updateTemplate(template.id, { current_version: version })
      }
      toast.success(`${template.name} now uses version ${version}`)
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update version')
    } finally {
      setSavingVersionSlug(null)
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

  const effective = (value, base) => {
    const num = Number(value === '' || value == null ? base : value)
    return Number.isFinite(num) && num >= 0 ? num : 0
  }

  const currency = 'EGP'

  const handleImageUpload = async (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setUploadError('Please select an image file')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setUploadError('Image must be smaller than 20MB')
      return
    }
    try {
      const bitmap = await createImageBitmap(file)
      bitmap.close()
    } catch {
      setUploadError('Could not read image file. Please try another file.')
      return
    }
    setUploadError('')
    setUploadingImage(true)
    setUploadProgress(0)
    try {
      const { optimized, thumbnail } = await optimizeAndThumbnail(file, {
        optimized: { maxWidth: 1600, maxHeight: 1600, quality: 0.82, format: 'webp' },
        thumbnail: { maxWidth: 400, maxHeight: 400, quality: 0.8, format: 'webp' },
      })
      setUploadProgress(50)
      const token = await currentAccessToken()
      if (!token) throw new Error('No auth token')
      const { uploadDesignerMedia } = await import('@/services/media')
      const mediaRef = await uploadDesignerMedia(optimized, { token })
      setPreviewImage(mediaRef.key || mediaRef.path)
      setUploadProgress(75)
      const thumbRef = await uploadDesignerMedia(thumbnail, { token })
      setThumbnailPreview(thumbRef.key || thumbRef.path)
      setUploadProgress(100)
      toast.success('Template preview image uploaded')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      setUploadError(msg)
      toast.error(msg)
    } finally {
      setUploadingImage(false)
      setUploadProgress(0)
    }
  }

  const handleImageChange = (e) => {
    const file = e.target.files?.[0]
    if (file) handleImageUpload(file)
  }

  const clearPreviewImage = () => {
    setPreviewImage(null)
    setThumbnailPreview(null)
    setUploadError('')
  }

  const handleCreateTemplate = async () => {
    if (!newTemplate.name.trim()) {
      toast.error('Template name is required')
      return
    }
    if (!newTemplate.slug.trim()) {
      toast.error('Public path (slug) is required')
      return
    }
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(newTemplate.slug)) {
      toast.error('Public path must be lowercase, start with a letter, and contain only letters, numbers, hyphens, and underscores')
      return
    }
    setSavingNew(true)
    try {
      const data = await createTemplate({
        name: newTemplate.name.trim(),
        slug: newTemplate.slug.trim(),
        description: newTemplate.description.trim(),
        display_name: newTemplate.display_name.trim() || newTemplate.name.trim(),
        public_path: newTemplate.public_path.trim() || newTemplate.slug.trim(),
        display_state: newTemplate.display_state,
        enabled: newTemplate.enabled,
        preview_image_url: previewImage,
        thumbnail_url: thumbnailPreview,
      })
      toast.success(`Template "${data.name}" created`)
      setCreateDialogOpen(false)
      setNewTemplate({
        name: '',
        slug: '',
        description: '',
        display_name: '',
        public_path: '',
        display_state: 'normal',
        enabled: true,
      })
      setPreviewImage(null)
      setThumbnailPreview(null)
      await reload()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not create template'
      if (msg.includes('duplicate') || msg.includes('unique')) {
        toast.error('A template with this name or public path already exists')
      } else {
        toast.error(msg)
      }
    } finally {
      setSavingNew(false)
    }
  }

  const handleEditTemplate = (template) => {
    setEditingTemplate(template)
    setEditForm({
      name: template.name,
      display_name: template.display_name || template.name,
      public_path: template.public_path || template.slug,
      description: template.description || '',
      display_state: template.display_state || 'normal',
      enabled: template.enabled !== false,
    })
    setEditDialogOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!editingTemplate) return
    if (!editForm.display_name?.trim()) {
      toast.error('Display name is required')
      return
    }
    if (!editForm.public_path?.trim()) {
      toast.error('Public path is required')
      return
    }
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(editForm.public_path)) {
      toast.error('Public path must be lowercase, start with a letter, and contain only letters, numbers, hyphens, and underscores')
      return
    }
    setSavingEdit(true)
    try {
      await updateTemplateIdentity(editingTemplate.id, {
        display_name: editForm.display_name.trim(),
        public_path: editForm.public_path.trim(),
      })
      if (editForm.name !== editingTemplate.name ||
          editForm.description !== (editingTemplate.description || '') ||
          editForm.display_state !== editingTemplate.display_state ||
          editForm.enabled !== editingTemplate.enabled) {
        await updateTemplate(editingTemplate.id, {
          name: editForm.name.trim(),
          description: editForm.description.trim(),
          display_state: editForm.display_state,
          enabled: editForm.enabled,
        })
      }
      toast.success('Template updated')
      setEditDialogOpen(false)
      setEditingTemplate(null)
      await reload()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save template'
      if (msg.includes('duplicate') || msg.includes('unique')) {
        toast.error('A template with this public path already exists')
      } else {
        toast.error(msg)
      }
    } finally {
      setSavingEdit(false)
    }
  }

  const rowsFor = useMemo(() => {
    const list = templates ?? []
    return list.map((template) => {
      const state = getCatalogItemState(template)
      const Mini = templateMiniFor(template.slug)
      const rows = []
      for (const wrapper of wrappers) {
        const original = originalFor(template.id, wrapper)
        const value = draftFor(template.id, wrapper)
        const isDirty =
          original.exists !== (value.enabled && (value.price !== '' || value.cost !== '')) ||
          (original.exists && (original.enabled !== value.enabled || original.price !== value.price || original.cost !== value.cost)) ||
          (!original.exists && value.enabled)
        rows.push({ wrapper, original, value, isDirty, key: rowKey(template.id, wrapper.id) })
      }
      return { template, item: state, Mini, rows }
    })
  }, [templates, wrappers, options, draft])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl">Templates</h1>
          <p className="text-sm text-muted-foreground">
            Manage templates - create, edit names/paths, upload previews. No deletion.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="size-4" />
            Add template
          </Button>
        </div>
      </div>

      {templates === null ? (
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}</div>
      ) : templates.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">No templates yet.</CardContent></Card>
      ) : (
        <div className="space-y-6">
          {(rowsFor || []).map(({ template: t, item, Mini }) => (
            <Card key={t.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="hidden h-20 w-14 shrink-0 overflow-hidden rounded-md border bg-muted/40 sm:grid sm:place-items-center">
                      {Mini ? (
                        <div className="grid h-full w-full place-items-center p-1 [&_svg]:max-h-full [&_svg]:max-w-full">
                          <Mini />
                        </div>
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="font-heading text-xl">{t.display_name || t.name}</CardTitle>
                      <CardDescription className="font-mono text-xs">/{t.slug}</CardDescription>
                      {t.public_path && t.public_path !== t.slug && (
                        <CardDescription className="font-mono text-xs text-muted-foreground">Public: /{t.public_path}</CardDescription>
                      )}
                      <p className="mt-1 text-[11px] text-muted-foreground">{item?.summary}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleEditTemplate(t)}>
                      <Edit2 className="size-4" />
                      Edit
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Preview Image</Label>
                  <div className="flex items-center gap-4">
                    <div className="relative w-32 h-24 bg-muted rounded-lg overflow-hidden border border-border flex-shrink-0">
                      {t.preview_image_url ? (
                        <img src={t.preview_image_url} alt={`${t.name} preview`} className="w-full h-full object-cover" />
                      ) : t.thumbnail_url ? (
                        <img src={t.thumbnail_url} alt={`${t.name} thumbnail`} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">No preview</div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">Upload via Edit dialog.</p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Name</Label>
                    <p className="text-sm">{t.name}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Display Name</Label>
                    <p className="text-sm">{t.display_name || t.name}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Public Path</Label>
                    <p className="text-sm font-mono">/{t.public_path || t.slug}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Enabled</Label>
                    <p className="text-sm">{t.enabled !== false ? 'Yes' : 'No'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Template</DialogTitle>
            <DialogDescription>Add a new template to the catalog.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-name">Template Name *</Label>
              <Input id="create-name" value={newTemplate.name} onChange={(e) => setNewTemplate((c) => ({ ...c, name: e.target.value, display_name: c.display_name || e.target.value, slug: c.slug || e.target.value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-') }))} placeholder="e.g., Memorial Message" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-slug">Public Path (slug) *</Label>
              <Input id="create-slug" value={newTemplate.slug} onChange={(e) => setNewTemplate((c) => ({ ...c, slug: e.target.value, public_path: c.public_path || e.target.value }))} placeholder="e.g., memorial-message" />
              <p className="text-xs text-muted-foreground">Lowercase, starts with letter, letters/numbers/hyphens/underscores</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-display-name">Display Name</Label>
              <Input id="create-display-name" value={newTemplate.display_name} onChange={(e) => setNewTemplate((c) => ({ ...c, display_name: e.target.value }))} placeholder="Display name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-public-path">Public Path (override)</Label>
              <Input id="create-public-path" value={newTemplate.public_path} onChange={(e) => setNewTemplate((c) => ({ ...c, public_path: e.target.value }))} placeholder="Public path" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-description">Description</Label>
              <Input id="create-description" value={newTemplate.description} onChange={(e) => setNewTemplate((c) => ({ ...c, description: e.target.value }))} placeholder="Description" />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="create-enabled">Enabled</Label>
              <Switch id="create-enabled" checked={newTemplate.enabled} onCheckedChange={(checked) => setNewTemplate((c) => ({ ...c, enabled: checked }))} />
            </div>
            <div className="space-y-2">
              <Label>Preview Image</Label>
              <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e.target.files?.[0])} disabled={uploadingImage} />
              {uploadingImage && <p className="text-xs text-muted-foreground">{uploadProgress}%</p>}
              {previewImage && <p className="text-xs text-muted-foreground">Uploaded</p>}
              {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateTemplate} disabled={savingNew}>
              {savingNew ? <Loader2Icon className="size-4 animate-spin" /> : <Save className="size-4" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
            <DialogDescription>Update template information.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Template Name *</Label>
              <Input id="edit-name" value={editForm.name || ''} onChange={(e) => setEditForm((c) => ({ ...c, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-display-name">Display Name *</Label>
              <Input id="edit-display-name" value={editForm.display_name || ''} onChange={(e) => setEditForm((c) => ({ ...c, display_name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-public-path">Public Path *</Label>
              <Input id="edit-public-path" value={editForm.public_path || ''} onChange={(e) => setEditForm((c) => ({ ...c, public_path: e.target.value }))} />
              <p className="text-xs text-muted-foreground">Lowercase, starts with letter, letters/numbers/hyphens/underscores</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Input id="edit-description" value={editForm.description || ''} onChange={(e) => setEditForm((c) => ({ ...c, description: e.target.value }))} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-enabled">Enabled</Label>
              <Switch id="edit-enabled" checked={editForm.enabled !== false} onCheckedChange={(checked) => setEditForm((c) => ({ ...c, enabled: checked }))} />
            </div>
            <div className="space-y-2">
              <Label>Preview Image</Label>
              <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e.target.files?.[0])} disabled={uploadingImage} />
              {uploadingImage && <p className="text-xs text-muted-foreground">{uploadProgress}%</p>}
              {previewImage && <p className="text-xs text-muted-foreground">Uploaded</p>}
              {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={savingEdit}>
              {savingEdit ? <Loader2Icon className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
