import { useEffect, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { Sparkles, Lock } from 'lucide-react'
import { fetchPublicMessage, publicMediaUrl, projectMediaUrl, isAdminSession } from '@/services/messages'
import { Brand } from '@/components/brand'
import { formatDate } from '@/services/format'
import MemorialLetter from '@/templates/memorial-message/v1/MemorialLetter'
import '@/styles/book.css'

const STATES = {
  loading: 'loading',
  unavailable: 'unavailable',
  error: 'error',
  ready: 'ready',
  password: 'password',
  invalid: 'invalid',
  expired: 'expired',
}

export function PublicMessage() {
  const { publicId } = useParams()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [state, setState] = useState(STATES.loading)
  const [payload, setPayload] = useState(null)
  const [adminPreview, setAdminPreview] = useState(false)
  const [password, setPassword] = useState('')
  const [unlocking, setUnlocking] = useState(false)

  const load = async (pw = '') => {
    if (!publicId || !token) {
      setState(STATES.unavailable)
      return
    }
    try {
      let preview = false
      try {
        preview = await isAdminSession()
      } catch {
        preview = false
      }
      const result = await fetchPublicMessage(publicId, token, { bump: !preview, password: pw || undefined })
      if (!result.found || !result.available) {
        if (result.reason === 'password_protected') {
          setState(STATES.password)
          return
        }
        if (result.reason === 'invalid_password') {
          setState(STATES.invalid)
          return
        }
        if (result.reason === 'expired') {
          setState(STATES.expired)
          return
        }
        setState(STATES.unavailable)
        return
      }
      setAdminPreview(preview)
      setPayload(result)
      setState(STATES.ready)
    } catch {
      setState(STATES.unavailable)
    }
  }

  useEffect(() => {
    void load('')
  }, [publicId, token])

  const unlock = async (e) => {
    e.preventDefault()
    setUnlocking(true)
    await load(password)
    setUnlocking(false)
  }

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

  if (state === STATES.expired) {
    return (
      <MessageFrame>
        <div className="mx-auto flex min-h-[55vh] max-w-md flex-col items-center justify-center text-center">
          <Sparkles className="mb-4 text-muted-foreground/50" />
          <h1 className="font-heading text-3xl tracking-tight">This message has expired</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            This Dearune can no longer be opened online.
          </p>
          <Link to="/" className="mt-8 text-sm underline underline-offset-4 hover:text-foreground">
            Return to Dearune
          </Link>
        </div>
      </MessageFrame>
    )
  }

  if (state === STATES.password || state === STATES.invalid) {
    return (
      <MessageFrame>
        <div className="mx-auto flex min-h-[55vh] max-w-md flex-col items-center justify-center text-center">
          <Lock className="mb-4 text-muted-foreground/50" />
          <h1 className="font-heading text-3xl tracking-tight">This message is locked</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {state === STATES.invalid ? 'That password is not correct.' : 'Enter the password to open your message.'}
          </p>
          <form onSubmit={unlock} className="mt-6 flex w-full max-w-xs flex-col gap-2">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded border px-3 py-2 text-center"
              placeholder="Password"
              autoFocus
            />
            <button disabled={unlocking || !password} className="rounded bg-foreground px-3 py-2 text-background disabled:opacity-50">
              {unlocking ? 'Opening…' : 'Open'}
            </button>
          </form>
          <Link to="/" className="mt-8 text-sm underline underline-offset-4 hover:text-foreground">
            Return to Dearune
          </Link>
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
  const letter = {
    greeting: payload.headline || '',
    body: payload.body || '',
    signature: payload.signature || '',
    font: payload.font_family || 'Cormorant Upright',
    language: payload.language || 'en',
    photos: [],
    audio: null,
  }

  const rawMedia = (payload.media ?? []).map((item) => ({
    ...item,
    url: item.drive_file_id
      ? publicMediaUrl(item.drive_file_id, { publicId, token })
      : item.path
        ? projectMediaUrl(item.path, { publicId, token })
        : String(item.url ?? ''),
    kind: String(item.media_type ?? item.kind ?? 'file'),
    originalName: item.original_filename ? String(item.original_filename) : null,
  }))

  const photos = rawMedia
    .filter((item) => item.kind === 'image')
    .map((item, idx) => ({ id: item.id || idx, url: item.url, position: idx === 0 ? 'pos-a' : idx === 1 ? 'pos-b' : 'pos-c' }))
  const audio = rawMedia.find((item) => item.kind === 'audio')?.url ? { src: rawMedia.find((item) => item.kind === 'audio').url } : null
  letter.photos = photos
  letter.audio = audio

  return (
    <MessageFrame>
      <div className="mx-auto mt-10 w-full max-w-4xl">
        <div className="mb-6 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">
            {recipient ? `For ${recipient}` : 'For someone dear'}
            {occasion ? ` · ${occasion}` : ''}
            {eventDate ? ` · ${formatDate(eventDate)}` : ''}
          </p>
        </div>
        <MemorialLetter mode="view" letter={letter} />
      </div>

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