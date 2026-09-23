import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Download, Film, FileText, ImageIcon, AudioLines, Loader2Icon, Lock, Paperclip, RefreshCw, Save, Send, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { clearDesignerToken, fetchDesignerMessage, getDesignerToken, publishDesignerMessage, saveDesignerMessage } from '@/services/designer'
import { compressImage, designerAuthedDriveBlob, initMessageUpload, mediaTypeForFile, MEDIA_TYPE_LIMITS, uploadResumableFile } from '@/services/media'
import { buildInsertPdf, downloadPdf } from '@/services/pdf'
import { qrContent, qrDataUrl } from '@/services/qr'
import { WRAPPER_LABELS } from '@/services/constants'
import { formatMoney } from '@/services/format'
import { Brand } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { StageBadge } from '@/components/stage-badge'

const MEDIA_ICONS = {
  image: ImageIcon,
  audio: AudioLines,
  video: Film,
  file: FileText,
}

function MediaIcon({ type }) {
  const Icon = MEDIA_ICONS[type] ?? FileText
  return <Icon className="size-4" />
}

function fileNameOf(row) {
  return row.original_filename || `${row.media_type}.file`
}

export function DesignerMessageEditor() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const token = getDesignerToken()

  const [loading, setLoading] = useState(true)
  const [locked, setLocked] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  const [publicId, setPublicId] = useState('')
  const [messageId, setMessageId] = useState('')
  const [order, setOrder] = useState({})
  const [headline, setHeadline] = useState('')
  const [body, setBody] = useState('')
  const [signature, setSignature] = useState('')
  const [publishedAt, setPublishedAt] = useState(null)
  const [media, setMedia] = useState([])
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [preview, setPreview] = useState(false)
  const [qrInfo, setQrInfo] = useState(null)
  const [pendingFiles, setPendingFiles] = useState([])
  const fileRef = useRef(null)
  const previewUrlsRef = useRef([])

  const wrapperType = String(order.wrapper_type ?? '')
  const isDigital = wrapperType === 'digital'

  useEffect(() => {
    const urls = previewUrlsRef.current
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [])

  const hydratePreviews = useCallback(async (rows) => {
    const tk = getDesignerToken()
    const withPreviews = await Promise.all(
      rows.map(async (row) => {
        if (!['image', 'audio'].includes(row.media_type)) return row
        if (!row.drive_file_id || !tk) return row
        try {
          const blob = await designerAuthedDriveBlob(row.drive_file_id, tk)
          const url = URL.createObjectURL(blob)
          previewUrlsRef.current.push(url)
          return { ...row, previewUrl: url }
        } catch {
          return row
        }
      }),
    )
    return withPreviews
  }, [])

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!token || !orderId) return
      try {
        const result = await fetchDesignerMessage(token, orderId)
        if (!active) return
        setOrder(result.order ?? {})
        setHeadline(result.message?.headline ?? '')
        setBody(result.message?.body ?? '')
        setSignature(result.message?.signature ?? '')
        setPublicId(result.message?.public_id ?? '')
        setMessageId(result.message?.id ?? '')
        setLocked(Boolean(result.message?.locked_at))
        setPublishedAt(result.message?.published_at ?? null)
        setCancelled(Boolean(result.order?.cancelled_at))
        const rows = await hydratePreviews(result.media ?? [])
        if (active) setMedia(rows)
      } catch (err) {
        if (active) toast.error(err instanceof Error ? err.message : 'Failed to load message')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [token, orderId, hydratePreviews])

  const saveDraft = async () => {
    if (!token || !orderId) return
    setSaving(true)
    try {
      const additions = pendingFiles.map((p) => ({
        driveFileId: p.fileId,
        mediaType: p.mediaType,
        mimeType: p.file.type || 'application/octet-stream',
        sizeBytes: p.file.size,
        originalFilename: p.fileName,
      }))
      const result = await saveDesignerMessage(token, orderId, {
        headline,
        body,
        signature: signature || null,
        mediaAdditions: additions.length > 0 ? additions : undefined,
      })
      const rows = await hydratePreviews(result.media ?? [])
      setMedia(rows)
      setPendingFiles([])
      toast.success('Draft saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const removeMedia = async (mediaId) => {
    if (!token || !orderId) return
    try {
      const result = await saveDesignerMessage(token, orderId, {
        headline,
        body,
        signature: signature || null,
        mediaRemove: [mediaId],
      })
      const rows = await hydratePreviews(result.media ?? [])
      setMedia(rows)
      toast.success('Media removed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove media')
    }
  }

  const onPickFiles = async (files) => {
    if (!token || !messageId) return
    const additions = []
    for (const file of files) {
      try {
        let uploadFile = file
        const mediaType = mediaTypeForFile(file)
        if (mediaType === 'image') uploadFile = await compressImage(file)
        const mimeType = uploadFile.type || 'application/octet-stream'
        if (uploadFile.size > MEDIA_TYPE_LIMITS[mediaType]) throw new Error('File is too large')
        const { sessionUrl } = await initMessageUpload({
          messageId,
          mediaType,
          fileName: uploadFile.name,
          mimeType,
          sizeBytes: uploadFile.size,
          token,
        })
        const upload = await uploadResumableFile(sessionUrl, uploadFile)
        if (!upload.fileId) throw new Error('Upload did not return a file id')
        additions.push({ fileId: upload.fileId, file: uploadFile, mediaType, fileName: uploadFile.name })
      } catch (err) {
        toast.error(`${file.name}: ${err instanceof Error ? err.message : 'upload failed'}`)
      }
    }
    setPendingFiles((prev) => [...prev, ...additions])
    if (additions.length > 0) toast.success(`${additions.length} file${additions.length > 1 ? 's' : ''} staged — save draft to attach`)
  }

  const publish = async () => {
    if (!token || !orderId) return
    if (!body.trim()) {
      toast.error('Write the message before publishing')
      return
    }
    setPublishing(true)
    try {
      const result = await publishDesignerMessage(token, orderId)
      const content = qrContent(result.qrPayload)
      const image = await qrDataUrl(content, 220)
      setQrInfo({ content, publicId: result.qrPayload.publicId, image })
      setLocked(true)
      setPublishedAt(result.message.published_at ?? new Date().toISOString())
      setPreview(true)
      toast.success(isDigital ? 'Message published' : 'Message locked and ready to print')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not publish')
    } finally {
      setPublishing(false)
    }
  }

  const generatePrintFile = async () => {
    if (!qrInfo) return
    try {
      const bytes = await buildInsertPdf({
        headline,
        body,
        signature: signature || null,
        qrContent: qrInfo.content,
        printConfig: {},
      })
      downloadPdf(bytes, `dearune-${publicId || 'letter'}.pdf`)
      toast.success('Print file ready')
    } catch {
      toast.error('Could not generate the print file')
    }
  }

  const previewUrl = useMemo(() => (publicId ? `${window.location.origin}/message/${publicId}` : null), [publicId])

  const signOut = () => {
    clearDesignerToken()
    navigate('/designer/login', { replace: true })
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading message…
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[oklch(0.97_0.004_90)] px-6 pb-16 pt-6">
      <header className="mx-auto flex max-w-4xl items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/designer">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="size-4" />
              Studio
            </Button>
          </Link>
          <Brand />
        </div>
        <Button variant="ghost" size="sm" onClick={signOut}>Sign out</Button>
      </header>

      <main className="mx-auto mt-8 max-w-4xl space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="font-heading text-2xl">
                  {String(order.recipient_name ?? '')}
                </CardTitle>
                <CardDescription>
                  {String(order.template_name ?? 'Template')} · {String(order.occasion ?? '') || '—'} · {String(order.event_date ?? '') || '—'}
                </CardDescription>
              </div>
              <StageBadge order={order} publishedAt={publishedAt} />
            </div>
            <p className="text-sm text-muted-foreground">
              {WRAPPER_LABELS[wrapperType] ?? wrapperType}
              {!isDigital && order.snapshot_price ? ` · ${formatMoney(String(order.snapshot_price), String(order.currency ?? 'GBP'))}` : ''}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {cancelled && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                This order has been cancelled. Writing is disabled.
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="wire-public">Public link (for reference)</Label>
              <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                <Link className="min-w-0 flex-1 truncate underline underline-offset-4 hover:text-foreground" to={previewUrl ?? '/'}>
                  {previewUrl ?? '—'}
                </Link>
                <Link className="flex items-center gap-1.5 text-xs" to={previewUrl ?? '/'}>
                  Open <span>↗</span>
                </Link>
              </div>
              {messageId && <p className="text-xs text-muted-foreground">Opening the link counts an open — use the studio preview to check the layout instead.</p>}
            </div>
          </CardContent>
        </Card>

        {locked ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
              <Lock className="size-8 text-muted-foreground/60" />
              <div>
                <p className="font-heading text-xl">Message is published</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  The words are sealed{isDigital ? '' : ' — the print file is ready for the studio'}.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button onClick={publish} disabled={publishing}>
                  {publishing ? <Loader2Icon className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  {isDigital ? 'Republish' : 'Reprint QR'}
                </Button>
                {!isDigital && qrInfo && (
                  <Button variant="outline" onClick={generatePrintFile}>
                    <Download className="size-4" />
                    Print file
                  </Button>
                )}
              </div>
              <p className="max-w-md text-xs text-muted-foreground">
                Reprinting issues a fresh protected link for the print run. The previous link is retired.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-xl">The words</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="headline">Headline</Label>
                    <Input id="headline" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="To my dearest…" disabled={cancelled} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signature">Signature</Label>
                    <Input id="signature" value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="With love, always" disabled={cancelled} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="body">The message</Label>
                  <Textarea
                    id="body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Write the words that are meant to last…"
                    className="min-h-[240px]"
                    disabled={cancelled}
                  />
                  <p className="text-right text-xs text-muted-foreground">{body.length.toLocaleString()} characters</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="font-heading text-xl">Attachments</CardTitle>
                  <CardDescription>Add a photo, memento, or a voice note to accompany the letter.</CardDescription>
                </div>
                <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => void onPickFiles(Array.from(e.target.files ?? []))} />
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={cancelled || !messageId}>
                  <Paperclip className="size-4" />
                  Add files
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {media.length === 0 && pendingFiles.length === 0 ? (
                  <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                    No attachments yet.
                  </p>
                ) : (
                  <>
                    {media.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
                        <MediaIcon type={item.media_type} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">{fileNameOf(item)}</p>
                          {item.previewUrl && item.media_type === 'image' ? (
                            <img src={item.previewUrl} alt="" className="mt-2 max-h-40 rounded-md border" loading="lazy" />
                          ) : item.previewUrl && item.media_type === 'audio' ? (
                            <audio controls className="mt-2 w-full" src={item.previewUrl} />
                          ) : (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {item.size_bytes ? `${Math.round(item.size_bytes / 1024)} KB · ` : ''}
                              {item.media_type}
                            </p>
                          )}
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => void removeMedia(item.id)} disabled={cancelled}>
                          <Trash2 className="size-4 text-muted-foreground" />
                        </Button>
                      </div>
                    ))}
                    {pendingFiles.map((p) => (
                      <div key={p.fileId} className="flex items-center gap-3 rounded-lg border border-dashed bg-secondary/30 px-3 py-2">
                        <MediaIcon type={p.mediaType} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">{p.fileName}</p>
                          <p className="text-xs text-muted-foreground">Uploaded — staging to attach on save</p>
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {pendingFiles.length > 0 && (
                  <p className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                    <Save className="size-3.5" /> Save the draft to attach staged files.
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4">
              <p className="text-sm text-muted-foreground">
                {cancelled ? (
                  'This order is cancelled.'
                ) : isDigital ? (
                  'Publishing makes the message available to its recipient.'
                ) : (
                  'Publishing locks the words and prepares the print file.'
                )}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => void saveDraft()} disabled={saving || cancelled}>
                  {saving ? <Loader2Icon className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Save draft
                </Button>
                <Button onClick={() => void publish()} disabled={publishing || cancelled || !body.trim()}>
                  {publishing ? <Loader2Icon className="size-4 animate-spin" /> : <Send className="size-4" />}
                  {isDigital ? 'Publish now' : 'Lock & publish'}
                </Button>
              </div>
            </div>

            <label className="flex items-center justify-between rounded-2xl border border-dashed bg-card px-4 py-3">
              <span className="text-sm text-muted-foreground">Preview the letter layout</span>
              <Switch checked={preview} onCheckedChange={setPreview} />
            </label>

            {preview && (
              <Card className="border-dashed">
                <CardContent className="px-6 py-10 md:px-10">
                  <p className="text-center text-xs uppercase tracking-[0.3em] text-muted-foreground">Draft preview</p>
                  {headline && <h2 className="mt-6 text-center font-heading text-2xl">{headline}</h2>}
                  <div className="mt-6 whitespace-pre-wrap text-[15px] leading-[1.85] text-foreground/90">
                    {body || <span className="text-muted-foreground italic">Nothing written yet…</span>}
                  </div>
                  {signature && <p className="mt-8 text-right font-heading text-xl">{signature}</p>}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>

      <Dialog open={Boolean(qrInfo)} onOpenChange={(open) => { if (!open) setQrInfo(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">{isDigital ? 'Message published' : 'Ready for the studio'}</DialogTitle>
            <DialogDescription>
              {isDigital
                ? 'The recipient can now open their message.'
                : 'Download the print file, attach it to the piece, and include the protected QR. The message goes live the moment it is delivered.'}
            </DialogDescription>
          </DialogHeader>
          {qrInfo && (
            <div className="flex flex-col items-center gap-3">
              <img src={qrInfo.image} alt="QR code" className="size-44 rounded-lg border" />
              <p className="w-full truncate rounded-lg bg-muted px-3 py-2 text-center font-mono text-xs">
                {qrInfo.content}
              </p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setQrInfo(null)}>Close</Button>
            {!isDigital && (
              <Button onClick={() => void generatePrintFile()}>
                <Download className="size-4" />
                Download print file
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}