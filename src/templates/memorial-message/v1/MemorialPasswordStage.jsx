import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Fleuron } from '@/components/book/ornaments'
import { playKeyInsert, playKeyTurn } from '@/services/sound'

// Memorial stage C — the lock. A letter sealed so its keeper must turn the
// key. The password itself is never written down anywhere a page could be
// read from later; only the knowledge that a lock exists is kept with the
// draft. When the memorial is delivered, the receiver's own password seals
// the book to the world — this one opens the sending side while it is still
// in the making.

function Key({ turning, set }) {
  return (
    <div className={`antique-key${turning ? ' is-turning' : ''}${set ? ' is-set' : ''}`} aria-hidden="true">
      <span className="key-plate">
        <span className="keyhole" />
        <span className="plate-screws"><i /><i /><i /><i /></span>
      </span>
      <span className="key-body">
        <span className="key-bow">
          <svg width="34" height="34" viewBox="0 0 40 40">
            <path
              d="M20 4 C30 4 36 11 36 20 C36 29 29 36 20 36 C15 36 11 34 8.5 31"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
            <path d="M8.5 31 L5 27.5 L9 25.5 Z" fill="currentColor" />
          </svg>
        </span>
        <span className="key-stem" />
      </span>
    </div>
  )
}

function KeyField({ id, label, placeholder, hintId, value, onChange, revealed, onReveal, showText, hideText, disabled }) {
  return (
    <label className="lock-field" htmlFor={id}>
      <span className="lock-label">{label}</span>
      <span className="lock-well">
        <input
          id={id}
          type={revealed ? 'text' : 'password'}
          dir="ltr"
          autoComplete="new-password"
          spellCheck="false"
          value={value}
          maxLength={64}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-describedby={hintId}
          disabled={disabled}
        />
        <button
          type="button"
          className="lock-eye"
          onClick={onReveal}
          disabled={disabled}
          aria-pressed={revealed}
          aria-controls={id}
          aria-label={revealed ? hideText : showText}
          title={revealed ? hideText : showText}
        >
          {revealed ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
        </button>
      </span>
    </label>
  )
}

export default function MemorialPasswordStage({ draft, onSet, onNext }) {
  const lang = draft.language === 'ar' ? 'ar' : 'en'
  const t = (en, ar) => (lang === 'ar' ? ar : en)
  const [first, setFirst] = useState('')
  const [second, setSecond] = useState('')
  const [revealFirst, setRevealFirst] = useState(false)
  const [revealSecond, setRevealSecond] = useState(false)
  const [turning, setTurning] = useState(false)
  const [alert, setAlert] = useState('')

  const alreadySet = !!draft.passwordSet && !turning
  const hintId = 'memorial-lock-hint'

  const seal = () => {
    setAlert('')
    if (!first) {
      setAlert(t('Choose a password', 'اختر كلمة سر'))
      return
    }
    if (first.length < 4) {
      setAlert(t('Four symbols at least, like an old safe', 'أربعة أحرف على الأقل'))
      return
    }
    if (first !== second) {
      setAlert(t('The two turns of the lock do not match', 'التأكيد غير مطابق'))
      return
    }
    playKeyInsert()
    setTurning(true)
    setTimeout(() => {
      playKeyTurn()
      setTimeout(() => {
        onSet(first)
        onNext()
      }, 320)
    }, 420)
  }

  return (
    <div className="settle stage-root">
      <div className="page-script">{t('the lock', 'القفل')}</div>
      <div className="page-kicker" style={{ marginTop: 6 }}>
        chapter the seventh
      </div>

      <Fleuron />

      <div className="lock-stage">
        <Key turning={turning} set={alreadySet} />
        <p className="lock-copy">
          {alreadySet
            ? t(
                'The lock is already in place. You may turn a new lock — the old one is forgotten with it.',
                'القفل موضعٌ بالفعل. يمكنك تغييره وسيُنسى القديم.',
              )
            : t(
                'This letter travels sealed. Whoever opens the book must meet it with the right password.',
                'تُسافر هذه الرسالة مقفلة، ومَن يفتح الكتاب لا بدّ أن يأتي بكلمة السر الصحيحة.',
              )}
        </p>

        <div className="lock-fields">
          <KeyField
            id="memorial-lock-first"
            label={t('password', 'كلمة السر')}
            placeholder={t('four characters or more', 'أربعة أحرف فأكثر')}
            hintId={hintId}
            value={first}
            onChange={setFirst}
            revealed={revealFirst}
            onReveal={() => setRevealFirst((v) => !v)}
            showText={t('Show the password', 'إظهار كلمة السر')}
            hideText={t('Hide the password', 'إخفاء كلمة السر')}
            disabled={turning}
          />
          <KeyField
            id="memorial-lock-second"
            label={t('repeat the password', 'أعدي كلمة السر')}
            placeholder={t('type it once more', 'اكتبيها مرة أخرى')}
            hintId={hintId}
            value={second}
            onChange={setSecond}
            revealed={revealSecond}
            onReveal={() => setRevealSecond((v) => !v)}
            showText={t('Show it once more', 'إظهارها مرة أخرى')}
            hideText={t('Hide it once more', 'إخفاؤها مرة أخرى')}
            disabled={turning}
          />
        </div>

        <div className="lock-hint" id={hintId}>
          {t(
            'Four characters or more. You will need it to open this side of the book.',
            'أربعة أحرف فأكثر. ستحتاجينها لفتح هذا الجانب من الكتاب.',
          )}
        </div>

        {alert ? (
          <div className="field-note--warn" role="alert">
            {alert}
          </div>
        ) : null}
      </div>

      <div className="stage-actions">
        <button type="button" className="d-btn d-btn--ink" onClick={seal} disabled={turning}>
          {t('seal the letter', 'أقفل الرسالة')} →
        </button>
      </div>
    </div>
  )
}
