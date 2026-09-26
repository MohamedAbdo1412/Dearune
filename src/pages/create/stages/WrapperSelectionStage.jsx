import { useEffect, useMemo, useState } from 'react'
import { Fleuron } from '@/components/book/ornaments'
import DearuneLoader from '@/components/book/DearuneLoader'
import { getDesignerToken } from '@/services/designer'
import { formatMoney } from '@/services/format'
import { resolveWrapperPhotoUrl, resolveWrapperPrice, wrapperLabel, wrapperDescription } from '@/services/wrappers'

// Memorial stage — the arrival. The wrapper the letter travels in, chosen
// between writing the words and locking them. Every card's name, description,
// photo and price comes from the catalog the server offered for THIS paper
// (`wrappers` already filtered to enabled options); nothing is hardcoded.

export default function WrapperSelectionStage({ template = null, wrappers = null, value, onChange, onNext, language = 'en' }) {
  const lang = language === 'ar' ? 'ar' : 'en'
  const t = (en, ar) => (lang === 'ar' ? ar : en)
  const token = useMemo(() => getDesignerToken(), [])
  const [photos, setPhotos] = useState({})

  const list = Array.isArray(wrappers) ? wrappers : null
  const loading = wrappers == null

  // A paper that offers exactly one way of sending leaves no real choice;
  // it is chosen the moment the page opens.
  useEffect(() => {
    if (list && list.length === 1 && value !== list[0].key) onChange(list[0].key)
  }, [list, value, onChange])

  useEffect(() => {
    let alive = true
    const withPhotos = (list ?? []).filter((w) => w.image_url)
    if (!withPhotos.length || !token) return undefined
    Promise.all(withPhotos.map(async (w) => [w.key, await resolveWrapperPhotoUrl(w.image_url, token)]))
      .then((entries) => {
        if (alive) setPhotos(Object.fromEntries(entries.filter(([, url]) => url)))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [list, token])

  return (
    <div className="settle stage-root">
      <div className="page-script">{t('how it arrives', 'كيف يصل')}</div>
      <div className="page-kicker" style={{ marginTop: 6 }}>
        chapter the sixth
      </div>
      <h2 className="page-title">{t('In which wrapper?', 'بأي تغليف؟')}</h2>

      <Fleuron />

      {loading ? (
        <div className="wrap-loading">
          <DearuneLoader size="sm" />
          <span>{t('laying out the wrappers…', 'جارٍ ترتيب التغليف…')}</span>
        </div>
      ) : list.length === 0 ? (
        <p className="wrap-empty">
          {t(
            'This paper is carried exactly as written — the studio hands it over in its own way.',
            'تُسلَّم هذه الورقة كما كُتبت — يسلّمها الاستوديو بطريقته الخاصة.'
          )}
        </p>
      ) : (
        <div
          className="wrap-row"
          role="group"
          aria-label={t('Wrapper', 'التغليف')}
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
        >
          {list.map((w) => {
            const chosen = value === w.key
            const { price } = resolveWrapperPrice({ template, wrapper: w, templateWrapperOption: w.option ?? null })
            return (
              <button
                key={w.key}
                type="button"
                className={`wrap-card${chosen ? ' is-chosen' : ''}`}
                aria-pressed={chosen}
                onClick={() => onChange(w.key)}
              >
                <span className="wrap-photo" aria-hidden="true">
                  {photos[w.key] ? (
                    <img src={photos[w.key]} alt="" loading="lazy" />
                  ) : (
                    <span className="wrap-photo-mark">❦</span>
                  )}
                </span>
                <span className="wrap-body">
                  <span className="wrap-name">{wrapperLabel(w, lang)}</span>
                  <span className="wrap-desc">{wrapperDescription(w, lang)}</span>
                </span>
                <span className="wrap-price">{formatMoney(price)}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="stage-actions">
        <button
          type="button"
          className="d-btn d-btn--ink"
          onClick={onNext}
          disabled={loading || (list.length > 0 && !value)}
        >
          {t('to the lock', 'إلى القفل')} →
        </button>
      </div>
    </div>
  )
}
