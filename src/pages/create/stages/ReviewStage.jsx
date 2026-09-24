import { useEffect, useState } from 'react'
import MemorialLetter from '@/templates/memorial-message/MemorialLetter'
import { getDesignerToken } from '@/services/designer'
import { resolveMediaUrl } from '@/services/media'
import { Fleuron } from '@/components/book/ornaments'

// Memorial stage D — review. The letter as it will be sent, read once more
// before the book leaves the hands that made it. The handover itself is a
// later chapter; for now the book simply declares it is ready.

export default function ReviewStage({ draft, templateName, onBack }) {
  const lang = draft.language === 'ar' ? 'ar' : 'en'
  const t = (en, ar) => (lang === 'ar' ? ar : en)
  const token = getDesignerToken()
  const [photoUrls, setPhotoUrls] = useState([null, null, null])
  const [audioUrl, setAudioUrl] = useState(null)

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
        <span className="draft-note">{t('awaits the handover of the book', 'بانتظار تسليم الكتاب')}</span>
        <span className="draft-note">{templateName}</span>
        {draft.passwordSet ? <span className="draft-note">{t('the lock is set', 'القفل مثبَّت')}</span> : null}
      </div>

      <div className="stage-actions">
        <button type="button" className="d-btn d-btn--thread" onClick={onBack}>
          ← {t('one more look', 'نظرة أخيرة')}
        </button>
      </div>
    </div>
  )
}