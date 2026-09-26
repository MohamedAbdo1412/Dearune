import { useState } from 'react'
import MemorialLetter from '@/templates/memorial-message/MemorialLetter'
import { memorialDefaults } from '@/templates/memorial-message/letterDefaults'
import '@/styles/book.css'

// /qa/memorial — the visual-QA bench for the letter itself.
//
// One static route (no auth, no data): the Memorial Message renderer shown in
// every mood it ships in — read, writing, empty and Arabic — each inside a
// sheet of the real delivery's proportion, so a screenshot at any viewport
// width is an honest proof. e2e/qa-memorial.mjs walks it at 1920 → 360.

const BODY_EN = `The house is quieter these days, and in that quiet we hear you best — in the kettle's click, in the half-finished sentence, in the way everyone still saves the chair by the window.

We kept the letters you wrote us, the ones with the crooked margins and the ink that ran when the rain came in. They are not relics. They are instructions on how to be a little kinder than the day requires.

So this book is not a goodbye. It is a place to put the flowers, and to read you again whenever we need to. Know that you are loved past the edge of any word we could set in type.`

const BODY_AR = `البيت أهدأ في هذه الأيام، وفي ذلك الهدأ نسمعك أفضل: في صوت الغلّايان، وفي الجملة التي لم تكتمل، وفي الطريقة التي يحتفظ بها الجميع بالكرسي قرب النافذة.

أبقينا رسائلك التي كتبتها بخطوط مائلة وحبر سال حين دخل المطر. إنها ليست تذكارات، إنها تعليمات على أن نكون ألطف قليلاً مما يطلبه اليوم.

لهذا الكتاب، إذن، ليس وداعاً. إنه مكان نضع فيه الزهور، ونقرؤك من جديد كلما احتجنا إليك. اعلم أنك محبوب حتى حافة أي كلمة نتمكن من طباعتها.`

const drafts = {
  enRead: {
    language: 'en',
    ...memorialDefaults('en'),
    greeting: 'My dearest,',
    closing: 'With love, always,',
    body: BODY_EN,
    senderName: 'Mariam',
    photos: [{ slot: 0 }, { slot: 1 }, { slot: 2 }],
    audio: { slot: 0 },
    passwordSet: false,
  },
  enEmpty: {
    language: 'en',
    ...memorialDefaults('en'),
    body: '',
    senderName: '',
    photos: [null, null, null],
    audio: null,
    passwordSet: false,
  },
  arFull: {
    language: 'ar',
    ...memorialDefaults('ar'),
    greeting: 'إلى حبيبنا،',
    closing: 'بكل الحب،',
    body: BODY_AR,
    senderName: 'مريم',
    photos: [{ slot: 0 }, { slot: 1 }, { slot: 2 }],
    audio: { slot: 0 },
    passwordSet: false,
  },
}

// Stand-in prints — paper-toned SVGs kept as data URIs so the harness never
// touches the network and the composition can be judged with real images.
const print = (top, bottom) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/><circle cx="290" cy="96" r="54" fill="rgba(255,252,240,0.5)"/><path d="M0 300 L120 168 L215 258 L300 190 L400 300 Z" fill="rgba(60,40,24,0.35)"/></svg>`
  )}`
const PHOTO_URLS = [print('#d8c7a4', '#8d7355'), print('#c9d3cd', '#6c7f77'), print('#e3cfbf', '#a98d77')]

const PANELS = [
  { key: 'en-read', label: 'english · read · prints & a sound', draft: drafts.enRead, editable: false, photos: PHOTO_URLS },
  { key: 'en-edit', label: 'english · writing (one ruled sheet)', draft: drafts.enRead, editable: true, photos: PHOTO_URLS },
  { key: 'en-empty', label: 'english · read · nothing written yet', draft: drafts.enEmpty, editable: false, photos: [null, null, null] },
  { key: 'ar-read', label: 'العربية · القراءة · صور وصوت', draft: drafts.arFull, editable: false, photos: PHOTO_URLS },
  { key: 'ar-edit', label: 'العربية · الكتابة', draft: drafts.arFull, editable: true, photos: PHOTO_URLS },
]

function Panel({ label, draft, editable, photos }) {
  const [value, setValue] = useState(draft)
  const isAr = draft.language === 'ar'
  return (
    <figure className="qa-panel" dir={isAr ? 'rtl' : 'ltr'}>
      <figcaption className="qa-cap" dir="auto">
        {label}
      </figcaption>
      <div className="qa-sheet">
        <MemorialLetter
          draft={value}
          editable={editable}
          onField={(key, next) => setValue((prev) => ({ ...prev, [key]: next }))}
          photoUrls={photos}
          onPhotoTap={editable ? () => {} : undefined}
          audio={value.audio}
          audioUrl={null}
        />
      </div>
    </figure>
  )
}

const QA_CSS = `
.qa-root { min-height: 100vh; background: #efe7d3; color: #32281e; padding: 26px 14px 60px; }
.qa-head { max-width: 720px; margin: 0 auto 26px; text-align: center; font-family: 'Fraunces Variable', Georgia, serif; }
.qa-head h1 { font-size: 1.15rem; letter-spacing: 0.16em; text-transform: uppercase; margin: 0 0 6px; }
.qa-head p { font-family: 'EB Garamond', Georgia, serif; font-style: italic; color: #8d7a62; margin: 0; }
.qa-panel { margin: 0 auto 42px; display: flex; flex-direction: column; align-items: center; }
.qa-cap { font-family: 'Fraunces Variable', Georgia, serif; font-size: 0.62rem; letter-spacing: 0.3em; text-transform: uppercase; color: #8d7a62; margin-bottom: 10px; }
[dir='rtl'] .qa-cap { text-transform: none; letter-spacing: 0.06em; font-size: 0.8rem; }
.qa-sheet {
  width: min(92vw, 540px);
  aspect-ratio: 3 / 4;
  display: flex;
  background:
    radial-gradient(120% 90% at 30% 12%, rgba(255, 252, 242, 0.9), rgba(240, 230, 208, 0.55) 70%),
    #f6efdf;
  border: 1px solid rgba(85, 66, 44, 0.4);
  box-shadow: 0 10px 26px -16px rgba(30, 18, 8, 0.55), inset 0 0 0 1px rgba(255, 255, 255, 0.5);
  overflow: hidden;
  padding: 14px 14px 10px;
}
.qa-sheet .memorial { width: 100%; }
`

export function MemorialQa() {
  return (
    <div className="qa-root">
      <style>{QA_CSS}</style>
      <header className="qa-head">
        <h1>Memorial Letter · visual bench</h1>
        <p>one renderer, five moods — screenshots from 1920 to 360</p>
      </header>
      {PANELS.map((panel) => (
        <Panel key={panel.key} {...panel} />
      ))}
    </div>
  )
}
