import { useState } from 'react'
import DearuneLoader from '@/components/book/DearuneLoader'
import { Fleuron } from '@/components/book/ornaments'
import { DEARUNE_POLICY, DEARUNE_POLICY_VERSION } from '@/policies/dearunePolicy'
import { validateMemorial } from '@/templates/memorial-message/MemorialEditorStage'

// The last spread of the pipeline. The letter is set and reviewed; this page
// is where the designer reads the terms and — only after freely accepting the
// CURRECT version — seals the book. Acceptance travels with the submission:
// the server stores the exact policy_version + acceptance time the moment the
// hand falls on the seal, so a later revision of the terms never rewrites what
// this book agreed to.
//
// The submit itself (media uploads + designer-projects) is slow and may fail
// mid-way; it is designed to be retried without duplicating anything, and this
// page owns the busy/error states around it.

export default function PoliciesStage({ draft, templateName, receiverName, onSubmit }) {
  const lang = draft.language === 'ar' ? 'ar' : 'en'
  const t = (en, ar) => (lang === 'ar' ? ar : en)
  const [accepted, setAccepted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const problems = validateMemorial(draft, lang)

  const handleSubmit = async () => {
    if (!accepted) return
    if (problems.length) {
      setError(problems[0])
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await onSubmit()
    } catch (cause) {
      setError(cause?.message || t('The book could not be submitted', 'تعذّر إرسال الكتاب'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="settle stage-root">
      <div className="page-script">{t('the terms', 'الشروط')}</div>
      <div className="page-kicker" style={{ marginTop: 6 }}>
        chapter the eighth
      </div>

      <p className="page-lead" style={{ marginBottom: 8 }}>
        {t('One last page before the seal. These are the words this book is bound by.', 'صفحة أخيرة قبل الختم. هذه هي الكلمات التي يُقيَّد بها هذا الكتاب.')}
      </p>

      <Fleuron />

      <div className="policy-list">
        {DEARUNE_POLICY.points.map((point) => (
          <div className="policy-point" key={point.id}>
            <h4 className="policy-title">{point.title}</h4>
            <p className="policy-body">{point.body}</p>
          </div>
        ))}
      </div>

      <div className="policy-foot">
        <span className="draft-note">
          {t('version', 'الإصدار')} · {DEARUNE_POLICY_VERSION}
        </span>
        {receiverName ? (
          <span className="draft-note">
            {t('for', 'لـِ')} {receiverName} · {templateName || ''}
          </span>
        ) : null}
      </div>

      <label className={`policy-accept${accepted ? ' is-on' : ''}`}>
        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} disabled={submitting} />
        <span>
          {t('I accept these terms as written, on behalf of the book and its reader.', 'أقبل هذه الشروط كما وردت، نيابةً عن الكتاب وقارئه.')}
        </span>
      </label>

      {problems.length && accepted ? (
        <div className="field-note--warn" role="alert" style={{ textAlign: 'center', margin: '6px 0 0' }}>
          {problems[0]}
        </div>
      ) : null}
      {error ? (
        <div className="field-note--warn" role="alert" style={{ textAlign: 'center', margin: '6px 0 0' }}>
          {error}
        </div>
      ) : null}

      <div className="stage-actions">
        <button type="button" id="mm-submit" className="d-btn d-btn--ink" onClick={handleSubmit} disabled={!accepted || problems.length > 0 || submitting}>
          {submitting ? <DearuneLoader size="sm" label={t('submitting', 'يُرسل')} /> : t('submit book', 'أرسل الكتاب')}
        </button>
      </div>
      {!accepted ? (
        <p className="draft-note" style={{ textAlign: 'center', marginTop: 6 }}>
          {t('the seal stays dry until the terms are ticked', 'يظل الختم جافاً حتى تحديد الشروط')}
        </p>
      ) : null}
    </div>
  )
}