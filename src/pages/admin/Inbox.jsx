import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  BellRing,
  Loader2,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/services/format'
import {
  fetchAdminWorkerInbox,
  fetchWorkerThread,
  markAdminWorkerThreadRead,
  sendAdminWorkerMessage,
  subscribeToAllWorkerMessages,
} from '@/services/workerMessages'

const STATUS_STYLES = {
  active: 'border-emerald-600/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  inactive: 'border-border bg-muted text-muted-foreground',
  suspended: 'border-destructive/25 bg-destructive/10 text-destructive',
}

function messageOf(error) {
  const text = error instanceof Error ? error.message : String(error ?? '')
  if (text.includes('admin.unauthorized')) return 'Your administrator session is no longer valid.'
  if (text.includes('worker.not_found')) return 'That worker no longer exists.'
  if (text.includes('message.body_required')) return 'Write a message before sending.'
  if (text.includes('message.body_too_long')) return 'That message is too long (5000 characters maximum).'
  if (text.includes('message.title_too_long')) return 'That subject is too long (200 characters maximum).'
  return text || 'The request failed.'
}

function notifyInboxChanged() {
  window.dispatchEvent(new CustomEvent('admin-inbox-refresh'))
}

function StatusPill({ status }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-medium capitalize', STATUS_STYLES[status] ?? STATUS_STYLES.inactive)}>
      {status}
    </span>
  )
}

