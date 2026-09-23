export default function DearuneLoader({ label = 'the press is turning…' }) {
  return (
    <div className="book-loader" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span className="d-hint">{label}</span>
    </div>
  )
}