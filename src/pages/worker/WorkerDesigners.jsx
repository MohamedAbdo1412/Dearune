import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import {
  ChevronRight,
  Copy,
  Download,
  FolderOpen,
  KeyRound,
  Loader2,
  Pencil,
  PenLine,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
  UserPlus,
} from 'lucide-react'
import { toast } from 'sonner'
import { ProjectBadge } from '@/components/stage-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { hasPermission } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/services/format'
import {
  activateDesignerAsWorker,
  createDesignerAsWorker,
  fetchWorkerDesigners,
  downloadWorkerShipmentsCsv,
  fetchWorkerProjects,
  fetchWorkerShipmentsForExport,
  resetDesignerPasscodeAsWorker,
  revokeDesignerAsWorker,
  updateDesignerAsWorker,
} from '@/services/workerDesigners'

function messageOf(error) {
  return error instanceof Error ? error.message : 'Something went wrong'
}

async function copy(value) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success('Copied')
  } catch {
    toast.error('Could not copy — select the text instead')
  }
}

function CredentialDialog({ credentials, onClose }) {
  return (
    <Dialog open={Boolean(credentials)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {credentials ? (
          <>
            <DialogHeader>
              <DialogTitle>{credentials.title}</DialogTitle>
              <DialogDescription>{credentials.note}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {credentials.items.map((item) => (
                <div key={item.label} className="rounded-xl border border-border bg-muted/40 p-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{item.label}</p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <code className="break-all font-mono text-lg font-semibold tracking-wider">{item.value}</code>
                    <Button type="button" variant="outline" size="icon" onClick={() => copy(item.value)} aria-label={`Copy ${item.label}`}>
                      <Copy className="size-4" aria-hidden />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <p className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs leading-5 text-muted-foreground">
              This is shown once. The studio does not store the passcode in readable form and cannot
              show it again. If it is lost, reset it here.
            </p>
            <DialogFooter>
              <Button onClick={onClose}>I have shared it securely</Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export function WorkerDesigners() {
  const { session } = useOutletContext()
  const permissions = session.permissions
  const canCreate = hasPermission(permissions, 'designers.create')
  const canEdit = hasPermission(permissions, 'designers.edit')
  const canManage = hasPermission(permissions, 'designers.manage')
  const canAssign = hasPermission(permissions, 'designers.assign')
  const canViewDetails = hasPermission(permissions, 'designers.view_details')
  const canExport = hasPermission(permissions, 'designers.export')

  const [designers, setDesigners] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [projects, setProjects] = useState(null)
  const [projectsError, setProjectsError] = useState('')
  const [busy, setBusy] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editCode, setEditCode] = useState('')
  const [credentials, setCredentials] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [exporting, setExporting] = useState(false)

  const selected = useMemo(
    () => (designers ?? []).find((designer) => designer.id === selectedId) ?? null,
    [designers, selectedId],
  )

  const load = useCallback(async () => {
    setError('')
    try {
      const data = await fetchWorkerDesigners()
      setDesigners(data)
      setSelectedId((current) => {
        if (current && data.some((designer) => designer.id === current)) return current
        return data[0]?.id ?? ''
      })
    } catch (caught) {
      setError(messageOf(caught))
      setDesigners((current) => current ?? [])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!selectedId) {
      setProjects([])
      return
    }
    let cancelled = false
    setProjects(null)
    setProjectsError('')
    fetchWorkerProjects(selectedId)
      .then((data) => {
        if (!cancelled) setProjects(data)
      })
      .catch((caught) => {
        if (!cancelled) {
          setProjectsError(messageOf(caught))
          setProjects([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return designers ?? []
    return (designers ?? []).filter((designer) =>
      [designer.name, designer.code].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle)),
    )
  }, [designers, query])

  const stats = useMemo(() => {
    const all = designers ?? []
    return {
      total: all.length,
      active: all.filter((designer) => !designer.revokedAt).length,
      revoked: all.filter((designer) => designer.revokedAt).length,
      projects: all.reduce((total, designer) => total + (Number(designer.projectCount) || 0), 0),
    }
  }, [designers])

  const create = async () => {
    if (!createName.trim()) {
      toast.error('Please provide a designer name')
      return
    }
    setBusy(true)
    try {
      const result = await createDesignerAsWorker(createName.trim())
      setCreateOpen(false)
      setCreateName('')
      setCredentials({
        title: 'Designer created',
        note: 'Give these two values to the designer privately. The ID identifies them; the passcode signs them in.',
        items: [
          { label: 'Designer ID', value: result.code },
          { label: 'Passcode', value: result.passcode },
        ],
      })
      await load()
    } catch (caught) {
      toast.error(messageOf(caught))
    } finally {
      setBusy(false)
    }
  }

  const openEdit = () => {
    if (!selected) return
    setEditName(selected.name)
    setEditCode(selected.code)
    setEditOpen(true)
  }

  const saveEdit = async () => {
    if (!selected) return
    if (!editName.trim() || !editCode.trim()) {
      toast.error('A name and sign-in ID are both required')
      return
    }
    setBusy(true)
    try {
      await updateDesignerAsWorker(selected.id, { name: editName.trim(), code: editCode.trim() })
      toast.success('Designer updated')
      setEditOpen(false)
      await load()
    } catch (caught) {
      toast.error(messageOf(caught))
    } finally {
      setBusy(false)
    }
  }

  const exportShipments = async () => {
    if (exporting || !canExport) return
    setExporting(true)
    try {
      const rows = await fetchWorkerShipmentsForExport()
      const count = downloadWorkerShipmentsCsv(rows)
      if (count === 0) toast.error('No delivery details have been entered yet')
      else toast.success(`Shipping CSV downloaded · ${count} ${count === 1 ? 'Dearune' : 'Dearunes'}`)
    } catch (caught) {
      toast.error(messageOf(caught))
    } finally {
      setExporting(false)
    }
  }

  const runConfirm = async () => {
    if (!confirm) return
    const { type, designer } = confirm
    setBusy(true)
    try {
      if (type === 'revoke') {
        await revokeDesignerAsWorker(designer.id)
        toast.success('Designer access revoked')
      } else if (type === 'activate') {
        await activateDesignerAsWorker(designer.id)
        toast.success('Designer reactivated')
      } else if (type === 'reset') {
        const result = await resetDesignerPasscodeAsWorker(designer.id)
        setCredentials({
          title: 'New designer passcode',
          note: `Share this new passcode with ${designer.name} privately. The previous passcode no longer works.`,
          items: [{ label: 'Passcode', value: result.passcode }],
        })
      }
      setConfirm(null)
      await load()
    } catch (caught) {
      toast.error(messageOf(caught))
    } finally {
      setBusy(false)
    }
  }

  if (designers === null) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </div>
    )
  }

  if (error && designers.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/70 p-8 text-center">
        <span className="mx-auto inline-flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <PenLine className="size-6" aria-hidden />
        </span>
        <h1 className="mt-4 font-heading text-xl tracking-tight">Designers could not be loaded</h1>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" className="mt-4" onClick={load}>
          <RefreshCw className="size-4" aria-hidden />
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Designers</p>
          <h1 className="mt-1 font-heading text-3xl tracking-tight">The people behind the Dearunes</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            A safe directory: names, sign-in IDs, project counts and each designer's Dearunes. Sale
            prices, costs and the private letter are not part of this view.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canExport ? (
            <Button variant="outline" onClick={exportShipments} disabled={exporting}>
              {exporting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Download className="size-4" aria-hidden />
              )}
              Shipping CSV
            </Button>
          ) : null}
          <Button variant="outline" onClick={load}>
            <RefreshCw className="size-4" aria-hidden />
            Refresh
          </Button>
          {canCreate ? (
            <Button onClick={() => setCreateOpen(true)}>
              <UserPlus className="size-4" aria-hidden />
              Create designer
            </Button>
          ) : null}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Designers', value: stats.total },
          { label: 'Active', value: stats.active },
          { label: 'Revoked', value: stats.revoked },
          { label: 'Dearunes', value: stats.projects },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-border bg-card px-4 py-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{stat.label}</p>
            <p className="mt-2 font-heading text-3xl tracking-tight">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr] lg:items-start">
        <section className="rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-9"
                placeholder="Search name or ID…"
                aria-label="Search designers"
              />
            </div>
          </div>
          <div className="max-h-[34rem] overflow-y-auto p-2 worker-scroll">
            {visible.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                {query ? 'No designer matches that search.' : 'No designers yet. Create the first one.'}
              </p>
            ) : (
              <ul className="space-y-1">
                {visible.map((designer) => (
                  <li key={designer.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(designer.id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors',
                        designer.id === selectedId ? 'bg-primary/10' : 'hover:bg-muted/60',
                      )}
                    >
                      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 font-heading text-sm text-primary">
                        {(designer.name || '?').slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{designer.name}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {designer.code} · {designer.projectCount} Dearune{designer.projectCount === 1 ? '' : 's'}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        {designer.revokedAt ? (
                          <Badge variant="outline" className="text-[0.62rem]">Revoked</Badge>
                        ) : (
                          <span className="size-1.5 rounded-full bg-emerald-500" aria-label="Active" />
                        )}
                        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="min-h-[22rem] rounded-2xl border border-border bg-card shadow-sm">
          {selected ? (
            <>
              <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-heading text-2xl tracking-tight">{selected.name}</h2>
                    {selected.revokedAt ? (
                      <Badge variant="outline">Revoked</Badge>
                    ) : (
                      <Badge className="bg-primary/10 text-primary">Active</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Sign-in ID <span className="font-mono font-medium text-foreground">{selected.code}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Created {formatDateTime(selected.createdAt)} · Last sign-in {selected.lastLoginAt ? formatDateTime(selected.lastLoginAt) : 'never'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canViewDetails || canAssign ? (
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/worker/designers/${selected.id}`}>
                        <FolderOpen className="size-4" aria-hidden />
                        {canAssign ? 'Open & assign' : 'Full page'}
                      </Link>
                    </Button>
                  ) : null}
                  {canEdit ? (
                    <Button variant="outline" size="sm" onClick={openEdit}>
                      <Pencil className="size-4" aria-hidden />
                      Edit
                    </Button>
                  ) : null}
                  {canManage ? (
                    <>
                      <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirm({ type: 'reset', designer: selected })}>
                        <KeyRound className="size-4" aria-hidden />
                        Reset passcode
                      </Button>
                      {selected.revokedAt ? (
                        <Button size="sm" disabled={busy} onClick={() => setConfirm({ type: 'activate', designer: selected })}>
                          <ShieldCheck className="size-4" aria-hidden />
                          Reactivate
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirm({ type: 'revoke', designer: selected })}>
                          <ShieldOff className="size-4" aria-hidden />
                          Revoke
                        </Button>
                      )}
                    </>
                  ) : null}
                </div>
              </div>

              <div className="p-5">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <FolderOpen className="size-4 text-primary" aria-hidden />
                  Dearunes
                </h3>
                {projects === null ? (
                  <div className="mt-3 space-y-2">
                    <Skeleton className="h-14 rounded-xl" />
                    <Skeleton className="h-14 rounded-xl" />
                    <Skeleton className="h-14 rounded-xl" />
                  </div>
                ) : projectsError ? (
                  <p className="mt-3 rounded-xl bg-destructive/5 px-3 py-2 text-sm text-destructive">{projectsError}</p>
                ) : projects.length === 0 ? (
                  <p className="mt-3 rounded-xl bg-muted/50 px-3 py-6 text-center text-sm text-muted-foreground">
                    No Dearunes handed over yet.
                  </p>
                ) : (
                  <ul className="mt-3 divide-y divide-border">
                    {projects.map((project) => (
                      <li key={project.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{project.title || 'Untitled Dearune'}</p>
                          <p className="mt-0.5 font-mono text-xs text-muted-foreground">{project.reference}</p>
                        </div>
                        <ProjectBadge project={project} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <div className="flex h-full min-h-[22rem] flex-col items-center justify-center p-8 text-center">
              <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <PenLine className="size-6" aria-hidden />
              </span>
              <p className="mt-4 text-sm text-muted-foreground">Choose a designer to see their Dearunes.</p>
            </div>
          )}
        </section>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a designer</DialogTitle>
            <DialogDescription>
              A designer signs in with a generated ID and passcode, not an email. The passcode is
              shown once after creation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="designer-name">Designer name</Label>
            <Input
              id="designer-name"
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="e.g. Nour"
              maxLength={120}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={create} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
              Create designer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit designer</DialogTitle>
            <DialogDescription>Changing the sign-in ID replaces how this designer signs in.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="designer-edit-name">Name</Label>
              <Input id="designer-edit-name" value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={120} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="designer-edit-code">Sign-in ID</Label>
              <Input id="designer-edit-code" value={editCode} onChange={(event) => setEditCode(event.target.value)} maxLength={40} className="font-mono" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={saveEdit} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Save designer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(confirm)} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.type === 'revoke'
                ? 'Revoke this designer?'
                : confirm?.type === 'activate'
                  ? 'Reactivate this designer?'
                  : 'Reset this passcode?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.type === 'revoke'
                ? `${confirm?.designer?.name} will not be able to sign in. Their existing Dearunes stay exactly as they are.`
                : confirm?.type === 'activate'
                  ? `${confirm?.designer?.name} will be able to sign in again with their current passcode.`
                  : `A new passcode will be generated for ${confirm?.designer?.name}. The previous passcode stops working immediately.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep as is</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                runConfirm()
              }}
              disabled={busy}
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {confirm?.type === 'revoke' ? 'Revoke access' : confirm?.type === 'activate' ? 'Reactivate' : 'Generate passcode'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CredentialDialog credentials={credentials} onClose={() => setCredentials(null)} />
    </div>
  )
}
