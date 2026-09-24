import { useMemo } from 'react'
import MemorialLetter from '@/templates/memorial-message/MemorialLetter'
import { useMemorialMedia } from '@/templates/memorial-message/useMemorialMedia'
import { Fleuron } from '@/components/book/ornaments'

function validateMemorial(draft, lang) {
  const t = (en, ar) => (lang === 'ar' ? ar : en)
  const errors = []
  const body = draft.body ? draft.body.replace(/\s+/g, '') : ''
  if (!body) errors.push(t('The words are not written yet', 'الكلمات لم تُكتب بعد'))
  if (!draft.senderName || !draft.senderName.trim()) errors.push(t('A name is missing', 'الاسم ناقص'))
  return errors
}

// Memorial stage D — review. The letter as it will be sent, read once more
// before the book leaves the hands that made it. Nothing is sent from here
// anymore: the photograph prints and sound still live only on this device, in
// the dark. The next leaf is the terms, where the seal is finally pressed.
//
// The proof below is rendered from the same MemorialLetter as the desk-side
// proof, fed through useMemorialMedia so local (IndexedDB) media is decrypted
// and shown just as it is — never re-uploaded, never touched by the network.

export default function ReviewStage({ draft, token, templateName, onBack, onNext }) {
  const lang = draft.language === 'ar' ? 'ar' : 'en'
  const t = (en, ar) => (lang === 'ar' ? ar : en)
  const { photoUrls, audioUrl } = useMemorialMedia(draft, token)

  const problems = useMemo(() => validateMemorial(draft, lang), [draft, lang])

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
        <MemorialLetter draft={draft} photoUrls={photoUrls} audio={draft.audio} audioUrl={audioUrl} />
      </div>

      <div className="review-meta">
        <span className="draft-note">{t('the book closes when you seal it', 'يُغلق الكتاب عند ختمه')}</span>
        <span className="draft-note">{templateName}</span>
        {draft.passwordSet ? <span className="draft-note">{t('the lock is set', 'القفل مثبَّت')}</span> : null}
      </div>

      {problems.length ? (
        <div className="field-note--warn" role="alert" style={{ textAlign: 'center', margin: '8px 0' }}>
          {problems[0]}
        </div>
      ) : null}

      <div className="stage-actions">
        <button type="button" className="d-btn d-btn--thread" onClick={onBack}>
          ← {t('one more look', 'نظرة أخيرة')}
        </button>
        <button type="button" id="mm-to-terms" className="d-btn d-btn--ink" onClick={onNext}>
          {t('to the terms', 'إلى الشروط')} →
        </button>
      </div>
    </div>
  )
}