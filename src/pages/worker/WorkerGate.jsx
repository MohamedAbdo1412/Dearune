import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Loader2, LogOut, RefreshCw, ShieldAlert } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { WorkerBrand } from '@/components/worker-brand'
import { Button } from '@/components/ui/button'
import { fetchWorkerSession, signOutWorker, touchWorkerSession } from '@/services/workerSession'
import { WorkerShell } from '@/pages/worker/WorkerShell'
import '@/styles/worker.css'

function FullScreen({ children }) {
  return (
    <div className="worker-app flex min-h-svh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}

function SessionCard({ icon, title, message, children }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <WorkerBrand />
      <span className="mt-7 inline-flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        {icon}
      </span>
      <h1 className="mt-5 font-heading text-2xl tracking-tight">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{message}</p>
      <div className="mt-6 flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

function LoadingScreen() {
  return (
    <FullScreen>
      <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <WorkerBrand className="justify-center" />
        <div className="mt-7 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Checking your access…
        </div>
      </div>
    </FullScreen>
  )
}

function leave() {
  signOutWorker().finally(() => window.location.assign('/worker/login'))
}

/**
 * The single worker route gate.
 *
 * It validates the session with Auth on mount, refreshes on focus and on a
 * timer, and never renders the worker shell for a missing, inactive or
 * non-worker account. It is a UX gate only: every query and write behind it
 * re-checks the same live status and permission in Postgres.
 */
export function WorkerGate() {
  const [state, setState] = useState({ loading: true, session: null, error: null })
  const mounted = useRef(true)
  const touched = useRef('')

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setState((current) => ({ ...current, loading: true, error: null }))
    const result = await fetchWorkerSession()
    if (!mounted.current) return
    if (result.error) {
      // A background refresh must not tear down a working shell. An initial
      // failure does show the error card, with no access to the dashboard.
      setState((current) => {
        if (quiet && current.session) return current
        return { loading: false, session: null, error: result.error }
      })
      return
    }
    setState({ loading: false, session: result.session, error: null })
  }, [])

  useEffect(() => {
    mounted.current = true
    load()
    const timer = setInterval(() => load({ quiet: true }), 60_000)
    const onFocus = () => load({ quiet: true })
    const onVisibility = () => {
      if (document.visibilityState === 'visible') load({ quiet: true })
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)

    let unsubscribe = () => {}
    if (supabase) {
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          load({ quiet: event !== 'SIGNED_OUT' })
        }
      })
      unsubscribe = () => data.subscription.unsubscribe()
    }

    return () => {
      mounted.current = false
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      unsubscribe()
    }
  }, [load])

  useEffect(() => {
    const session = state.session
    if (!session?.worker || !session.active) return
    if (touched.current === session.user.id) return
    touched.current = session.user.id
    touchWorkerSession().catch(() => {
      // The stamp is cosmetic; the server still enforces every call.
    })
  }, [state.session])

  if (state.loading && !state.session) return <LoadingScreen />

  if (state.error && !state.session) {
    return (
      <FullScreen>
        <SessionCard
          icon={<ShieldAlert className="size-6" aria-hidden />}
          title="We could not verify your session"
          message="Your session may have expired, or the network is unavailable. Nothing was opened. Try again, or sign out and sign back in."
        >
          <Button onClick={() => load()}>
            <RefreshCw className="size-4" aria-hidden />
            Try again
          </Button>
          <Button variant="outline" onClick={leave}>
            <LogOut className="size-4" aria-hidden />
            Sign out
          </Button>
        </SessionCard>
      </FullScreen>
    )
  }

  if (state.session?.isAdmin) return <Navigate to="/admin/overview" replace />
  if (!state.session) return <Navigate to="/worker/login" replace state={{ from: '/worker/home' }} />

  if (!state.session.worker) {
    return (
      <FullScreen>
        <SessionCard
          icon={<ShieldAlert className="size-6" aria-hidden />}
          title="This account is not a worker account"
          message="You are signed in, but this account is not listed in the worker directory. Use the admin sign-in if you are an administrator, or ask your administrator to create a worker account."
        >
          <Button variant="outline" onClick={leave}>
            <LogOut className="size-4" aria-hidden />
            Sign out
          </Button>
        </SessionCard>
      </FullScreen>
    )
  }

  if (!state.session.active) {
    const suspended = state.session.worker.status === 'suspended'
    return (
      <FullScreen>
        <SessionCard
          icon={<ShieldAlert className="size-6" aria-hidden />}
          title={suspended ? 'Your worker access is suspended' : 'Your worker access is inactive'}
          message={
            state.session.worker.status_reason ||
            'Your studio administrator has turned off this account. Ask them to reactivate it if you believe this is a mistake.'
          }
        >
          <Button variant="outline" onClick={leave}>
            <LogOut className="size-4" aria-hidden />
            Sign out
          </Button>
        </SessionCard>
      </FullScreen>
    )
  }

  return <WorkerShell session={state.session} onRefresh={() => load({ quiet: true })} />
}
