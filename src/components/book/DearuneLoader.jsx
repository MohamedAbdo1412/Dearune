export default function DearuneLoader({ label = 'the press is turning…', small = false }) {
  return (
    <div className={`book-loader${small ? ' book-loader--small' : ''}`} role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {label ? <span className="d-hint">{label}</span> : null}
    </div>
  )
}