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