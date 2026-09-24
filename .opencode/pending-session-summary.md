# Dearune Designer Book Pipeline — session checkpoint

Scope: the "many projects per designer" overhaul (spec sections A–H). This file records
what is DONE and what still needs the user's hands (deploy + live credentials).

## Done this session
- `src/pages/create/CreateBook.jsx` — full orchestration rewrite:
  - Boot loader while hydrating: `fetchDraftUnlock` + `fetchProjects` → `unlockDraftKey`
    → `getActiveProjectId` → `loadDraft` → resume latest active draft.
  - Stale-sweep: a local draft with `submittedAt` whose server row exists is cleared
    (draft + IndexedDB media) and routed to the closed shelf.
  - Returning designer w/o draft → shelf ("Previous Designs"); fresh → `createLocalProject`.
  - `handleSubmit`: flush debounce → per-media IndexedDB decrypt → upload with stable
    `fixed` names (`photo-0`, `audio-0`) + persisted `submitLedger` → `createProject`
    (client `projectId`, `DEARUNE_POLICY_VERSION`, `policiesAcceptedAt`) →
    mark `submittedAt` → `submitted` stage.
  - `handleCloseBook`: `clearDraft` + `deleteProjectMedia` → closed shelf.
  - Debounced (350 ms) encrypted autosave with flush on turn/submit; `projectId` threaded
    to the memorial editor; `EditorProofPage` framed to `renderAspectRatio` 3/4.
  - `handleSubmit` reads the WHOLE letter back from the encrypted local draft
    (`loadTemplateDraft`, post-flush) instead of volatile in-memory state — the desk
    is the source of truth for what gets posted.
- Terms stage button is now "submit book" (`id="mm-submit"`), the trigger that posts
  the submitted message only from localStorage/IndexedDB; loaders/errors say "submitting".
- `src/pages/create/stages/ReviewStage.jsx` — removed submit (was `mm-handover`); now
  reads via `useMemorialMedia`, right button `id="mm-to-terms"` → policies stage.
- `src/pages/create/stages/ProjectsBook.jsx` / `ProjectSheet.jsx` — lifecycle status rows
  (active until / expired / sealed-not-yet-opened) + `expires_at`/`policy_version` meta.
- `src/pages/create/stages/PoliciesStage.jsx` — fixed `DearuneLoader` to default import;
  removed dead `canSubmit`.
- `src/App.jsx` — removed `/designer*` routes + `RequireDesigner`; deleted
  `src/pages/designer/` (DesignerLogin, DesignerStudio, DesignerMessageEditor).
- `src/styles/book.css` — added `.policy-*`, `.seal-wax` (+`--set`), `.mono`,
  `.project-state.is-expired`, `.note`, `.book-loader-wrap`, `.page-body .dropcap` display.
- `tests/pipeline.test.js` — rewritten for v3 async/unlock model: per-designer unlock,
  cross-account decryption isolation, ciphertext-only-in-storage, fresh nonces, registry
  metadata-only, project isolation, password never persisted, pipeline stage whitelist.

## Verification status
- `npm test`: 57/57 pass. `npm run build`: pass (only pre-existing chunk-size warning).
- `npm run lint`: warnings only; new-code warnings: `ProjectSheet.jsx:40` `Date.now`
  purity (acceptable), plus many pre-existing ones.

## Still required from the user
1. Deploy backend (no Supabase CLI on this machine; project `xwgegarncnxswiswsufx`,
   `DESIGNER_JWT_SECRET` in gitignored `supabase/.env`):
   ```
   supabase db push
   supabase functions deploy designer-login designer-projects designer-media
   supabase secrets set --env-file supabase/.env --project-ref xwgegarncnxswiswsufx
   ```
   Migration file: `supabase/migrations/20260924000001_pipeline_policies.sql`.
2. Designer credentials (code + passcode) OR an admin-created designer, so the
   authenticated flows (login → fresh book → resume → submit with media → close →
   second designer cannot decrypt) can be live-verified. Ask the user for these next.

## Notes / known leftovers
- `src/services/media.js:29` `compressImage` comment artifact ("return a compact JPEG")
  — line 29 is a scroll-clamp condition, not a return; comment may be reworded.
- Abandoned v2 draft keys from the old single-project era are intentionally left as
  orphans (no migration) — `draftStorageKey` bumps to v3.
- Supabase submit uses `upsert` + stable `fixed` object names (retry-safe even if the
  provider is google_drive, where resumable upsert is impossible); the encrypted
  `submitLedger` in the draft makes retries reuse uploaded refs.

