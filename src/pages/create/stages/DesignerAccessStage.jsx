import { useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Fleuron } from '@/components/book/ornaments'
import { formatCountdown } from '@/services/draft'

export default function DesignerAccessStage({ busy, error, cooldown, onAccess, onCooldownEnd }) {
  const [code, setCode] = useState('')
  const [passcode, setPasscode] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [remaining, setRemaining] = useState(null)

  useEffect(() => {
    if (!cooldown?.lockedUntil) {
      setRemaining(null)
      return
    }
    let alive = true
    const tick = () => {
      const ms = Date.parse(cooldown.lockedUntil) - Date.now()
      const next = Math.max(0, Math.ceil(ms / 1000))
      if (alive) setRemaining(next)
      if (next === 0 && alive) onCooldownEnd()
    }
    tick()
    const id = setInterval(tick, 500)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [cooldown, onCooldownEnd])

  const digits = /^\d{0,6}$/
  const complete = /^\d{6}$/
  const canSubmit = complete.test(code) && complete.test(passcode) && !busy

  function handleSubmit(event) {
    event.preventDefault()
    if (!canSubmit) return
    onAccess(code.trim(), passcode.trim())
  }

  if (cooldown && remaining !== null) {
    return (
      <div className="lockup settle" role="status" aria-live="polite">
        <div className="ring">
          <b>{formatCountdown(remaining)}</b>
        </div>
        <h3>The door is resting</h3>
        <p>
          Too many incorrect attempts — the book keeps its secrets carefully. It will open
          again in a moment.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="settle stage-root" aria-label="Enter the book">
      <div className="page-script">the book is open</div>
      <div className="page-kicker" style={{ marginTop: 6 }}>
        chapter the first
      </div>
      <h2 className="page-title">Enter as its designer</h2>
      <p className="page-lead">
        On the day a message is accepted, we hand its maker a six-number code and a
        passcode. This book opens for those alone.
      </p>

      <Fleuron />

      <div className="bk-fields">
        <div className="d-field">
          <label className="d-label" htmlFor="bk-code">
            Designer code <small>the six numbers</small>
          </label>
          <input
            id="bk-code"
            className={`d-input d-input--coded${error ? ' error' : ''}`}
            value={code}
            onChange={(e) => digits.test(e.target.value) && setCode(e.target.value)}
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength="6"
            autoComplete="off"
            placeholder="0 0 0 0 0 0"
            disabled={busy}
            aria-describedby="bk-code-hint"
          />
        </div>

        <div className="d-field">
          <label className="d-label" htmlFor="bk-pass">
            Passcode <small>also six digits</small>
          </label>
          <div className="d-input-wrap">
            <input
              id="bk-pass"
              className={`d-input d-input--coded${error ? ' error' : ''}`}
              value={passcode}
              onChange={(e) => digits.test(e.target.value) && setPasscode(e.target.value)}
              inputMode="numeric"
              type={revealed ? 'text' : 'password'}
              pattern="[0-9]{6}"
              maxLength="6"
              autoComplete="off"
              placeholder="0 0 0 0 0 0"
              disabled={busy}
              aria-describedby="bk-code-hint"
            />
            <button
              type="button"
              className="lock-eye"
              onClick={() => setRevealed((v) => !v)}
              disabled={busy}
              aria-pressed={revealed}
              aria-controls="bk-pass"
              aria-label={revealed ? 'Hide the passcode' : 'Show the passcode'}
              title={revealed ? 'Hide the passcode' : 'Show the passcode'}
            >
              {revealed ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
            </button>
          </div>
        </div>

        <div className="board-feedback">
          {error ? <div className="msg">{error}</div> : <span className="d-hint" id="bk-code-hint">Every attempt is counted; after three, the door rests for a minute.</span>}
        </div>

        <div style={{ textAlign: 'center' }}>
          {busy ? (
            <span className="d-hint" style={{ letterSpacing: '0.22em', textTransform: 'uppercase', fontFamily: 'var(--font-display)', fontSize: '0.72rem' }}>
              opening the book…
            </span>
          ) : (
            <button type="submit" className="d-btn d-btn--ink" disabled={!canSubmit}>
              Enter the book
            </button>
          )}
        </div>
      </div>
    </form>
  )
}