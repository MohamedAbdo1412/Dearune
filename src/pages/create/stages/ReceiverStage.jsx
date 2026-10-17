import { useState } from 'react'

export default function ReceiverStage({ initial, onNext }) {
  const [name, setName] = useState(initial ?? '')
  const [alert, setAlert] = useState('')
  const trimmed = name.trim()

  const submit = (event) => {
    event.preventDefault()
    if (trimmed.length < 2) {
      setAlert('A name is needed — two symbols at least.')
      return
    }
    onNext(trimmed)
  }

  return (
    <form onSubmit={submit} className="settle stage-root" aria-label="Who is this book for?">
      <div className="page-script">a name first</div>
      <div className="page-kicker" style={{ marginTop: 6 }}>
        chapter the second
      </div>

      <p className="page-lead">One book, made for a single name.</p>

      <div className="bk-fields">
        <div className="d-field">
          <label className="d-label" htmlFor="bk-receiver">
            The book is for <small>write it as it should read</small>
          </label>
          <input
            id="bk-receiver"
            className="d-input"
            value={name}
            maxLength={80}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
            placeholder="Amélie Dubois"
            aria-describedby="bk-receiver-note"
          />
          <div className="field-note" id="bk-receiver-note">
            It is printed and engraved exactly as you write it here.
          </div>
        </div>
        {alert ? (
          <div className="field-note--warn" role="alert">
            {alert}
          </div>
        ) : null}
      </div>

      <div className="stage-actions">
        <button type="submit" className="d-btn d-btn--ink">
          it is settled →
        </button>
      </div>
    </form>
  )
}