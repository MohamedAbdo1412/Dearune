import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import BookShell from '@/components/book/BookShell'
import { Folio } from '@/components/book/ornaments'
import {
  BASE_STAGES,
  decodeJwtPayload,
  loadDraft,
  loadTemplateDraft,
  saveDraft,
  saveTemplateDraft,
  templateStagesFor,
} from '@/services/draft'
import { designerLogin, fetchDesignerTemplates, getDesignerToken, clearDesignerToken } from '@/services/designer'
import { memorialDefaults } from '@/templates/memorial-message/MemorialLetter'
import {
  playPageLift,
  playPageSettle,
  playInkTouch,
  playClick,
  playPin,
  isSoundMuted,
  setSoundMuted,
  unmuteVia,
} from '@/services/sound'
import '@/styles/book.css'

import DesignerAccessStage from './stages/DesignerAccessStage'
import ReceiverStage from './stages/ReceiverStage'
import TemplateSelectionStage from './stages/TemplateSelectionStage'
import UnwrittenStage from './stages/UnwrittenStage'
import ReviewStage from './stages/ReviewStage'
import StatusBook from './stages/StatusBook'
import { TitleSheet, ReceiverSheet, PapersSheet, LanguageSheet, LockSheet, CloseSheet, ClosedBookSheet, UnwrittenSheet, ChapterPage } from './stages/chapters'

import MemorialLetter from '@/templates/memorial-message/MemorialLetter'
import MemorialLanguageStage from '@/templates/memorial-message/MemorialLanguageStage'
import MemorialEditorStage from '@/templates/memorial-message/MemorialEditorStage'
import MemorialPasswordStage from '@/templates/memorial-message/MemorialPasswordStage'
import { useMemorialMedia } from '@/templates/memorial-message/useMemorialMedia'

import { useReducedMotion, useIsMobile } from './createHelpers'

const AUDIO_INK_MS = 520

// The book as a pipeline: base chapters (enter · for whom · the papers),
// then the chosen paper's own chapters. Each stage is one spread; the spread
// numbering comes from the stage's place in the sequence, so folios grow
// without a hand-maintained table.
function initialBook() {
  const token = getDesignerToken()
  const body = decodeJwtPayload(token)
  if (!body?.sub) {
    return { designerId: '', designerName: '', stage: 'access', chosenSlug: null, closed: false, coverOpen: false }
  }
  const draft = loadDraft(body.sub)
  if (!draft) {
    return { designerId: body.sub, designerName: '', receiverName: '', stage: 'receiver', chosenSlug: null, closed: false, coverOpen: true }
  }
  if (draft.submittedAt) {
    return { designerId: body.sub, designerName: draft.designerName, receiverName: draft.receiverName, stage: 'status', chosenSlug: draft.templateSlug, closed: true, coverOpen: true }
  }
  return {
    designerId: body.sub,
    designerName: draft.designerName,
    receiverName: draft.receiverName,
    stage: draft.currentStage,
    chosenSlug: draft.templateSlug,
    closed: false,
    coverOpen: true,
  }
}

function HomeDraft({ designerId, slug }) {
  const stored = slug && designerId ? loadTemplateDraft(designerId, slug) : null
  if (stored) return stored
  return { ...memorialDefaults('en'), photos: [null, null, null], audio: null, passwordSet: false }
}

