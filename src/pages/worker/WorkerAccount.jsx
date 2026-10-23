import { useNavigate, useOutletContext } from 'react-router-dom'
import { CalendarDays, Check, LogOut, Mail, Minus, RefreshCw, ShieldCheck, UserRound } from 'lucide-react'
import { WorkerBrand } from '@/components/worker-brand'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PERMISSION_MODULES, hasPermission } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/services/format'
import { signOutWorker } from '@/services/workerSession'

export function WorkerAccount() {
  const { session, onRefresh } = useOutletContext()
  const navigate = useNavigate()
  const worker = session.worker

  const leave = async () => {
    await signOutWorker()
    navigate('/worker/login', { replace: true })
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Your account</p>
        <h1 className="mt-1 font-heading text-3xl tracking-tight">Account &amp; access</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          A read-only copy of what the studio has shared. Access is managed by the administrator; a
          worker cannot promote themselves or change their own permissions.
        </p>
      </header>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 font-heading text-lg text-primary">
              {(worker.display_name || '?').slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h2 className="font-heading text-2xl tracking-tight">{worker.display_name}</h2>
              <p className="mt-1 flex items-center gap-1.5 break-all text-sm text-muted-foreground">
                <Mail className="size-3.5 shrink-0" aria-hidden />
                {worker.email}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="size-3.5 shrink-0" aria-hidden />
                Worker since {formatDateTime(worker.created_at)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-primary/10 text-primary">
              <ShieldCheck className="size-3.5" aria-hidden />
              Active
            </Badge>
            <Button variant="outline" size="sm" onClick={onRefresh}>
              <RefreshCw className="size-4" aria-hidden />
              Refresh access
            </Button>
            <Button variant="outline" size="sm" onClick={leave}>
              <LogOut className="size-4" aria-hidden />
              Sign out
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6" aria-labelledby="worker-access-list">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="size-4" aria-hidden />
          </span>
          <div>
            <h2 id="worker-access-list" className="font-heading text-xl tracking-tight">Access details</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Each line is checked independently by the database. The Financial categories never imply
              one another, and customer payables is separate from revenue, cost and profit.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {PERMISSION_MODULES.map((module) => {
            const granted = module.permissions.filter((permission) => hasPermission(session.permissions, permission.id))
            const enabled = hasPermission(session.permissions, module.viewPermission)
            return (
              <div
                key={module.id}
                className={cn(
                  'rounded-2xl border p-4',
                  enabled ? 'border-primary/20 bg-primary/[0.035]' : 'border-border bg-muted/20',
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">{module.label}</h3>
                    {module.sensitive ? (
                      <Badge variant="outline" className="text-[0.62rem]">Sensitive</Badge>
                    ) : null}
                  </div>
                  <Badge variant="outline" className={enabled ? 'border-primary/30 text-primary' : 'text-muted-foreground'}>
                    {enabled ? 'Available' : 'Not granted'}
                  </Badge>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{module.description}</p>
                <ul className="mt-3 space-y-1.5">
                  {module.permissions.map((permission) => {
                    const on = hasPermission(session.permissions, permission.id)
                    return (
                      <li key={permission.id} className="flex items-start gap-2 text-sm">
                        <span
                          className={cn(
                            'mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full',
                            on ? 'bg-primary/12 text-primary' : 'bg-muted text-muted-foreground',
                          )}
                          aria-hidden
                        >
                          {on ? <Check className="size-3" /> : <Minus className="size-3" />}
                        </span>
                        <span className={on ? '' : 'text-muted-foreground'}>
                          {permission.label}
                          <span className="sr-only">{on ? ' — granted' : ' — not granted'}</span>
                        </span>
                      </li>
                    )
                  })}
                </ul>
                {module.id === 'financial' && granted.length === 0 ? (
                  <p className="mt-3 rounded-xl bg-muted/50 px-2.5 py-2 text-xs leading-5 text-muted-foreground">
                    No financial category is granted. If you can open the Financial section, it will show
                    no figures at all.
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UserRound className="size-4" aria-hidden />
          </span>
          <div>
            <h2 className="font-heading text-xl tracking-tight">Managed by the studio</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Name, email, status and permissions are changed by the studio administrator from the
              admin Users section. There is no self-service promotion and no public worker registration.
              If something is missing, send a message from the Messages section when that access is
              available, or contact the studio directly.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <WorkerBrand compact />
          <span>·</span>
          <span>Joined {formatDateTime(worker.created_at)}</span>
        </div>
      </section>
    </div>
  )
}
