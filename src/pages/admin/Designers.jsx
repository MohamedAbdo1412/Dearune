import { useEffect, useState } from 'react'
import { Check, Copy, Loader2Icon, Plus, RotateCcw, ShieldOff, ShieldCheck, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { activateDesigner, createDesigner, fetchDesigners, resetPasscode, revokeDesigner } from '@/services/designers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { formatDateTime } from '@/services/format'
import { useAppSettings } from '@/hooks/use-app-settings'

function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2">
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-mono text-sm">{value}</p>
      </div>
      <Button variant="ghost" size="icon" onClick={() => void copy()}>
        {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
      </Button>
    </div>
  )
}

export function Designers() {
  const { settings } = useAppSettings()
  const maintenance = Boolean(settings?.maintenance_mode)
  const [rows, setRows] = useState(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [credentials, setCredentials] = useState(null)
  const [actingId, setActingId] = useState(null)
  const [newPasscode, setNewPasscode] = useState(null)

  const reload = async () => {
    try {
      setRows(await fetchDesigners())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load designers')
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  const create = async () => {
    if (!name.trim()) { toast.error('Give the designer a name'); return }
    setBusy(true)
    try {
      const result = await createDesigner(name.trim())
      setCredentials({ name: result.designer.name, code: result.code, passcode: result.passcode })
      setName('')
      setCreating(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create designer')
    } finally {
      setBusy(false)
    }
  }

  const act = async (designerId, action) => {
    setActingId(designerId)
    setNewPasscode(null)
    try {
      if (action === 'reset-passcode') {
        const result = await resetPasscode(designerId)
        if (result.passcode) setNewPasscode(result.passcode)
        toast.success('New passcode generated')
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
      setActingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl">Designers</h1>
          <p className="text-sm text-muted-foreground">The people who write the words.</p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          New designer
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">{rows?.length ?? '—'} designers</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows === null ? (
                <TableRow><TableCell colSpan={6} className="p-6 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="p-6 text-center text-sm text-muted-foreground">No designers yet — create the first one.</TableCell></TableRow>
              ) : (
                rows.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell><code className="rounded bg-muted px-1.5 py-0.5 text-xs">{d.code}</code></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(d.created_at)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{d.last_login_at ? formatDateTime(d.last_login_at) : 'never'}</TableCell>
                    <TableCell>
                      {d.revoked_at ? <Badge variant="destructive">Revoked</Badge> : <Badge variant="outline" className="text-emerald-700 dark:text-emerald-400">Active</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" disabled={actingId === d.id} onClick={() => void act(d.id, 'reset-passcode')} title="Reset passcode">
                          {actingId === d.id ? <Loader2Icon className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                          <span className="sr-only">Reset passcode</span>
                        </Button>
                        {d.revoked_at ? (
                          <Button size="sm" variant="outline" disabled={actingId === d.id} onClick={() => void act(d.id, 'activate')}>
                            <ShieldCheck className="size-4" /> Activate
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" disabled={actingId === d.id || maintenance} onClick={() => void act(d.id, 'revoke')}>
                            <ShieldOff className="size-4" /> Revoke
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={creating} onOpenChange={(open) => { if (!open) setCreating(false) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">New designer</DialogTitle>
            <DialogDescription>Generated a unique 6-digit code. You will hand them their passcode in the next step.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="designer-name">Name</Label>
            <Input id="designer-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Able Ansel" onKeyDown={(e) => { if (e.key === 'Enter') void create() }} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={() => void create()} disabled={busy}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={credentials !== null || newPasscode !== null} onOpenChange={(open) => { if (!open) { setCredentials(null); setNewPasscode(null) } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">
              {newPasscode ? 'New passcode' : credentials ? `${credentials.name}'s credentials` : ''}
            </DialogTitle>
            <DialogDescription>
              Shown once. Share it privately and never store it afterwards.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {credentials && (
              <>
                <CopyField label="Sign-in code" value={credentials.code} />
                <CopyField label="One-time passcode" value={credentials.passcode} />
              </>
            )}
            {newPasscode && <CopyField label="New passcode" value={newPasscode} />}
            {credentials && <p className="text-xs text-muted-foreground">Designer: <span className="font-medium text-foreground">{credentials.name}</span>. The old passcode (if any) no longer works.</p>}
          </div>
          <DialogFooter>
            <Button onClick={() => { setCredentials(null); setNewPasscode(null) }}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}