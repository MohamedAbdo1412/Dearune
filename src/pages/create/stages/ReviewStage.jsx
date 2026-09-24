import { useEffect, useState } from 'react'
import MemorialLetter from '@/templates/memorial-message/MemorialLetter'
import { getDesignerToken } from '@/services/designer'
import { resolveMediaUrl } from '@/services/media'
import { Fleuron } from '@/components/book/ornaments'
import DearuneLoader from '@/components/book/DearuneLoader'

function validateMemorial(draft, lang) {
  const t = (en, ar) => (lang === 'ar' ? ar : en)
  const errors = []
  const body = draft.body ? draft.body.replace(/\s+/g, '') : ''
  if (!body) errors.push(t('The words are not written yet', 'الكلمات لم تُكتب بعد'))
  if (!draft.senderName || !draft.senderName.trim()) errors.push(t('A name is missing', 'الاسم ناقص'))
  return errors
}

// Memorial stage D — review. The letter as it will be sent, read once more
// before the book leaves the hands that made it. The "close the book" action
// hands the letter to the server (createProject); only a server-confirmed
// close clears this project's local draft.

export default function ReviewStage({ draft, templateName, onBack, onSubmit }) {
  const lang = draft.language === 'ar' ? 'ar' : 'en'
  const t = (en, ar) => (lang === 'ar' ? ar : en)
  const token = getDesignerToken()
  const [photoUrls, setPhotoUrls] = useState([null, null, null])
  const [audioUrl, setAudioUrl] = useState(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')

  const photos = draft.photos?.length === 3 ? draft.photos : [null, null, null]

  useEffect(() => {
    let alive = true
    photos.forEach((ref, i) => {
      if (!ref?.path) return
      resolveMediaUrl(ref, token).then((url) => alive && setPhotoUrls((prev) => (prev[i] === url ? prev : prev.map((u, j) => (j === i ? url : u)))))
    })
    const audioRef = draft.audio
    if (audioRef?.path) resolveMediaUrl(audioRef, token).then((url) => alive && setAudioUrl(url))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.map((p) => p?.path ?? '').join('||'), draft.audio?.path ?? ''])

  const handleHandover = () => {
    const problems = validateMemorial(draft, lang)
    if (problems.length) {
      setSendError(problems[0])
      return
    }
    setSending(true)
    setSendError('')
    Promise.resolve(onSubmit?.())
      .catch((error) => setSendError(error?.message || t('The book could not be closed', 'تعذّر إغلاق الكتاب')))
      .finally(() => setSending(false))
  }

  return (
    <div className="settle stage-root">
      <div className="page-script">{t('the close', 'الخاتمة')}</div>
      <div className="page-kicker" style={{ marginTop: 6 }}>
        chapter the seventh
      </div>

      <p className="page-lead" style={{ marginBottom: 8 }}>
        {t('This is the letter it will send. Nothing more to add — it is ready.', 'هكذا ستُرسل الرسالة. لا مزيد من الكلمات — إنها جاهزة.')}
      </p>

      <Fleuron />

      <div className="review-letter">
        <MemorialLetter
          draft={draft}
          photoUrls={photoUrls}
          audio={draft.audio}
          audioUrl={audioUrl}
        />
      </div>

      <div className="review-meta">
        <span className="draft-note">{t('the book closes when you seal it', 'يُغلق الكتاب عند ختمه')}</span>
        <span className="draft-note">{templateName}</span>
        {draft.passwordSet ? <span className="draft-note">{t('the lock is set', 'القفل مثبَّت')}</span> : null}
      </div>

      {sendError ? (
        <div className="field-note--warn" role="alert" style={{ textAlign: 'center', margin: '8px 0' }}>
          {sendError}
        </div>
      ) : null}

      <div className="stage-actions">
        <button type="button" className="d-btn d-btn--thread" onClick={onBack} disabled={sending}>
          ← {t('one more look', 'نظرة أخيرة')}
        </button>
        <button type="button" id="mm-handover" className="d-btn d-btn--ink" onClick={handleHandover} disabled={sending}>
          {sending ? (
            <DearuneLoader small label={t('closing', 'يُغلق')} />
          ) : (
            t('close the book', 'أغلق الكتاب')
          )}
        </button>
      </div>
    </div>
  )
}