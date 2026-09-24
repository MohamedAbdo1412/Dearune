import { useEffect, useRef, useState } from 'react'
import Cropper from 'react-easy-crop'
import MemorialLetter from './MemorialLetter'
import MessageAudio from './MessageAudio'
import { useIsMobile } from '@/pages/create/createHelpers'
import { getDesignerToken } from '@/services/designer'
import {
  cropImageBlob,
  uploadDesignerMedia,
  deleteDesignerMedia,
  resolveMediaUrl,
  MEDIA_TYPE_LIMITS,
} from '@/services/media'
import DearuneLoader from '@/components/book/DearuneLoader'
import { Fleuron } from '@/components/book/ornaments'

// Memorial stage B — speaking page. The letter is written live on the paper:
// greeting, the words, the closing, a name. Three small prints are brought in
// from the owner's hand — each cropped on a mounter's bench, pinned, and left
// to dry. One sound may be kept beside the letter.

export function validateMemorial(draft, lang) {
  const t = (en, ar) => (lang === 'ar' ? ar : en)
  const errors = []
  const body = draft.body ? draft.body.replace(/\s+/g, '') : ''
  if (!body) errors.push(t('The words are not written yet', 'الكلمات لم تُكتب بعد'))
  if (!draft.senderName || !draft.senderName.trim()) errors.push(t('A name is missing', 'الاسم ناقص'))
  return errors
}

const PHOTO_ASPECT = 4 / 3

function PhotoCropDialog({ open, src, hasExisting, onCancel, onPin, onLift, submitting, name }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [pixelArea, setPixelArea] = useState(null)

  useEffect(() => {
    if (open) {
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setPixelArea(null)
    }
  }, [open])

  if (!open) return null
  const canPin = pixelArea && !submitting

  return (
    <div className="crop-overlay" role="dialog" aria-modal="true" aria-label="Pin a print">
      <div className="crop-bench">
        <div className="crop-stage">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            minZoom={1}
            maxZoom={5}
            aspect={PHOTO_ASPECT}
            showGrid={false}
            objectFit="contain"
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, areaPixels) => setPixelArea(areaPixels)}
          />
        </div>
        <div className="crop-controls">
          <label className="crop-roll">
            <span>{name}</span>
            <input
              type="range"
              min="1"
              max="5"
              step="0.01"
              value={zoom}
              disabled={submitting}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
          </label>
          <div className="crop-actions">
            {hasExisting ? (
              <button type="button" className="d-btn d-btn--ghost d-btn--danger" onClick={onLift} disabled={submitting}>
                lift this print
              </button>
            ) : null}
            <button type="button" className="d-btn d-btn--thread" onClick={onCancel} disabled={submitting}>
              cancel
            </button>
            <button type="button" className="d-btn d-btn--ink" onClick={() => canPin && onPin(pixelArea)} disabled={!canPin}>
              {submitting ? <DearuneLoader small /> : 'pin it to the page'}
            </button>
          </div>
          {submitting ? <div className="crop-note">letting the ink dry…</div> : null}
        </div>
      </div>
    </div>
  )
}

