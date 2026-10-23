import { Link, useOutletContext } from 'react-router-dom'
import { ArrowLeft, LogOut, ShieldX } from 'lucide-react'
import { WorkerBrand } from '@/components/worker-brand'
import { Button } from '@/components/ui/button'
import { hasAnyPermission, hasPermission, permissionLabel } from '@/lib/permissions'
import { signOutWorker } from '@/services/workerSession'

/**
 * The in-app access-denied state.
 *
 * Hiding a nav item is not the boundary. A worker who types a route directly
 * still lands here, and the database RPC behind the route would refuse the
 * request even if this component were bypassed.
 */
export function WorkerAccessDenied({
  title = 'This area is not shared with you',
  message = 'Your studio administrator has not granted the access this page needs. Ask them to review your permissions if you believe this is a mistake.',
  requiredPermission,
  anyOf,
}) {
  const context = useOutletContext()
  const session = context?.session ?? null
  const required = requiredPermission ? permissionLabel(requiredPermission) : ''
  const requiredList = (anyOf ?? []).map(permissionLabel).join(' or ')

  const leave = async () => {
    await signOutWorker()
    window.location.assign('/worker/login')
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-16">
      <WorkerBrand />
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <ShieldX className="size-6" aria-hidden />
        </span>
        <h1 className="mt-5 font-heading text-2xl tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-3 max-w-prose text-sm leading-6 text-muted-foreground">{message}</p>
        {required || requiredList ? (
          <p className="mt-4 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
            Required access: <span className="font-medium text-foreground">{required || requiredList}</span>
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/worker/home">
              <ArrowLeft className="size-4" aria-hidden />
              Back to your dashboard
            </Link>
          </Button>
          {session ? (
            <Button variant="outline" onClick={leave}>
              <LogOut className="size-4" aria-hidden />
              Sign out
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** Route-level permission check. The database still checks independently. */
export function WorkerPermissionGate({ permission, anyOf, title, message, children }) {
  const context = useOutletContext()
  const granted = context?.session?.permissions ?? []
  const allowed = permission ? hasPermission(granted, permission) : hasAnyPermission(granted, anyOf)
  if (!allowed) return <WorkerAccessDenied title={title} message={message} requiredPermission={permission} anyOf={anyOf} />
  return children
}
