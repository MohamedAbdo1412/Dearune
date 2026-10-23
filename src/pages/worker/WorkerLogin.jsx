import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, KeyRound, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { WorkerBrand } from '@/components/worker-brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fetchWorkerSession, touchWorkerSession } from '@/services/workerSession'
import '@/styles/worker.css'

/**
 * Worker sign-in.
 *
 * There is no public worker registration. The administrator creates the
 * Supabase Auth account and the worker directory row; this screen only signs
 * that account in. A non-worker (including a designer) is rejected, and an
 * inactive/suspended worker is signed back out with a neutral message.
 */
export function WorkerLogin() {
  const navigate = useNavigate()
  const location = useLocation()
  const requested = typeof location.state?.from === 'string' ? location.state.from : '/worker/home'
  const from = requested.startsWith('/worker') ? requested : '/worker/home'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchWorkerSession().then((result) => {
      if (cancelled || !result.session) return
      if (result.session.isAdmin) navigate('/admin/overview', { replace: true })
      else if (result.session.active) navigate('/worker/home', { replace: true })
    })
    return () => {
      cancelled = true
    }
  }, [navigate])

  const submit = async (event) => {
    event.preventDefault()
    if (!supabase) {
      setError('Supabase is not configured for this environment.')
      return
    }
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (signInError) throw new Error(signInError.message || 'Could not sign in')

      const result = await fetchWorkerSession()
      if (result.error) throw result.error
      const session = result.session
      if (!session) throw new Error('Your session could not be verified. Please try again.')

      if (session.isAdmin) {
        navigate('/admin/overview', { replace: true })
        return
      }
      if (!session.worker) {
        await supabase.auth.signOut()
        throw new Error('This account is not a worker account. Use the admin sign-in if you are an administrator.')
      }
      if (!session.active) {
        await supabase.auth.signOut()
        throw new Error(
          session.worker.status === 'suspended'
            ? 'This worker account is suspended. Ask your studio administrator to reactivate it.'
            : 'This worker account is inactive. Ask your studio administrator to reactivate it.',
        )
      }

      await touchWorkerSession().catch(() => {})
      navigate(from, { replace: true })
    } catch (caught) {
      setError(caught?.message || 'Could not sign in')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="worker-app min-h-svh lg:grid lg:grid-cols-[1.05fr_1fr]">
      <section className="worker-hero relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="relative z-10">
          <WorkerBrand tagClassName="text-sidebar-primary" />
        </div>
        <div className="relative z-10 max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sidebar-primary">
            Studio workspace
          </p>
          <h1 className="mt-4 font-heading text-4xl leading-tight tracking-tight text-sidebar-foreground xl:text-5xl">
            The workshop, without the noise.
          </h1>
          <p className="mt-5 max-w-sm text-sm leading-6 text-sidebar-foreground/68">
            Your dashboard is built from the access the studio gave you. Operations, designers, QA,
            financials and messages appear only when they are yours to use.
          </p>
          <div className="mt-8 grid gap-3 text-sm text-sidebar-foreground/72">
            <p className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-sidebar-primary" aria-hidden />
              Access is checked by the database on every action, not just hidden in the menu.
            </p>
            <p className="flex items-start gap-2.5">
              <LockKeyhole className="mt-0.5 size-4 shrink-0 text-sidebar-primary" aria-hidden />
              Financial categories are granted separately. One category never implies another.
            </p>
          </div>
        </div>
        <p className="relative z-10 text-xs text-sidebar-foreground/40">
          Dearune · private studio tooling
        </p>
      </section>

      <section className="flex min-h-svh items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md">
          <div className="lg:hidden">
            <WorkerBrand />
          </div>

          <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8 lg:mt-0">
            <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <KeyRound className="size-5" aria-hidden />
            </span>
            <h2 className="mt-5 font-heading text-2xl tracking-tight sm:text-3xl">Worker sign-in</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Use the email and temporary password your studio administrator gave you. Workers
              cannot register themselves.
            </p>

            <form className="mt-6 space-y-4" onSubmit={submit}>
              <div className="space-y-2">
                <Label htmlFor="worker-email">Email</Label>
                <Input
                  id="worker-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@studio.com"
                  required
                  disabled={busy}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="worker-password">Password</Label>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setRevealed((value) => !value)}
                    aria-label={revealed ? 'Hide password' : 'Show password'}
                  >
                    {revealed ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
                    {revealed ? 'Hide' : 'Show'}
                  </button>
                </div>
                <Input
                  id="worker-password"
                  type={revealed ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  disabled={busy}
                />
              </div>

              {error ? (
                <p role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm leading-5 text-destructive">
                  {error}
                </p>
              ) : null}

              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {busy ? 'Signing in…' : 'Open my dashboard'}
              </Button>
            </form>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
              <Link to="/admin/login" className="underline-offset-4 hover:text-foreground hover:underline">
                Administrator sign-in
              </Link>
              <Link to="/" className="underline-offset-4 hover:text-foreground hover:underline">
                Back to Dearune
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
