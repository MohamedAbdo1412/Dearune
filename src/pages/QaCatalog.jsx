import { useState } from 'react'
import { Folio } from '@/components/book/ornaments'
import TemplateSelectionStage from '@/pages/create/stages/TemplateSelectionStage'
import WrapperSelectionStage from '@/pages/create/stages/WrapperSelectionStage'
import { chooserCatalogItems } from '@/services/catalog'
import '@/styles/book.css'

// /qa/catalog — the visual-QA bench for the merchandising vocabulary, the
// mirror of /qa/memorial: one static route (no auth, no network) rendering
// the REAL chooser stages against a synthetic archive where every display
// state sits side by side —
//
//   papers:  normal · new (seal + chosen) · not available (veiled, held) ·
//            hidden (enabled=false, must leave NO slot behind)
//   wrappers: normal · new · not available · hidden, in both languages,
//            once with Next held (nothing chosen) and once with it open.
//
// e2e/qa-catalog.mjs measures that vocabulary (disabled buttons, seals,
// veils, order, absence of the hidden rows) and screenshots the bench from
// 1920 down to 390.

const TEMPLATES = [
  {
    id: 't-normal',
    slug: 'memorial-message',
    name: 'The Memorial Letter',
    description: 'the registry-bound letter itself',
    enabled: true,
    sort_order: 1,
    display_state: 'normal',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 't-new',
    slug: 'classic-letter',
    name: 'Classic Letter',
    description: 'freshly set, sealed for the season',
    enabled: true,
    sort_order: 2,
    display_state: 'new',
    created_at: '2026-01-02T00:00:00.000Z',
  },
  {
    id: 't-resting',
    slug: 'word-and-wax',
    name: 'Word & Wax',
    description: 'shown, but resting for now',
    enabled: true,
    sort_order: 3,
    display_state: 'not_available',
    created_at: '2026-01-03T00:00:00.000Z',
  },
  {
    // disabled (not display_state): the archive filter must drop it whole,
    // and its sort_order of 0 would make it the FIRST card if it ever leaked.
    id: 't-hidden',
    slug: 'silent-card',
    name: 'Must never render',
    description: 'a hidden paper, for absence proofs',
    enabled: false,
    sort_order: 0,
    display_state: 'normal',
    created_at: '2026-01-04T00:00:00.000Z',
  },
]

const WRAPPERS = [
  {
    id: 'w-normal',
    key: 'oak_box',
    name: 'Oak Box',
    name_ar: 'صندوق البلوط',
    description: 'hinged oak, lined in linen',
    description_ar: 'بلوط بمفصلات وبطانة كتان',
    base_price: 45,
    production_cost: 18,
    active: true,
    display_order: 10,
    display_state: 'normal',
    image_url: '',
    created_at: '2026-01-05T00:00:00.000Z',
  },
  {
    id: 'w-new',
    key: 'linen_sleeve',
    name: 'Linen Sleeve',
    name_ar: 'غلاف الكتان',
    description: 'soft sleeve, stitched by hand',
    description_ar: 'غلاف ناعم مخيط يدويًا',
    base_price: 25,
    production_cost: 9,
    active: true,
    display_order: 20,
    display_state: 'new',
    image_url: '',
    created_at: '2026-01-06T00:00:00.000Z',
  },
  {
    id: 'w-resting',
    key: 'wax_and_string',
    name: 'Wax & String',
    name_ar: 'شمع وخيط',
    description: 'sealed with the studio mark',
    description_ar: 'مختوم بختم الاستوديو',
    base_price: 15,
    production_cost: 5,
    active: true,
    display_order: 30,
    display_state: 'not_available',
    image_url: '',
    created_at: '2026-01-07T00:00:00.000Z',
  },
  {
    // active=false → hidden whole; display_order 0 would place it first.
    id: 'w-hidden',
    key: 'never_shown',
    name: 'Must never render',
    name_ar: 'لا يُعرض أبدًا',
    description: 'a deactivated wrapper, for absence proofs',
    description_ar: 'غليف موقوف، لإثبات الغياب',
    base_price: 99,
    production_cost: 50,
    active: false,
    display_order: 0,
    display_state: 'normal',
    image_url: '',
    created_at: '2026-01-08T00:00:00.000Z',
  },
]

