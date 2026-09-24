import { useMemo } from 'react'
import MemorialLetter from '@/templates/memorial-message/MemorialLetter'
import { useMemorialMedia } from '@/templates/memorial-message/useMemorialMedia'
import { Fleuron } from '@/components/book/ornaments'

// A single handed-over book, read-only. The letter is served from the
// project's server-side payload and its media resolve through the designer's
// own namespace — the same designer-media path used while writing, so a
// closed book still reads the way it was made.

function projectDraft(project) {
  const payload = project?.payload && typeof project.payload === 'object' ? project.payload : {}
  const photos = Array.isArray(payload.photos) ? [...payload.photos] : [null, null, null]
  while (photos.length < 3) photos.push(null)
  return {
    ...payload,
    language: payload.language === 'ar' ? 'ar' : 'en',
    greeting: typeof payload.greeting === 'string' ? payload.greeting : '',
    body: typeof payload.body === 'string' ? payload.body : '',
    closing: typeof payload.closing === 'string' ? payload.closing : '',
    senderName: typeof payload.senderName === 'string' ? payload.senderName : '',
    photos: photos.slice(0, 3),
    audio: payload.audio && typeof payload.audio === 'object' ? payload.audio : null,
  }
}

export default function ProjectSheet({ project, token, templates }) {
  const draft = useMemo(() => projectDraft(project), [project])
  const { photoUrls, audioUrl } = useMemorialMedia(draft, token)
  const lang = draft.language === 'ar' ? 'ar' : 'en'
  const t = (en, ar) => (lang === 'ar' ? ar : en)

  const closedAt = project?.submitted_at && !Number.isNaN(Date.parse(project.submitted_at))
    ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(project.submitted_at))
    : null
  const paper = (templates ?? []).find((p) => p.slug === project?.template_slug)?.name ?? project?.template_slug ?? ''

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
        <span className="draft-note">{paper || t('chosen paper', 'الورق المختار')}</span>
        {closedAt ? <span className="draft-note">{t('closed', 'أُغلق')} · {closedAt}</span> : null}
        <span className="draft-note">receipt · {project?.public_id ?? ''}</span>
      </div>
    </div>
  )
}