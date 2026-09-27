# Dearune — architecture

Dearune is a private studio for hand-set memorial books: a designer writes one
letter (English or Arabic), pins prints, keeps a sound, chooses how the book is
wrapped, and hands it over. The whole product is a **book that turns pages** —
not a form wizard — so most of the architecture exists to keep that metaphor
honest while the data stays encrypted and server-owned.

---

## Stack & hard constraints

| Layer | Choice |
| --- | --- |
| Frontend | React 19 + Vite, **JavaScript/JSX only inside `src/`** (no new TS files) |
| Styling | Tailwind + shadcn (admin), hand-written CSS for the book (`src/styles/`) |
| Backend | Supabase — Postgres, RLS, Storage, Edge Functions |
| Deploy | Cloudflare Workers (`wrangler.jsonc` + `worker.js`: `/api/health`, static assets, SPA fallback) |
| Motion | `motion` (one dependency, no extra animation libs) |
| Tests | Vitest (`npm test`), oxlint (`npm run lint`), Playwright scripts in `e2e/` |

Rules that keep the codebase the shape its users expect:

- Migrations are **forward-only**; old migrations are never rewritten.
- Templates never hardcode wrapper names or prices — everything resolves from
  the wrapper catalog (below).
- No book close/reopen between stages, no giant spinner, no monolithic
  Memorial component, no duplicated price logic.

---

## The book pipeline (`/create`)

`src/pages/create/CreateBook.jsx` is the single host. It owns:

- **`stage`** — which spread is showing (the page it is ON).
- **Shelf vs pipeline** (`closed`) — the shelf of handed-over books replaces
  the pipeline entirely when closed.
- Everything else about *movement* lives in **`state/bookMachine.js`** — a pure
  reducer for the cover (`OPEN_COVER` / `COVER_SETTLED`), the sweeping leaf
  (`GO` / `TURN_END`), the ink pass (`INK_START` / `INK_END`) and the two
  resting states (`SHOW_SHELF`, `RESET_DESK`). Because it is pure, overlapping
  turns, double-opening covers and stranded "opening" flags are unit-tested
  without React.

Stage sequence comes from the **template contract** (next section), and the
spread is rendered by two callbacks:

- `rightFor(key)` — the working page. Book-owned pages (`access`, `receiver`,
  `templates`, `wrapper`, `review`, `policies`, `submitted`, `unwritten`) are a
  switch in CreateBook; **template-owned pages render through
  `template.components[stage]`** with one uniform prop bag
  (`draft / value / onChange / onSelect / onSet / onNext / projectId`), and
  `onNext` is derived from the sequence — never hardcoded.
- `leftFor(key)` — the facing chapter sheet (`stages/chapters.jsx`): title,
  for-whom, papers, language, proof, wrapper, lock, close, terms, handed-over.

Folio numbers are derived from the stage's index in the sequence
(`index * 2 + 2`), so inserting a stage renumbers the book automatically.

**Page turn.** `components/book/PageTurn.jsx` sweeps one leaf about the spine
in *phased* keyframes (`rotateY` stops `0 → -6 → -24 → -90 → -156 → -174 →
-180`, sine-ish `times`, linear per segment) — slow lift, fast middle, soft
landing — and reports landing through `onAnimationComplete`. While it sweeps,
`BookShell` marks the resting spread `inert` + `aria-hidden`, so a mid-turn
tap can never land on the leaving page. Reduced motion falls back to a 0.3 s
opacity fade.

**Boot.** While the encrypted draft is decrypted the book still *is* the hero:
an open spread carrying `DearuneLoader` on its right page — never a bare
spinner. Loader sizes: `xs 14 · sm 20 · md 34 · lg 54` (ornaments only at `md+`).

---

## Template contract — `src/templates/stages.js`

One pure module (no React, no storage) is the single source of truth for
*pages*:

- Stage vocabulary: `BASE_STAGES`, `WRAPPER_STAGE`, `REVIEW_STAGE`,
  `POLICIES_STAGE`, `SUBMITTED_STAGE`, `STATUS_STAGE`, `UNWRITTEN_STAGE`.
