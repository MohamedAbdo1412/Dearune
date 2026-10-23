import { useCallback, useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Bell, Loader2, MessageCircle, RefreshCw, Send, ShieldAlert, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { hasPermission } from '@/lib/permissions'
import { formatDateTime } from '@/services/format'
import {
  fetchWorkerThread,
  markWorkerMessagesRead,
  sendWorkerMessage,
  subscribeToWorkerMessages,
} from '@/services/workerMessages'

function messageOf(error) {
  const text = error instanceof Error ? error.message : String(error ?? '')
  if (text.includes('worker.forbidden')) return 'Sending messages is not part of your current access.'
  if (text.includes('message.body_required')) return 'Write a message before sending.'
  if (text.includes('message.body_too_long')) return 'That message is too long (5000 characters maximum).'
  if (text.includes('message.title_too_long')) return 'That subject is too long (200 characters maximum).'
  if (text.includes('worker.inactive_or_unknown')) return 'This worker account is no longer active.'
  return text || 'The message could not be sent.'
}

function NotificationOnly({ unread, onRefresh, refreshing }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Bell className="size-6" aria-hidden />
      </span>
      <h1 className="mt-5 font-heading text-2xl tracking-tight">Messages are private</h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
        Your account can see that a message exists — {unread > 0 ? `${unread} unread` : 'currently none unread'} —
        but reading the conversation is a separate permission. Ask the studio administrator if you need
        to read or reply here.
      </p>
      <div className="mt-5 flex items-center gap-2">
        <Badge className="bg-primary text-primary-foreground">{unread > 99 ? '99+' : unread} unread</Badge>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw className={refreshing ? 'size-4 animate-spin' : 'size-4'} aria-hidden />
          Check again
        </Button>
      </div>
    </div>
  )
}

