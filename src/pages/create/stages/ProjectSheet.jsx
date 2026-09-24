import { useMemo } from 'react'
import MemorialLetter from '@/templates/memorial-message/MemorialLetter'
import { useMemorialMedia } from '@/templates/memorial-message/useMemorialMedia'
import { Fleuron } from '@/components/book/ornaments'
import { parseProjectPayload } from '@/services/projectPayload'

// A single handed-over book, read-only. The letter is served from the
// project's server-side payload and its media resolve through the designer's
// own namespace — the same designer-media path used while writing, so a
// closed book still reads the way it was made.
//
// The payload is the design: nothing here may substitute a sample when a
// project cannot be read. A missing or malformed payload shows an honest
// "could not be read" state instead of fabricating words.

const NULL_MEDIA_DRAFT = { photos: [null, null, null], audio: null }

export default function ProjectSheet({ project, token, templates, onBack }) {
  const draft = useMemo(() => parseProjectPayload(project?.payload), [project])
  // The media hook must always run; when there is no letter there is nothing
  // to resolve, so it only sees an empty frame.
  const { photoUrls, audioUrl } = useMemorialMedia(draft ?? NULL_MEDIA_DRAFT, token)
  const lang = draft?.language === 'ar' ? 'ar' : 'en'
  const t = (en, ar) => (lang === 'ar' ? ar : en)

  const closedAt = project?.submitted_at && !Number.isNaN(Date.parse(project.submitted_at))
    ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(project.submitted_at))
    : null
  const paper = (templates ?? []).find((p) => p.slug === project?.template_slug)?.name ?? project?.template_slug ?? ''
  const paperVersion = project?.template_version ? `v${project.template_version}` : ''

  const active = Boolean(project?.message_active)
  const expires = project?.expires_at && !Number.isNaN(Date.parse(project.expires_at)) ? Date.parse(project.expires_at) : null
  const gone = active && expires ? expires < Date.now() - 86400000 : false
  const readsUntil = expires
    ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en-GB', { dateStyle: 'medium' }).format(new Date(expires))
    : null

  if (!draft) {
    return (
      <div className="settle stage-root">
        <div className="page-script">the book</div>
        <div className="page-kicker" style={{ marginTop: 6 }}>
          {t('pages unreadable', 'صفحات غير قابلة للقراءة')}
        </div>

        <Fleuron />

        <div className="page-body" style={{ textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
          <p>
            {t('We couldn\'t load this Dearune.', 'تعذّر تحميل هذه الرسالة الديرونية.')}
          </p>
          <p style={{ marginTop: '1em' }} className="draft-note">
            {t('Its words were not stored with the record. The book stays on the shelf, but it cannot be reprinted.', 'لم تُحفظ كلماتها مع السجل. يبقى الكتاب على الرف، لكن لا يمكن إعادة طبعه.')}
          </p>
        </div>

        {onBack ? (
          <div className="stage-actions">
            <button type="button" className="d-btn d-btn--thread" onClick={onBack}>
              ← {t('back to the shelf', 'العودة إلى الرف')}
            </button>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="settle stage-root">
      <div className="page-script">{t('handed over', 'تم التسليم')}</div>
      <div className="page-kicker" style={{ marginTop: 6 }}>
        the final folio
      </div>

      <Fleuron />

      <div className="review-letter">
        <MemorialLetter draft={draft} photoUrls={photoUrls} audio={draft.audio} audioUrl={audioUrl} />
      </div>

      <div className="review-meta">
        <span className="draft-note">{paper || t('chosen paper', 'الورق المختار')}{paperVersion ? ` · ${paperVersion}` : ''}</span>
        {closedAt ? <span className="draft-note">{t('closed', 'أُغلق')} · {closedAt}</span> : null}
        <span className="draft-note">receipt · {project?.public_id ?? ''}</span>
      </div>
      <div className="review-meta" style={{ marginTop: 2 }}>
        {active ? (
          <span className={`project-state ${gone ? 'is-expired' : ''}`}>
            {gone ? t('the reading has ended', 'انتهت فترة القراءة') : readsUntil ? t('reads until', 'تقرأ حتى') + ' · ' + readsUntil : t('reading now', 'تُقرأ الآن')}
          </span>
        ) : (
          <span className="project-state">{t('sealed · not yet opened', 'مختومة · لم تُفتح بعد')}</span>
        )}
        {project?.policy_version ? <span className="draft-note">terms · {project.policy_version}</span> : null}
      </div>
    </div>
  )
}