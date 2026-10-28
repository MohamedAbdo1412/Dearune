import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import BookShell, { VersoPage } from '@/components/book/BookShell'
import DearuneLoader from '@/components/book/DearuneLoader'
import { Folio } from '@/components/book/ornaments'
import {
  decodeJwtPayload,
  loadDraft,
  saveDraft,
  saveTemplateDraft,
  loadTemplateDraft,
  clearDraft,
  createLocalProject,
  getActiveProjectId,
} from '@/services/draft'
import { BASE_STAGES, REVIEW_STAGE, POLICIES_STAGE, SUBMITTED_STAGE, WRAPPER_STAGE, templateStagesFor, nextStageIn } from '@/templates/stages'
import { templateRegistry } from '@/templates'
import { lockDraftKey, unlockDraftKey, decryptBytes } from '@/services/draftCrypto'
import { deleteProjectMedia, getEncryptedMedia, mediaStorageKey } from '@/services/draftMediaStore'
import { designerLogin, fetchDesignerTemplates, getDesignerToken, clearDesignerToken } from '@/services/designer'
import { fetchProjects, fetchProject, createProject, fetchDraftUnlock } from '@/services/projects'
import { uploadDesignerMedia } from '@/services/media'
import { DEARUNE_POLICY_VERSION } from '@/policies/dearunePolicy'
import { blankPageDraft } from '@/templates/memorial-message/v1/memorialSampleData'

import BookStageNavigation from '@/components/book/BookStageNavigation'
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
import WrapperSelectionStage from './stages/WrapperSelectionStage'
import ReviewStage from './stages/ReviewStage'
import PoliciesStage from './stages/PoliciesStage'
import SubmittedStage from './stages/SubmittedStage'
import ProjectsBook from './stages/ProjectsBook'
import ProjectSheet from './stages/ProjectSheet'
import { TitleSheet, ReceiverSheet, PapersSheet, LanguageSheet, WrapperSheet, LockSheet, CloseSheet, PoliciesSheet, SubmittedSheet, ClosedBookSheet, UnwrittenSheet, ChapterPage } from './stages/chapters'

import MemorialLetter from '@/templates/memorial-message/v1/MemorialLetter'
import { validateMemorial } from '@/templates/memorial-message/v1/MemorialEditorStage'
import { useMemorialMedia } from '@/templates/memorial-message/v1/useMemorialMedia'
import { MEMORIAL_TEMPLATE } from '@/templates/memorial-message/v1'


import { useReducedMotion, useIsMobile } from '@/hooks/use-media'
import { bookReducer, initialBookMotion } from './state/bookMachine'
import { chooserCatalogItems, getCatalogItemState } from '@/services/catalog'

const AUDIO_INK_MS = 520
// The delivered paper's fixed proportion; the living proof is framed to it.
const RENDER_RATIO = MEMORIAL_TEMPLATE.renderAspectRatio ?? 3 / 4

// The book as a pipeline: base chapters (enter · for whom · the papers), then
// the chosen paper's own chapters, then the terms with the seal. Each stage is
// one spread; the spread numbering comes from the stage's place in the
// sequence, so folios grow without a hand-maintained table.
function initialBook() {
  const token = getDesignerToken()
  const body = decodeJwtPayload(token)
  if (!body?.sub) {
    return { designerId: '', stage: 'access', chosenSlug: null, closed: false, coverOpen: false }
  }
  // The token is present; the AES-GCM draft key never survives a reload, so
  // the real state is hydrated (unlock → registry → decrypted draft) after
  // mount. Until then a quiet loader covers the page.
  return { designerId: body.sub, stage: 'receiver', chosenSlug: null, closed: false, coverOpen: false }
}

function freshMemorial() {
  return blankPageDraft()
}

