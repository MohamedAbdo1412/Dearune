import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  History,
  KeyRound,
  Loader2,
  Mail,
  MessageCircle,
  PenLine,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { CredentialOnceDialog } from '@/components/admin/CredentialOnceDialog'
import { PermissionEditor } from '@/components/admin/PermissionEditor'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { permissionLabel, sortPermissionIds } from '@/lib/permissions'
import { formatDateTime } from '@/services/format'
import {
  fetchWorkerProfile,
  resetWorkerPassword,
  setWorkerPermissions,
  setWorkerStatus,
  updateWorkerDetails,
} from '@/services/workers'

const STATUS = {
  active: {
    label: 'Active',
    className: 'border-emerald-600/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  },
  inactive: {
    label: 'Inactive',
    className: 'border-border bg-muted text-muted-foreground',
  },
  suspended: {
    label: 'Suspended',
    className: 'border-destructive/25 bg-destructive/10 text-destructive',
  },
}

const ACTION_META = {
  'worker.created': { label: 'Worker created', icon: UserRound },
  'worker.updated': { label: 'Details updated', icon: PenLine },
  'worker.status_changed': { label: 'Status changed', icon: ShieldAlert },
  'worker.permissions_changed': { label: 'Permissions changed', icon: ShieldCheck },
  'worker.password_reset': { label: 'Password reset', icon: KeyRound },
}

function messageOf(error) {
  const text = error instanceof Error ? error.message : String(error ?? '')
  if (text.includes('admin.unauthorized') || text.includes('Administrator access required')) {
    return 'Your administrator session is no longer valid. Sign in again.'
  }
  return text || 'Something went wrong'
}

function StatusBadge({ status }) {
  const meta = STATUS[status] ?? STATUS.inactive
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium', meta.className)}>
      <span className="size-1.5 rounded-full bg-current opacity-75" aria-hidden />
      {meta.label}
    </span>
  )
}

function safeAuditDetails(entry) {
  const meta = entry?.metadata ?? {}
  const details = []
  if (Array.isArray(meta.granted) && meta.granted.length > 0) {
    details.push({ label: 'Granted', value: meta.granted.map(permissionLabel).join(', ') })
  }
  if (Array.isArray(meta.revoked) && meta.revoked.length > 0) {
    details.push({ label: 'Revoked', value: meta.revoked.map(permissionLabel).join(', ') })
  }
  if (meta.from || meta.to) {
    details.push({ label: 'Status', value: `${meta.from || 'unknown'} to ${meta.to || 'unknown'}` })
  }
  if (meta.reason) details.push({ label: 'Reason', value: String(meta.reason) })
  if (meta.email_changed) details.push({ label: 'Email', value: 'changed' })
  if (!meta.from && !meta.to && meta.display_name && entry?.action === 'worker.created') {
    details.push({ label: 'Name', value: String(meta.display_name) })
  }
  return details
}

