import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  KeyRound,
  Loader2,
  Mail,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserPlus,
  Users as UsersIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { CredentialOnceDialog } from '@/components/admin/CredentialOnceDialog'
import { PermissionEditor } from '@/components/admin/PermissionEditor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { normalizePermissionSelection, permissionSummaryText } from '@/lib/permissions'
import { formatDateTime } from '@/services/format'
import { createWorker, fetchWorkers } from '@/services/workers'

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

function StatusBadge({ status }) {
  const meta = STATUS[status] ?? STATUS.inactive
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium', meta.className)}>
      <span className="size-1.5 rounded-full bg-current opacity-75" aria-hidden />
      {meta.label}
    </span>
  )
}

function messageOf(error) {
  return error instanceof Error ? error.message : 'Something went wrong'
}

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3.5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function Users() {
  const [workers, setWorkers] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [permissions, setPermissions] = useState([])
  const [busy, setBusy] = useState(false)
  const [credentials, setCredentials] = useState(null)

  const load = useCallback(async () => {
    setError('')
    try {
      setWorkers(await fetchWorkers())
    } catch (caught) {
      setError(messageOf(caught))
      setWorkers((current) => current ?? [])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const stats = useMemo(() => {
    const rows = workers ?? []
    return {
      total: rows.length,
      active: rows.filter((worker) => worker.status === 'active').length,
      paused: rows.filter((worker) => worker.status !== 'active').length,
      unread: rows.reduce((total, worker) => total + (Number(worker.unreadFromWorker) || 0), 0),
    }
  }, [workers])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (workers ?? [])
      .filter((worker) => (tab === 'all' ? true : worker.status === tab))
      .filter((worker) => {
        if (!needle) return true
        return [worker.displayName, worker.email, worker.status, permissionSummaryText(worker.permissions)]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle))
      })
  }, [workers, query, tab])

  const create = async () => {
    if (!name.trim()) {
      toast.error('Please provide a worker name')
      return
    }
    if (!email.trim() || !email.includes('@')) {
      toast.error('Please provide a valid email address')
      return
    }
    setBusy(true)
    try {
      const result = await createWorker({
        displayName: name.trim(),
        email: email.trim(),
        permissions: normalizePermissionSelection(permissions),
      })
      setCreateOpen(false)
      setName('')
      setEmail('')
      setPermissions([])
      setCredentials({
        title: 'Worker account created',
        description: 'Share these sign-in details privately. The worker can change the password later from the admin if it is lost.',
        items: [
          { label: 'Email', value: result.worker?.email ?? email.trim() },
          { label: 'Temporary password', value: result.password },
        ],
      })
      await load()
    } catch (caught) {
      toast.error(messageOf(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl">Users</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Worker Dashboard sign-ins, kept separate from designers. Administrators are not managed here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={workers === null}>
            <RefreshCw className="size-4" aria-hidden />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <UserPlus className="size-4" aria-hidden />
            New worker
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Workers" value={workers === null ? '—' : stats.total} hint="All worker accounts" />
        <Stat label="Active" value={workers === null ? '—' : stats.active} hint="Can sign in now" />
        <Stat label="Paused" value={workers === null ? '—' : stats.paused} hint="Inactive or suspended" />
        <Stat label="From workers" value={workers === null ? '—' : stats.unread} hint="Unread messages" />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="all">All {workers === null ? '' : `(${stats.total})`}</TabsTrigger>
            <TabsTrigger value="active">Active {workers === null ? '' : `(${stats.active})`}</TabsTrigger>
            <TabsTrigger value="inactive">Inactive</TabsTrigger>
            <TabsTrigger value="suspended">Suspended</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full lg:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, email or access…"
            className="pl-9"
            aria-label="Search workers"
          />
        </div>
      </div>

      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={load}>Try again</Button>
        </div>
      ) : null}

      {workers === null ? (
        <div className="space-y-2 rounded-xl border bg-card p-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card/60 p-10 text-center">
          <span className="mx-auto inline-flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <UsersIcon className="size-6" aria-hidden />
          </span>
          <h2 className="mt-4 font-heading text-xl">
            {workers.length === 0 ? 'No worker accounts yet' : 'Nothing matches this view'}
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
            {workers.length === 0
              ? 'Create a worker when someone needs the royal-blue Worker Dashboard. Designers keep their own separate passcode sign-in.'
              : 'Clear the search or status tab to see the rest of the directory.'}
          </p>
          {workers.length === 0 ? (
            <Button className="mt-4" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" aria-hidden />
              Create the first worker
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Worker</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Access</th>
                  <th className="px-4 py-3 font-medium">Last sign-in</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 text-right font-medium">Open</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((worker) => (
                  <tr key={worker.id} className="border-t transition-colors hover:bg-muted/35">
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-start gap-2.5">
                        <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted font-heading text-sm">
                          {(worker.displayName || '?').slice(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium">{worker.displayName}</p>
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <Mail className="size-3" aria-hidden />
                            <span className="truncate">{worker.email}</span>
                          </p>
                          {worker.unreadFromWorker > 0 ? (
                            <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[0.62rem] font-medium text-primary">
                              <MessageCircle className="size-2.5" aria-hidden />
                              {worker.unreadFromWorker} new message{worker.unreadFromWorker === 1 ? '' : 's'}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <StatusBadge status={worker.status} />
                    </td>
                    <td className="max-w-[22rem] px-4 py-3 align-top">
                      <p className="text-xs leading-5 text-muted-foreground">{permissionSummaryText(worker.permissions)}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-top text-xs text-muted-foreground">
                      {worker.lastSignInAt ? formatDateTime(worker.lastSignInAt) : 'Never'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-top text-xs text-muted-foreground">
                      {formatDateTime(worker.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/admin/users/${worker.id}`}>
                          Open
                          <ArrowRight className="size-3.5" aria-hidden />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:hidden">
            {filtered.map((worker) => (
              <Link
                key={worker.id}
                to={`/admin/users/${worker.id}`}
                className="rounded-xl border bg-card p-4 transition-colors hover:bg-muted/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{worker.displayName}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{worker.email}</p>
                  </div>
                  <StatusBadge status={worker.status} />
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {permissionSummaryText(worker.permissions)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.68rem] text-muted-foreground">
                  <span>Last sign-in {worker.lastSignInAt ? formatDateTime(worker.lastSignInAt) : 'never'}</span>
                  {worker.unreadFromWorker > 0 ? (
                    <span className="font-medium text-primary">{worker.unreadFromWorker} new message{worker.unreadFromWorker === 1 ? '' : 's'}</span>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="rounded-xl border bg-muted/25 p-3.5 text-xs leading-5 text-muted-foreground">
        <p className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Workers sign in through the Worker Dashboard. They cannot create other workers, change their own
          permissions, or open admin routes. Deactivation is preferred over deletion so message and audit
          history stays intact.
        </p>
      </div>

      <Dialog open={createOpen} onOpenChange={(open) => !open && !busy && setCreateOpen(false)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create a worker</DialogTitle>
            <DialogDescription>
              Creates a Supabase Auth sign-in and a separate worker directory row. The temporary password
              is generated on the server and shown once.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="worker-create-name">Name</Label>
              <Input
                id="worker-create-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Hana"
                maxLength={120}
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="worker-create-email">Sign-in email</Label>
              <Input
                id="worker-create-email"
                type="email"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="hana@studio.com"
                disabled={busy}
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Permissions</p>
                <p className="text-xs text-muted-foreground">Start with nothing and grant only what the role needs.</p>
              </div>
              <Badge variant="outline">{permissions.length} selected</Badge>
            </div>
            <PermissionEditor value={permissions} onChange={setPermissions} disabled={busy} idPrefix="create-worker" />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={create} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <KeyRound className="size-4" aria-hidden />}
              Create worker
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