export default function CreateBook() {
  const initial = useMemo(() => initialBook(), [])
  const [designer, setDesigner] = useState({ id: initial.designerId, name: '' })
  const [stage, setStage] = useState(initial.stage)
  // How the book MOVES (cover · turning leaf · ink pass) lives in the pure
  // book machine; CreateBook keeps only the page it is ON and which view is
  // showing (shelf vs pipeline).
  const [motion, dispatch] = useReducer(bookReducer, initial.coverOpen, (coverOpen) => initialBookMotion({ coverOpen }))
  const [templates, setTemplates] = useState(null)
  const [templatesError, setTemplatesError] = useState('')
  // Why the book just turned back to the chooser (a paper or wrapper the
  // admin has since hidden or set aside). Shown by the stage it belongs to.
  const [catalogNotice, setCatalogNotice] = useState('')
  const [chosenSlug, setChosenSlug] = useState(initial.chosenSlug)
  const [receiverName, setReceiverName] = useState('')
  const [wrapperKey, setWrapperKey] = useState('')
  const [projectId, setProjectId] = useState(null)
  const [closed, setClosed] = useState(initial.closed)
  const [booting, setBooting] = useState(Boolean(initial.designerId))
  const [login, setLogin] = useState({ status: 'idle' })
  const [insonicated, setInsonicated] = useState(!isSoundMuted())
  const [memorial, setMemorial] = useState(freshMemorial)
  const [projects, setProjects] = useState(null)
  const [projectsError, setProjectsError] = useState('')
  const [activeProject, setActiveProject] = useState(null)
  const [openingId, setOpeningId] = useState(null)
  const [openingAlert, setOpeningAlert] = useState('')

  const reduced = useReducedMotion()
  const mobile = useIsMobile()
  const fetchingRef = useRef(false)
  const passwordRef = useRef('')
  const memorialPendingRef = useRef(null)
  const memorialTimerRef = useRef(null)
  const inkTimersRef = useRef([])

  const sequence = useMemo(() => {
    if (closed) return []
    const base = [...BASE_STAGES]
    if (!designer.id) return base
    if (!chosenSlug) return base
    return [...base, ...templateStagesFor(chosenSlug)]
  }, [designer.id, chosenSlug, closed])

  const memorialToken = useMemo(() => (designer.id ? getDesignerToken() : null), [designer.id])

  const flushMemorialNow = useCallback(() => {
    const pending = memorialPendingRef.current
    if (pending && pending.designerId && pending.projectId && pending.slug) {
      saveTemplateDraft(pending.designerId, pending.slug, pending.patch, pending.projectId).catch(() => {})
      memorialPendingRef.current = null
    }
    if (memorialTimerRef.current) {
      clearTimeout(memorialTimerRef.current)
      memorialTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      if (memorialTimerRef.current) clearTimeout(memorialTimerRef.current)
      for (const t of inkTimersRef.current) window.clearTimeout(t)
    }
  }, [])

  // Safety net for the cover swing: the machine normally settles when the
  // motion exit callback reports completion, but if that callback never fires
  // (interrupted animation, backgrounded tab) the book must not stay locked
  // "opening" forever. A generous deadline clears the flag regardless.
  useEffect(() => {
    if (!motion.opening) return
    const t = window.setTimeout(() => dispatch({ type: 'COVER_SETTLED' }), 1400)
    return () => window.clearTimeout(t)
  }, [motion.opening])

  // -------------------------------------------------------------------------
  // Session hydration: with a token but a memory-only draft key, the page
  // fetches the account's unlock secret, decrypts the ACTIVE project's draft,
  // sweeps stale local copies of already-submitted books, and lands wherever
  // the designer left off. This is the only place the identity is resolved.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!designer.id) return
    let alive = true
    const token = getDesignerToken()
    setBooting(true)

    const showShelf = (projects) => {
      if (!alive) return
      setProjectId(null)
      setChosenSlug(null)
      setReceiverName('')
      setWrapperKey('')
      setMemorial(freshMemorial())
      setProjects(projects)
      setProjectsError('')
      setClosed(true)
      dispatch({ type: 'SHOW_SHELF' })
      setStage('status')
    }
    const resumeLetter = (nextDraft, nextPid, prevRows) => {
      if (!alive) return
      setProjectId(nextPid)
      setChosenSlug(nextDraft.templateSlug)
      setReceiverName(nextDraft.receiverName ?? '')
      setWrapperKey(nextDraft.wrapperKey ?? '')
      const slug = nextDraft.templateSlug
      setMemorial(slug && nextDraft.templateDrafts?.[slug] ? nextDraft.templateDrafts[slug] : freshMemorial())
      setProjects(prevRows)
      setProjectsError('')
      setClosed(false)
      dispatch({ type: 'SHOW_SHELF' })
      setStage(nextDraft.currentStage)
    }

    Promise.all([fetchDraftUnlock(token), fetchProjects(token)])
      .then(async ([unlock, proj]) => {
        if (!alive) return
        const rows = Array.isArray(proj?.projects) ? proj.projects : []
        await unlockDraftKey(designer.id, unlock.draftSecret)
        const pid = getActiveProjectId(designer.id)
        const draft = pid ? await loadDraft(designer.id, pid) : null

        if (draft?.submittedAt && rows.some((r) => r.id === pid)) {
          // This book was closed (possibly in another tab); the server owns it
          // now, so its local draft and media are swept rather than resumed.
          await clearDraftBody(designer.id, pid)
          showShelf(rows)
        } else if (draft && !draft.submittedAt && rows.length === 0) {
          // No previous messages and a letter mid-pen on the desk: go straight
          // back into it. A returning designer with a shelf lands there first,
          // never on a half-written page.
          resumeLetter(draft, pid, rows)
        } else {
          // The shelf of previous messages always comes first; a fresh page
          // ("For whom") is reached by choosing a new message.
          showShelf(rows)
        }
      })
      .catch(() => {
        // The session is still authentic — the designer just proved their pins.
        // A failure here means the unlock or shelf fetch fell over (a transient
        // network hiccup, or this project's functions/migration not yet
        // deployed). We do NOT throw a valid session back to the door: the shelf
        // is shown (possibly empty) and their encrypted drafts stay safely in
        // storage for the moment the fetch succeeds. If a letter was plainly
        // mid-pen locally, it is resumed instead. The template fetch (below)
        // remains the authoritative 401 check — a genuinely expired token is
        // the one thing that returns you to the door.
        if (!alive) return
        const pid = getActiveProjectId(designer.id)
        loadDraft(designer.id, pid)
          .then((localDraft) => {
            if (pid && localDraft && !localDraft.submittedAt) resumeLetter(localDraft, pid, [])
            else showShelf([])
          })
          .catch(() => {
            showShelf([])
          })
      })
      .finally(() => {
        if (alive) setBooting(false)
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designer.id])

  async function clearDraftBody(designerId, pid) {
    await clearDraft(designerId, pid)
    await deleteProjectMedia(designerId, pid).catch(() => {})
  }

  // Resume robustness: the stored stage must make sense inside the current
  // sequence (a designer may have changed paper mid-flight).
  useEffect(() => {
    if (closed) return
    if (motion.turn) return
    if (booting) return
    if (!designer.id) {
      if (stage !== 'access') setStage('access')
      return
    }
    if (stage === 'status' || stage === SUBMITTED_STAGE) return
    if (!sequence.includes(stage)) {
      const fallback = chosenSlug ? templateStagesFor(chosenSlug)[0] : 'receiver'
      setStage(fallback)
      if (projectId) saveDraft(designer.id, { currentStage: fallback, templateSlug: chosenSlug || null }, projectId)
    }
  }, [sequence, stage, designer.id, chosenSlug, motion.turn, closed, booting, projectId])

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
          clearDesignerToken()
          lockDraftKey()
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

  // The paper in hand: the SERVER owns what it looks like on the shelf
  // (name, phrase, wrappers), the frontend registry owns how its PAGES are
  // built — merged here so `template.components` is live for the spread.
  const chosenTemplate = useMemo(() => {
    const fromServer = (templates ?? []).find((t) => t.slug === chosenSlug)
    const contract = templateRegistry(chosenSlug)
    if (!contract) return fromServer ?? { slug: chosenSlug, name: chosenSlug, description: '' }
    return { ...contract, ...fromServer, components: contract.components }
  }, [templates, chosenSlug])

  // The wrappers THIS paper offers, put through the admin's merchandising
  // rules in ONE place: hidden rows never reach a stage, resting rows do
  // (veiled), and the order is the admin's. `null` while the archive is
  // still loading; a failed archive read degrades to "no wrappers known" so
  // the desk never deadlocks.
  const wrapperOptions = useMemo(() => {
    if (templates === null) return templatesError ? [] : null
    return chooserCatalogItems(chosenTemplate.wrappers ?? [])
  }, [templates, templatesError, chosenTemplate])

  // What the template chooser renders, under the same rules: the admin's
  // visible papers in the admin's order — an inactive paper leaves no slot
  // behind, a resting one keeps its place under a veil.
  const chooserTemplates = useMemo(
    () => (templates === null ? null : chooserCatalogItems(templates)),
    [templates]
  )

  // -------------------------------------------------------------------------
  // The archive outlives a draft: what was chosen on an earlier visit may
  // since have been hidden or set aside by the admin. Their settings are the
  // source of truth, so the book never continues onto a page the chooser
  // would no longer offer — it turns back to the choosing spread with a word
  // of why. The words themselves stay in the encrypted draft: re-picking the
  // same paper restores them.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!templates || !chosenSlug || closed || booting || !designer.id) return
    if (motion.turn) return
    const item = getCatalogItemState(templates.find((row) => row.slug === chosenSlug))
    if (item.selectable) return
    setCatalogNotice(
      memorial.language === 'ar'
        ? 'الورقة التي بدأتها لم تعد متاحة الآن — اختر أخرى للمتابعة.'
        : 'The paper you had begun is no longer available — choose another to continue.'
    )
    setChosenSlug(null)
    setWrapperKey('')
    if (projectId) {
      saveDraft(designer.id, { templateSlug: null, wrapperKey: '', currentStage: 'templates' }, projectId)
    }
    setStage('templates')
  }, [templates, chosenSlug, closed, booting, designer.id, projectId, motion.turn, memorial.language])

  // The same rule one chapter later: a wrapper retired after it was picked
  // is dropped from the draft (the server would refuse it at the seal
  // anyway) and the stage is told why.
  useEffect(() => {
    // Only a REAL archive may condemn a choice: while it is still loading
    // (or failed to load), the draft keeps its wrapper untouched.
    if (!wrapperKey || !templates || !wrapperOptions || closed || booting || motion.turn) return
    const row = wrapperOptions.find((w) => w.key === wrapperKey)
    if (row && getCatalogItemState(row).selectable) return
    setCatalogNotice(
      memorial.language === 'ar'
        ? 'التغليف الذي اخترته لم يعد متاحًا الآن — اختر آخرًا للمتابعة.'
        : 'The wrapper you had chosen is no longer available — choose another.'
    )
    setWrapperKey('')
    if (designer.id && projectId) saveDraft(designer.id, { wrapperKey: '' }, projectId)
  }, [wrapperKey, wrapperOptions, closed, booting, motion.turn, designer.id, projectId, memorial.language])

  const persistStage = useCallback(
    (target) => {
      if (!designer.id || !projectId) return
      if (target === 'status' || target === 'access' || target === SUBMITTED_STAGE) return
      saveDraft(designer.id, { currentStage: target, templateSlug: chosenSlug || null, receiverName }, projectId)
      flushMemorialNow()
    },
    [designer.id, projectId, chosenSlug, receiverName, flushMemorialNow]
  )

  const goTo = useCallback(
    (target, direction) => {
      // No turn while a leaf sweeps, while the cover swings open, on the
      // page already showing, or on the shelf — same contract as ever, now
      // enforced by the machine as well.
      if (motion.turn || motion.opening || target === stage || closed) return
      playPageLift()
      dispatch({ type: 'GO', target, direction, from: stage })
    },
    [motion.turn, motion.opening, stage, closed]
  )

  const handleTurnEnd = useCallback(() => {
    if (!motion.turn) return
    playPageSettle()
    const target = motion.turn.target
    // Any ink pass of a previous turn dies here so a stale timer can never
    // dim the spread that is arriving now.
    for (const t of inkTimersRef.current) window.clearTimeout(t)
    inkTimersRef.current = []
    dispatch({ type: 'TURN_END' })
    setStage(target)
    persistStage(target)
    const start = window.setTimeout(() => {
      dispatch({ type: 'INK_START' })
      playInkTouch()
      const stop = window.setTimeout(() => dispatch({ type: 'INK_END' }), reduced ? 200 : AUDIO_INK_MS)
      inkTimersRef.current = [stop]
    }, reduced ? 60 : 220)
    inkTimersRef.current = [start]
  }, [motion.turn, persistStage, reduced])

  const handleAccess = useCallback(
    async (code, passcode) => {
      setLogin({ status: 'busy' })
      try {
        const session = await designerLogin(code, passcode)
        const payload = decodeJwtPayload(session.token)
        const id = payload?.sub || session.designer?.id || ''
        if (!id) throw new Error("We couldn't verify those details.")
        await unlockDraftKey(id, session.draftSecret)
        setDesigner({ id, name: session.designer?.name || '' })

        // With the pins accepted the cover opens at once — nothing
        // network-bound may keep the book shut. The landing is always the
        // shelf of previous messages; a fresh page ("For whom") is reached by
        // choosing a new message. The hydration effect, the one place identity
        // is resolved, refines this landing (shelf reconciliation) the instant
        // it resolves.
        setProjectId(null)
        setChosenSlug(null)
        setReceiverName('')
        setWrapperKey('')
        setMemorial(freshMemorial())
        setClosed(true)
        // The cover is shut on the access spread: opening it swings onto the
        // shelf — the one cover animation the machine stages for real.
        dispatch({ type: 'OPEN_COVER' })
        setStage('status')
        setLogin({ status: 'idle' })
        playPin()
      } catch (error) {
        if (error.cooldown) {
          setLogin({ status: 'cooldown', retryAfterSeconds: error.retryAfterSeconds, lockedUntil: error.lockedUntil })
        } else {
          setLogin({ status: 'error', message: error.message || "We couldn't verify those details." })
        }
      }
    },
    []
  )

  const handleCooldownEnd = useCallback(() => setLogin({ status: 'idle' }), [])

  const handleReceiver = useCallback(
    (name) => {
      setReceiverName(name)
      if (designer.id && projectId) saveDraft(designer.id, { receiverName: name, currentStage: 'templates', templateSlug: null }, projectId)
      playClick()
      goTo('templates', 'fwd')
    },
    [designer.id, projectId, goTo]
  )

  const handlePickTemplate = useCallback(
    (template) => {
      if (!designer.id || !projectId) return
      // The card itself is disabled when the admin has hidden or set the
      // paper aside; guard the handler as well so no code path can enter a
      // paper the chooser would not offer.
      if (!getCatalogItemState(template).selectable) return
      const code = template.slug
      setCatalogNotice('')
      setChosenSlug(code)
      // Wrappers are offered per paper: a choice made for one template can
      // never travel to another (the server would rightly refuse it).
      setWrapperKey('')
      const first = templateStagesFor(code)[0]
      saveDraft(designer.id, { templateSlug: code, currentStage: first, wrapperKey: '' }, projectId)
      playPin()
      goTo(first, 'fwd')
    },
    [designer.id, projectId, goTo]
  )

  // The one Back control of the pipeline. Every stage that has a previous page
  // hands it a destination through the same masthead leaf, so the way back never
  // relocates from spread to spread and each previous page arrives with the
  // reverse turn the book has always done. The chain is DERIVED from the stage
  // sequence itself — a template that contributes a stage (the wrapper, say)
  // is automatically the previous page of whatever follows it, and no hand-
  // maintained table can fall out of step with TEMPLATE_STAGES.
  const previousStageOf = useMemo(() => {
    const map = { receiver: 'shelf', templates: 'receiver' }
    let prev = 'templates'
    for (const key of templateStagesFor(chosenSlug)) {
      map[key] = prev
      prev = key
    }
    return map
  }, [chosenSlug])

  // The receiver is the first spread of the book: its previous page is not one
  // of the chapters but the shelf itself, so going back closes the view (the
  // in-progress draft stays where it is, untouched) instead of turning to a
  // spread that does not exist.
  const returnToShelf = useCallback(() => {
    if (motion.turn) return
    playPageLift()
    setActiveProject(null)
    setProjectId(null)
    setChosenSlug(null)
    setReceiverName('')
    setWrapperKey('')
    setMemorial(freshMemorial())
    dispatch({ type: 'SHOW_SHELF' })
    setClosed(true)
    setStage('status')
    setCatalogNotice('')
    playPageSettle()
  }, [motion.turn])

  // Template field changes are debounced (~⅓ s) so a hurried pen stays calm;
  // the pending patch is flushed whenever a page turns or the seal is pressed,
  // so no freshest word is ever stranded in a timer.
  const persistMemorial = useCallback(
    (patch) => {
      if (!designer.id || !chosenSlug || !projectId) return
      memorialPendingRef.current = {
        designerId: designer.id,
        projectId,
        slug: chosenSlug,
        patch: { ...(memorialPendingRef.current?.patch ?? {}), ...patch },
      }
      if (memorialTimerRef.current) clearTimeout(memorialTimerRef.current)
      memorialTimerRef.current = setTimeout(flushMemorialNow, 350)
    },
    [designer.id, chosenSlug, projectId, flushMemorialNow]
  )

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

  // The wrapper choice writes through at once (a plain root draft field, not
  // a debounced template patch): it is one click, and the stage may be left
  // for the lock immediately after. Cards the admin has veiled are refused
  // here too — `wrapperOptions` is the visible catalog, so anything absent
  // from it (hidden, unset or resting) never lands in the draft.
  const handleWrapperPick = useCallback(
    (key) => {
      const row = (wrapperOptions ?? []).find((w) => w.key === key)
      if (!row || !getCatalogItemState(row).selectable) return
      setCatalogNotice('')
      setWrapperKey(key)
      if (designer.id && projectId) saveDraft(designer.id, { wrapperKey: key }, projectId)
      playClick()
    },
    [designer.id, projectId, wrapperOptions]
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

  // Submission. The letter is still LOCAL — its photos and sound live encrypted
  // in IndexedDB, untouched by the network. The seal submits the WHOLE message
  // read straight back out of the encrypted local draft (the desk is the source
  // of truth, never the volatile in-memory state), uploading the media in it,
  // then creates the server project carrying the EXACT policy version accepted
  // just now. Only a server-confirmed project causes the local work to be marked
  // submitted; the sweep itself happens on Close the Book.
  const handleSubmit = useCallback(async () => {
    if (!designer.id || !projectId || !chosenSlug) return
    flushMemorialNow()
    const stored = await loadTemplateDraft(designer.id, chosenSlug, projectId)
    const atSubmit = stored ?? memorial
    const lang = atSubmit.language === 'ar' ? 'ar' : 'en'
    const problems = validateMemorial(atSubmit, lang)
    if (problems.length) throw new Error(problems[0])
    const token = getDesignerToken()
    const now = new Date().toISOString()

    // The desk is the source of truth: the wrapper choice is read back from
    // the same decrypted draft as the ledger (the in-memory copy only stands
    // in for the pathological case where nothing was persisted yet).
    const fullDraft = await loadDraft(designer.id, projectId)
    const ledger = fullDraft?.submitLedger ?? {}
    const wrapperType = fullDraft?.wrapperKey || wrapperKey || null
    const serverRefFor = async (localRef, kind) => {
      const slotKey = `${localRef.role}:${localRef.slot}`
      if (ledger[slotKey]) return ledger[slotKey]
      const record = await getEncryptedMedia(mediaStorageKey(designer.id, projectId, localRef.role, localRef.slot))
      if (!record?.data) throw new Error('A print is missing from this desk')
      const plain = await decryptBytes({ iv: record.iv, ct: record.data })
      if (!plain) throw new Error('A print could not be read')
      const blob = new Blob([plain], { type: record.mimeType })
      const fixed = `${localRef.role}-${localRef.slot}`
      const file = new File([blob], record.name || `${kind}-${localRef.slot}.bin`, { type: record.mimeType })
      const ref = await uploadDesignerMedia(file, { token, kind, fixed })
      ledger[slotKey] = ref
      await saveDraft(designer.id, { submitLedger: ledger }, projectId)
      return ref
    }

    const photos = []
    for (let i = 0; i < 3; i += 1) {
      const local = atSubmit.photos?.[i]
      photos.push(local ? await serverRefFor(local, 'photo') : null)
    }
    const audio = atSubmit.audio ? await serverRefFor(atSubmit.audio, 'audio') : null

    const serverDraft = {
      language: atSubmit.language,
      greeting: atSubmit.greeting || '',
      closing: atSubmit.closing || '',
      senderName: atSubmit.senderName || '',
      body: atSubmit.body || '',
      photos,
      audio,
      passwordSet: Boolean(atSubmit.passwordSet),
    }
    let project
    try {
      ({ project } = await createProject(token, {
        projectId,
        templateSlug: chosenSlug,
        receiverName,
        draft: serverDraft,
        policyVersion: DEARUNE_POLICY_VERSION,
        policiesAcceptedAt: now,
        wrapperType,
      }))
    } catch (cause) {
      // The archive may have moved under the letter (a paper or wrapper the
      // admin set aside between opening the book and pressing the seal — the
      // server refuses it). Re-open the archive so the validation effect
      // above can return the book to the choosing spread; the reason itself
      // surfaces on the terms page through the usual catch.
      setTemplates(null)
      throw cause
    }
    await saveDraft(designer.id, { submittedAt: now, submittedProjectId: project.id, submitLedger: {} }, projectId)
    setActiveProject(project)
    setProjects((prev) => [project, ...(prev ?? []).filter((p) => p.id !== project.id)])
    // The hand-over is a REAL turn, not a jump: the leaf sweeps from the
    // terms onto the handed-over page and the ink pass greets it there.
    setClosed(false)
    dispatch({ type: 'GO', target: SUBMITTED_STAGE, direction: 'fwd', from: stage })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designer.id, projectId, chosenSlug, receiverName, wrapperKey, stage, memorial, flushMemorialNow])

  // Close the Book: the server owns the letter now, so the local project
  // (encrypted draft + its media) is swept off this device and the cover shuts
  // onto the shelf. Deliberately one-way: the words have left the desk.
  const handleCloseBook = useCallback(async () => {
    const pid = projectId
    if (designer.id && pid) {
      await clearDraft(designer.id, pid)
      await deleteProjectMedia(designer.id, pid).catch(() => {})
    }
    setProjectId(null)
    setChosenSlug(null)
    setReceiverName('')
    setWrapperKey('')
    setMemorial(freshMemorial())
    setActiveProject(null)
    dispatch({ type: 'SHOW_SHELF' })
    setClosed(true)
    setStage('status')
    passwordRef.current = ''
    playPageSettle()
  }, [designer.id, projectId])

  // A shelf row is metadata only; the letter itself lives on the server. Each
  // open fetches the project's full payload so the book shows what was actually
  // handed over — never the blank sample.
  const handleOpenProject = useCallback(
    async (project) => {
      if (openingId) return
      setOpeningAlert('')
      setOpeningId(project.id)
      try {
        const token = getDesignerToken()
        const { project: full } = await fetchProject(token, project.id)
        setActiveProject(full)
      } catch (cause) {
        setOpeningAlert(cause?.message || 'The book could not be opened.')
      } finally {
        setOpeningId(null)
      }
    },
    [openingId]
  )

  // A new dearune opens a brand-new project page; previous books and their
  // drafts are left exactly where they are.
  const handleNewDearune = useCallback(() => {
    let next = null
    if (designer.id) next = createLocalProject(designer.id)
    setProjectId(next)
    playClick()
    setChosenSlug(null)
    setReceiverName('')
    setWrapperKey('')
    setActiveProject(null)
    setMemorial(freshMemorial())
    setStage('receiver')
    setClosed(false)
    dispatch({ type: 'RESET_DESK' })
    setLogin({ status: 'idle' })
    passwordRef.current = ''
    setOpeningId(null)
    setOpeningAlert('')
    setCatalogNotice('')
  }, [designer.id])

  const handleLeave = useCallback(() => {
    clearDesignerToken()
    lockDraftKey()
    memorialPendingRef.current = null
    if (memorialTimerRef.current) clearTimeout(memorialTimerRef.current)
    for (const t of inkTimersRef.current) window.clearTimeout(t)
    inkTimersRef.current = []
    setDesigner({ id: '', name: '' })
    setProjectId(null)
    setReceiverName('')
    setWrapperKey('')
    setStage('access')
    dispatch({ type: 'RESET_DESK' })
    setTemplates(null)
    setTemplatesError('')
    setChosenSlug(null)
    setClosed(false)
    setProjects(null)
    setProjectsError('')
    setActiveProject(null)
    setOpeningId(null)
    setOpeningAlert('')
    setBooting(false)
    passwordRef.current = ''
    setCatalogNotice('')
  }, [])

  const toggleSound = useCallback(() => {
    const next = isSoundMuted()
    setSoundMuted(!next)
    setInsonicated(!next)
    if (next) unmuteVia('toggle')
  }, [])

  // ---------------------------------------------------------------------------
  // The Back control. One leaf in the masthead, same place on every spread;
  // its label names the page it returns to.
  // ---------------------------------------------------------------------------

  const nestLabels = memorial.language === 'ar'
  // Each word names the page the Back leaf returns TO (the destination), so
  // the label and the turn can never disagree about where you land.
  const PREVIOUS_WORDS = {
    shelf: nestLabels ? 'الرف' : 'the shelf',
    receiver: nestLabels ? 'لمن' : 'for whom',
    templates: nestLabels ? 'الأوراق' : 'the papers',
    unwritten: nestLabels ? 'الأوراق' : 'the papers',
    'memorial.language': nestLabels ? 'اللغة' : 'the tongue',
    'memorial.editor': nestLabels ? 'صفحة الكلام' : 'the speaking page',
    'wrapper': nestLabels ? 'التغليف' : 'the wrapper',
    'memorial.password': nestLabels ? 'القفل' : 'the lock',
    [REVIEW_STAGE]: nestLabels ? 'الخاتمة' : 'the close',
    [POLICIES_STAGE]: nestLabels ? 'الختم' : 'the seal',
  }

  const previousStage = previousStageOf[stage]
  const navBack = closed
    ? activeProject
      ? () => {
          playClick()
          setActiveProject(null)
        }
      : null
    : designer.id && previousStage
      ? previousStage === 'shelf'
        ? returnToShelf
        : () => goTo(previousStage, 'back')
      : null
  const navWord = navBack ? (previousStage ? PREVIOUS_WORDS[previousStage] : PREVIOUS_WORDS.shelf) : null

  // ---------------------------------------------------------------------------
  // Rendering the spread: one left leaf + one right leaf per stage.
  // ---------------------------------------------------------------------------

  const rightFor = useCallback(
    (key) => {
      // The handed-over page sits just past the last spread of the sequence,
      // so its folio continues the book's numbering instead of falling back.
      const index = key === SUBMITTED_STAGE ? sequence.length : sequence.indexOf(key)
      const folio = index >= 0 ? index * 2 + 2 : 2

      // Pages a template owns render through ITS registry entry — one prop
      // bag, the component picks what it knows. The next leaf is derived
      // from the sequence, never hardcoded, so re-ordering a template's
      // pages cannot strand a stage pointing at the wrong neighbour.
      const TemplatePage = chosenTemplate?.components?.[key]
      if (TemplatePage) {
        const next = nextStageIn(sequence, key)
        return (
          <Folio folio={folio}>
            <TemplatePage
              draft={memorial}
              template={chosenTemplate}
              value={memorial.language}
              projectId={projectId}
              onChange={handleMemorialField}
              onSelect={handleLanguage}
              onSet={handleSetPassword}
              onNext={next ? () => goTo(next, 'fwd') : undefined}
            />
          </Folio>
        )
      }

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
              <ReceiverStage initial={receiverName} onNext={handleReceiver} />
            </Folio>
          )
        case 'templates':
          return (
            <Folio folio={folio}>
              <TemplateSelectionStage
                templates={chooserTemplates ?? []}
                loading={Boolean(designer.id) && templates === null && !templatesError}
                error={templatesError}
                chosenSlug={chosenSlug}
                onSelect={handlePickTemplate}
                notice={catalogNotice}
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
              <UnwrittenStage template={chosenTemplate} />
            </Folio>
          )
        case WRAPPER_STAGE: {
          const next = nextStageIn(sequence, key) ?? 'review'
          return (
            <Folio folio={folio}>
              <WrapperSelectionStage
                template={chosenTemplate}
                wrappers={wrapperOptions}
                value={wrapperKey}
                onChange={handleWrapperPick}
                onNext={() => goTo(next, 'fwd')}
                language={memorial.language}
                notice={catalogNotice}
              />
            </Folio>
          )
        }
        case REVIEW_STAGE:
          return (
            <Folio folio={folio}>
              <ReviewStage
                draft={memorial}
                token={memorialToken}
                templateName={chosenTemplate.name}
                onNext={() => goTo(nextStageIn(sequence, key) ?? POLICIES_STAGE, 'fwd')}
              />
            </Folio>
          )
        case POLICIES_STAGE:
          return (
            <Folio folio={folio}>
              <PoliciesStage
                draft={memorial}
                templateName={chosenTemplate.name}
                receiverName={receiverName}
                onSubmit={handleSubmit}
              />
            </Folio>
          )
        case SUBMITTED_STAGE:
          return (
            <Folio folio={folio}>
              <SubmittedStage
                title={activeProject?.title}
                forName={receiverName}
                paperName={chosenTemplate.name}
                receiptId={activeProject?.public_id}
                onCloseBook={handleCloseBook}
              />
            </Folio>
          )
        default:
          return null
      }
    },
    [sequence, login, templates, templatesError, chooserTemplates, catalogNotice, chosenSlug, chosenTemplate, wrapperOptions, wrapperKey, designer, memorial, memorialToken, receiverName, projectId, activeProject, handleAccess, handleCooldownEnd, handleReceiver, handlePickTemplate, handleLanguage, handleMemorialField, handleWrapperPick, handleSetPassword, handleSubmit, handleCloseBook, goTo]
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
        case 'wrapper':
          return <WrapperSheet />
        case 'memorial.password':
          return <LockSheet />
        case 'review':
          return <CloseSheet receiverName={designer.name.split(' ')[0] || undefined} />
        case POLICIES_STAGE:
          return <PoliciesSheet />
        case SUBMITTED_STAGE:
          return <SubmittedSheet />
        default:
          return <ChapterPage folio={folio} title="Dearune" />
      }
    },
    [sequence, memorial, memorialToken, designer]
  )

  // While the draft is being decrypted and the shelf fetched, the BOOK is
  // still the hero: an open spread carrying a quiet loader on its right page,
  // never a bare spinner replacing the object.
  if (booting && designer.id) {
    return (
      <div className="book-root">
        <Masthead insonicated={insonicated} onToggleSound={toggleSound} />
        <BookShell
          leftNode={<VersoPage />}
          rightNode={
            <Folio folio={2}>
              <div className="book-boot">
                <DearuneLoader size="lg" label="setting the type…" />
              </div>
            </Folio>
          }
          coverOpen
        />
        <footer className="book-footer">
          <span>paper &amp; ink · set by hand</span>
          <span>a closed book keeps its words</span>
        </footer>
      </div>
    )
  }

  // The closed-book view replaces the whole pipeline: the shelf of books, or
  // a single handed-over book opened from it.
  if (closed) {
    return (
      <div className="book-root">
        <Masthead
          left={navBack ? <BookStageNavigation onBack={navBack} label={navWord} /> : null}
          insonicated={insonicated}
          onToggleSound={toggleSound}
          right={designer.id ? <Mast leave onLeave={handleLeave} /> : null}
        />
        <BookShell
          leftNode={<ClosedBookSheet />}
          rightNode={
            <Folio folio={17}>
              {activeProject ? (
                <ProjectSheet project={activeProject} token={memorialToken} templates={templates} onBack={() => setActiveProject(null)} />
              ) : (
                <ProjectsBook
                  projects={projects}
                  loading={projects === null && !projectsError}
                  error={projectsError}
                  templates={templates}
                  onOpen={handleOpenProject}
                  openingId={openingId}
                  openingAlert={openingAlert}
                  onNewDearune={handleNewDearune}
                  onRetry={() => {
                    setProjectsError('')
                    setProjects(null)
                  }}
                />
              )}
            </Folio>
          }
          coverOpen={motion.coverOpen}
          onCoverSettled={() => dispatch({ type: 'COVER_SETTLED' })}
          inking={false}
        />
        <footer className="book-footer">
          <span>paper &amp; ink · set by hand</span>
          <span>a closed book keeps its words</span>
        </footer>
      </div>
    )
  }

  const resting = motion.turn ? motion.turn.target : stage
  const spreadNumber = Math.max(1, sequence.indexOf(resting) + 1)

  // One leaf, two faces. On the desktop spread the arriving page appears on
  // the far half of the book; on mobile there is only one exposed page, so
  // the arriving face is the next working page itself.
  const turnFront = motion.turn
    ? motion.turn.direction === 'back'
      ? mobile
        ? rightFor(motion.turn.from)
        : leftFor(motion.turn.from)
      : rightFor(motion.turn.from)
    : null
  const turnBack = motion.turn
    ? motion.turn.direction === 'back'
      ? rightFor(motion.turn.target)
      : mobile
        ? rightFor(motion.turn.target)
        : leftFor(motion.turn.target)
    : null

  return (
    <div className="book-root">
      <Masthead
        left={navBack ? <BookStageNavigation onBack={navBack} label={navWord} /> : null}
        insonicated={insonicated}
        onToggleSound={toggleSound}
        right={designer.id ? <Mast leave onLeave={handleLeave} /> : null}
      />
      <BookShell
        leftNode={leftFor(resting)}
        rightNode={rightFor(resting)}
        coverOpen={motion.coverOpen}
        onOpenCover={() => {
          unmuteVia('cover')
          dispatch({ type: 'OPEN_COVER' })
        }}
        onCoverSettled={() => dispatch({ type: 'COVER_SETTLED' })}
        flipping={Boolean(motion.turn)}
        turnDirection={motion.turn?.direction ?? 'fwd'}
        turnFront={turnFront}
        turnBack={turnBack}
        onTurnEnd={handleTurnEnd}
        inking={motion.inking}
        inkDirection={motion.inkDirection}
      />
      <footer className="book-footer">
        <span>paper &amp; ink · set by hand</span>
        <span>spread {spreadNumber} of {sequence.length || 1}</span>
      </footer>
    </div>
  )
}

function Masthead({ insonicated, onToggleSound, right, left }) {
  return (
    <header className="book-masthead">
      <span className="masthead-left">
        {left}
        <span className="mono">
          D<em>earune</em>
        </span>
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
// the left while the working copy is edited on the right. The composition is
// framed inside a sheet of the real delivery's proportion, so the preview is
// an honest paper, never a stretched page.
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
        <div className="proof-frame" style={{ '--render-ratio': RENDER_RATIO }}>
          <div className="proof-paper">
            <MemorialLetter draft={closedCopy} photoUrls={photoUrls} audio={draft.audio} audioUrl={audioUrl} compact />
          </div>
        </div>
      </div>
    </Folio>
  )
}