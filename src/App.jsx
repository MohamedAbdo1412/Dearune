import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getDesignerToken } from '@/services/designer'
import { Landing } from '@/pages/Landing'
import { PublicMessage } from '@/pages/PublicMessage'
import { DesignerLogin } from '@/pages/designer/DesignerLogin'
import { DesignerStudio } from '@/pages/designer/DesignerStudio'
import { DesignerMessageEditor } from '@/pages/designer/DesignerMessageEditor'
import { AdminLogin } from '@/pages/admin/AdminLogin'
import { AdminShell } from '@/pages/admin/AdminShell'
import { Overview } from '@/pages/admin/Overview'
import { Orders } from '@/pages/admin/Orders'
import { OrderDetail } from '@/pages/admin/OrderDetail'
import { Designers } from '@/pages/admin/Designers'
import { Templates } from '@/pages/admin/Templates'
import { Settings } from '@/pages/admin/Settings'
import { NotFound } from '@/pages/NotFound'

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

function RequireDesigner({ children }) {
  const location = useLocation()
  const [token, setToken] = useState(() => getDesignerToken())
  useEffect(() => {
    const listener = (e) => {
      if (e.key?.startsWith('dearune.designer')) setToken(getDesignerToken())
    }
    window.addEventListener('storage', listener)
    return () => window.removeEventListener('storage', listener)
  }, [])

  if (!token) {
    return <Navigate to="/designer/login" replace state={{ from: location.pathname }} />
  }
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/message/:publicId" element={<PublicMessage />} />
      <Route path="/designer/login" element={<DesignerLogin />} />
      <Route
        path="/designer"
        element={
          <RequireDesigner>
            <DesignerStudio />
          </RequireDesigner>
        }
      />
      <Route
        path="/designer/orders/:orderId"
        element={
          <RequireDesigner>
            <DesignerMessageEditor />
          </RequireDesigner>
        }
      />
      <Route path="/admin/login" element={<AdminLogin />} />
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
        <Route path="orders" element={<Orders />} />
        <Route path="orders/:orderId" element={<OrderDetail />} />
        <Route path="designers" element={<Designers />} />
        <Route path="templates" element={<Templates />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}