function AuditItem({ entry, last }) {
  const meta = ACTION_META[entry.action] ?? { label: entry.action, icon: History }
  const Icon = meta.icon
  const details = safeAuditDetails(entry)
  return (
    <li className="relative pl-9">
      {!last ? <span className="absolute left-[0.68rem] top-7 h-[calc(100%-1rem)] w-px bg-border" aria-hidden /> : null}
      <span className="absolute left-0 top-0.5 inline-flex size-6 items-center justify-center rounded-full border bg-background text-muted-foreground">
        <Icon className="size-3" aria-hidden />
      </span>
      <div className="pb-4">
        <p className="text-sm font-medium">{meta.label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatDateTime(entry.created_at)} · {entry.actor_type === 'worker' ? 'worker action' : entry.actor_type}
        </p>
        {details.length > 0 ? (
          <dl className="mt-1.5 space-y-0.5">
            {details.map((detail) => (
              <div key={detail.label} className="flex flex-wrap gap-x-1.5 text-xs leading-5">
                <dt className="text-muted-foreground">{detail.label}:</dt>
                <dd className="min-w-0 break-words">{detail.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </li>
  )
}

function InfoRow({ label, value, mono = false }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn('mt-1 text-sm', mono && 'font-mono text-xs')}>{value}</dd>
    </div>
  )
}

export function UserDetail() {
  const { workerId } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState([])
  const [savingPermissions, setSavingPermissions] = useState(false)

  const [detailsOpen, setDetailsOpen] = useState(false)
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [savingDetails, setSavingDetails] = useState(false)

  const [statusTarget, setStatusTarget] = useState(null)
  const [statusReason, setStatusReason] = useState('')
  const [savingStatus, setSavingStatus] = useState(false)

  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [credentials, setCredentials] = useState(null)

  const load = useCallback(
    async ({ quiet = false } = {}) => {
      if (!workerId) return
      if (!quiet) setLoading(true)
      setError('')
      try {
        const result = await fetchWorkerProfile(workerId)
        setData(result)
        setDraft(sortPermissionIds(result.worker?.permissions ?? []))
        if (!result.worker) setError('That worker no longer exists')
      } catch (caught) {
        setError(messageOf(caught))
        setData(null)
      } finally {
        if (!quiet) setLoading(false)
      }
    },
    [workerId],
  )

  useEffect(() => {
    load()
  }, [load])

  const worker = data?.worker ?? null
  const history = data?.history ?? []
  const dirty = useMemo(() => {
    const saved = sortPermissionIds(worker?.permissions ?? [])
    return JSON.stringify(saved) !== JSON.stringify(sortPermissionIds(draft))
  }, [draft, worker])

  const openDetails = () => {
    if (!worker) return
    setFormName(worker.displayName ?? '')
    setFormEmail(worker.email ?? '')
    setDetailsOpen(true)
  }

  const saveDetails = async () => {
    if (!worker) return
    if (!formName.trim()) {
      toast.error('Please provide a worker name')
      return
    }
    if (!formEmail.trim() || !formEmail.includes('@')) {
      toast.error('Please provide a valid email address')
      return
    }
    setSavingDetails(true)
    try {
      await updateWorkerDetails({ workerId: worker.id, displayName: formName.trim(), email: formEmail.trim() })
      toast.success('Worker details updated')
      setDetailsOpen(false)
      await load({ quiet: true })
    } catch (caught) {
      toast.error(messageOf(caught))
    } finally {
      setSavingDetails(false)
    }
  }

  const savePermissions = async () => {
    if (!worker || !dirty) return
    setSavingPermissions(true)
    try {
      const result = await setWorkerPermissions({
        workerId: worker.id,
        permissions: sortPermissionIds(draft),
      })
      const granted = result?.granted?.length ?? 0
      const revoked = result?.revoked?.length ?? 0
      toast.success(
        granted || revoked
          ? `Access saved · ${granted} granted, ${revoked} revoked`
          : 'Access saved',
      )
      await load({ quiet: true })
    } catch (caught) {
      toast.error(messageOf(caught))
    } finally {
      setSavingPermissions(false)
    }
  }

  const changeStatus = async () => {
    if (!worker || !statusTarget) return
    if (statusTarget.status !== 'active' && statusReason.trim().length < 3) {
      toast.error('Please provide a short reason')
      return
    }
    setSavingStatus(true)
    try {
      await setWorkerStatus({
        workerId: worker.id,
        status: statusTarget.status,
        reason: statusTarget.status === 'active' ? '' : statusReason.trim(),
      })
      toast.success(
        statusTarget.status === 'active'
          ? 'Worker reactivated'
          : statusTarget.status === 'suspended'
            ? 'Worker suspended'
            : 'Worker deactivated',
      )
      setStatusTarget(null)
      setStatusReason('')
      await load({ quiet: true })
    } catch (caught) {
      toast.error(messageOf(caught))
    } finally {
      setSavingStatus(false)
    }
  }

  const resetPassword = async () => {
    if (!worker) return
    setResetting(true)
    try {
      const result = await resetWorkerPassword(worker.id)
      setResetOpen(false)
      setCredentials({
        title: 'Password reset',
        description:
          'The old password no longer works. Share this temporary password privately with the worker.',
        items: [
          { label: 'Email', value: worker.email },
          { label: 'New temporary password', value: result.password },
        ],
      })
      await load({ quiet: true })
    } catch (caught) {
      toast.error(messageOf(caught))
    } finally {
      setResetting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }

  if (!worker) {
    return (
      <div className="rounded-2xl border border-dashed bg-card/60 p-10 text-center">
        <ShieldX className="mx-auto size-8 text-muted-foreground" aria-hidden />
        <h1 className="mt-4 font-heading text-xl">Worker not found</h1>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
          {error || 'That worker may have been removed from the directory, or the link is wrong.'}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button variant="outline" onClick={() => load()}>
            <RefreshCw className="size-4" aria-hidden />
            Try again
          </Button>
          <Button asChild>
            <Link to="/admin/users">
              <ArrowLeft className="size-4" aria-hidden />
              Back to Users
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/admin/users">
            <ArrowLeft className="size-4" aria-hidden />
            All users
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => load()}>
            <RefreshCw className="size-4" aria-hidden />
            Refresh
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to={`/admin/inbox/${worker.id}`}>
              <MessageCircle className="size-4" aria-hidden />
              Message
            </Link>
          </Button>
        </div>
      </div>

      <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-2xl bg-muted font-heading text-xl">
              {(worker.displayName || '?').slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-heading text-2xl">{worker.displayName}</h1>
                <StatusBadge status={worker.status} />
              </div>
              <p className="mt-1 flex items-center gap-1.5 break-all text-sm text-muted-foreground">
                <Mail className="size-3.5 shrink-0" aria-hidden />
                {worker.email}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="size-3.5 shrink-0" aria-hidden />
                Created {formatDateTime(worker.createdAt)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={openDetails}>
              <PenLine className="size-4" aria-hidden />
              Edit details
            </Button>
            <Button variant="outline" size="sm" onClick={() => setResetOpen(true)}>
              <KeyRound className="size-4" aria-hidden />
              Reset password
            </Button>
          </div>
        </div>

        {worker.status !== 'active' && worker.statusReason ? (
          <p className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-800 dark:text-amber-200">
            <span className="font-medium">Reason on record:</span> {worker.statusReason}
          </p>
        ) : null}

        <dl className="mt-5 grid gap-4 border-t pt-4 sm:grid-cols-3">
          <InfoRow label="Last sign-in" value={worker.lastSignInAt ? formatDateTime(worker.lastSignInAt) : 'Never'} />
          <InfoRow label="Updated" value={formatDateTime(worker.updatedAt)} />
          <InfoRow label="Worker id" value={worker.id} mono />
        </dl>
      </section>

      <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6" aria-labelledby="status-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="status-heading" className="font-heading text-xl">
              Account status
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Deactivation is the supported removal path. It blocks sign-in immediately and preserves
              message and audit history. Nothing here deletes the account.
            </p>
          </div>
          <StatusBadge status={worker.status} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {worker.status !== 'active' ? (
            <Button
              size="sm"
              onClick={() => {
                setStatusReason('')
                setStatusTarget({ status: 'active', label: 'Reactivate worker' })
              }}
            >
              <CheckCircle2 className="size-4" aria-hidden />
              Reactivate
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setStatusReason('')
                  setStatusTarget({ status: 'inactive', label: 'Deactivate worker' })
                }}
              >
                <ShieldX className="size-4" aria-hidden />
                Deactivate
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  setStatusReason('')
                  setStatusTarget({ status: 'suspended', label: 'Suspend worker' })
                }}
              >
                <ShieldAlert className="size-4" aria-hidden />
                Suspend
              </Button>
            </>
          )}
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6" aria-labelledby="permissions-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="permissions-heading" className="font-heading text-xl">
              Permissions
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Changes are saved explicitly and enforced by the database on the worker's next request.
              A signed-in worker does not keep an access level after it is revoked here.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {dirty ? (
              <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">
                Unsaved changes
              </Badge>
            ) : (
              <Badge variant="outline" className="border-emerald-600/20 text-emerald-700 dark:text-emerald-400">
                Saved
              </Badge>
            )}
            <Button size="sm" onClick={savePermissions} disabled={!dirty || savingPermissions}>
              {savingPermissions ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
              Save permissions
            </Button>
          </div>
        </div>
        <div className="mt-4">
          <PermissionEditor
            value={draft}
            onChange={setDraft}
            disabled={savingPermissions}
            idPrefix={`worker-${worker.id.slice(0, 8)}`}
          />
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6" aria-labelledby="activity-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="activity-heading" className="font-heading text-xl">
              Activity
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Admin actions on this worker, newest first. Audit entries never contain passwords or
              tokens, and workers cannot edit or delete them.
            </p>
          </div>
          <Badge variant="outline">{history.length} entries</Badge>
        </div>
        {history.length === 0 ? (
          <p className="mt-4 rounded-xl bg-muted/40 px-3 py-4 text-sm text-muted-foreground">
            No activity has been recorded yet.
          </p>
        ) : (
          <ol className="mt-5">
            {history.map((entry, index) => (
              <AuditItem key={entry.id} entry={entry} last={index === history.length - 1} />
            ))}
          </ol>
        )}
      </section>

      <Dialog open={detailsOpen} onOpenChange={(open) => !open && !savingDetails && setDetailsOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit worker details</DialogTitle>
            <DialogDescription>
              This changes the directory and the Supabase Auth email. Passwords are never shown here.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="worker-detail-name">Name</Label>
              <Input
                id="worker-detail-name"
                value={formName}
                maxLength={120}
                onChange={(event) => setFormName(event.target.value)}
                disabled={savingDetails}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="worker-detail-email">Sign-in email</Label>
              <Input
                id="worker-detail-email"
                type="email"
                inputMode="email"
                value={formEmail}
                onChange={(event) => setFormEmail(event.target.value)}
                disabled={savingDetails}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsOpen(false)} disabled={savingDetails}>
              Cancel
            </Button>
            <Button onClick={saveDetails} disabled={savingDetails}>
              {savingDetails ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
              Save details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(statusTarget)} onOpenChange={(open) => !open && !savingStatus && setStatusTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{statusTarget?.label}</DialogTitle>
            <DialogDescription>
              {statusTarget?.status === 'active'
                ? 'The worker can sign in again and use the access already granted. Permissions are unchanged.'
                : statusTarget?.status === 'suspended'
                  ? 'Sign-in is blocked while the status is suspended. Every protected request fails until the account is reactivated.'
                  : 'Sign-in is blocked while the status is inactive. Message and audit history are preserved.'}
            </DialogDescription>
          </DialogHeader>
          {statusTarget?.status !== 'active' ? (
            <div className="space-y-2">
              <Label htmlFor="worker-status-reason">Reason</Label>
              <Textarea
                id="worker-status-reason"
                rows={3}
                maxLength={300}
                value={statusReason}
                onChange={(event) => setStatusReason(event.target.value)}
                placeholder="Explain the change for the studio record…"
              />
              <p className="text-xs text-muted-foreground">At least 3 characters. Stored in the audit log.</p>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusTarget(null)} disabled={savingStatus}>
              Cancel
            </Button>
            <Button
              onClick={changeStatus}
              disabled={savingStatus || (statusTarget?.status !== 'active' && statusReason.trim().length < 3)}
            >
              {savingStatus ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ShieldCheck className="size-4" aria-hidden />}
              {statusTarget?.label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetOpen} onOpenChange={(open) => !open && !resetting && setResetOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset this worker's password?</DialogTitle>
            <DialogDescription>
              The current password stops working immediately. A new temporary password is generated on
              the server and shown once.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)} disabled={resetting}>
              Cancel
            </Button>
            <Button onClick={resetPassword} disabled={resetting}>
              {resetting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <KeyRound className="size-4" aria-hidden />}
              Reset password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CredentialOnceDialog
        open={Boolean(credentials)}
        title={credentials?.title}
        description={credentials?.description}
        items={credentials?.items ?? []}
        onClose={() => setCredentials(null)}
      />
    </div>
  )
}