---

## Next task: Designer Pipeline — consistent Back control + Previous Designs render real data

### Root cause (Previous Designs showing SAMPLE)
The save-side bug: `supabase/functions/designer-projects/index.ts` POST inserted
`payload: JSON.stringify(payload)` into the `jsonb` `projects.payload` column. PostgREST
stores that as a JSON **string** scalar, not an object. On read,
`ProjectSheet.jsx` `projectDraft` did `typeof payload === 'object' ? payload : {}` →
silently `{}` → `MemorialLetter` fell back to `memorialDefaults` ("Dear friend," / blank
body) → looks like TEMPLATE SAMPLE. Old deployed function rows may also be payload-less.

### Done this session
- Server (`designer-projects/index.ts`):
  - POST now inserts the payload **object** directly (no `JSON.stringify`).
  - `parsePayload()` normalizes reads: object passthrough, JSON-string parsed (recovers
    old rows), anything unreadable → `null` (client shows a real error, never a sample).
  - `template_version` added to `METADATA_COLUMNS`; stored from `TEMPLATE_VERSIONS`
    (`memorial-message: 1`).
- New migration `20260924000002_project_template_version.sql`:
  - adds `template_version integer not null default 1`;
  - DO-block folds legacy string payloads back into JSONB objects (parse-safe; keeps
    unparseable scalars for honest client error).
- Client:
  - `src/services/projectPayload.js` — `parseProjectPayload(raw)` (object|string;
    refuses empty/stub/malformed → `null`; body-must-be-string guard).
  - `src/templates/memorial-message/memorialSampleData.js` — `MEMORIAL_SAMPLE` +
    `blankPageDraft()`; the ONLY source of sample shapes (new-draft init), never a
    submitted-view fallback.
  - `ProjectSheet.jsx` — uses `parseProjectPayload`; takes `onBack`; renders explicit
    "We couldn't load this Dearune." error (with a back-to-shelf button) when payload
    is unreadable; shows `template_version` (vN) on the meta line; media hook gets a
    safe null frame so hooks stay unconditional.
  - `CreateBook.jsx` — `freshMemorial` = `blankPageDraft()`.
- Back navigation:
  - New `src/components/book/BookStageNavigation.jsx` — ONE control, masthead-left
    beside the wordmark (wrapped in `.masthead-left`), custom arrow+word, disabled
    support, renders nothing without `onBack`.
  - `CreateBook.jsx` — `previousStageOf`/`PREVIOUS_WORDS` maps for every pipeline stage;
    `navBack`/`navWord` drive the masthead `left` slot in both the open book and the
    closed view (closed+activeProject → back to shelf). Navigation uses the existing
    reverse page-turn via `goTo(prev,'back')` (state preserved by `handleTurnEnd`/
    `persistStage`); receiver's previous is `shelf` via new `returnToShelf()` (closes the
    view, draft untouched). No nav on access, submitted, booting, or the bare shelf.
  - Removed duplicate bottom back buttons (and `backTo` helper + `onBack` props) from:
    `ReceiverStage`, `UnwrittenStage`, `MemorialLanguageStage`, `MemorialEditorStage`,
    `MemorialPasswordStage`, `ReviewStage`, `PoliciesStage`. Forward buttons keep their
    IDs (`mm-seal`, `mm-to-terms`, `mm-submit`).
  - `book.css` — `.masthead-left`, `.book-nav*`, `.stage-actions` → `justify-content:
    flex-end` + `:empty { display:none }`; mobile (<560px) collapses nav word to caret.
- Tests (`tests/pipeline.test.js`, now 61): object payload → draft; legacy JSON-string
  payload → same draft; empty/stub/malformed/array → `null`; no default substitution.

### Verification
- `npm test` 61/61 pass; `npm run build` pass; `npm run lint` exit 0 (only pre-existing +
  `ProjectSheet.jsx` `Date.now` purity warnings).

### Still needed from user
- Migrations to deploy now: BOTH `20260924000001_pipeline_policies.sql` and
  `20260924000002_project_template_version.sql` (`supabase db push`).
- Redeploy `designer-projects` (and designer-login/designer-media if not yet deployed).
- Live e2e: unique test message, photos+audio, submit → close → reopen from Previous
  Designs → confirm the actual words/media render (not sample) in EN and AR.
- Remaining spec item worth noting: sample separation now enforced (blankPageDraft), and
  media refs persisted are permanent server refs (no blob: URLs in payloads).