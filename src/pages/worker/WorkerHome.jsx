import { Link, useOutletContext } from 'react-router-dom'
import {
  ArrowRight,
  Factory,
  MessageCircle,
  PenLine,
  ScanLine,
  ShieldCheck,
  UserRound,
  Wallet,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { summarizePermissions, workerModuleAccess } from '@/lib/permissions'
import { cn } from '@/lib/utils'

const MODULES = {
  operations: {
    to: '/worker/operations',
    label: 'Operations',
    icon: Factory,
    description: 'Move units through the workshop, correct notes and phone details, and archive completed work.',
  },
  designers: {
    to: '/worker/designers',
    label: 'Designers',
    icon: PenLine,
    description: 'See the designer directory and the Dearunes each person handed over.',
  },
  qa: {
    to: '/worker/qa',
    label: 'QA desk',
    icon: ScanLine,
    description: 'Scan a printed Dearune QR and inspect its units, delivery record and timeline.',
  },
  financial: {
    to: '/worker/financial',
    label: 'Financial',
    icon: Wallet,
    description: 'The money categories the studio has explicitly shared with you.',
  },
  messages: {
    to: '/worker/messages',
    label: 'Messages',
    icon: MessageCircle,
    description: 'Your private thread with the studio administrator.',
  },
}

function ModuleCard({ module, unread, notificationOnly }) {
  const Icon = module.icon
  return (
    <Link
      to={module.to}
      className="group flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md focus-visible:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="flex items-center gap-1.5">
          {notificationOnly ? (
            <Badge variant="outline" className="text-[0.65rem]">
              Notifications only
            </Badge>
          ) : null}
          {unread > 0 ? (
            <Badge className="rounded-full bg-primary text-primary-foreground">
              {unread > 99 ? '99+' : unread} new
            </Badge>
          ) : null}
        </div>
      </div>
      <h2 className="mt-5 font-heading text-xl tracking-tight">{module.label}</h2>
      <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{module.description}</p>
      <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
        Open
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  )
}

/** Permission-shaped landing page. A single-module worker still gets a complete dashboard. */
export function WorkerHome() {
  const { session, unread } = useOutletContext()
  const access = workerModuleAccess(session.permissions)
  const groups = summarizePermissions(session.permissions)
  const firstName = (session.worker.display_name || '').split(/\s+/)[0] || 'there'
  const visibleModules = ['operations', 'designers', 'qa', 'financial'].filter((key) => access[key])
  const showMessages = access.messages || access.notifications

  return (
    <div className="space-y-6">
      <section className="worker-hero rounded-3xl border border-primary/10 p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
          Worker dashboard
        </p>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-heading text-3xl leading-tight tracking-tight sm:text-4xl">
              Welcome back, {firstName}
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              {visibleModules.length + (showMessages ? 1 : 0) > 0
                ? 'Your dashboard is built from your live permissions. If something you need is missing, ask the studio administrator to review your access.'
                : 'Your account is active. No work modules have been shared with you yet. The studio administrator can grant exactly the access you need.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-primary/20 bg-card/70 text-primary">
              <ShieldCheck className="size-3.5" aria-hidden />
              {groups.length > 0 ? `${groups.length} access group${groups.length === 1 ? '' : 's'}` : 'No modules yet'}
            </Badge>
            {unread > 0 ? (
              <Badge className="bg-primary text-primary-foreground">
                {unread > 99 ? '99+' : unread} unread
              </Badge>
            ) : null}
          </div>
        </div>
      </section>

      {visibleModules.length > 0 || showMessages ? (
        <section aria-labelledby="worker-modules">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 id="worker-modules" className="font-heading text-2xl tracking-tight">
                Your workspace
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Only the modules you can actually use are shown.
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleModules.map((key) => (
              <ModuleCard key={key} module={MODULES[key]} unread={key === 'messages' ? unread : 0} />
            ))}
            {showMessages ? (
              <ModuleCard
                module={MODULES.messages}
                unread={unread}
                notificationOnly={!access.messages && access.notifications}
              />
            ) : null}
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-border bg-card/60 p-6 sm:p-8">
          <h2 className="font-heading text-xl tracking-tight">A clean slate</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            There is nothing to open yet. This is not an error: the studio deliberately grants each
            capability on its own. Your account page shows exactly what has been shared.
          </p>
          <Button asChild className="mt-4" variant="outline">
            <Link to="/worker/account">
              <UserRound className="size-4" aria-hidden />
              Review your access
            </Link>
          </Button>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-xl tracking-tight">Your access</h2>
              <p className="mt-1 text-sm text-muted-foreground">A plain-language copy of what the database enforces.</p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/worker/account">Details</Link>
            </Button>
          </div>
          {groups.length > 0 ? (
            <ul className="mt-4 space-y-2.5">
              {groups.map((group) => (
                <li key={group.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-muted/55 px-3 py-2.5">
                  <span className="text-sm font-medium">{group.label}</span>
                  <span className={cn('text-right text-xs leading-5 text-muted-foreground', group.sensitive && 'text-primary')}>
                    {group.items.join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-xl bg-muted/55 px-3 py-3 text-sm text-muted-foreground">
              No module permissions are granted to this account.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <h2 className="font-heading text-xl tracking-tight">Account</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Name</dt>
              <dd className="mt-1 font-medium">{session.worker.display_name}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Email</dt>
              <dd className="mt-1 break-all">{session.worker.email}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Status</dt>
              <dd className="mt-1">
                <Badge className="bg-primary/10 text-primary">Active</Badge>
              </dd>
            </div>
          </dl>
          <Button asChild variant="outline" className="mt-5 w-full">
            <Link to="/worker/account">
              <UserRound className="size-4" aria-hidden />
              Account &amp; access
            </Link>
          </Button>
        </div>
      </section>
    </div>
  )
}
