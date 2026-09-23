import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import BookShell from '@/components/book/BookShell'
import PageTurn from '@/components/book/PageTurn'
import { Folio } from '@/components/book/ornaments'
import DesignerAccessStage from './stages/DesignerAccessStage'
import TemplateSelectionStage from './stages/TemplateSelectionStage'
import ReservedStage from './stages/ReservedStage'
import { decodeJwtPayload, saveDraft, loadDraft, clearDraft } from '@/services/draft'
import { designerLogin, fetchDesignerTemplates, getDesignerToken, clearDesignerToken } from '@/services/designer'
import '@/styles/book.css'

const FOLIOS = { access: 1, template: 3, reserved: 5 }

function initialBook() {
  const token = getDesignerToken()
  const body = decodeJwtPayload(token)
  if (!body?.sub) {
    return { designerId: '', designerName: '', stage: 'access', templateSlug: null, coverOpen: false }
  }
  const draft = loadDraft(body.sub)
  if (!draft) {
    return { designerId: body.sub, designerName: '', stage: 'template', templateSlug: null, coverOpen: true }
  }
  return {
    designerId: body.sub,
    designerName: draft.designerName,
    stage: draft.currentStage,
    templateSlug: draft.templateSlug,
    coverOpen: true,
  }
}

export default function CreateBook() {
  const initial = useMemo(() => initialBook(), [])
  const [designer, setDesigner] = useState({ id: initial.designerId, name: initial.designerName })
  const [stage, setStage] = useState(initial.stage)
  const [coverOpen, setCoverOpen] = useState(initial.coverOpen)
  const [flip, setFlip] = useState(null)
  const [templates, setTemplates] = useState(null)
  const [templatesError, setTemplatesError] = useState('')
  const [chosenSlug, setChosenSlug] = useState(initial.templateSlug)
  const [login, setLogin] = useState({ status: 'idle' })
  const fetchingRef = useRef(false)

  const expireSession = useCallback(() => {
    clearDesignerToken()
    if (designer.id) clearDraft(designer.id)
    setDesigner({ id: '', name: '' })
    setFlip(null)
    setStage('access')
    setTemplates(null)
    setTemplatesError('')
    setChosenSlug(null)
    setLogin({ status: 'error', message: 'Your session has closed. Please enter again.' })
  }, [designer.id])

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
          expireSession()
          return
        }
        setTemplatesError(error.message || 'The archive did not open.')
      })
      .finally(() => {
        if (alive) fetchingRef.current = false
      })
    return () => {
      // StrictMode remounts effects in dev; release the guard so the next
      // mount can run the fetch instead of being skipped.
      alive = false
      fetchingRef.current = false
    }
  }, [designer.id, templates, expireSession])

  const goTo = useCallback(
    (target, direction) => {
      if (flip || target === stage) return
      setFlip({ target, direction, from: stage })
    },
    [flip, stage]
  )

  const handleTurnDone = useCallback(() => {
    if (!flip) return
    setStage(flip.target)
    setFlip(null)
  }, [flip])

  const handleAccess = useCallback(
    async (code, passcode) => {
      setLogin({ status: 'busy' })
      try {
        const session = await designerLogin(code, passcode)
        const payload = decodeJwtPayload(session.token)
        const id = payload?.sub || session.designer?.id || ''
        const name = session.designer?.name || ''
        setChosenSlug(null)
        if (id) saveDraft(id, { designerName: name, currentStage: 'template', templateSlug: null })
        setDesigner({ id, name })
        setLogin({ status: 'idle' })
        goTo('template', 'fwd')
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

  const handlePickTemplate = useCallback(
    (template) => {
      if (!designer.id) return
      setChosenSlug(template.slug)
      saveDraft(designer.id, { currentStage: 'reserved', templateSlug: template.slug })
      goTo('reserved', 'fwd')
    },
    [designer.id, goTo]
  )

  const handleBackToTemplates = useCallback(() => {
    if (!designer.id) return
    saveDraft(designer.id, { currentStage: 'template' })
    goTo('template', 'back')
  }, [designer.id, goTo])

  const chosenTemplate = useMemo(
    () => (templates ?? []).find((t) => t.slug === chosenSlug) ?? null,
    [templates, chosenSlug]
  )

  const pageFor = useCallback(
    (key) => {
      const folio = FOLIOS[key]
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
        case 'template':
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
        case 'reserved':
          return (
            <Folio folio={folio}>
              <ReservedStage
                designerName={designer.name}
                template={chosenTemplate}
                onBack={handleBackToTemplates}
              />
            </Folio>
          )
        default:
          return null
      }
    },
    [login, templates, templatesError, chosenSlug, chosenTemplate, designer, handleAccess, handleCooldownEnd, handlePickTemplate, handleBackToTemplates]
  )

  const resting = flip ? flip.target : stage
  const turning = flip ? pageFor(flip.from) : null

  return (
    <div className="book-root">
      <header className="book-masthead">
        <span className="mono">D<em>earune</em></span>
        <span className="tagline">a single message · a single book</span>
      </header>

      <BookShell
        rightNode={pageFor(resting)}
        turnNode={flip ? <PageTurn direction={flip.direction} front={turning} onDone={handleTurnDone} /> : null}
        coverOpen={coverOpen}
        onOpenCover={() => setCoverOpen(true)}
        flipping={Boolean(flip)}
      />

      <footer className="book-footer">
        <span>paper &amp; ink · set by hand</span>
        <span>your words stay with you until the book is handed over</span>
      </footer>
    </div>
  )
}