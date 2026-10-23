import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Copy,
  FolderOpen,
  History,
  KeyRound,
  Loader2,
  PenLine,
  ShieldCheck,
  ShieldOff,
  UserPlus,
} from 'lucide-react'
import { toast } from 'sonner'
import { ProjectBadge } from '@/components/stage-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { hasPermission } from '@/lib/permissions'
import { formatDateTime } from '@/services/format'
import {
  activateDesignerAsWorker,
  assignDesignerToProjectAsWorker,
  fetchWorkerDesignerDetail,
  fetchWorkerDesigners,
  fetchWorkerProjects,
  resetDesignerPasscodeAsWorker,
  revokeDesignerAsWorker,
} from '@/services/workerDesigners'

const messageOf = (error) => (error instanceof Error ? error.message : 'Something went wrong')

async function copy(value) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success('Passcode copied')
  } catch {
    toast.error('Could not copy — select the passcode and copy it manually')
  }
}

// One designer's full page for a worker holding `designers.view_details`.
// Everything arrives from `worker_designer_detail`: the directory row, the safe
// project list and recent project activity. There is no revenue, cost, profit
// or letter payload on this screen, by construction.
export function WorkerDesignerDetail() {
  const { designerId } = useParams()
  const { session } = useOutletContext()
  const permissions = session.permissions
  const canManage = hasPermission(permissions, 'designers.manage')
  const canAssign = hasPermission(permissions, 'designers.assign')
  const canViewDetails = hasPermission(permissions, 'designers.view_details')

  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [credentials, setCredentials] = useState(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignProjectId, setAssignProjectId] = useState('')
  const [projects, setProjects] = useState([])
  const [loadingProjects, setLoadingProjects] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      if (canViewDetails) {
        setData(await fetchWorkerDesignerDetail(designerId))
        return
      }
      // Assignment without the detail permission: the directory row is enough
      // to identify the designer. The project list and history stay withheld.
      const rows = await fetchWorkerDesigners()
      const row = rows.find((designer) => designer.id === designerId)
      if (!row) throw new Error('Designer not found')
      setData({ designer: row, projects: [], events: [] })
    } catch (caught) {
      setError(messageOf(caught))
    }
  }, [canViewDetails, designerId])

  useEffect(() => {
    void load()
  }, [load])

  const designer = data?.designer ?? null
  const designerProjects = data?.projects ?? []
  const events = data?.events ?? []
  const availableProjects = useMemo(
    () => projects.filter((project) => project.designer_id !== designerId),
    [projects, designerId],
  )

  const act = async (action) => {
    if (!canManage || busy) return
    setBusy(true)
    try {
      if (action === 'reset') {
        const result = await resetDesignerPasscodeAsWorker(designerId)
        setCredentials(result.passcode)
      } else if (action === 'revoke') {
        await revokeDesignerAsWorker(designerId)
        toast.success('Designer access revoked')
      } else {
        await activateDesignerAsWorker(designerId)
        toast.success('Designer reactivated')
      }
      await load()
    } catch (caught) {
      toast.error(messageOf(caught))
    } finally {
      setBusy(false)
    }
  }

  const openAssign = async () => {
    setAssignOpen(true)
    setAssignProjectId('')
    if (projects.length > 0) return
    setLoadingProjects(true)
    try {
      const all = await fetchWorkerProjects()
      setProjects(Array.isArray(all) ? all : [])
    } catch (caught) {
      toast.error(messageOf(caught))
    } finally {
      setLoadingProjects(false)
    }
  }

  const saveAssign = async () => {
    if (!assignProjectId || busy) return
    setBusy(true)
    try {
      await assignDesignerToProjectAsWorker(designerId, assignProjectId)
      toast.success('Dearune assigned to this designer')
      setAssignOpen(false)
      await load()
    } catch (caught) {
      toast.error(messageOf(caught))
    } finally {
      setBusy(false)
    }
  }

  if (!data && !error) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!designer) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/70 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          {error || 'Designer not found.'}{' '}
          <Link className="underline" to="/worker/designers">
            Back to Designers
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            to="/worker/designers"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Designers
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 font-heading text-3xl tracking-tight">
            <span className="break-words">{designer.name}</span>
            <code className="rounded bg-muted px-2 py-0.5 font-mono text-sm">{designer.code}</code>
            {designer.revokedAt ? (
              <Badge variant="destructive">Revoked</Badge>
            ) : (
              <Badge className="bg-primary/10 text-primary">Active</Badge>
            )}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Joined {formatDateTime(designer.createdAt)} ·{' '}
            {designer.lastLoginAt ? `last seen ${formatDateTime(designer.lastLoginAt)}` : 'never signed in'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canAssign ? (
            <Button size="sm" variant="outline" onClick={() => void openAssign()} disabled={busy}>
              <UserPlus className="size-4" aria-hidden />
              Assign a Dearune
            </Button>
          ) : null}
          {canManage ? (
            <>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void act('reset')}>
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <KeyRound className="size-4" aria-hidden />}
                Reset passcode
              </Button>
              {designer.revokedAt ? (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void act('activate')}>
                  <ShieldCheck className="size-4" aria-hidden />
                  Activate
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void act('revoke')}>
                  <ShieldOff className="size-4" aria-hidden />
                  Revoke
                </Button>
              )}
            </>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Dearunes', value: designer.projectCount ?? designerProjects.length },
          { label: 'Not sold', value: designer.unpaidProjectCount ?? 0 },
          { label: 'In the studio', value: designer.inStudioCount ?? 0 },
          { label: 'On this page', value: designerProjects.length },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-border bg-card px-4 py-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{stat.label}</p>
            <p className="mt-2 font-heading text-3xl tracking-tight">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <section className="rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <FolderOpen className="size-4 text-primary" aria-hidden />
              Handed over
            </h2>
            <span className="text-xs text-muted-foreground">{designerProjects.length} shown</span>
          </div>
          <div className="p-5">
            {!canViewDetails ? (
              <p className="rounded-xl bg-muted/50 px-3 py-6 text-center text-sm text-muted-foreground">
                Full designer details are not part of your access. You can still use “Assign a Dearune” if your
                administrator granted that capability.
              </p>
            ) : designerProjects.length === 0 ? (
              <p className="rounded-xl bg-muted/50 px-3 py-6 text-center text-sm text-muted-foreground">
                No Dearunes handed over yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {designerProjects.map((project) => (
                  <li key={project.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{project.title || 'Untitled Dearune'}</p>
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">{project.reference}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Handed over {project.submitted_at ? formatDateTime(project.submitted_at) : '—'}
                        {project.archived_at ? ' · archived' : ''}
                      </p>
                    </div>
                    <ProjectBadge project={project} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <History className="size-4 text-primary" aria-hidden />
              Recent activity
            </h2>
          </div>
          <div className="p-5">
            {!canViewDetails ? (
              <p className="text-sm text-muted-foreground">
                Activity history requires the “View designer details” permission.
              </p>
            ) : events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recorded activity yet.</p>
            ) : (
              <ol className="space-y-3">
                {events.map((event) => (
                  <li key={event.id} className="flex gap-3 text-xs">
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                    <div className="min-w-0">
                      <p className="break-words font-mono text-[0.7rem] text-foreground">{event.action}</p>
                      <p className="mt-0.5 text-muted-foreground">
                        {event.actorType ? `${event.actorType} · ` : ''}
                        {formatDateTime(event.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>

      <Dialog open={Boolean(credentials)} onOpenChange={(open) => !open && setCredentials(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New designer passcode</DialogTitle>
            <DialogDescription>
              Share this with {designer.name} privately. The previous passcode no longer works.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-3">
            <code className="break-all font-mono text-lg font-semibold tracking-wider">{credentials}</code>
            <Button type="button" variant="outline" size="icon" onClick={() => void copy(credentials)} aria-label="Copy passcode">
              <Copy className="size-4" aria-hidden />
            </Button>
          </div>
          <p className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs leading-5 text-muted-foreground">
            This is shown once. The studio does not store the passcode in readable form.
          </p>
          <DialogFooter>
            <Button onClick={() => setCredentials(null)}>I have shared it securely</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign a Dearune</DialogTitle>
            <DialogDescription>
              Move an existing Dearune to {designer.name}. This changes the same designer relationship the admin
              workspace uses.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="designer-detail-project">Dearune</Label>
            <Select value={assignProjectId} onValueChange={setAssignProjectId} disabled={loadingProjects}>
              <SelectTrigger id="designer-detail-project">
                <SelectValue placeholder={loadingProjects ? 'Loading…' : 'Choose a Dearune'} />
              </SelectTrigger>
              <SelectContent>
                {availableProjects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.reference} · {project.title || 'Untitled Dearune'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!loadingProjects && availableProjects.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Every visible Dearune is already assigned to this designer.
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void saveAssign()} disabled={busy || !assignProjectId}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <PenLine className="size-4" aria-hidden />}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
