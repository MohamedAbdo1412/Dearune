import { Fleuron } from '@/components/book/ornaments'

// Shown instead of the pipeline once a book has been handed over: the pages
// are no longer available for editing, and the message sleeps in its
// wrappers until its new owner opens it.

export default function StatusBook({ draft, templateName }) {
  const lang = draft.language === 'ar' ? 'ar' : 'en'
  const t = (en, ar) => (lang === 'ar' ? ar : en)
  const submittedAt = draft.meta?.submittedAt ?? draft.submittedAt ?? null

  const when =
    submittedAt && !Number.isNaN(Date.parse(submittedAt))
      ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(submittedAt))
      : null

  return (
    <div className="settle stage-root">
      <div className="page-script">{t('handed over', 'تم التسليم')}</div>
      <div className="page-kicker" style={{ marginTop: 6 }}>
        the final folio
      </div>
      <h2 className="page-title">{t('This book is no longer here.', 'لم يعد هذا الكتاب هنا.')}</h2>

      <Fleuron />

      <div className="page-body">
        <p className="dropcap">
          {t(
            'The book you made has closed. Its pages cannot be turned from this side any more; they now belong to the one who holds it.',
            'أُغلق الكتاب الذي صنعته. لم تعد صفحاته قابلة للقلب من هذا الجانب؛ إنها الآن ملكٌ لمن يحمله.',
          )}
        </p>
        <p style={{ marginTop: '1em' }}>
          {t('Paper', 'الورق')}: <em>{templateName}</em>
          {when ? (
            <>
              <br />
              {t('Closed', 'أُغلق')}: <em>{when}</em>
            </>
          ) : null}
        </p>
      </div>

      <div style={{ marginTop: 'auto', textAlign: 'center' }}>
        <span className="draft-note">{t('a closed book keeps its words', 'الكتاب المقفول يحفظ كلماته')}</span>
      </div>
    </div>
  )
}