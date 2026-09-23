import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogOut, PenLine } from 'lucide-react'
import { toast } from 'sonner'
import { clearDesignerToken, fetchDesignerOrders, getDesignerToken } from '@/services/designer'
import { Brand } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { StageBadge } from '@/components/stage-badge'
import { formatDate, formatMoney } from '@/services/format'
import { WRAPPER_LABELS } from '@/services/constants'

export function DesignerStudio() {
  const navigate = useNavigate()
  const token = getDesignerToken()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!token) return
      try {
        const result = await fetchDesignerOrders(token)
        if (active) setOrders(result.orders ?? [])
      } catch (err) {
        if (active) toast.error(err instanceof Error ? err.message : 'Failed to load orders')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [token])

  const signOut = () => {
    clearDesignerToken()
    toast.info('Signed out')
    navigate('/designer/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-[oklch(0.97_0.004_90)] px-6 pb-16 pt-6">
      <header className="mx-auto flex max-w-5xl items-center justify-between">
        <Brand />
        <div className="flex items-center gap-3">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">Home</Link>
          <Button variant="outline" size="sm" onClick={signOut}>
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto mt-10 max-w-5xl">
        <h1 className="font-heading text-3xl tracking-tight">Your messages</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Orders assigned to you, waiting to be written and sealed.
        </p>

        {loading ? (
          <div className="mt-8 space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <Card className="mt-8">
            <CardContent className="flex flex-col items-center py-16 text-center">
              <PenLine className="mb-4 text-muted-foreground/50" />
              <p className="font-medium">Nothing assigned yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                When the team assigns you a message, it will appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="mt-8 space-y-3">
            {orders.map((row) => {
              const order = row.order ?? {}
              const wrapper = WRAPPER_LABELS[order.wrapper_type] ?? order.wrapper_type
              return (
                <Link key={order.id} to={`/designer/orders/${order.id}`} className="block">
                  <Card className="transition-colors hover:border-foreground/40">
                    <CardHeader className="px-6 py-5">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <CardTitle className="text-base">{order.recipient_name}</CardTitle>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {(order.template?.name ?? order.templateName) ?? 'Template'} · {wrapper} · {formatDate(order.created_at)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          {order.wrapper_type !== 'digital' && (
                            <span className="hidden rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium md:inline">
                              {formatMoney(order.snapshot_price, order.currency)}
                            </span>
                          )}
                          <StageBadge order={order} publishedAt={row.message?.published_at ?? null} />
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}