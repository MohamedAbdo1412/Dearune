import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2Icon, RotateCcw, ShieldOff, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { activateDesigner, fetchDesigners, resetPasscode, revokeDesigner } from '@/services/designers'
import { fetchDearunes } from '@/services/dearunes'
import { fetchSales, sumSales } from '@/services/sales'
import { fetchTemplates } from '@/services/templates'
import { formatDateTime, formatMoney } from '@/services/format'
import { useAppSettings } from '@/hooks/use-app-settings'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { DearuneList } from '@/components/admin/DearuneList'

// One designer's page: who they are, what they have handed over, and what
// the studio still owes each of those Dearunes. The same rows as the
// Designers shelf, without the accordion around them.

export function DesignerDetail() {
  const { designerId } = useParams()
  const { settings } = useAppSettings()
  const maintenance = Boolean(settings?.maintenance_mode)
  const [designer, setDesigner] = useState(null)
  const [projects, setProjects] = useState(null)
  const [sales, setSales] = useState([])
  const [catalog, setCatalog] = useState(null)
  const [acting, setActing] = useState(false)
  const [status, setStatus] = useState('loading')

  const reload = useCallback(async () => {
    setStatus('loading')
    try {
      const [designerRows, projectRows, saleRows] = await Promise.all([
        fetchDesigners(),
        fetchDearunes(designerId),
        fetchSales(),
      ])
      const row = designerRows.find((d) => d.id === designerId) ?? null
      setDesigner(row)
      setProjects(projectRows)
      setSales(saleRows)
      setStatus('ready')
      if (!row) toast.error('That designer no longer exists')
    } catch (err) {
      setStatus('error')
      toast.error(err instanceof Error ? err.message : 'Could not load this designer')
    }
  }, [designerId])

  useEffect(() => {
    void reload()
    void fetchTemplates().then(setCatalog).catch(() => setCatalog(null))
  }, [reload])

  const act = async (action) => {
    setActing(true)
    try {
      if (action === 'reset-passcode') {
        const result = await resetPasscode(designerId)
        if (result.passcode) {
          await navigator.clipboard.writeText(result.passcode).catch(() => {})
          toast.success(`New passcode copied: ${result.passcode}`)
        } else {
          toast.success('New passcode generated')
        }
      } else if (action === 'revoke') {
        await revokeDesigner(designerId)
        toast.success('Designer revoked')
      } else {
        await activateDesigner(designerId)
        toast.success('Designer activated')
      }
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActing(false)
    }
  }

  const mine = projects ?? []
  const soldRows = sales.filter((s) => mine.some((p) => p.id === s.project_id))
  const totals = sumSales(soldRows, 'EGP')
  const openCount = mine.filter((p) => !p.paid_at && !p.archived_at).length
  const inHand = mine.filter((p) => p.paid_at && !p.arrived_at && p.wrapper_type !== 'digital' && !p.archived_at).length

  if (status === 'loading' && !designer) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (!designer) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          {status === 'error' ? 'This designer could not be loaded.' : 'Designer not found.'}{' '}
          <Link className="underline" to="/admin/designers">Back to Designers</Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link to="/admin/designers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Designers
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 font-heading text-2xl">
            <span className="break-words">{designer.name}</span>
            <code className="rounded bg-muted px-2 py-0.5 font-mono text-sm">{designer.code}</code>
            {designer.revoked_at ? <Badge variant="destructive">Revoked</Badge> : <Badge variant="outline" className="text-emerald-700 dark:text-emerald-400">Active</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground">
            Joined {formatDateTime(designer.created_at)} · {designer.last_login_at ? `last seen ${formatDateTime(designer.last_login_at)}` : 'never signed in'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={acting} onClick={() => void act('reset-passcode')}>
            {acting ? <Loader2Icon className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Reset passcode
          </Button>
          {designer.revoked_at ? (
            <Button size="sm" variant="outline" disabled={acting} onClick={() => void act('activate')}>
              <ShieldCheck className="size-4" /> Activate
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={acting || maintenance} onClick={() => void act('revoke')}>
              <ShieldOff className="size-4" /> Revoke
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Dearunes</p>
            <p className="text-xl font-semibold tabular-nums">{projects === null ? '—' : mine.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Not sold</p>
            <p className="text-xl font-semibold tabular-nums">{projects === null ? '—' : openCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">In the studio</p>
            <p className="text-xl font-semibold tabular-nums">{projects === null ? '—' : inHand}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Revenue</p>
            <p className="text-xl font-semibold tabular-nums">{projects === null ? '—' : formatMoney(totals.revenue, 'EGP')}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Handed over</CardTitle>
        </CardHeader>
        <CardContent>
          <DearuneList
            projects={mine}
            catalog={catalog}
            maintenance={maintenance}
            onChanged={() => void reload()}
            basePath={`/admin/designers/${designer.id}/messages`}
            empty="No Dearunes handed over yet."
          />
        </CardContent>
      </Card>
    </div>
  )
}