function InboxRow({ thread, selected }) {
  return (
    <Link
      to={`/admin/inbox/${thread.workerId}`}
      className={cn(
        'block border-b px-4 py-3.5 transition-colors last:border-b-0 hover:bg-muted/45',
        selected && 'bg-muted/65',
      )}
      aria-current={selected ? 'page' : undefined}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted font-heading text-sm">
          {(thread.displayName || '?').slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-medium">{thread.displayName}</p>
            {thread.unreadFromWorker > 0 ? (
              <Badge className="h-5 min-w-5 justify-center rounded-full bg-primary px-1.5 text-[0.62rem] text-primary-foreground">
                {thread.unreadFromWorker > 99 ? '99+' : thread.unreadFromWorker}
                <span className="sr-only"> unread</span>
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{thread.email}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {thread.lastMessagePreview
              ? `${thread.lastMessageFrom === 'admin' ? 'You: ' : ''}${thread.lastMessagePreview}`
              : 'No messages yet'}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <StatusPill status={thread.status} />
            {thread.lastMessageAt ? (
              <span className="text-[0.65rem] text-muted-foreground">{formatDateTime(thread.lastMessageAt)}</span>
            ) : null}
            {thread.unreadForWorker > 0 ? (
              <span className="text-[0.65rem] text-muted-foreground">{thread.unreadForWorker} unread by worker</span>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  )
}

function ThreadPane({ thread, messages, loading, error, onRefresh, refreshing }) {
  return (
    <div className="flex min-h-[32rem] flex-col rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate font-medium">{thread.displayName}</h2>
            <StatusPill status={thread.status} />
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{thread.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to={`/admin/users/${thread.workerId}`}>Open worker</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={refreshing ? 'size-4 animate-spin' : 'size-4'} aria-hidden />
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="m-4 flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <div className="max-h-[32rem] flex-1 space-y-4 overflow-y-auto p-4">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-3/4 rounded-2xl" />
            <Skeleton className="ml-auto h-24 w-2/3 rounded-2xl" />
            <Skeleton className="h-16 w-1/2 rounded-2xl" />
          </div>
        ) : messages.length === 0 ? (
          <div className="py-12 text-center">
            <MessageCircle className="mx-auto size-7 text-muted-foreground" aria-hidden />
            <p className="mt-3 font-medium">No messages yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Send the first note below. Only this worker can see the thread.
            </p>
          </div>
        ) : (
          messages.map((message) => {
            const fromAdmin = message.sender_type === 'admin'
            return (
              <article
                key={message.id}
                className={cn(
                  'max-w-[92%] rounded-2xl px-4 py-3 sm:max-w-[82%]',
                  fromAdmin
                    ? 'ml-auto rounded-tr-md bg-primary text-primary-foreground'
                    : 'rounded-tl-md border bg-muted/45',
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('text-xs font-semibold', fromAdmin ? 'text-primary-foreground/90' : '')}>
                    {fromAdmin ? 'You' : thread.displayName}
                  </span>
                  {message.priority ? (
                    <Badge
                      variant="outline"
                      className={cn(
                        'h-5 px-1.5 text-[0.6rem]',
                        fromAdmin
                          ? 'border-primary-foreground/35 text-primary-foreground'
                          : 'border-amber-500/40 text-amber-800 dark:text-amber-200',
                      )}
                    >
                      High priority
                    </Badge>
                  ) : null}
                  {!fromAdmin && !message.read_at ? (
                    <span className="text-[0.62rem] font-medium text-primary">New</span>
                  ) : null}
                </div>
                {message.title ? (
                  <p className={cn('mt-1.5 text-sm font-medium', fromAdmin && 'text-primary-foreground')}>
                    {message.title}
                  </p>
                ) : null}
                <p className={cn('mt-1 whitespace-pre-wrap break-words text-sm leading-6', fromAdmin ? 'text-primary-foreground/95' : '')}>
                  {message.body}
                </p>
                <p className={cn('mt-2 text-[0.65rem]', fromAdmin ? 'text-primary-foreground/65' : 'text-muted-foreground')}>
                  {formatDateTime(message.created_at)}
                  {fromAdmin && message.read_at ? ' · read by worker' : ''}
                </p>
              </article>
            )
          })
        )}
      </div>
    </div>
  )
}

function Composer({ thread, onSent, disabled }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [priority, setPriority] = useState(false)
  const [sending, setSending] = useState(false)

  const send = async (event) => {
    event.preventDefault()
    if (sending || disabled) return
    if (!body.trim()) {
      toast.error('Write a message before sending')
      return
    }
    setSending(true)
    try {
      await sendAdminWorkerMessage(thread.workerId, {
        title: title.trim(),
        body: body.trim(),
        priority,
      })
      setTitle('')
      setBody('')
      setPriority(false)
      toast.success(`Message sent to ${thread.displayName}`)
      notifyInboxChanged()
      await onSent?.()
    } catch (caught) {
      toast.error(messageOf(caught))
    } finally {
      setSending(false)
    }
  }

  return (
    <form className="border-t p-4 sm:p-5" onSubmit={send}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="admin-message-title">
              Subject <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="admin-message-title"
              value={title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="A short subject"
              disabled={sending}
            />
          </div>
          <label htmlFor="admin-message-priority" className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <Checkbox
              id="admin-message-priority"
              checked={priority}
              disabled={sending}
              onCheckedChange={(checked) => setPriority(Boolean(checked))}
            />
            High priority
          </label>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="admin-message-body">Message</Label>
          <Textarea
            id="admin-message-body"
            rows={4}
            maxLength={5000}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={`Write to ${thread.displayName}…`}
            disabled={sending}
          />
          <p className="text-right text-[0.68rem] text-muted-foreground">{body.length}/5000</p>
        </div>
        <Button type="submit" disabled={sending || !body.trim()}>
          {sending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
          Send message
        </Button>
      </div>
    </form>
  )
}

export function Inbox() {
  const { workerId } = useParams()
  const navigate = useNavigate()
  const [threads, setThreads] = useState(null)
  const [inboxError, setInboxError] = useState('')
  const [query, setQuery] = useState('')
  const [messages, setMessages] = useState([])
  const [threadError, setThreadError] = useState('')
  const [threadLoading, setThreadLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const mounted = useRef(true)

  const loadInbox = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setRefreshing(true)
    try {
      const rows = await fetchAdminWorkerInbox()
      if (mounted.current) {
        setThreads(rows)
        setInboxError('')
      }
    } catch (caught) {
      if (mounted.current) setInboxError(messageOf(caught))
    } finally {
      if (mounted.current) setRefreshing(false)
    }
  }, [])

  const loadThread = useCallback(
    async ({ quiet = false } = {}) => {
      if (!workerId) return
      if (!quiet) setThreadLoading(true)
      setThreadError('')
      try {
        const rows = await fetchWorkerThread(workerId)
        if (!mounted.current) return
        setMessages(rows)
        const unread = rows.some((message) => message.sender_type === 'worker' && !message.read_at)
        if (unread) {
          await markAdminWorkerThreadRead(workerId)
          if (mounted.current) {
            const now = new Date().toISOString()
            setMessages((current) =>
              current.map((message) =>
                message.sender_type === 'worker' && !message.read_at ? { ...message, read_at: now } : message,
              ),
            )
          }
          notifyInboxChanged()
          await loadInbox({ quiet: true })
        }
      } catch (caught) {
        if (mounted.current) setThreadError(messageOf(caught))
      } finally {
        if (mounted.current) setThreadLoading(false)
      }
    },
    [loadInbox, workerId],
  )

  useEffect(() => {
    mounted.current = true
    loadInbox()
    return () => {
      mounted.current = false
    }
  }, [loadInbox])

  useEffect(() => {
    if (!workerId) {
      setMessages([])
      setThreadError('')
      return
    }
    setMessages([])
    loadThread()
    const timer = setInterval(() => loadThread({ quiet: true }), 45_000)
    const onFocus = () => loadThread({ quiet: true })
    const onVisibility = () => {
      if (document.visibilityState === 'visible') loadThread({ quiet: true })
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    const unsubscribe = subscribeToAllWorkerMessages(() => {
      loadThread({ quiet: true })
      loadInbox({ quiet: true })
    })
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      unsubscribe()
    }
  }, [loadInbox, loadThread, workerId])

  const selected = useMemo(
    () => (threads ?? []).find((thread) => thread.workerId === workerId) ?? null,
    [threads, workerId],
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return threads ?? []
    return (threads ?? []).filter((thread) =>
      [thread.displayName, thread.email, thread.lastMessagePreview]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    )
  }, [threads, query])

  const totalUnread = useMemo(
    () => (threads ?? []).reduce((total, thread) => total + (Number(thread.unreadFromWorker) || 0), 0),
    [threads],
  )

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl">Inbox</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
            Private worker conversations. The worker can read only their own thread; the admin can read
            all of them.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {totalUnread > 0 ? (
            <Badge className="bg-primary text-primary-foreground">
              <BellRing className="size-3.5" aria-hidden />
              {totalUnread} from workers
            </Badge>
          ) : (
            <Badge variant="outline">No unread worker messages</Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => { loadInbox(); if (workerId) loadThread() }} disabled={refreshing}>
            <RefreshCw className={refreshing ? 'size-4 animate-spin' : 'size-4'} aria-hidden />
            Refresh
          </Button>
        </div>
      </header>

      {inboxError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <span>{inboxError}</span>
          <Button size="sm" variant="outline" onClick={() => loadInbox()}>Try again</Button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[21rem_1fr] lg:items-start">
        <aside className={cn('overflow-hidden rounded-2xl border bg-card shadow-sm', workerId && 'hidden lg:block')}>
          <div className="border-b p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search conversations…"
                className="pl-9"
                aria-label="Search worker conversations"
              />
            </div>
          </div>

          <div className="max-h-[36rem] overflow-y-auto">
            {threads === null ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-20 rounded-xl" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center">
                <MessageCircle className="mx-auto size-6 text-muted-foreground" aria-hidden />
                <p className="mt-2 text-sm font-medium">{threads.length === 0 ? 'No workers yet' : 'No match'}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {threads.length === 0
                    ? 'Create a worker from Users to start a conversation.'
                    : 'Try a different name or email.'}
                </p>
                {threads.length === 0 ? (
                  <Button asChild size="sm" className="mt-3">
                    <Link to="/admin/users">
                      Open Users
                      <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  </Button>
                ) : null}
              </div>
            ) : (
              filtered.map((thread) => (
                <InboxRow key={thread.workerId} thread={thread} selected={thread.workerId === workerId} />
              ))
            )}
          </div>
        </aside>

        {workerId ? (
          <div className="space-y-4">
            <Button asChild variant="ghost" size="sm" className="-ml-2 lg:hidden">
              <Link to="/admin/inbox">
                <ArrowLeft className="size-4" aria-hidden />
                All conversations
              </Link>
            </Button>
            {selected ? (
              <>
                <ThreadPane
                  thread={selected}
                  messages={messages}
                  loading={threadLoading && messages.length === 0}
                  error={threadError}
                  onRefresh={() => loadThread()}
                  refreshing={threadLoading}
                />
                <Composer
                  thread={selected}
                  disabled={threadLoading}
                  onSent={async () => {
                    await loadThread({ quiet: true })
                    await loadInbox({ quiet: true })
                  }}
                />
              </>
            ) : threads === null ? (
              <Skeleton className="h-96 rounded-2xl" />
            ) : (
              <div className="rounded-2xl border border-dashed bg-card/60 p-10 text-center">
                <TriangleAlert className="mx-auto size-7 text-muted-foreground" aria-hidden />
                <h2 className="mt-3 font-heading text-xl">Conversation not found</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  That worker is not in the directory, or the link is out of date.
                </p>
                <Button className="mt-4" variant="outline" onClick={() => navigate('/admin/inbox')}>
                  Back to Inbox
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="hidden min-h-[32rem] flex-col items-center justify-center rounded-2xl border border-dashed bg-card/50 p-10 text-center lg:flex">
            <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <MessageCircle className="size-6" aria-hidden />
            </span>
            <h2 className="mt-4 font-heading text-xl">Choose a conversation</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Each worker has one private thread. Opening it marks their messages as read and updates the
              badge in the sidebar.
            </p>
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-muted/50 px-3 py-2 text-left text-xs leading-5 text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Message content is protected by row level security. The worker id in the URL is not
              trusted; the database checks the admin session on every read and write.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