export default function MemorialEditorStage({ draft, onChange, onNext, onBack }) {
  const lang = draft.language === 'ar' ? 'ar' : 'en'
  const t = (en, ar) => (lang === 'ar' ? ar : en)
  const token = getDesignerToken()

  // The writer lands on the greeting, pen ready — but only on a wide screen
  // (on a phone the keyboard must not spring open on its own).
  const mobile = useIsMobile()
  useEffect(() => {
    if (mobile) return
    const timer = window.setTimeout(() => {
      if (document.activeElement && document.activeElement !== document.body) return
      document.getElementById('mm-greeting')?.focus({ preventScroll: true })
    }, 420)
    return () => window.clearTimeout(timer)
  }, [mobile])

  const [photoUrls, setPhotoUrls] = useState([null, null, null])
  const [audioUrl, setAudioUrl] = useState(null)
  const [audioBusy, setAudioBusy] = useState(false)
  const [alert, setAlert] = useState({ tone: 'warn', text: '' })
  const [dialog, setDialog] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const photos = draft.photos?.length === 3 ? draft.photos : [null, null, null]
  const pendingIndexRef = useRef(0)
  const pendingFileRef = useRef(null)

  useEffect(() => {
    let alive = true
    photos.forEach((ref, i) => {
      if (!ref?.path) return
      resolveMediaUrl(ref, token).then((url) => {
        if (!alive) return
        setPhotoUrls((prev) => (prev[i] === url ? prev : prev.map((u, j) => (j === i ? url : u))))
      })
    })
    return () => {
      alive = false
    }
  }, [photos.map((p) => p?.path ?? '').join('||')]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true
    const ref = draft.audio
    if (!ref?.path) {
      setAudioUrl(null)
      return
    }
    resolveMediaUrl(ref, token).then((url) => alive && setAudioUrl(url))
    return () => {
      alive = false
    }
  }, [draft.audio?.path ?? '']) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!alert.text) return
    const timer = setTimeout(() => setAlert({ tone: 'warn', text: '' }), 5000)
    return () => clearTimeout(timer)
  }, [alert])

  const setPhotos = (next) => onChange('photos', next)

  const openPhotoSlot = (index) => {
    pendingIndexRef.current = index
    const input = document.getElementById('mm-photo-input')
    if (input) {
      input.value = ''
      input.click()
    }
  }

  const handlePhotoFile = (event) => {
    const file = event.target.files?.[0]
    setAlert({ tone: 'warn', text: '' })
    if (!file) return
    if (!file.type || !file.type.startsWith('image/')) {
      setAlert({ tone: 'warn', text: t('That is not a photograph', 'هذه ليست صورة') })
      return
    }
    if (file.size > MEDIA_TYPE_LIMITS.image) {
      setAlert({ tone: 'warn', text: t('That picture is too heavy to pin', 'الصورة كبيرة جداً لِتُعلَّق') })
      return
    }
    pendingFileRef.current = file
    setDialog({ index: pendingIndexRef.current, src: URL.createObjectURL(file) })
  }

  const pinPrint = async (pixelArea) => {
    if (!dialog) return
    const slot = pendingIndexRef.current
    const existing = photos[slot]
    const file = pendingFileRef.current
    setSubmitting(true)
    try {
      const cropped = await cropImageBlob(file, pixelArea)
      const ref = await uploadDesignerMedia(cropped, { token, kind: 'photo' })
      if (existing?.path && existing.path !== ref.path) await deleteDesignerMedia(existing, { token })
      const next = [...photos]
      next[slot] = ref
      setPhotos(next)
      setDialog(null)
      pendingFileRef.current = null
    } catch {
      setAlert({ tone: 'warn', text: t('Could not pin the print', 'تعذر تثبيت الصورة') })
    } finally {
      setSubmitting(false)
    }
  }

  const liftPrint = async () => {
    if (!dialog) return
    const slot = pendingIndexRef.current
    const existing = photos[slot]
    setSubmitting(true)
    try {
      if (existing?.path) await deleteDesignerMedia(existing, { token })
      setPhotos(photos.map((p, i) => (i === slot ? null : p)))
      setDialog(null)
    } finally {
      setSubmitting(false)
    }
  }

  const handleAudioFile = async (event) => {
    const file = event.target.files?.[0]
    setAlert({ tone: 'warn', text: '' })
    if (!file) return
    if (!file.type || !file.type.startsWith('audio/')) {
      setAlert({ tone: 'warn', text: t('That is not a sound', 'هذا ليس صوتاً') })
      return
    }
    if (file.size > MEDIA_TYPE_LIMITS.audio) {
      setAlert({ tone: 'warn', text: t('The sound is too long to keep', 'الصوت طويل جداً لِيُحفَظ') })
      return
    }
    setAudioBusy(true)
    try {
      if (draft.audio?.path) await deleteDesignerMedia(draft.audio, { token })
      const ref = await uploadDesignerMedia(file, { token, kind: 'audio' })
      onChange('audio', ref)
    } catch {
      setAlert({ tone: 'warn', text: t('Could not keep the sound', 'تعذر حفظ الصوت') })
    } finally {
      setAudioBusy(false)
    }
  }

  const removeAudio = async () => {
    if (draft.audio?.path) await deleteDesignerMedia(draft.audio, { token })
    onChange('audio', null)
    setAudioUrl(null)
  }

  const goNext = () => {
    const problems = validateMemorial(draft, lang)
    if (problems.length) {
      setAlert({ tone: 'warn', text: problems[0] })
      return
    }
    onNext()
  }

  return (
    <div className="settle stage-root is-editing-page">
      <div className="page-script">{t('the speaking page', 'صفحة الكلام')}</div>
      <div className="page-kicker" style={{ marginTop: 6 }}>
        chapter the fifth
      </div>
      <input
        type="file"
        id="mm-photo-input"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handlePhotoFile}
      />

      <Fleuron />

      <MemorialLetter
        draft={draft}
        editable
        onField={onChange}
        photoUrls={photoUrls}
        onPhotoTap={openPhotoSlot}
        audio={draft.audio}
        audioUrl={audioUrl}
      />

      <div className="m-toolbar">
        {draft.audio ? (
          <div className="m-audio-copy">
            <span className="sound-label">{t('a sound is kept here', 'صوتٌ مُرفَق')}</span>
            {audioUrl ? <MessageAudio src={audioUrl} label={t('listen', 'استمع')} /> : null}
            <button type="button" className="d-btn d-btn--ghost d-btn--danger" onClick={removeAudio} disabled={audioBusy}>
              {t('lift the sound', 'إزالة الصوت')}
            </button>
          </div>
        ) : (
          <label className={`d-btn d-btn--thread${audioBusy ? ' is-busy' : ''}`}>
            {audioBusy ? <DearuneLoader small /> : t('keep a sound here', 'احتفظ بصوتٍ هنا')}
            <input type="file" accept="audio/*" style={{ display: 'none' }} onChange={handleAudioFile} />
          </label>
        )}
        {alert.text ? (
          <div className={`field-note${alert.tone === 'warn' ? '--warn' : ''}`} role="alert">
            {alert.text}
          </div>
        ) : null}
      </div>

      <div className="stage-actions">
        <button type="button" className="d-btn d-btn--thread" onClick={onBack}>
          ← {t('back to languages', 'العودة للغة')}
        </button>
        <button type="button" id="mm-seal" className="d-btn d-btn--ink" onClick={goNext}>
          {t('seal the letter', 'مضيّ هذا الكتاب')} →
        </button>
      </div>

      <PhotoCropDialog
        open={dialog != null}
        src={dialog?.src}
        hasExisting={dialog != null ? photos[dialog.index]?.path != null : false}
        onCancel={() => {
          setDialog(null)
          pendingFileRef.current = null
        }}
        onLift={liftPrint}
        onPin={pinPrint}
        submitting={submitting}
        name={t('Frame it — drag to move, roll to scale', 'قرّب وحدِّد الإطار')}
      />
    </div>
  )
}