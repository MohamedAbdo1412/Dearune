import { useEffect, useState } from 'react'
import { Loader2Icon, Save, AlertTriangle, Database, Trash2, Key } from 'lucide-react'
import { toast } from 'sonner'
import { useAppSettings } from '@/hooks/use-app-settings'
import { supabase, currentAccessToken, invokeFunction } from '@/lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export function Settings() {
  const { settings, loading, error, refresh, updateSettings } = useAppSettings()
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)

  // Data Reset state
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [resetPassword, setResetPassword] = useState('')
  const [resetConfirm, setResetConfirm] = useState(false)
  const [resetTargets, setResetTargets] = useState({
    designers: false,
    projects: false,
    orders: false,
    soldLogs: false,
    messages: false,
    templates: false,
    wrappers: false,
    mediaStorage: false,
    fullStorage: false,
  })
  const [resetLoading, setResetLoading] = useState(false)
  const [resetProgress, setResetProgress] = useState('')

  useEffect(() => {
    if (settings && !form) {
      setForm({
        businessName: settings.business_name ?? '',
        currency: settings.currency ?? 'EGP',
        maintenanceMode: settings.maintenance_mode,
        allowNewOrders: settings.allow_new_orders,
        storageProvider: settings.storage_provider ?? 'supabase',
      })
    }
  }, [settings, form])

  const RESET_PASSWORD = '@Trap8TrapMohamed01029260231'

  const targetLabels = {
    designers: 'Designers (designers table)',
    projects: 'Projects / Dearunes (projects table)',
    orders: 'Operations orders (ops_orders view — milestone data)',
    soldLogs: 'Sold logs / Sales (sale records)',
    messages: 'Messages (public messages, project_events)',
    templates: 'Templates (templates table)',
    wrappers: 'Wrappers (wrapper_types, template_wrapper_options)',
    mediaStorage: 'Message media storage (designer-drafts bucket)',
    fullStorage: 'Full project media storage (all buckets)',
  }

  const handleResetTargetChange = (key, value) => {
    setResetTargets((prev) => ({ ...prev, [key]: value }))
  }

  const anyTargetSelected = Object.values(resetTargets).some(Boolean)

  const validatePassword = () => {
    if (resetPassword !== RESET_PASSWORD) {
      toast.error('Incorrect password')
      return false
    }
    if (!anyTargetSelected) {
      toast.error('Select at least one data type to reset')
      return false
    }
    return true
  }

  const executeReset = async () => {
    if (!validatePassword()) return

    setResetLoading(true)
    setResetProgress('Connecting to database...')
    setResetConfirm(false)

    try {
      const adminToken = await currentAccessToken()
      if (!adminToken) throw new Error('Not signed in')

      const result = await invokeFunction('admin-operations', {
        method: 'POST',
        adminToken,
        body: {
          action: 'data-reset',
          targets: resetTargets,
          password: resetPassword,
        },
      })

      if (result.error) {
        throw new Error(result.error)
      }

      toast.success(`Reset completed: ${result.summary}`)
      setResetTargets({
        designers: false,
        projects: false,
        orders: false,
        soldLogs: false,
        messages: false,
        templates: false,
        wrappers: false,
        mediaStorage: false,
        fullStorage: false,
      })
      setResetPassword('')
      setResetDialogOpen(false)
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reset failed')
    } finally {
      setResetLoading(false)
      setResetProgress('')
    }
  }

  if (loading) {
    return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
  }
  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Could not load settings. Check that app_settings exists and RLS allows your admin to read it.
        </CardContent>
      </Card>
    )
  }
  if (!form) return null

  const save = async () => {
    setSaving(true)
    try {
      const maintenanceNowToggledOn = form.maintenanceMode && !settings.maintenance_mode
      await updateSettings({
        businessName: form.businessName.trim() || 'Dearune',
        currency: form.currency,
        maintenanceMode: form.maintenanceMode,
        allowNewOrders: form.allowNewOrders,
        storageProvider: form.storageProvider,
      })
      if (maintenanceNowToggledOn) {
        toast.info('Maintenance mode is ON — the studio is paused and irreversible actions are blocked.')
      } else {
        toast.success('Settings saved')
      }
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Settings</h1>
        <p className="text-sm text-muted-foreground">How the studio runs.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">Studio</CardTitle>
          <CardDescription>Used on receipts and the public-facing pages.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="biz-name">Business name</Label>
            <Input id="biz-name" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Currency</Label>
            <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EGP">EGP · £E</SelectItem>
                <SelectItem value="GBP">GBP · £</SelectItem>
                <SelectItem value="EUR">EUR · €</SelectItem>
                <SelectItem value="USD">USD · $</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">Toggles</CardTitle>
          <CardDescription>These change what the studio, designers, and visitors can do right now.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="maint">Maintenance mode</Label>
              <p className="text-sm text-muted-foreground">
                Pauses the studio. Blocks new sales, irreversible production steps, and designer publishing while active.
              </p>
            </div>
            <Switch id="maint" checked={form.maintenanceMode} onCheckedChange={(v) => setForm({ ...form, maintenanceMode: v })} />
          </div>
          <div className="flex items-start justify-between gap-4 border-t pt-6">
            <div className="min-w-0">
              <Label htmlFor="new-orders">Allow new orders</Label>
              <p className="text-sm text-muted-foreground">
                When off, the admin can still work existing orders, but the front desk cannot record new sales.
              </p>
            </div>
            <Switch id="new-orders" checked={form.allowNewOrders} onCheckedChange={(v) => setForm({ ...form, allowNewOrders: v })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">Media storage</CardTitle>
          <CardDescription>
            Where designers' draft photographs and voice notes are kept until an order exists.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <Label htmlFor="storage-provider">Designer draft storage</Label>
              <p className="text-sm text-muted-foreground">
                Supabase keeps drafts in the private <code>designer-drafts</code> bucket and hands out short-lived
                signed URLs. Google Drive mirrors them into a per-designer folder — only choose this if the Drive
                credentials are configured in the project.
              </p>
            </div>
            <Select value={form.storageProvider} onValueChange={(v) => setForm({ ...form, storageProvider: v })}>
              <SelectTrigger id="storage-provider" className="w-full sm:w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="supabase">Supabase</SelectItem>
                <SelectItem value="google_drive">Google Drive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ---- Data Reset (Danger Zone) ---- */}
      <Card className="border-destructive/50 bg-destructive/5">
        <CardHeader>
          <CardTitle className="font-heading text-lg flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5" />
            Data Reset — Danger Zone
          </CardTitle>
          <CardDescription>
            Irreversibly delete selected data. Requires the master password. Admin users are NEVER affected.
            <br />
            <strong>This cannot be undone.</strong> No backups are created by this action.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            {Object.entries(targetLabels).map(([key, label]) => (
              <label key={key} className="flex items-center gap-3 rounded-lg border bg-background p-3 hover:bg-muted/50 transition-colors">
                <Checkbox
                  checked={resetTargets[key]}
                  onCheckedChange={(e) => handleResetTargetChange(key, e.target.checked)}
                  className="size-4"
                />
                <span className="text-sm font-medium">{label}</span>
                {key === 'mediaStorage' && (
                  <span className="ml-auto text-xs text-muted-foreground">(designer-drafts bucket only)</span>
                )}
                {key === 'fullStorage' && (
                  <span className="ml-auto text-xs text-destructive">(ALL buckets — use with extreme caution)</span>
                )}
              </label>
            ))}
          </div>

          <Separator />

          <Button
            variant="destructive"
            onClick={() => setResetDialogOpen(true)}
            disabled={!anyTargetSelected || resetLoading}
          >
            <Trash2 className="size-4" />
            Reset Selected Data
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2Icon className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save settings
        </Button>
      </div>

      {/* Password Confirmation Dialog */}
      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" />
              Confirm Data Reset
            </AlertDialogTitle>
            <AlertDialogDescription>
              You are about to <strong>permanently delete</strong> the following data:
              <ul className="mt-2 ml-4 list-disc text-sm space-y-1">
                {Object.entries(targetLabels)
                  .filter(([key]) => resetTargets[key])
                  .map(([key, label]) => (
                    <li key={key}>{label}</li>
                  ))}
              </ul>
              <p className="mt-3 text-sm text-destructive">
                This action is IRREVERSIBLE. Admin users will NOT be deleted.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-password">Master Password</Label>
              <Input
                id="reset-password"
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder="Enter the master password"
                autoFocus
              />
            </div>
            <label className="flex items-center gap-2">
              <Checkbox checked={resetConfirm} onCheckedChange={setResetConfirm} />
              <span className="text-sm">I understand this cannot be undone and I confirm the deletion</span>
            </label>
            {resetProgress && (
              <div className="text-center text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin mx-auto mb-1" />
                {resetProgress}
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setResetPassword('')}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeReset}
              disabled={!resetConfirm || !resetPassword || resetLoading}
            >
              {resetLoading ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Delete Selected Data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}