const NOTICE_EN = 'The paper you had begun is no longer available — choose another to continue.'
const NOTICE_AR = 'التغليف الذي اخترته لم يعد متاحًا الآن — اختر آخرًا للمتابعة.'

// Exactly the production path: CreateBook hands the stages rows already
// put through `chooserCatalogItems` (the server sends the same archive).
// The hidden rows above are therefore invisible here — the e2e script
// proves their absence rather than their rendering.
const VISIBLE_TEMPLATES = chooserCatalogItems(TEMPLATES)
const VISIBLE_WRAPPERS = chooserCatalogItems(WRAPPERS)

const QA_CSS = `
.qa-root { min-height: 100vh; background: #efe7d3; color: #32281e; padding: 26px 14px 60px; }
.qa-head { max-width: 720px; margin: 0 auto 26px; text-align: center; font-family: 'Fraunces Variable', Georgia, serif; }
.qa-head h1 { font-size: 1.15rem; letter-spacing: 0.16em; text-transform: uppercase; margin: 0 0 6px; }
.qa-head p { font-family: 'EB Garamond', Georgia, serif; font-style: italic; color: #8d7a62; margin: 0; }
.qa-panel { margin: 0 auto 42px; display: flex; flex-direction: column; align-items: center; }
.qa-cap { font-family: 'Fraunces Variable', Georgia, serif; font-size: 0.62rem; letter-spacing: 0.3em; text-transform: uppercase; color: #8d7a62; margin-bottom: 10px; }
[dir='rtl'] .qa-cap { text-transform: none; letter-spacing: 0.06em; font-size: 0.8rem; }
/* one real page: same geometry the spread gives the stage (--pw below), so
   the paper grid wraps exactly as it does inside the book */
.qa-frame {
  --pw: min(92vw, 590px);
  --ph: auto;
  position: relative;
  width: var(--pw);
  min-height: calc(var(--pw) * 1.4142);
  background:
    radial-gradient(130% 120% at 18% 12%, rgba(255, 252, 240, 0.9) 0%, rgba(247, 238, 220, 0) 42%),
    #f6efdf;
  border: 1px solid rgba(85, 66, 44, 0.4);
  box-shadow: 0 10px 26px -16px rgba(30, 18, 8, 0.55), inset 0 0 0 1px rgba(255, 255, 255, 0.5);
}
`

function Panel({ label, folio, children }) {
  return (
    <figure className="qa-panel">
      <figcaption className="qa-cap" dir="auto">
        {label}
      </figcaption>
      <div className="qa-frame">
        <Folio folio={folio}>{children}</Folio>
      </div>
    </figure>
  )
}

export function CatalogQa() {
  const [chosenSlug, setChosenSlug] = useState('classic-letter')
  const [wrapperEn, setWrapperEn] = useState('')
  const [wrapperAr, setWrapperAr] = useState('oak_box')

  return (
    <div className="qa-root">
      <style>{QA_CSS}</style>
      <header className="qa-head">
        <h1>Archive choices — visual bench</h1>
        <p>every display state, side by side — screenshots from 1920 to 390</p>
      </header>

      <Panel label="Papers — normal, new & chosen, veiled" folio={4}>
        <TemplateSelectionStage
          templates={VISIBLE_TEMPLATES}
          loading={false}
          error=""
          chosenSlug={chosenSlug}
          onSelect={(row) => setChosenSlug(row.slug)}
          onRetry={() => {}}
          notice={NOTICE_EN}
        />
      </Panel>

      <Panel label="Wrappers — English · nothing chosen (Next held)" folio={6}>
        <WrapperSelectionStage
          template={VISIBLE_TEMPLATES[0]}
          wrappers={VISIBLE_WRAPPERS}
          value={wrapperEn}
          onChange={setWrapperEn}
          onNext={() => {}}
          language="en"
          notice={NOTICE_EN}
        />
      </Panel>

      <Panel label="التغليف — عربي · اختيار ثابت (التالي مفتوح)" folio={8}>
        <WrapperSelectionStage
          template={VISIBLE_TEMPLATES[0]}
          wrappers={VISIBLE_WRAPPERS}
          value={wrapperAr}
          onChange={setWrapperAr}
          onNext={() => {}}
          language="ar"
          notice={NOTICE_AR}
        />
      </Panel>
    </div>
  )
}
