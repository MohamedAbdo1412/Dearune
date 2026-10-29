import { useCallback, useEffect, useMemo, useState } from 'react'
import { Fleuron } from '@/components/book/ornaments'
import DearuneLoader from '@/components/book/DearuneLoader'
import { getDesignerToken } from '@/services/designer'
import { normalizeExternalUrl, checkExternalLink, externalUrlMessage } from '@/services/externalLink'

// External Link stage B — the proof. The destination is asked about ONCE from
// our server (never from the browser: that would leak the reader's network and
// hit CORS walls), and the answer is shown plainly:
//
//   reachable?   did anything answer, and with what status;
//   embeddable?  what the destination's OWN X-Frame-Options / CSP say.
//
// A server "no" is never presented as "the page is broken": sign-in walls, bot
// filters and JavaScript-only pages look unreachable from a server while
// opening perfectly on a phone. And a page that answers 200 is not proof it
// renders — that is why the note under the frame says so.
//
// The frame is only attempted when the destination allows it. We never try to
// defeat `frame-ancestors` / `X-Frame-Options`; when the site says no, the
// stage explains it and offers a new tab with rel="noopener noreferrer".

const REASON_COPY = {
  empty: {
    en: 'There is no destination yet. Go back and enter the link first.',
    ar: 'لا توجد وجهة بعد. عُد وأدخل الرابط أولًا.',
  },
  malformed: {
    en: 'This does not look like a full web address.',
    ar: 'لا يبدو هذا عنواناً كاملاً.',
  },
  scheme: {
    en: 'Only http:// and https:// links can be printed.',
    ar: 'تُقبل روابط http:// و https:// فقط.',
  },
  credentials: {
    en: 'A link with a username or password inside it cannot be printed.',
    ar: 'لا يمكن طباعة رابط يحمل اسم مستخدم أو كلمة مرور داخله.',
  },
  'blocked-host': {
    en: 'This address is private or internal, so a printed code could never reach it.',
    ar: 'هذا العنوان خاص أو داخلي، ولن يستطيع رمز مطبوع الوصول إليه.',
  },
  'too-long': {
    en: 'That link is too long to be printed.',
    ar: 'هذا الرابط طويل جداً لِيُطبع.',
  },
  timeout: {
    en: 'The page took too long to answer. Some sites are slow, or refuse automated visitors — it may still open on a phone.',
    ar: 'تأخّرت الصفحة في الرد. بعض المواقع بطيئة أو ترفض الزيارات الآلية — وقد تُفتح على الهاتف.',
  },
  unreachable: {
    en: 'We could not reach this page from our server just now. Some sites refuse automated checks — it may still open on a phone.',
    ar: 'تعذّر الوصول إلى هذه الصفحة من خادمنا الآن. بعض المواقع ترفض الفحص الآلي — وقد تُفتح على الهاتف.',
  },
  'too-many-redirects': {
    en: 'This address redirects too many times to be checked safely.',
    ar: 'هذا العنوان يعيد التوجيه مرات كثيرة لِيُفحص بأمان.',
  },
}

function reasonText(reason, lang, fallback) {
  const entry = REASON_COPY[reason]
  if (entry) return lang === 'ar' ? entry.ar : entry.en
  return fallback
}

