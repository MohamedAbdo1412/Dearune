import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { Loader2Icon, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Brand } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function AdminLogin() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from ?? '/admin/overview'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    if (!supabase) {
      toast.error('Supabase is not configured for this environment')
      return
    }
    if (busy) return
    setBusy(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      const { data: row } = await supabase.from('admin_users').select('id, display_name').eq('id', data.user.id).maybeSingle()
      if (!row) {
        await supabase.auth.signOut()
        toast.error('This account is not an administrator')
        return
      }
      toast.success(`Welcome, ${row.display_name ?? 'administrator'}`)
      navigate(from, { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[oklch(0.97_0.004_90)] px-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mb-3 flex justify-center">
            <Brand />
          </div>
          <CardTitle className="font-heading text-2xl">Dearune admin</CardTitle>
          <CardDescription>
            Sign in with your administrator account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button className="w-full" type="submit" disabled={busy}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
              Sign in
            </Button>
          </form>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            <Link to="/" className="underline underline-offset-4">Go back</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}