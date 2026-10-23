import { supabase } from '@/lib/supabase'
import { workerRpc } from '@/services/workerRpc'

const MESSAGE_COLUMNS = 'id, worker_id, sender_type, title, body, priority, read_at, created_at'

/**
 * Read one private thread.
 *
 * RLS is the boundary: a worker can only select rows whose `worker_id` is
 * their own active worker id and only while holding `messages.view`; an admin
 * can select all. The screen must pass the current worker id, but a forged id
 * simply returns no rows for a worker.
 */
export async function fetchWorkerThread(workerId) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase
    .from('worker_messages')
    .select(MESSAGE_COLUMNS)
    .eq('worker_id', workerId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function sendWorkerMessage(title, body) {
  return workerRpc('worker_send_message', {
    p_title: title ?? '',
    p_body: body ?? '',
  })
}

export async function markWorkerMessagesRead() {
  return workerRpc('worker_mark_messages_read')
}

export async function fetchWorkerUnreadCount() {
  return workerRpc('worker_unread_count')
}

/** Admin-only RPC. The worker id, sender and audit actor are server-derived. */
export async function sendAdminWorkerMessage(workerId, { title, body, priority = false }) {
  return workerRpc('admin_send_worker_message', {
    p_worker_id: workerId,
    p_title: title ?? '',
    p_body: body ?? '',
    p_priority: Boolean(priority),
  })
}

export async function markAdminWorkerThreadRead(workerId) {
  return workerRpc('admin_mark_worker_messages_read', { p_worker_id: workerId })
}

export async function fetchAdminWorkerInbox() {
  const data = await workerRpc('admin_worker_inbox')
  return Array.isArray(data) ? data : []
}

/**
 * Realtime is an enhancement, not the delivery mechanism. The database row is
 * written first; screens also refresh on focus and on a timer, so notifications
 * work when the project has no Realtime publication configured.
 *
 * channel() reuses an existing channel with the same topic, and adding a
 * postgres_changes callback after subscribe() throws. Every subscription
 * therefore gets its own topic: the unread badge, the Messages screen and the
 * admin inbox can all listen at once, and React StrictMode re-mounts cannot
 * collide with the previous subscription.
 */
let channelSequence = 0

function channelTopic(prefix) {
  channelSequence += 1
  return `${prefix}-${Date.now().toString(36)}-${channelSequence}`
}

export function subscribeToWorkerMessages(workerId, onChange) {
  if (!supabase || !workerId) return () => {}
  let active = true
  const channel = supabase
    .channel(channelTopic(`worker-messages-${workerId}`))
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'worker_messages', filter: `worker_id=eq.${workerId}` },
      () => {
        if (active) onChange()
      },
    )
    .subscribe()
  return () => {
    active = false
    supabase.removeChannel(channel)
  }
}

export function subscribeToAllWorkerMessages(onChange) {
  if (!supabase) return () => {}
  let active = true
  const channel = supabase
    .channel(channelTopic('admin-worker-messages'))
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'worker_messages' },
      () => {
        if (active) onChange()
      },
    )
    .subscribe()
  return () => {
    active = false
    supabase.removeChannel(channel)
  }
}
