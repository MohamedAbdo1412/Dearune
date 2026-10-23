import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  ReceiptText,
  Settings2,
  Users,
  UsersRound,
  LogOut,
  Wrench,
  LayoutDashboard,
  Menu,
  Palette,
  Package,
  Factory,
  ScanLine,
  Smartphone,
  MessageCircle,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Brand } from '@/components/brand'
import { cn } from '@/lib/utils'
import { useAppSettings } from '@/hooks/use-app-settings'
import { useAdminInboxUnread } from '@/hooks/use-admin-inbox-unread'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { appForPath } from '@/pwa/apps'
import { AppInstallPrompt } from '@/components/app-install'

// The admin shell: the frame every admin screen sits in.
//
// On a wide screen the sidebar is always there. On a phone there is no room
// for it, so it folds away behind a menu button in a sticky top bar — the
// same links, the same order, one tap away. Nothing about the screen changes
// when the drawer is used; only where the links live.

const NAV_ITEMS = [
  { to: '/admin/overview', label: 'Dashboard', icon: LayoutDashboard },
  // The three installable apps. The section they open is the same section.
  { to: '/admin/apps', label: 'Apps', icon: Smartphone },
  { to: '/admin/operations', label: 'Operations', icon: Factory },
  { to: '/admin/designers', label: 'Designers', icon: Users },
  { to: '/admin/templates', label: 'Templates', icon: Palette },
  { to: '/admin/wrappers', label: 'Wrappers', icon: Package },
  { to: '/admin/sold', label: 'Sold Logs', icon: ReceiptText },
  { to: '/admin/financial', label: 'Financial', icon: Wallet },
  { to: '/admin/qa', label: 'QA', icon: ScanLine },
  { to: '/admin/users', label: 'Users', icon: UsersRound },
  { to: '/admin/inbox', label: 'Inbox', icon: MessageCircle, badge: 'inbox' },
  { to: '/admin/settings', label: 'Settings', icon: Settings2 },
]

function NavLinks({ onNavigate, inboxCount }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )
          }
        >
          <item.icon className="size-4 shrink-0" />
          <span className="flex-1">{item.label}</span>
          {item.badge === 'inbox' && inboxCount > 0 ? (
            <Badge className="h-5 min-w-5 justify-center rounded-full bg-primary px-1.5 text-[0.62rem] text-primary-foreground">
              {inboxCount > 99 ? '99+' : inboxCount}
              <span className="sr-only"> unread</span>
            </Badge>
          ) : null}
        </NavLink>
      ))}
    </nav>
  )
}

export function AdminShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { settings } = useAppSettings()
  const [menuOpen, setMenuOpen] = useState(false)
  const { count: inboxCount } = useAdminInboxUnread()

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut()
    toast.info('Signed out')
    navigate('/admin/login', { replace: true })
  }

  const maintenance = Boolean(settings?.maintenance_mode)

  const current = NAV_ITEMS.find((item) => location.pathname.startsWith(item.to))
  const currentApp = appForPath(location.pathname)

  return (
    <div className="flex min-h-screen flex-col bg-muted/40 lg:flex-row">
      {/* ---- the sidebar, for wide screens ------------------------------- */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-background px-4 py-6 lg:flex">
        <div className="px-2">
          <Brand />
          <p className="mt-1 px-0.5 text-xs uppercase tracking-[0.2em] text-muted-foreground">Admin</p>
        </div>

        <div className="mt-8 flex flex-1 flex-col overflow-y-auto">
          <NavLinks inboxCount={inboxCount} />
        </div>

        <div className="border-t pt-4">
          <button
            onClick={() => void signOut()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ---- the top bar, for narrow screens ----------------------------- */}
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b bg-background px-4 py-2.5 lg:hidden">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open the admin menu">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[85vw] max-w-xs p-0">
            <SheetHeader className="border-b px-4 py-3">
              <SheetTitle className="flex items-center gap-2.5">
                <Brand />
              </SheetTitle>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
              <p className="mb-3 px-0.5 text-xs uppercase tracking-[0.2em] text-muted-foreground">Admin</p>
              <NavLinks inboxCount={inboxCount} onNavigate={() => setMenuOpen(false)} />
              <div className="mt-auto border-t pt-4">
                <button
                  onClick={() => void signOut()}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <LogOut className="size-4" />
                  Sign out
                </button>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Brand />
          <span className="hidden text-xs uppercase tracking-[0.2em] text-muted-foreground sm:inline">Admin</span>
        </div>
        {current ? (
          <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-foreground">
            {current.label}
          </span>
        ) : null}
      </header>

      <div className="flex min-w-0 flex-1 flex-col">
        {maintenance && (
          <div className="flex items-start gap-2 border-b bg-amber-500/10 px-4 py-2.5 text-sm text-amber-700 md:px-6 dark:text-amber-400">
            <Wrench className="mt-0.5 size-4 shrink-0" />
            <span>Maintenance mode is ON — irreversible actions are blocked.</span>
          </div>
        )}
        <main className="min-h-0 min-w-0 flex-1 p-4 md:p-6 lg:p-8">
          {/* While the reader is inside one of the three apps, and the browser
              is willing to install it, the offer appears here. */}
          {currentApp ? <AppInstallPrompt app={currentApp} /> : null}
          <Outlet context={{ maintenance }} />
        </main>
      </div>
    </div>
  )
}
