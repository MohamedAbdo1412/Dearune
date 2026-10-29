import { useEffect, useState, useCallback, useMemo } from 'react'
import { Loader2Icon, Plus, Save, Edit2 } from 'lucide-react'
import { toast } from 'sonner'
import { fetchTemplates, updateTemplate, createTemplate, updateTemplateIdentity, updateTemplatePreview, isTemplateStoragePath, resolveTemplateImageUrl, uploadTemplateAsset, TEMPLATE_SLUG_RE } from '@/services/templates'
import { getCatalogItemState } from '@/services/catalog'
import { templateMiniFor } from '@/templates'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { optimizeAndThumbnail } from '@/lib/image-optimizer'
import { currentAccessToken } from '@/lib/supabase'

export function Templates() {
  const [templates, setTemplates] = useState(null)

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
  // Rows store a storage PATH; the card needs a signed URL to paint it.
  const [previewUrls, setPreviewUrls] = useState({})

  const resolvePreviews = useCallback(async (rows) => {
    const token = await currentAccessToken().catch(() => null)
    if (!token) return
    const entries = await Promise.all(
      (rows ?? []).map(async (row) => {
        const source = isTemplateStoragePath(row.preview_image_url)
          ? row.preview_image_url
          : isTemplateStoragePath(row.thumbnail_url)
            ? row.thumbnail_url
            : null
        return [row.id, source ? await resolveTemplateImageUrl(source, token) : null]
      }),
    )
    setPreviewUrls(Object.fromEntries(entries))
  }, [])

  const reload = useCallback(async () => {
    try {
      const data = await fetchTemplates()
      setTemplates(data.templates)
      void resolvePreviews(data.templates)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load templates')
    }
  }, [resolvePreviews])

  useEffect(() => {
    void reload()
  }, [reload])

  const handleImageUpload = async (file, templateSlug) => {
    if (!file) return
    if (!TEMPLATE_SLUG_RE.test(String(templateSlug ?? ''))) {
      setUploadError('Set a valid public path (slug) first — the preview is stored under it.')
      return
    }
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
      const mediaPath = await uploadTemplateAsset(templateSlug, optimized, token, { fixed: 'preview' })
      setPreviewImage(mediaPath)
      setUploadProgress(75)
      const thumbPath = await uploadTemplateAsset(templateSlug, thumbnail, token, { fixed: 'preview-thumb' })
      setThumbnailPreview(thumbPath)
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

  const openCreateDialog = () => {
    // Never carry a preview uploaded for a previous draft into a new one.
    setPreviewImage(null)
    setThumbnailPreview(null)
    setUploadError('')
    setUploadProgress(0)
    setCreateDialogOpen(true)
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
    if (!TEMPLATE_SLUG_RE.test(newTemplate.slug)) {
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
    // Seed the preview state with what the row already holds, so saving the
    // dialog persists exactly these values unless a new image is uploaded.
    setPreviewImage(template.preview_image_url || null)
    setThumbnailPreview(template.thumbnail_url || null)
    setUploadError('')
    setUploadProgress(0)
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
    if (!TEMPLATE_SLUG_RE.test(editForm.public_path)) {
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
      const originalPreview = editingTemplate.preview_image_url || ''
      const originalThumb = editingTemplate.thumbnail_url || ''
      const nextPreview = previewImage || ''
      const nextThumb = thumbnailPreview || ''
      if (nextPreview !== originalPreview || nextThumb !== originalThumb) {
        await updateTemplatePreview(editingTemplate.id, nextPreview, nextThumb)
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
      const item = getCatalogItemState(template)
      const Mini = templateMiniFor(template.slug)
      // A stored object path is not an image: use the resolved signed URL,
      // while a plain URL (or empty) passes straight through.
      const stored = template.preview_image_url || template.thumbnail_url || ''
      const previewUrl = previewUrls[template.id] ?? (isTemplateStoragePath(stored) ? '' : stored)
      return { template, item, Mini, previewUrl }
    })
  }, [templates, previewUrls])

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
          <Button size="sm" variant="outline" onClick={openCreateDialog}>
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
          {(rowsFor || []).map(({ template: t, item, Mini, previewUrl }) => (
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
                      {previewUrl ? (
                        <img src={previewUrl} alt={`${t.name} preview`} className="w-full h-full object-cover" />
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
              <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e.target.files?.[0], newTemplate.slug)} disabled={uploadingImage} />
              <p className="text-xs text-muted-foreground">Stored under templates/{newTemplate.slug || '<slug>'}/</p>
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
              <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e.target.files?.[0], editingTemplate?.slug)} disabled={uploadingImage} />
              <p className="text-xs text-muted-foreground">Stored under templates/{editingTemplate?.slug || '<slug>'}/</p>
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
