// A small "printer's proof": a CSS miniature of the real page, drawn from
// the template's print_config. The brand assets for templates do not exist
// yet (no image files), so the archive previews react to the actual line,
// seal, watermark and QR settings instead of screenshots.

function Mini({ template, name = '' }) {
  const cfg = template?.print_config ?? {}
  const seal = cfg.seal?.enabled && cfg.seal?.color
  const watermarkOn = cfg.watermark?.enabled
  const qr = Boolean(cfg.qr)
  const headingPx = Math.max(5, Math.min(9, Math.round((cfg.heading?.fontSize ?? 26) * 0.3)))
  const linePx = Math.max(2, Math.min(4, Math.round((cfg.body?.fontSize ?? 13) * 0.22)))

  return (
    <div
      className="mini"
      role="img"
      aria-label={`Proof of the ${name} paper: ${seal ? 'with a wax seal' : 'plain seal'}, watermark “${watermarkOn ? cfg.watermark?.text ?? 'Dearune' : 'none'}”.`}
    >
      <div className="m-head" style={{ height: `${headingPx}px` }} />
      <div className="m-line" style={{ height: `${linePx}px` }} />
      <div className="m-line" style={{ height: `${linePx}px`, width: '70%' }} />
      <div className="m-line m-line-short" style={{ height: `${linePx}px` }} />
      {seal ? (
        <div className="m-seal" style={sealGradient(seal)} />
      ) : (
        <div className="m-seal m-seal--plain" />
      )}
      {qr && <div className="m-qr" aria-hidden="true" />}
      {watermarkOn && <div className="m-water">{cfg.watermark?.text ?? 'Dearune'}</div>}
    </div>
  )
}

function sealGradient(color) {
  return {
    background: `radial-gradient(circle at 32% 30%, ${lighten(color)}, ${color} 78%)`,
    boxShadow: `0 1px 4px rgba(20, 10, 30, 0.6), inset 0 0 2px rgba(255,255,255,0.15)`,
  }
}

function lighten(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''))
  if (!m) return '#4a3a5c'
  const n = Number.parseInt(m[1], 16)
  const r = Math.min(255, ((n >> 16) & 0xff) + 46)
  const g = Math.min(255, ((n >> 8) & 0xff) + 40)
  const b = Math.min(255, (n & 0xff) + 56)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

export default function TemplateSample({ template, chosen, onPick }) {
  return (
    <button
      type="button"
      className={`t-sample${chosen ? ' is-chosen' : ''}`}
      onClick={() => onPick(template)}
      aria-pressed={Boolean(chosen)}
    >
      <Mini template={template} name={template.name} />
      <span className="meta">
        <h4>{template.name}</h4>
        <p>{template.description || 'Plain words on fine paper.'}</p>
      </span>
    </button>
  )
}