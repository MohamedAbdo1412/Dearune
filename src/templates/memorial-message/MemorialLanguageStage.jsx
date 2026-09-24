import { Fleuron } from '@/components/book/ornaments'

// Memorial stage A — choose the language. Two typographic cards; nothing else.

const OPTIONS = [
  { code: 'en', name: 'English', script: 'the letter opens left to right', sample: 'Aa Ee Gg' },
  { code: 'ar', name: 'العربية', script: 'تفتح الرسالة من اليمين', sample: 'أ ب ت ث' },
]

export default function MemorialLanguageStage({ value, onSelect }) {
  return (
    <div className="settle stage-root">
      <div className="page-script">a first choice</div>
      <div className="page-kicker" style={{ marginTop: 6 }}>chapter the fourth</div>
      <h2 className="page-title">In which tongue?</h2>

      <Fleuron />

      <div className="lang-row" role="group" aria-label="Language">
        {OPTIONS.map((opt) => {
          const chosen = value === opt.code
          const ar = opt.code === 'ar'
          return (
            <button
              key={opt.code}
              type="button"
              className={`lang-card${chosen ? ' is-chosen' : ''}`}
              aria-pressed={chosen}
              onClick={() => onSelect(opt.code)}
            >
              <span className={`lang-name${ar ? ' is-ar' : ''}`}>{opt.name}</span>
              <span className="lang-sample" aria-hidden="true">{opt.sample}</span>
              <span className="lang-script">{opt.script}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}