export default function CreateBook() {
  const initial = useMemo(() => initialBook(), [])
  const [designer, setDesigner] = useState({ id: initial.designerId, name: initial.designerName })
  const [stage, setStage] = useState(initial.stage)
  const [coverOpen, setCoverOpen] = useState(initial.coverOpen)
  const [flip, setFlip] = useState(null)
  const [templates, setTemplates] = useState(null)
  const [templatesError, setTemplatesError] = useState('')
  const [chosenSlug, setChosenSlug] = useState(initial.chosenSlug)
  const [receiverName, setReceiverName] = useState(initial.receiverName ?? '')
  const [closed, setClosed] = useState(initial.closed)
  const [login, setLogin] = useState({ status: 'idle' })
  const [insonicated, setInsonicated] = useState(!isSoundMuted())
  const [inking, setInking] = useState(false)
  const [inkDirection, setInkDirection] = useState('fwd')
  const [memorial, setMemorial] = useState(() => HomeDraft(initial.designerId, initial.chosenSlug))

  const reduced = useReducedMotion()
  const mobile = useIsMobile()
  const fetchingRef = useRef(false)
  const passwordRef = useRef('')
  const sequence = useMemo(() => {
    if (closed) return []
    const base = [...BASE_STAGES]
    if (!designer.id) return base
    if (!chosenSlug) return base
    return [...base, ...templateStagesFor(chosenSlug)]
  }, [designer.id, chosenSlug, closed])

  const memorialToken = useMemo(() => (designer.id ? getDesignerToken() : null), [designer.id])

  // (Re)load the memorial draft for the signed-in designer whenever identity
  // or the chosen paper changes (login, leave, resume, switching papers).
  useEffect(() => {
    if (!designer.id) {
      setMemorial({ ...memorialDefaults('en'), photos: [null, null, null], audio: null, passwordSet: false })
      return
    }
    setMemorial({ ...HomeDraft(designer.id, chosenSlug) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designer.id, chosenSlug])

  // Resume robustness: the stored stage must make sense inside the current
  // sequence (a designer may have changed paper mid-flight).
  useEffect(() => {
    if (closed) return
    if (flip) return
    if (!designer.id) {
      if (stage !== 'access') setStage('access')
      return
    }
    if (stage === 'status') return
    if (!sequence.includes(stage)) {
      const fallback = chosenSlug ? templateStagesFor(chosenSlug)[0] : 'receiver'
      setStage(fallback)
      saveDraft(designer.id, { currentStage: fallback, templateSlug: chosenSlug || null })
    }
  }, [sequence, stage, designer.id, chosenSlug, flip, closed])

  const persistMemorial = useCallback(
    (patch) => {
      if (!designer.id || !chosenSlug) return
      // Write-through on every change: switching papers mid-thought must
      // never strand the freshest words in a pending timer.
      saveTemplateDraft(designer.id, chosenSlug, patch)
    },
    [designer.id, chosenSlug]
  )

  useEffect(() => {
    const handler = () => unmuteVia('pointer')
    window.addEventListener('pointerdown', handler, { once: true })
    return () => window.removeEventListener('pointerdown', handler)
  }, [])

  useEffect(() => {
    if (!designer.id || templates || fetchingRef.current) return
    fetchingRef.current = true
    let alive = true
    fetchDesignerTemplates(getDesignerToken())
      .then(({ templates: list }) => {
        if (!alive) return
        setTemplates(Array.isArray(list) ? list : [])
        setTemplatesError('')
      })
      .catch((error) => {
        if (!alive) return
        if (error.status === 401) {
          setDesigner({ id: '', name: '' })
          setStage('access')
          return
        }
        setTemplatesError(error.message || 'The archive did not open.')
      })
      .finally(() => {
        if (alive) fetchingRef.current = false
      })
    return () => {
      alive = false
      fetchingRef.current = false
    }
  }, [designer.id, templates])

  const persistStage = useCallback(
    (target) => {
      if (designer.id && target !== 'status' && target !== 'access') saveDraft(designer.id, { currentStage: target })
    },
    [designer.id]
  )

  const goTo = useCallback(
    (target, direction) => {
      if (flip || target === stage) return
      playPageLift()
      setFlip({ target, direction, from: stage })
    },
    [flip, stage]
  )

  const handleTurnEnd = useCallback(() => {
    if (!flip) return
    playPageSettle()
    const target = flip.target
    const direction = flip.direction
    setStage(target)
    setFlip(null)
    persistStage(target)
    window.setTimeout(() => {
      setInking(true)
      setInkDirection(direction)
      playInkTouch()
      window.setTimeout(() => setInking(false), reduced ? 200 : AUDIO_INK_MS)
    }, reduced ? 60 : 220)
  }, [flip, persistStage, reduced])

  const handleAccess = useCallback(
    async (code, passcode) => {
      setLogin({ status: 'busy' })
      try {
        const session = await designerLogin(code, passcode)
        const payload = decodeJwtPayload(session.token)
        const id = payload?.sub || session.designer?.id || ''
        const name = session.designer?.name || ''
        if (id) {
          saveDraft(id, { designerName: name, currentStage: 'receiver', receiverName: '', templateSlug: null })
          setMemorial({ ...memorialDefaults('en'), photos: [null, null, null], audio: null, passwordSet: false })
        }
        setReceiverName('')
        setChosenSlug(null)
        setDesigner({ id, name })
        setClosed(false)
        setLogin({ status: 'idle' })
        playPin()
        window.setTimeout(() => goTo('receiver', 'fwd'), 430)
      } catch (error) {
        if (error.cooldown) {
          setLogin({ status: 'cooldown', retryAfterSeconds: error.retryAfterSeconds, lockedUntil: error.lockedUntil })
        } else {
          setLogin({ status: 'error', message: error.message || "We couldn't verify those details." })
        }
      }
    },
    [goTo]
  )

  const handleCooldownEnd = useCallback(() => setLogin({ status: 'idle' }), [])

  const handleReceiver = useCallback(
    (name) => {
      setReceiverName(name)
      if (designer.id) saveDraft(designer.id, { receiverName: name, currentStage: 'templates' })
      playClick()
      goTo('templates', 'fwd')
    },
    [designer.id, goTo]
  )

  const handlePickTemplate = useCallback(
    (template) => {
      if (!designer.id) return
      const code = template.slug
      setChosenSlug(code)
      const first = templateStagesFor(code)[0]
      saveDraft(designer.id, { templateSlug: code, currentStage: first })
      playPin()
      goTo(first, 'fwd')
    },
    [designer.id, goTo]
  )

  const backTo = useCallback((target) => () => goTo(target, 'back'), [goTo])

  const handleLanguage = useCallback(
    (language) => {
      const patch = { language }
      setMemorial((prev) => ({ ...prev, ...patch }))
      persistMemorial(patch)
      playClick()
      goTo('memorial.editor', 'fwd')
    },
    [goTo, persistMemorial]
  )

  const handleMemorialField = useCallback(
    (field, value) => {
      const patch = { [field]: value }
      setMemorial((prev) => ({ ...prev, ...patch }))
      persistMemorial(patch)
    },
    [persistMemorial]
  )

  const handleSetPassword = useCallback(
    (password) => {
      passwordRef.current = password
      const patch = { passwordSet: true }
      setMemorial((prev) => ({ ...prev, ...patch }))
      persistMemorial(patch)
    },
    [persistMemorial]
  )

  const handleLeave = useCallback(() => {
    clearDesignerToken()
    setDesigner({ id: '', name: '' })
    setReceiverName('')
    setStage('access')
    setFlip(null)
    setTemplates(null)
    setTemplatesError('')
    setChosenSlug(null)
    setClosed(false)
    setCoverOpen(false)
  }, [])

  const toggleSound = useCallback(() => {
    const next = isSoundMuted()
    setSoundMuted(!next)
    setInsonicated(!next)
    if (next) unmuteVia('toggle')
  }, [])

  const chosenTemplate = useMemo(
    () => (templates ?? []).find((t) => t.slug === chosenSlug) ?? { slug: chosenSlug, name: chosenSlug, description: '' },
    [templates, chosenSlug]
  )

  // ---------------------------------------------------------------------------
  // Rendering the spread: one left leaf + one right leaf per stage.
  // ---------------------------------------------------------------------------

  const rightFor = useCallback(
    (key) => {
      const index = sequence.indexOf(key)
      const folio = index >= 0 ? index * 2 + 2 : 2
      switch (key) {
        case 'access':
          return (
            <Folio folio={folio}>
              <DesignerAccessStage
                busy={login.status === 'busy'}
                error={login.status === 'error' ? login.message : ''}
                cooldown={login.status === 'cooldown' ? { retryAfterSeconds: login.retryAfterSeconds, lockedUntil: login.lockedUntil } : null}
                onAccess={handleAccess}
                onCooldownEnd={handleCooldownEnd}
              />
            </Folio>
          )
        case 'receiver':
          return (
            <Folio folio={folio}>
              <ReceiverStage initial={receiverName} onNext={handleReceiver} onBack={backTo('access')} />
            </Folio>
          )
        case 'templates':
          return (
            <Folio folio={folio}>
              <TemplateSelectionStage
                templates={templates ?? []}
                loading={Boolean(designer.id) && templates === null && !templatesError}
                error={templatesError}
                chosenSlug={chosenSlug}
                onSelect={handlePickTemplate}
                onRetry={() => {
                  setTemplatesError('')
                  setTemplates(null)
                }}
              />
            </Folio>
          )
        case 'unwritten':
          return (
            <Folio folio={folio}>
              <UnwrittenStage template={chosenTemplate} onBack={backTo('templates')} />
            </Folio>
          )
        case 'memorial.language':
          return (
            <Folio folio={folio}>
              <MemorialLanguageStage value={memorial.language} onSelect={handleLanguage} onBack={backTo('templates')} />
            </Folio>
          )
        case 'memorial.editor':
          return (
            <Folio folio={folio}>
              <MemorialEditorStage draft={memorial} onChange={handleMemorialField} onNext={backTo('memorial.password')} onBack={backTo('memorial.language')} />
            </Folio>
          )
        case 'memorial.password':
          return (
            <Folio folio={folio}>
              <MemorialPasswordStage draft={memorial} onSet={handleSetPassword} onNext={backTo('review')} onBack={backTo('memorial.editor')} />
            </Folio>
          )
        case 'review':
          return (
            <Folio folio={folio}>
              <ReviewStage draft={memorial} templateName={chosenTemplate.name} onBack={backTo('memorial.password')} />
            </Folio>
          )
        default:
          return null
      }
    },
    [sequence, login, templates, templatesError, chosenSlug, chosenTemplate, designer, memorial, receiverName, handleAccess, handleCooldownEnd, handleReceiver, handlePickTemplate, handleLanguage, handleMemorialField, handleSetPassword, backTo]
  )

  const leftFor = useCallback(
    (key) => {
      const index = sequence.indexOf(key)
      const folio = index >= 0 ? index * 2 + 1 : 1
      switch (key) {
        case 'access':
          return <TitleSheet receiverName={undefined} />
        case 'receiver':
          return <ReceiverSheet />
        case 'templates':
          return <PapersSheet />
        case 'unwritten':
          return <UnwrittenSheet />
        case 'memorial.language':
          return <LanguageSheet />
        case 'memorial.editor':
          return <EditorProofPage draft={memorial} token={memorialToken} />
        case 'memorial.password':
          return <LockSheet />
        case 'review':
          return <CloseSheet receiverName={designer.name.split(' ')[0] || undefined} />
        default:
          return <ChapterPage folio={folio} title="Dearune" />
      }
    },
    [sequence, memorial, memorialToken, designer]
  )

  // The closed-book view replaces the whole pipeline.
  if (closed) {
    return (
      <div className="book-root">
        <Masthead
          insonicated={insonicated}
          onToggleSound={toggleSound}
          right={designer.id ? <Mast leave onLeave={handleLeave} /> : null}
        />
        <BookShell leftNode={<ClosedBookSheet />} rightNode={<Folio folio={15}><StatusBook draft={{ ...memorial, meta: {} }} templateName={chosenTemplate.name} /></Folio>} coverOpen inking={false} />
        <footer className="book-footer">
          <span>paper &amp; ink · set by hand</span>
          <span>a closed book keeps its words</span>
        </footer>
      </div>
    )
  }

  const resting = flip ? flip.target : stage
  const spreadNumber = Math.max(1, sequence.indexOf(resting) + 1)

  // One leaf, two faces. On the desktop spread the arriving page appears on
  // the far half of the book; on mobile there is only one exposed page, so
  // the arriving face is the next working page itself.
  const turnFront = flip
    ? flip.direction === 'back'
      ? mobile
        ? rightFor(flip.from)
        : leftFor(flip.from)
      : rightFor(flip.from)
    : null
  const turnBack = flip
    ? flip.direction === 'back'
      ? rightFor(flip.target)
      : mobile
        ? rightFor(flip.target)
        : leftFor(flip.target)
    : null

  return (
    <div className="book-root">
      <Masthead
        insonicated={insonicated}
        onToggleSound={toggleSound}
        right={designer.id ? <Mast leave onLeave={handleLeave} /> : null}
      />
      <BookShell
        leftNode={leftFor(resting)}
        rightNode={rightFor(resting)}
        coverOpen={coverOpen}
        onOpenCover={() => {
          unmuteVia('cover')
          setCoverOpen(true)
        }}
        flipping={Boolean(flip)}
        turnDirection={flip?.direction ?? 'fwd'}
        turnFront={turnFront}
        turnBack={turnBack}
        onTurnEnd={handleTurnEnd}
        inking={inking}
        inkDirection={inkDirection}
      />
      <footer className="book-footer">
        <span>paper &amp; ink · set by hand</span>
        <span>spread {spreadNumber} of {sequence.length || 1}</span>
      </footer>
    </div>
  )
}

function Masthead({ insonicated, onToggleSound, right }) {
  return (
    <header className="book-masthead">
      <span className="mono">
        D<em>earune</em>
      </span>
      <span className="tagline">a single message · a single book</span>
      <span className="masthead-actions">
        <button
          type="button"
          className={`sound-toggle${insonicated ? ' is-on' : ''}`}
          onClick={onToggleSound}
          aria-pressed={insonicated}
          aria-label={insonicated ? 'Mute the paper sounds' : 'Play the paper sounds'}
          title={insonicated ? 'mute' : 'unmute'}
        >
          {insonicated ? '♢' : '◇'}
        </button>
        {right}
      </span>
    </header>
  )
}

function Mast({ onLeave }) {
  return (
    <button type="button" className="mast-leave" onClick={onLeave}>
      close the book
    </button>
  )
}

// The facing proof — the memorial letter as it will be sent, read again on
// the left while the working copy is edited on the right.
function EditorProofPage({ draft, token }) {
  const { photoUrls, audioUrl } = useMemorialMedia(draft, token)
  const closedCopy = { ...draft, body: draft.body || ' ' }
  return (
    <Folio folio={9} className="chapter-page">
      <div className="settle">
        <div className="page-script">this is how it will read</div>
        <div className="page-kicker" style={{ marginTop: 6 }}>
          chapter the fifth
        </div>
        <div className="proof-note">
          the letters arrive as the ink settles — quiet, and always the same.
        </div>
        <MemorialLetter draft={closedCopy} photoUrls={photoUrls} audio={draft.audio} audioUrl={audioUrl} compact />
      </div>
    </Folio>
  )
}