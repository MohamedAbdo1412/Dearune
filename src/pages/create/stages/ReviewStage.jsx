import { useMemo } from 'react'
import MemorialLetter from '@/templates/memorial-message/v1/MemorialLetter'
import { useMemorialMedia } from '@/templates/memorial-message/v1/useMemorialMedia'
import { normalizeExternalUrl } from '@/services/externalLink'
import { validateTemplateDraft } from '@/templates/validate'

import { Fleuron } from '@/components/book/ornaments'

// The close — the book read once more before it leaves the hands that made it.
// Nothing is sent from here: the photograph prints and sound still live only on
// this device, in the dark; the next leaf is the terms, where the seal is
// finally pressed.
//
// A memorial letter is proofed as the letter it is. The external-link paper has
// no letter: its proof is the destination the printed code will open, shown
// exactly as it will be saved.

export default function ReviewStage({ draft, token, templateName, templateSlug, onNext }) {
  const lang = draft.language === 'ar' ? 'ar' : 'en'
  const t = (en, ar) => (lang === 'ar' ? ar : en)
  const { photoUrls, audioUrl } = useMemorialMedia(draft, token)
  const isExternal = templateSlug === 'external-link'
  const destination = isExternal ? normalizeExternalUrl(draft.destinationUrl) : null

  const problems = useMemo(() => validateTemplateDraft(templateSlug, draft, lang), [templateSlug, draft, lang])

  return (
    <div className="settle stage-root">
      <div className="page-script">{t('the close', 'الخاتمة')}</div>
      <div className="page-kicker" style={{ marginTop: 6 }}>
        chapter the seventh
      </div>

      <p className="page-lead" style={{ marginBottom: 8 }}>
        {isExternal
          ? t(
            'This is the page the printed code will open. Nothing more to add — it is ready.',
            'هذه هي الصفحة التي سيفتحها الرمز المطبوع. لا مزيد من الإضافة — إنها جاهزة.'
          )
          : t(
            'This is the letter it will send. Nothing more to add — it is ready.',
            'هكذا ستُرسل الرسالة. لا مزيد من الكلمات — إنها جاهزة.'
          )}
      </p>

      <Fleuron />

      {isExternal ? (
        <div className="link-receipt">
          <span className="d-label">{t('the destination', 'الوجهة')}</span>
          {destination?.ok ? (
            <a className="link-url" href={destination.url} target="_blank" rel="noopener noreferrer" dir="ltr">
              {destination.url}
            </a>
          ) : (
            <span className="link-url link-url--missing">{t('No valid link yet', 'لا رابط صالح بعد')}</span>
          )}
        </div>
      ) : (
        <div className="review-letter">
          <MemorialLetter draft={draft} photoUrls={photoUrls} audio={draft.audio} audioUrl={audioUrl} />
        </div>
      )}

      <div className="review-meta">
        <span className="draft-note">{t('the book closes when you seal it', 'يُغلق الكتاب عند ختمه')}</span>
        <span className="draft-note">{templateName}</span>
        {!isExternal && draft.passwordSet ? <span className="draft-note">{t('the lock is set', 'القفل مثبَّت')}</span> : null}
      </div>

      {problems.length ? (
        <div className="field-note--warn" role="alert" style={{ textAlign: 'center', margin: '8px 0' }}>
          {problems[0]}
        </div>
      ) : null}

      <div className="stage-actions">
        <button type="button" id="mm-to-terms" className="d-btn d-btn--ink" onClick={onNext}>
          {t('to the terms', 'إلى الشروط')} →
        </button>
      </div>
    </div>
  )
}
