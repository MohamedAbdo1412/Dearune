import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Landing } from '@/pages/Landing'
import { PublicMessage } from '@/pages/PublicMessage'
import { AdminLogin } from '@/pages/admin/AdminLogin'
import { AdminShell } from '@/pages/admin/AdminShell'
import { Overview } from '@/pages/admin/Overview'
import { Designers } from '@/pages/admin/Designers'
import { DesignerDetail } from '@/pages/admin/DesignerDetail'
import { MessageDetail } from '@/pages/admin/MessageDetail'
import { SoldLogs } from '@/pages/admin/SoldLogs'
import { SaleDetail } from '@/pages/admin/SaleDetail'
import { Templates } from '@/pages/admin/Templates'
import { Wrappers } from '@/pages/admin/Wrappers'
import { Settings } from '@/pages/admin/Settings'
import { Operations } from '@/pages/admin/Operations'
import { QaScanner } from '@/pages/admin/QaScanner'
import { NotFound } from '@/pages/NotFound'
import { MemorialQa } from '@/pages/QaMemorial'
import { CatalogQa } from '@/pages/QaCatalog'
import { syncAppForPath } from '@/pwa/app-runtime'

const CreateBook = lazy(() => import('@/pages/create/CreateBook'))
// The review step carries the PDF generator and the spreadsheet writer, so it
// is only fetched when someone actually goes to print.
const OperationsPrint = lazy(() => import('@/pages/admin/OperationsPrint'))
// The Apps page carries its own typeface, so it is fetched on its own too.
const Apps = lazy(() => import('@/pages/admin/Apps'))

// Keeps the page and the service workers in step with the section the reader
// is in: while an app's own section is open, the browser is pointed at that
// app's manifest and that app's worker is in charge of its own URLs.
function AppPwaSync() {
  const location = useLocation()
  useEffect(() => {
    syncAppForPath(location.pathname)
  }, [location.pathname])
  return null
}

function RequireAdmin({ children }) {
  const location = useLocation()
  const [state, setState] = useState('loading')

  useEffect(() => {
    let active = true
    const db = supabase
    const check = async () => {
      if (!db) {
        setState('denied')
        return
      }
      const { data } = await db.auth.getSession()
      if (!data.session) {
        setState('denied')
        return
      }
      const { data: row } = await db
        .from('admin_users')
        .select('id')
        .eq('id', data.session.user.id)
        .maybeSingle()
      if (active) setState(row ? 'ok' : 'denied')
    }
    void check()
    const sub = db?.auth.onAuthStateChange(() => {
      void check()
    }) ?? { data: { subscription: { unsubscribe: () => {} } } }
    return () => {
      active = false
      sub.data.subscription.unsubscribe()
    }
  }, [])

  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Checking session…
      </div>
    )
  }
  if (state === 'denied') {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />
  }
  return children
}

export default function App() {
  return (
    <>
      <AppPwaSync />
      <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/message/:publicId" element={<PublicMessage />} />
      <Route
        path="/create"
        element={
          <Suspense
            fallback={
              <div className="flex min-h-screen items-center justify-center text-sm tracking-[0.3em] uppercase text-muted-foreground">
                fetching the book…
              </div>
            }
          >
            <CreateBook />
          </Suspense>
        }
      />
      <Route path="/admin/login" element={<AdminLogin />} />
      {/* Visual-QA benches — static, no auth, kept out of every menu.
          e2e/qa-memorial.mjs and e2e/qa-catalog.mjs screenshot them. */}
      <Route path="/qa/memorial" element={<MemorialQa />} />
      <Route path="/qa/catalog" element={<CatalogQa />} />
      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <AdminShell />
          </RequireAdmin>
        }
      >
        <Route index element={<Navigate to="/admin/overview" replace />} />
        <Route path="overview" element={<Overview />} />
        {/* The old Sales screens are gone: one Dearune record now carries the
            sale, the message and the production steps. Keep the old URLs
            working so any bookmark lands somewhere useful. */}
        <Route path="orders" element={<Navigate to="/admin/overview" replace />} />
        <Route path="orders/:orderId" element={<Navigate to="/admin/overview" replace />} />
        <Route path="designers" element={<Designers />} />
        <Route path="designers/:designerId" element={<DesignerDetail />} />
        <Route path="designers/:designerId/messages/:projectId" element={<MessageDetail />} />
        <Route path="sold" element={<SoldLogs />} />
        <Route path="sold/:saleId" element={<SaleDetail />} />
        <Route path="operations" element={<Operations />} />
        {/* The QA desk — the admin-only scanner. The public /qa/* benches above
            are visual pages and stay out of the admin menu. */}
        <Route path="qa" element={<QaScanner />} />
        <Route
          path="operations/print"
          element={
            <Suspense
              fallback={
                <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
                  Preparing the papers…
                </div>
              }
            >
              <OperationsPrint />
            </Suspense>
          }
        />
        <Route path="templates" element={<Templates />} />
        <Route path="wrappers" element={<Wrappers />} />
        {/* The three apps, and the way to install them. */}
        <Route
          path="apps"
          element={
            <Suspense
              fallback={
                <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
                  Opening the apps…
                </div>
              }
            >
              <Apps />
            </Suspense>
          }
        />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  )
}