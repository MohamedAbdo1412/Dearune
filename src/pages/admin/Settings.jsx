import { useEffect, useState } from 'react'
import { Loader2Icon, Save } from 'lucide-react'
import { toast } from 'sonner'
import { useAppSettings } from '@/hooks/use-app-settings'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

export function Settings() {
  const { settings, loading, error, refresh, updateSettings } = useAppSettings()
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)

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
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="maint">Maintenance mode</Label>
              <p className="text-sm text-muted-foreground">
                Pauses the studio. Blocks new sales, irreversible production steps, and designer publishing while active.
              </p>
            </div>
            <Switch id="maint" checked={form.maintenanceMode} onCheckedChange={(v) => setForm({ ...form, maintenanceMode: v })} />
          </div>
          <div className="flex items-center justify-between gap-4 border-t pt-6">
            <div>
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
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="storage-provider">Designer draft storage</Label>
              <p className="text-sm text-muted-foreground">
                Supabase keeps drafts in the private <code>designer-drafts</code> bucket and hands out short-lived
                signed URLs. Google Drive mirrors them into a per-designer folder — only choose this if the Drive
                credentials are configured in the project.
              </p>
            </div>
            <Select value={form.storageProvider} onValueChange={(v) => setForm({ ...form, storageProvider: v })}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="supabase">Supabase</SelectItem>
                <SelectItem value="google_drive">Google Drive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2Icon className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save settings
        </Button>
      </div>
    </div>
  )
}