- `TEMPLATE_SEQUENCES[slug]` — each template's **full** sequence (the shared
  sending pages are interleaved, not a suffix: the wrapper sits between
  writing the words and locking them).
- `templateStagesFor(slug)`, `nextStageIn` / `previousStageIn`, and
  `checkTemplateContract(template, slug)` which flags a drifted stage list or
  a template claiming a book-owned page.

Consumers:

- `services/draft.js` **re-exports** it (persistence keeps one sequence, not a
  parallel copy).
- `templates/memorial-message/index.js` derives `MEMORIAL_TEMPLATE.stages`
  from it and declares `components` (language / editor / password pages).
- `templates/index.js` registry merges the **server's** template row (name,
  phrase, wrappers) with the **frontend contract** (stages, components,
  renderAspectRatio) in `chosenTemplate`.
- `tests/template-contract.test.js` asserts the whole contract.

---

## The Memorial Message (the one live template)

- `templates/memorial-message/MemorialLetter.jsx` — one renderer for editor,
  proof and review; edits render as a single continuous ruled sheet (the body
  is the one textarea; greeting/close/name ink their own baselines, no boxes).
- `src/styles/memorial.css` (extracted from `book.css`) — the letter's whole
  sheet: royal-red accent `--memorial-accent: #7a1d28` (focus lines, dropcap,
  signature rule), **editorial 12-column photo composition** (hero `6/12`,
  answers `1/7` and `7/11` — never three equal prints in a row), EN-only
  `::first-letter` dropcap, logical properties so Arabic mirrors itself, and
  `Aref Ruqaa` (`@fontsource/aref-ruqaa`) as the Arabic display face over
  Amiri for body text.
- Media is **local-first**: photos/sound are cropped, AES-GCM encrypted with
  the designer's draft key and stored in IndexedDB; only `{ store:'local', … }`
  references travel inside the encrypted draft. Upload happens at submission.

---

## Drafts & submission (client)

- `services/draft.js` — version-3, project-scoped, **everything encrypted at
  rest** (`draftCrypto`); the only plaintext is the per-designer registry of
  project ids + timestamps. One project id per book (`createLocalProject`
  first, always).
- `services/draftMediaStore.js` — encrypted media bytes in IndexedDB.
- Submission (`PoliciesStage` → `handleSubmit`) reads the full draft, accepts
  the terms, then `createProject(..., wrapperType)` — the wrapper key comes
  from the draft's `wrapperKey`, and the **server validates** it (active
  wrapper + enabled option for that template) before the row is written.
- After hand-over the local project is swept; the server owns the letter.

---

## Wrapper catalog & price resolution

Migration `20260926000001_wrapper_catalog.sql`:

- `public.wrapper_types` — one row per wrapping (key, names, description,
  photo, `base_price`, `production_cost`); photos live in storage under
  `wrappers/<key>/photo*` (admin-only write, designer-session read).
- `public.template_wrapper_options` — per-template offering of a wrapper with
  `price_override` / `cost_override` / `display_order` / `active`.
- RLS mirrors `template_pricing`: admins read+write, designers read.

**The one price rule** (everywhere): `option.price_override → wrapper.base_price
→ (legacy edge only) template_pricing`. A disabled option still *resolves* a
price (backward compatibility) but is never offered to designers. Frontend
helper: `services/wrappers.js` (`resolveWrapperPrice`, `wrapperLabel`,
`wrapperDescription`, signed photo URLs); `services/templates.js`
`fetchTemplates()` returns `{ templates, pricing, wrappers, options }`.

Stage order: editor → **wrapper** → password, so the choice reads as part of
the same act of sending.

---

## Availability & merchandising (display state)

One vocabulary, one module: `services/catalog.js`.

- `display_state` (`normal` · `new` · `not_available`) lives on `templates`
  and `wrapper_types` (migration `20260927000001_catalog_display_state.sql`).
  Activation stays where it always was — `templates.enabled` /
  `wrapper_types.active` — and ordering stays `sort_order` / `display_order`.
- **Hidden** (`enabled/active = false`) rows vanish everywhere — no slot, no
  hint. **Resting** (`not_available`) rows are shown, veiled, and *unpressable*
  (a disabled `<button>` refuses pointer and keyboard). **New** rows carry the
  rotated double-rule seal and stay choosable.
