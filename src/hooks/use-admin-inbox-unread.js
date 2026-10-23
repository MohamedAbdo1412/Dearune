import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchAdminWorkerInbox, subscribeToAllWorkerMessages } from '@/services/workerMessages'

/**
 * Unread worker messages for the admin sidebar.
 *
 * `admin_worker_inbox()` is an admin-only RPC, so a non-admin token receives
 * nothing. Realtime plus focus/interval refreshes keep the badge current.
 */
export function useAdminInboxUnread() {
  const [count, setCount] = useState(0)
  const mounted = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const threads = await fetchAdminWorkerInbox()
      const next = threads.reduce((total, thread) => total + (Number(thread.unreadFromWorker) || 0), 0)
      if (mounted.current) setCount(next)
      return next
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    refresh()
    const timer = setInterval(refresh, 60_000)
    const onFocus = () => refresh()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    // The Inbox marks a thread read and then tells every mounted badge to
    // refresh. Realtime may not be configured, so this event keeps the shell
    // honest in the same tab without waiting for the 60-second timer.
    window.addEventListener('admin-inbox-refresh', onFocus)
    const unsubscribe = subscribeToAllWorkerMessages(refresh)
    return () => {
      mounted.current = false
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('admin-inbox-refresh', onFocus)
      unsubscribe()
    }
  }, [refresh])

  return { count, refresh }
}