export default function ExternalLinkPreviewStage({ draft, onNext, onBack }) {
  const lang = draft.language === 'ar' ? 'ar' : 'en'
  const t = (en, ar) => (lang === 'ar' ? ar : en)
  const token = useMemo(() => getDesignerToken(), [])

  const target = normalizeExternalUrl(draft.destinationUrl)
  const url = target.ok ? target.url : ''
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({ phase: 'checking', result: null, message: '' })

  useEffect(() => {
    if (!url) {
      setState({ phase: 'invalid', result: null, message: '' })
      return undefined
    }
    let alive = true
    setState({ phase: 'checking', result: null, message: '' })
    const failedText = lang === 'ar' ? 'تعذّر فحص الرابط' : 'The link could not be checked'
    checkExternalLink(url, token)
      .then((result) => {
        if (alive) setState({ phase: 'done', result: result ?? {}, message: '' })
      })
      .catch((cause) => {
        if (alive) {
          setState({
            phase: 'failed',
            result: null,
            message: cause?.message || failedText,
          })
        }
      })
    return () => {
      alive = false
    }
  }, [url, token, attempt, lang])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  const result = state.result
  const embeddable = result?.embeddable ?? 'unknown'
  const reachable = Boolean(result?.reachable)
  const status = typeof result?.status === 'number' ? result.status : null
  const blockedStatus = reachable && status != null && status >= 400
  // A page served over https cannot frame an http destination (mixed content),
  // so that combination is explained instead of drawing an empty box.
  const pageIsHttps = typeof window !== 'undefined' && window.location.protocol === 'https:'
  const insecureTarget = pageIsHttps && url.startsWith('http:')
  const showFrame = Boolean(url) && state.phase === 'done' && embeddable !== 'no' && !insecureTarget
  const openInTab = target.ok ? url : ''

  return (
    <div className="settle stage-root">
      <div className="page-script">{t('the page it opens', 'الصفحة التي تُفتح')}</div>
      <div className="page-kicker" style={{ marginTop: 6 }}>
        chapter the fifth
      </div>
      <h2 className="page-title">{t('Check the destination', 'تحقّق من الوجهة')}</h2>

      <p className="page-lead">
        {t(
          'This is the page the printed code will open. Look it over before the book is sealed.',
          'هذه هي الصفحة التي سيفتحها الرمز المطبوع. راجعها قبل ختم الكتاب.'
        )}
      </p>

      <Fleuron />

      <div className="link-destination">
        <span className="d-label">{t('the link', 'الرابط')}</span>
        {target.ok ? (
          <a className="link-url" href={url} target="_blank" rel="noopener noreferrer" dir="ltr">
            {url}
          </a>
        ) : (
          <span className="link-url link-url--missing">
            {externalUrlMessage(target.reason, lang)}
          </span>
        )}
      </div>

      {state.phase === 'checking' ? (
        <div className="link-checking" role="status" aria-live="polite">
          <DearuneLoader size="sm" label="" />
          <span>{t('Checking your destination link…', 'جارٍ فحص رابط الوجهة…')}</span>
        </div>
      ) : null}

      {state.phase === 'failed' ? (
        <div className="link-verdict" role="alert">
          <p>{state.message}</p>
          <button type="button" className="d-btn d-btn--thread" onClick={retry}>
            {t('try again', 'حاول مجدداً')}
          </button>
        </div>
      ) : null}

      {state.phase === 'done' ? (
        <div className="link-verdict" role="status" aria-live="polite">
          {reachable && !blockedStatus ? (
            <p>
              {t(
                `The page answered (HTTP ${status}).`,
                `أجابت الصفحة (HTTP ${status}).`
              )}
            </p>
          ) : blockedStatus ? (
            <p>
              {t(
                `The page answered with HTTP ${status}. Many sites refuse automated visitors while still opening normally in a browser.`,
                `أجابت الصفحة بالرمز ${status}. كثير من المواقع ترفض الزائر الآلي وتُفتح عادةً في المتصفح.`
              )}
            </p>
          ) : (
            <p>{reasonText(result?.reason, lang, t('The page did not answer.', 'لم تُجب الصفحة.'))}</p>
          )}

          {result?.redirected && result?.finalUrl && result.finalUrl !== url ? (
            <p className="field-note">
              {t('It redirects to', 'تُعيد التوجيه إلى')}{' '}
              <a href={result.finalUrl} target="_blank" rel="noopener noreferrer" dir="ltr">
                {result.finalUrl}
              </a>
            </p>
          ) : null}

          <p className="field-note">
            {t(
              'A reachable page is not a promise of what a visitor will see — sign-in walls and scripts can change that.',
              'وصول الصفحة لا يضمن ما سيراه الزائر — جدران تسجيل الدخول والسكربتات قد تغيّر ذلك.'
            )}
          </p>

          <button type="button" className="d-btn d-btn--thread" onClick={retry}>
            {t('check again', 'افحص مجدداً')}
          </button>
        </div>
      ) : null}

      {showFrame ? (
        <div className="link-preview">
          <iframe
            key={`${url}-${attempt}`}
            className="link-frame"
            src={url}
            title={t('Preview of the destination page', 'معاينة صفحة الوجهة')}
            referrerPolicy="no-referrer"
            loading="lazy"
          />
          <p className="field-note">
            {embeddable === 'yes'
              ? t('The site allows embedded previews.', 'يسمح الموقع بالمعاينة المضمّنة.')
              : t(
                'We could not tell whether this site allows embedded previews. If the frame stays empty, open it in a new tab.',
                'تعذّر التأكد من سماح الموقع بالمعاينة المضمّنة. إن بقي الإطار فارغاً، افتحه في تبويب جديد.'
              )}
          </p>
        </div>
      ) : null}

      {state.phase === 'done' && embeddable === 'no' ? (
        <div className="link-blocked" role="status">
          <p>
            {t(
              'This website does not allow its pages to be shown inside another site, so there is no embedded preview here. That is the site’s own protection — it is not a problem with your link.',
              'هذا الموقع لا يسمح بعرض صفحاته داخل موقع آخر، لذلك لا معاينة مضمّنة هنا. هذه حماية الموقع نفسه — وليست مشكلة في رابطك.'
            )}
          </p>
        </div>
      ) : null}

      {state.phase === 'done' && insecureTarget ? (
        <div className="link-blocked" role="status">
          <p>
            {t(
              'This link begins with http://, so a secure page is not allowed to frame it. The address can still open normally in a browser tab — most sites offer an https:// address, which is worth using on a printed code.',
              'يبدأ هذا الرابط بـ http://، ولا يُسمح لصفحة آمنة بتضمينه. يمكن فتح العنوان عادةً في تبويب متصفح — ومعظم المواقع توفّر عنوان https://، وهو الأفضل لرمز مطبوع.'
            )}
          </p>
        </div>
      ) : null}

      {openInTab ? (
        <p className="link-open">
          <a href={openInTab} target="_blank" rel="noopener noreferrer">
            {t('open the destination in a new tab', 'افتح الوجهة في تبويب جديد')}
          </a>
        </p>
      ) : null}

      <div className="stage-actions">
        {onBack ? (
          <button type="button" className="d-btn d-btn--thread" onClick={onBack}>
            {t('change the link', 'تغيير الرابط')}
          </button>
        ) : null}
        <button
          type="button"
          id="el-confirm"
          className="d-btn d-btn--ink"
          onClick={onNext}
          disabled={!target.ok || state.phase === 'checking'}
        >
          {t('confirm this link', 'تأكيد هذا الرابط')} →
        </button>
      </div>

      <p className="draft-note" style={{ textAlign: 'center', marginTop: 6 }}>
        {t(
          'Confirming keeps this page with the book. The printed code will only ever open the page saved here.',
          'التأكيد يحفظ هذه الصفحة مع الكتاب. الرمز المطبوع لن يفتح إلا الصفحة المحفوظة هنا.'
        )}
      </p>
    </div>
  )
}