- Reading order: `designer-templates` drops hidden rows and returns
  `display_state` → `chooserCatalogItems()` re-applies the rules client-side →
  the stages render through `getCatalogItemState()` (an unknown future state
  fails safe: visible, never selectable; `DISPLAY_STATE_META` is the registry).
- Stale drafts: two effects in `CreateBook.jsx` bounce the book to the
  choosing stage with a bilingual `.stage-note` whenever the archived choice
  is no longer *selectable* — the words stay encrypted in the draft. At
  submission `designer-projects` re-checks
  `SELECTABLE_STATES = ['normal','new']` for template **and** wrapper (keep in
  sync with `DISPLAY_STATE_META`).
- Admin: the Templates and Wrappers screens each carry an Enabled/Hidden
  switch, a Display-state select, and an Order field with per-row save; each
  card's summary line previews the exact Create result
  (`Visible • New • Order #2` / `Hidden`). `create-sale` intentionally does
  not gate on display state — historical sales keep resolving.

---

## Backend map (Supabase)

- **Migrations** (`supabase/migrations/`, forward-only): initial schema →
  functions/policies → seeds → drive media → admin RLS → designer pipeline →
  designer media storage → designer projects → pipeline policies → project
  template version → designer operations (Sales merged into a single Dearune
  record) → wrapper catalog → catalog display-state.
- **Edge functions**: `designer-login`, `designer-templates`,
  `designer-projects`, `designer-messages`, `designer-message`,
  `designer-media`, `admin-dearunes`, `admin-designers`, `create-sale`, and
  the `drive-*` media trio. Shared logic in `_shared/`.
- Roles: `admin` (studio) and `designer` (authenticated + row in
  `designers`), enforced in SQL policies *and* re-checked in edge functions.

## Admin UI

`/admin` (shadcn + Tailwind): overview, designers → Dearunes (one record =
sale + message + production steps), templates, **wrappers** (catalog CRUD +
per-template options), settings. Wrappers are edited only here — never in
template code.

---

## Deploy & environment

- Cloudflare: `wrangler.jsonc` + `worker.js` (SPA + `/api/health`). Supabase
  URL/anon key are **build variables** (Settings → Build): `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`.
- Database/edges ship with `supabase db push` and
  `supabase functions deploy <name>` (needs local Supabase CLI login).
- `npm run build` produces `dist/`; `npm run preview` serves it on
  `http://localhost:4173`.

## Testing & visual QA

- `npm test` — Vitest: pipeline/draft invariants, wrappers, **book machine**,
  **template contract**, **catalog display state**.
- `e2e/pipeline.mjs` — Playwright walk of the full pipeline (note: its
  plaintext localStorage audit predates draft v3 encryption; only the stage
  traversal is maintained).
- `e2e/qa-memorial.mjs` + route **`/qa/memorial`** — the visual bench: the
  letter in five moods (read/writing/empty/Arabic × …) screenshot at
  1920 · 1440 · 1024 · 768 · 430 · 390 · 360 into `e2e/shots/`, plus
  machine-checked layout assertions (grid slots, dropcap red, ruqaa loaded,
  close stacking ≤ 860 px). Run: `npm run preview` then
  `node e2e/qa-memorial.mjs`.
- `e2e/qa-catalog.mjs` + route **`/qa/catalog`** — the merchandising bench:
  the real chooser stages fed a synthetic archive with every display state
  side by side — hidden rows proven absent, resting rows veiled and held,
  seals/order/RTL/Next-gating asserted — screenshotted at 1920 · 768 · 390.
  Run: `npm run preview` then `node e2e/qa-catalog.mjs`.

## Conventions & gotchas

- JS only in `src/`; aliases `@` → `src` (Vite + Vitest).
- CSS: `book.css` is the book (pages, cover, leaves, chrome);
  `memorial.css` is the letter (imported by `book.css`).
- Use the edit tool for file changes (PowerShell `Set-Content` risks
  encoding); `rg -n` for search (`rg -rn` is a replace typo).
- English UI strings pair with Arabic via local `t(en, ar)` helpers; stage
  Back labels name the **destination** page (`PREVIOUS_WORDS`).
