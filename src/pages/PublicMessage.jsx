import { useEffect, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { fetchPublicMessage, publicMediaUrl, projectMediaUrl, isAdminSession } from '@/services/messages'
import { Brand } from '@/components/brand'
import { formatDate } from '@/services/format'

const STATES = {
  loading: 'loading',
  unavailable: 'unavailable',
  error: 'error',
  ready: 'ready',
}

export function PublicMessage() {
  const { publicId } = useParams()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [state, setState] = useState(STATES.loading)
  const [payload, setPayload] = useState(null)
  const [adminPreview, setAdminPreview] = useState(false)

  useEffect(() => {
    if (!publicId || !token) {
      setState(STATES.unavailable)
      return
    }
    let active = true
    const load = async () => {
      try {
        let preview = false
        try {
          preview = await isAdminSession()
        } catch {
          preview = false
        }
        const result = await fetchPublicMessage(publicId, token, { bump: !preview })
        if (!active) return
        if (!result.found || !result.available) {
          setState(STATES.unavailable)
          return
        }
        setAdminPreview(preview)
        setPayload(result)
        setState(STATES.ready)
      } catch {
        if (active) setState(STATES.unavailable)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [publicId, token])

  if (state === STATES.loading) {
    return (
      <MessageFrame>
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted-foreground">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
          <p className="text-sm">Opening your message…</p>
        </div>
      </MessageFrame>
    )
  }

  if (state === STATES.unavailable) {
    return (
      <MessageFrame>
        <div className="mx-auto flex min-h-[55vh] max-w-md flex-col items-center justify-center text-center">
          <Sparkles className="mb-4 text-muted-foreground/50" />
          <h1 className="font-heading text-3xl tracking-tight">This message is not available</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            The words here are not ready to be opened yet — or the link you used is
            no longer valid. Please wait for the message to arrive before opening it.
          </p>
          <Link to="/" className="mt-8 text-sm underline underline-offset-4 hover:text-foreground">
            Return to Dearune
          </Link>
        </div>
      </MessageFrame>
    )
  }

  if (state === STATES.error || !payload) {
    return (
      <MessageFrame>
        <div className="mx-auto flex min-h-[55vh] max-w-md flex-col items-center justify-center text-center">
          <h1 className="font-heading text-3xl tracking-tight">We couldn't reach this message</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Something went wrong while opening it. Please try again in a moment.
          </p>
          <Link to="/" className="mt-8 text-sm underline underline-offset-4 hover:text-foreground">
            Return to Dearune
          </Link>
        </div>
      </MessageFrame>
    )
  }

  const order = payload.order ?? {}
  const recipient = String(order.recipient_name ?? '')
  const occasion = order.occasion ? String(order.occasion) : null
  const eventDate = order.event_date ? String(order.event_date) : null
  const wrapper = String(order.wrapper_type ?? '')
  const media = (payload.media ?? []).map((item) => ({
    ...item,
    url: item.drive_file_id
      ? publicMediaUrl(item.drive_file_id, { publicId, token })
      : item.path
        ? projectMediaUrl(item.path, { publicId, token })
        : String(item.url ?? ''),
    kind: String(item.media_type ?? item.kind ?? 'file'),
    originalName: item.original_filename ? String(item.original_filename) : null,
  }))

  return (
    <MessageFrame>
      <article className="relative mx-auto mt-10 w-full max-w-2xl overflow-hidden rounded-2xl border bg-[oklch(0.99_0.002_85)] px-6 py-12 shadow-sm md:px-14 md:py-16">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-amber-900/20 via-amber-700/40 to-amber-900/20" />
        <div className="mb-10 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">
            {recipient ? `For ${recipient}` : 'For someone dear'}
            {occasion ? ` · ${occasion}` : ''}
            {eventDate ? ` · ${formatDate(eventDate)}` : ''}
          </p>
        </div>

        {payload.headline && (
          <h1 className="text-center font-heading text-3xl leading-snug tracking-tight md:text-4xl">
            {payload.headline}
          </h1>
        )}

        {payload.body && (
          <div
            className="mt-8 space-y-4 text-[15px] leading-[1.85] text-foreground/90 md:text-base"
            style={{ whiteSpace: 'pre-wrap', fontFamily: payload.font_family || undefined }}
          >
            {payload.body}
          </div>
        )}

        {media.length > 0 && (
          <div className="mt-10 space-y-4">
            {media.map((item) => {
              if (item.kind === 'image' && item.url) {
                return <img key={item.id} src={item.url} alt="" className="mx-auto max-h-96 rounded-lg shadow-sm" loading="lazy" />
              }
              if (item.kind === 'audio' && item.url) {
                return <audio key={item.id} controls className="mx-auto w-full" src={item.url} />
              }
              if (item.kind === 'video' && item.url) {
                return <video key={item.id} controls className="mx-auto max-h-96 rounded-lg shadow-sm" src={item.url} />
              }
              if (item.url) {
                return (
                  <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="block text-center text-sm underline underline-offset-4">
                    {item.originalName || 'Attachment'}
                  </a>
                )
              }
              return null
            })}
          </div>
        )}

        {payload.signature && (
          <p className="mt-10 text-right font-heading text-2xl tracking-tight text-foreground/90">
            {payload.signature}
          </p>
        )}

        <div className="mt-12 flex items-center justify-between border-t pt-6 text-[11px] uppercase tracking-[0.2em] text-muted-foreground/70">
          <span>Dearune</span>
          <span>{wrapper.replace(/_/g, ' ')}</span>
        </div>
      </article>

      <p className="mx-auto mt-8 max-w-md text-center text-xs leading-relaxed text-muted-foreground">
        {adminPreview
          ? 'Administrator preview — this view was not counted as an open.'
          : 'Keep this link private — it opens the words written just for you.'}
      </p>
    </MessageFrame>
  )
}

function MessageFrame({ children }) {
  return (
    <div className="min-h-screen bg-[oklch(0.97_0.004_90)] px-6 pb-16 pt-6">
      <header className="mx-auto flex max-w-2xl items-center justify-between">
        <Link to="/">
          <Brand />
        </Link>
        <span className="text-xs uppercase tracking-[0.25em] text-muted-foreground">A message from Dearune</span>
      </header>
      {children}
    </div>
  )
}