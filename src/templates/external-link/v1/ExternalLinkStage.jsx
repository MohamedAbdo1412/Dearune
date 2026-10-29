import { useId, useState } from 'react'
import { Fleuron } from '@/components/book/ornaments'
import { normalizeExternalUrl, externalUrlMessage } from '@/services/externalLink'

// External Link stage A — the destination. One field, nothing else: this paper
// has no words, prints, sound or lock. What the designer types here becomes the
// page the printed code opens, so the format rules are strict and the error is
// shown inline rather than after the page turns.
//
// The value lives in the encrypted draft like every other template field
// (`onChange` is CreateBook's debounced write-through), so it survives a
// refresh, a back turn and a resume from the shelf.

export default function ExternalLinkStage({ draft, onChange, onNext }) {
  const lang = draft.language === 'ar' ? 'ar' : 'en'
  const t = (en, ar) => (lang === 'ar' ? ar : en)
  const inputId = useId()
  const hintId = `${inputId}-hint`

  const value = typeof draft.destinationUrl === 'string' ? draft.destinationUrl : ''
  const [touched, setTouched] = useState(Boolean(value))
  const check = normalizeExternalUrl(value)
  const error = touched && !check.ok ? externalUrlMessage(check.reason, lang) : ''

  // Fold the trimmed/normalised URL into the draft before turning the page, so
  // what the next stage checks is exactly what will be stored.
  const commit = () => {
    if (check.ok && check.url !== value) onChange('destinationUrl', check.url)
  }

  const goNext = () => {
    setTouched(true)
    if (!check.ok) return
    commit()
    onNext?.()
  }

  return (
    <div className="settle stage-root is-editing-page">
      <div className="page-script">{t('the destination', 'الوجهة')}</div>
      <div className="page-kicker" style={{ marginTop: 6 }}>
        chapter the fourth
      </div>
      <h2 className="page-title">{t('Where should the code lead?', 'إلى أين يقود الرمز؟')}</h2>

      <p className="page-lead">
        {t(
          'Enter the link you want your QR code to open. When someone scans your QR code, they will be redirected to this page.',
          'أدخل الرابط الذي تريد أن يفتحه رمز الاستجابة. حين يمسح أحدهم رمزك، سيُحوَّل إلى هذه الصفحة.'
        )}
      </p>

      <Fleuron />

      <div className="bk-fields">
        <div className="d-field">
          <label className="d-label" htmlFor={inputId}>
            {t('Destination link', 'رابط الوجهة')} <small>https://…</small>
          </label>
          <input
            id={inputId}
            className={`d-input${error ? ' error' : ''}`}
            type="url"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            dir="ltr"
            value={value}
            placeholder="https://example.com/my-page"
            aria-describedby={hintId}
            aria-invalid={error ? 'true' : 'false'}
            onChange={(event) => {
              onChange('destinationUrl', event.target.value)
            }}
            onBlur={() => {
              setTouched(true)
              commit()
            }}
          />
        </div>

        <div className="board-feedback" aria-live="polite">
          {error ? (
            <div className="msg" id={hintId} role="alert">
              {error}
            </div>
          ) : (
            <span className="d-hint" id={hintId}>
              {t(
                'A full address, beginning with http:// or https://. Nothing else is printed.',
                'عنوان كامل يبدأ بـ http:// أو https://. لا يُطبع سواه.'
              )}
            </span>
          )}
        </div>
      </div>

      <div className="stage-actions">
        <button type="button" id="el-continue" className="d-btn d-btn--ink" onClick={goNext}>
          {t('check the link', 'تحقّق من الرابط')} →
        </button>
      </div>
    </div>
  )
}
