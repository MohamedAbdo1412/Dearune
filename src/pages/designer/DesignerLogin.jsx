import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { Loader2Icon, LogIn } from 'lucide-react'
import { toast } from 'sonner'
import { designerLogin } from '@/services/designer'
import { Brand } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function DesignerLogin() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from ?? '/designer'
  const [code, setCode] = useState('')
  const [passcode, setPasscode] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const session = await designerLogin(code.trim(), passcode.trim())
      toast.success(`Welcome back, ${session.designer.name}`)
      navigate(from, { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Login failed')
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
          <CardTitle className="font-heading text-2xl">Designer studio</CardTitle>
          <CardDescription>
            Enter your six-digit code and passcode.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Code</Label>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="passcode">Passcode</Label>
              <Input
                id="passcode"
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value.replace(/\D/g, ''))}
                required
              />
            </div>
            <Button className="w-full" type="submit" disabled={busy || code.length !== 6 || passcode.length !== 6}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : <LogIn className="size-4" />}
              Sign in
            </Button>
          </form>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Codes are issued by the Dearune team.{' '}
            <Link to="/" className="underline underline-offset-4">Go back</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}