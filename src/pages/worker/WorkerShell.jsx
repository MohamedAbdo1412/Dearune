import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Factory,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  PenLine,
  RefreshCw,
  ScanLine,
  UserRound,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { WorkerBrand } from '@/components/worker-brand'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { hasAnyPermission, hasPermission } from '@/lib/permissions'
import { useWorkerUnread } from '@/hooks/use-worker-unread'
import { signOutWorker } from '@/services/workerSession'

const NAV_ITEMS = [
  { to: '/worker/home', label: 'Home', icon: LayoutDashboard, always: true },
  { to: '/worker/operations', label: 'Operations', icon: Factory, permission: 'operations.view' },
  { to: '/worker/designers', label: 'Designers', icon: PenLine, permission: 'designers.view' },
  { to: '/worker/qa', label: 'QA desk', icon: ScanLine, permission: 'qa.view' },
  { to: '/worker/financial', label: 'Financial', icon: Wallet, permission: 'financial.view' },
  {
    to: '/worker/messages',
    label: 'Messages',
    icon: MessageCircle,
    anyOf: ['messages.view', 'notifications.view'],
    badge: true,
  },
  { to: '/worker/account', label: 'Your account', icon: UserRound, always: true },
]

function visible(item, permissions) {
  if (item.always) return true
  if (item.permission) return hasPermission(permissions, item.permission)
  if (item.anyOf) return hasAnyPermission(permissions, item.anyOf)
  return false
}

function NavItems({ permissions, unread, onNavigate }) {
  return (
    <nav className="flex flex-col gap-1" aria-label="Worker dashboard">
      {NAV_ITEMS.filter((item) => visible(item, permissions)).map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/78 transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground',
                isActive && 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    'absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-sidebar-primary opacity-0 transition-opacity',
                    isActive && 'opacity-100',
                  )}
                  aria-hidden
                />
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.badge && unread > 0 ? (
                  <Badge className="h-5 min-w-5 justify-center rounded-full bg-primary px-1.5 text-[0.65rem] text-primary-foreground">
                    {unread > 99 ? '99+' : unread}
                    <span className="sr-only"> unread</span>
                  </Badge>
                ) : null}
              </>
            )}
          </NavLink>
        )
      })}
    </nav>
  )
}

function SidebarBody({ session, unread, onSignOut, onRefresh, refreshing, onNavigate }) {
  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <WorkerBrand tagClassName="text-sidebar-primary" />
      </div>

      <div className="rounded-2xl border border-sidebar-border bg-white/[0.045] p-3">
        <p className="truncate text-sm font-medium text-sidebar-foreground">
          {session.worker.display_name}
        </p>
        <p className="mt-0.5 truncate text-xs text-sidebar-foreground/60">{session.worker.email}</p>
        <span className="mt-2 inline-flex items-center gap-1.5 text-[0.68rem] font-medium uppercase tracking-[0.14em] text-sidebar-primary">
          <span className="size-1.5 rounded-full bg-sidebar-primary" aria-hidden />
          Active worker
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto worker-scroll">
        <NavItems permissions={session.permissions} unread={unread} onNavigate={onNavigate} />
      </div>

      <div className="flex flex-col gap-2 border-t border-sidebar-border pt-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="justify-start text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
          onClick={onRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} aria-hidden />
          Refresh access
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="justify-start text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
          onClick={onSignOut}
        >
          <LogOut className="size-4" aria-hidden />
          Sign out
        </Button>
        <p className="px-2 text-[0.65rem] leading-4 text-sidebar-foreground/40">
          Private studio workspace. Access is shown only for the permissions your administrator
          granted.
        </p>
      </div>
    </div>
  )
}

/**
 * The worker's frame: a deep royal-blue sidebar on desktop, a sheet on mobile,
 * and permission-generated navigation. A module that is not granted is not
 * drawn; a direct URL still ends in the access-denied screen, and the RPC
 * behind it still refuses.
 */
export function WorkerShell({ session, onRefresh }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const { count: unread, refresh: refreshUnread } = useWorkerUnread({
    workerId: session.worker.id,
    canRead: hasPermission(session.permissions, 'messages.view'),
    canNotify: hasPermission(session.permissions, 'notifications.view'),
  })

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  useEffect(() => {
    refreshUnread()
  }, [location.pathname, refreshUnread])

  const leave = async () => {
    if (signingOut) return
    setSigningOut(true)
    await signOutWorker()
    navigate('/worker/login', { replace: true })
  }

  const refresh = async () => {
    setRefreshing(true)
    try {
      await onRefresh?.()
      toast.success('Your access is up to date')
    } finally {
      setRefreshing(false)
    }
  }

  const context = useMemo(
    () => ({ session, onRefresh, unread, refreshUnread }),
    [session, onRefresh, unread, refreshUnread],
  )

  return (
    <div className="worker-app min-h-svh">
      <a
        href="#worker-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col bg-sidebar p-4 text-sidebar-foreground lg:flex">
        <SidebarBody
          session={session}
          unread={unread}
          onSignOut={leave}
          onRefresh={refresh}
          refreshing={refreshing}
          onNavigate={() => {}}
        />
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-background/88 px-4 py-3 backdrop-blur lg:hidden">
        <WorkerBrand compact />
        <div className="flex items-center gap-2">
          {unread > 0 ? (
            <Badge className="rounded-full bg-primary text-primary-foreground" aria-label={`${unread} unread messages`}>
              {unread > 99 ? '99+' : unread}
            </Badge>
          ) : null}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Open worker menu">
                <Menu className="size-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[19rem] border-sidebar-border bg-sidebar p-4 text-sidebar-foreground">
              <SheetHeader className="sr-only">
                <SheetTitle>Worker menu</SheetTitle>
              </SheetHeader>
              <SidebarBody
                session={session}
                unread={unread}
                onSignOut={leave}
                onRefresh={refresh}
                refreshing={refreshing}
                onNavigate={() => setOpen(false)}
              />
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main id="worker-main" className="lg:pl-72">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          <Outlet context={context} />
        </div>
      </main>
    </div>
  )
}
