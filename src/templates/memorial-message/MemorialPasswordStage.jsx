import { useState } from 'react'
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

export default function MemorialPasswordStage({ draft, onSet, onNext }) {
  const lang = draft.language === 'ar' ? 'ar' : 'en'
  const t = (en, ar) => (lang === 'ar' ? ar : en)
  const [first, setFirst] = useState('')
  const [second, setSecond] = useState('')
  const [turning, setTurning] = useState(false)
  const [alert, setAlert] = useState('')

  const alreadySet = !!draft.passwordSet && !turning

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
          <label className="lock-field">
            <span className="lock-label">{t('password', 'كلمة السر')}</span>
            <input
              type="password"
              dir="ltr"
              autoComplete="off"
              value={first}
              maxLength={64}
              onChange={(e) => setFirst(e.target.value)}
              placeholder="· · · ·"
            />
          </label>
          <label className="lock-field">
            <span className="lock-label">{t('turn it again', 'أعدها مرة أخرى')}</span>
            <input
              type="password"
              dir="ltr"
              autoComplete="off"
              value={second}
              maxLength={64}
              onChange={(e) => setSecond(e.target.value)}
              placeholder="· · · ·"
            />
          </label>
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