export function WorkerMessages() {
  const { session, unread, refreshUnread } = useOutletContext()
  const canRead = hasPermission(session.permissions, 'messages.view')
  const canSend = hasPermission(session.permissions, 'messages.send')
  const workerId = session.worker.id

  const [messages, setMessages] = useState(null)
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const mounted = useRef(true)

  const load = useCallback(
    async ({ quiet = false, markRead = true } = {}) => {
      if (!canRead) return
      if (!quiet) setRefreshing(true)
      setError('')
      try {
        const data = await fetchWorkerThread(workerId)
        if (!mounted.current) return
        const hadUnread = data.some((message) => message.sender_type === 'admin' && !message.read_at)
        setMessages(data)
        if (markRead && hadUnread) {
          await markWorkerMessagesRead()
          const now = new Date().toISOString()
          if (mounted.current) {
            setMessages((current) =>
              (current ?? []).map((message) =>
                message.sender_type === 'admin' && !message.read_at ? { ...message, read_at: now } : message,
              ),
            )
          }
          await refreshUnread()
        }
      } catch (caught) {
        if (mounted.current) setError(messageOf(caught))
      } finally {
        if (mounted.current) setRefreshing(false)
      }
    },
    [canRead, refreshUnread, workerId],
  )

  useEffect(() => {
    mounted.current = true
    if (!canRead) return
    load()
    const timer = setInterval(() => load({ quiet: true }), 45_000)
    const onFocus = () => load({ quiet: true })
    const onVisibility = () => {
      if (document.visibilityState === 'visible') load({ quiet: true })
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    const unsubscribe = subscribeToWorkerMessages(workerId, () => load({ quiet: true }))
    return () => {
      mounted.current = false
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      unsubscribe()
    }
  }, [canRead, load, workerId])

  const send = async (event) => {
    event.preventDefault()
    if (!canSend || sending) return
    if (!body.trim()) {
      toast.error('Write a message before sending')
      return
    }
    setSending(true)
    try {
      await sendWorkerMessage(title.trim(), body.trim())
      setTitle('')
      setBody('')
      toast.success('Message sent to the studio')
      await load({ quiet: true, markRead: false })
    } catch (caught) {
      toast.error(messageOf(caught))
    } finally {
      setSending(false)
    }
  }

  if (!canRead) {
    return (
      <div className="space-y-5">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Messages</p>
          <h1 className="mt-1 font-heading text-3xl tracking-tight">Your private thread</h1>
        </header>
        <NotificationOnly
          unread={unread}
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true)
            await refreshUnread()
            setRefreshing(false)
          }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Messages</p>
          <h1 className="mt-1 font-heading text-3xl tracking-tight">Your private thread</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Only you and the studio administrator can see this conversation. Notifications are in-app;
            the studio does not claim email or browser push delivery.
          </p>
        </div>
        <Button variant="outline" onClick={() => load({ quiet: false })} disabled={refreshing}>
          <RefreshCw className={refreshing ? 'size-4 animate-spin' : 'size-4'} aria-hidden />
          Refresh
        </Button>
      </header>

      {error ? (
        <p role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr] lg:items-start">
        <section className="min-h-[24rem] rounded-2xl border border-border bg-card shadow-sm" aria-label="Conversation">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <MessageCircle className="size-4 text-primary" aria-hidden />
              <h2 className="text-sm font-semibold">Conversation</h2>
            </div>
            {unread > 0 ? (
              <Badge className="bg-primary text-primary-foreground">{unread > 99 ? '99+' : unread} unread</Badge>
            ) : (
              <span className="text-xs text-muted-foreground">All caught up</span>
            )}
          </div>

          <div className="max-h-[34rem] space-y-4 overflow-y-auto p-4 worker-scroll sm:p-5">
            {messages === null ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-3/4 rounded-2xl" />
                <Skeleton className="ml-auto h-24 w-2/3 rounded-2xl" />
                <Skeleton className="h-16 w-1/2 rounded-2xl" />
              </div>
            ) : messages.length === 0 ? (
              <div className="py-10 text-center">
                <Sparkles className="mx-auto size-7 text-primary" aria-hidden />
                <p className="mt-3 font-heading text-lg tracking-tight">No messages yet</p>
                <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-muted-foreground">
                  {canSend
                    ? 'Write the first message below. The studio administrator will see it in the admin inbox.'
                    : 'The studio administrator has not sent anything yet. Reading is allowed, but replying is a separate permission.'}
                </p>
              </div>
            ) : (
              messages.map((message) => {
                const fromAdmin = message.sender_type === 'admin'
                return (
                  <article
                    key={message.id}
                    className={
                      fromAdmin
                        ? 'max-w-[92%] rounded-2xl rounded-tl-md border border-border bg-muted/45 px-4 py-3 sm:max-w-[85%]'
                        : 'ml-auto max-w-[92%] rounded-2xl rounded-tr-md border border-primary/20 bg-primary/8 px-4 py-3 sm:max-w-[85%]'
                    }
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold">{fromAdmin ? 'Studio' : 'You'}</span>
                      {message.priority ? (
                        <Badge className="h-5 bg-amber-500/15 px-1.5 text-[0.62rem] text-amber-800 dark:text-amber-200">
                          Priority
                        </Badge>
                      ) : null}
                    </div>
                    {message.title ? <p className="mt-1.5 text-sm font-medium">{message.title}</p> : null}
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p>
                    <p className="mt-2 text-[0.65rem] text-muted-foreground">
                      {formatDateTime(message.created_at)}
                      {fromAdmin && message.read_at ? ' · read' : ''}
                    </p>
                  </article>
                )
              })
            )}
          </div>

          {canSend ? (
            <form className="border-t border-border p-4 sm:p-5" onSubmit={send}>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="worker-message-title">Subject <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Input
                    id="worker-message-title"
                    value={title}
                    maxLength={200}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="A short subject"
                    disabled={sending}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="worker-message-body">Message</Label>
                  <Textarea
                    id="worker-message-body"
                    value={body}
                    rows={4}
                    maxLength={5000}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder="Write to the studio administrator…"
                    disabled={sending}
                  />
                  <p className="text-right text-[0.68rem] text-muted-foreground">{body.length}/5000</p>
                </div>
                <Button type="submit" className="w-full sm:w-auto" disabled={sending || !body.trim()}>
                  {sending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
                  Send message
                </Button>
              </div>
            </form>
          ) : (
            <div className="border-t border-border p-4 sm:p-5">
              <p className="flex items-start gap-2 rounded-xl bg-muted/45 px-3 py-2 text-xs leading-5 text-muted-foreground">
                <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                Reading is allowed. Sending is a separate permission and is not currently granted.
              </p>
            </div>
          )}
        </section>

        <aside className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-heading text-lg tracking-tight">Good to know</h2>
          <ul className="mt-3 space-y-3 text-sm leading-6 text-muted-foreground">
            <li className="flex gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
              Messages are stored in the studio database and belong to this worker account only.
            </li>
            <li className="flex gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
              The admin inbox can mark a thread read, but cannot rewrite or delete your messages.
            </li>
            <li className="flex gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
              Unread badges refresh when you return to the tab, when a new message arrives on Realtime,
              and on a short timer. They work without a browser-push subscription.
            </li>
            <li className="flex gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
              Signing out ends access to this thread on this device.
            </li>
          </ul>
        </aside>
      </div>
    </div>
  )
}
