import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchWorkerUnreadCount, subscribeToWorkerMessages } from '@/services/workerMessages'

/**
 * Unread admin messages for the signed-in worker.
 *
 * The count comes from a database RPC that checks the live session and either
 * `messages.view` or `notifications.view`. Realtime is used when available;
 * focus and a 60-second timer make the same badge reliable without it.
 */
export function useWorkerUnread({ workerId, canRead, canNotify }) {
  const [count, setCount] = useState(0)
  const enabled = Boolean(workerId) && Boolean(canRead || canNotify)
  const mounted = useRef(true)

  const refresh = useCallback(async () => {
    if (!enabled) {
      if (mounted.current) setCount(0)
      return 0
    }
    try {
      const value = await fetchWorkerUnreadCount()
      const next = Number(value) || 0
      if (mounted.current) setCount(next)
      return next
    } catch {
      // A failed badge must never invent a number. Keep the last known count
      // and let the next focus/timer try again.
      return null
    }
  }, [enabled])

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
    const unsubscribe = enabled ? subscribeToWorkerMessages(workerId, refresh) : () => {}
    return () => {
      mounted.current = false
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      unsubscribe()
    }
  }, [enabled, refresh, workerId])

  return { count, refresh }
}
