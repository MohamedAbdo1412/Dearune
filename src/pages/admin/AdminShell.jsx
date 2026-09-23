import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { ClipboardList, Palette, Settings2, Users, LogOut, Wrench, LayoutDashboard } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Brand } from '@/components/brand'
import { cn } from '@/lib/utils'
import { useAppSettings } from '@/hooks/use-app-settings'

export function AdminShell() {
  const navigate = useNavigate()
  const { settings } = useAppSettings()

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut()
    toast.info('Signed out')
    navigate('/admin/login', { replace: true })
  }

  const maintenance = Boolean(settings?.maintenance_mode)

  return (
    <div className="flex min-h-screen bg-muted/40">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r bg-background px-4 py-6">
        <div className="px-2">
          <Brand />
          <p className="mt-1 px-0.5 text-xs uppercase tracking-[0.2em] text-muted-foreground">Admin</p>
        </div>

        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {[
            { to: '/admin/overview', label: 'Overview', icon: LayoutDashboard },
            { to: '/admin/orders', label: 'Orders', icon: ClipboardList },
            { to: '/admin/designers', label: 'Designers', icon: Users },
            { to: '/admin/templates', label: 'Templates', icon: Palette },
            { to: '/admin/settings', label: 'Settings', icon: Settings2 },
          ].map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )
              }
            >
              <item.icon className="size-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

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

      <div className="flex min-w-0 flex-1 flex-col">
        {maintenance && (
          <div className="flex items-center gap-2 border-b bg-amber-500/10 px-6 py-2.5 text-sm text-amber-700 dark:text-amber-400">
            <Wrench className="size-4" />
            Maintenance mode is ON — irreversible actions are blocked.
          </div>
        )}
        <main className="min-h-0 flex-1 p-6 md:p-8">
          <Outlet context={{ maintenance }} />
        </main>
      </div>
    </div>
  )
}