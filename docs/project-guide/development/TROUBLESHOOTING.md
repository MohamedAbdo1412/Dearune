# Troubleshooting

This document provides solutions for common issues encountered during development and production.

## Common Issues

### 1. "Shipping is not defined" Error

**Error:** `ReferenceError: shipping is not defined`
**Location:** `src/services/operations.js:127`

**Fix:** The `toOperation` function references `shipping` but it's not destructured from the row.

```javascript
// Fix in toOperation(row)
const shipping = row.shipping ?? {}  // Add this line
recipientName: row.recipient_name ?? shipping?.recipient_name ?? row.project_title ?? '',
```

---

### 2. Build Fails: Missing Module

**Error:** `Could not load src/components/create/MemorialLetter`

**Fix:** Fix import path in `PublicMessage.jsx`

```javascript
// Wrong
import MemorialLetter from '@/components/create/MemorialLetter'

// Correct
import MemorialLetter from '@/templates/memorial-message/v1/MemorialLetter'
```

---

### 3. Lint Error: Missing Closing Brace

**Error:** `Expected \`}\` but found \`EOF\``

**Fix:** Check Edge Function for missing closing braces.

```typescript
// Common issue: missing closing braces in Deno.serve callback
Deno.serve(async (req) => {
  return withRequestId(req, async (requestId) => {
    // ...
  })
})  // ← Missing this
```

---

### 4. Migration Fails: Column "status" Does Not Exist

**Error:** `ERROR: column "status" does not exist`

**Cause:** Migration references dropped `status` column.

**Fix:** Update migration to use milestone timestamps.

```sql
-- Instead of: WHERE pp.status = 'delivered'
-- Use: WHERE pp.delivered_at IS NOT NULL
```

---

### 5. PWA Install Not Showing

**Cause:** Missing manifest, service worker, or HTTPS requirement.

**Checklist:**
- [ ] `npm run build` completed
- [ ] `npm run preview` serves `dist/` on HTTPS (localhost works)
- [ ] `public/manifest.webmanifest` exists
- [ ] `public/sw.js` registers
- [ ] `vite.config.js` has `VitePWA` plugin
- [ ] `index.html` has `<link rel="manifest">`

---

### 6. Designer Login Fails

**Error:** "We couldn't verify those details"

**Checklist:**
- [ ] Designer exists in `designers` table
- [ ] `code` is 6 digits
- [ ] `passcode_hash` exists and matches bcrypt
- [ ] `revoked_at` is null
- [ ] `designer_login_attempts` not locked out

---

### 7. Worker Can't Advance Milestone

**Error:** `maintenance_mode` or `shipping_address_missing`

**Checklist:**
- [ ] `app_settings.maintenance_mode = false`
- [ ] Shipping record exists with `recipient_name`, `address_line1`, `city`, `country`
- [ ] Worker has `operations.mark_shipped` permission
- [ ] Project `manufactured_at` is set

---

### 8. QR Code Not Scanning

**Checklist:**
- [ ] QR code generated with correct `publicId` + `token`
- [ ] `public_id` matches project
- [ ] `public_token` matches project
- [ ] QR size ≥ 2cm × 2cm on paper
- [ ] Lighting adequate
- [ ] Camera permission granted

---

### 9. PDF Generation Fails

**Error:** `Failed to load module script: MIME type text/html`

**Cause:** Dynamic import returns HTML (SPA fallback) instead of JS.

**Fix:** Ensure `vite.config.js` has proper chunking.

```javascript
// vite.config.js
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'pdf-lib': ['pdf-lib'],
        'exceljs': ['exceljs'],
      }
    }
  }
}
```

---

### 10. Rate Limit Exceeded

**Error:** `rate_limit_exceeded` (429)

**Check:**
- [ ] `rate_limit_buckets` table has entries
- [ ] `consume_rate_limit` RPC deployed
- [ ] Client handles 429 with retry-after

---

### 11. `designer-media` 403 on an Admin Upload (template preview / wrapper photo)

**Error:** `POST /functions/v1/designer-media?name=…` → `403 {"error":"Admins do not own drafts"}`

**Cause:** an admin upload without a studio namespace. The function only lets an
admin write *studio-owned* assets, which are named by `wrappers/<key>/…` or
`templates/<slug>/…`; a bare upload is a **designer draft** and stays
designer-only (that is what keeps one designer out of another's book).

**Fix:** call the upload with the owning key, always with a `kind`:

```js
// template preview (Templates → Preview image)
await uploadTemplateAsset(template.slug, file, token, { fixed: 'preview' })
// wrapper photo (Settings → Wrappers)
await uploadWrapperPhotoAsset(wrapper.key, file, token, { fixed: 'photo' })
```

A URL containing only `name=` (no `kind`, no `wrapper`/`template`) is the
signature of this bug. Stored paths resolve to signed URLs with
`resolveTemplateImageUrl()` / `resolveWrapperPhotoUrl()` before rendering —
a raw `templates/…` or `wrappers/…` path is not an image.

---

### 12. `token?grant_type=refresh_token` → 400 in the Console

**Error:** `xwge….supabase.co/auth/v1/token?grant_type=refresh_token:1 Failed to load resource: 400`

**Cause:** the refresh token in this browser's storage is no longer valid —
typically after a `supabase db reset`/re-seed (users and sessions are wiped),
a password change, or the same account signing in and out elsewhere. Supabase
rejects the stale token once, supabase-js then clears the session and emits
`SIGNED_OUT`; `RequireAdmin`/`WorkerGate` follow with a redirect to login.

**Check:**
- [ ] Signing in again clears it (expected — nothing to fix)
- [ ] It repeats on every load → check for two tabs fighting over the same
      session, or a stale service worker; clear site data once

**Not a bug:** a one-off 400 here is the correct response to an unusable
refresh token. It must not be "fixed" by disabling token refresh.

---

### 13. Template Card on `/create` Shows the Blank Sheet (no image)

**Symptom:** the paper chooser lists a template by name, but its card is the
empty `.paper-blank` sheet even though the admin uploaded a preview.

**Cause, in order of likelihood:**

1. **The row has no image columns set.** The chooser paints
   `thumbnail_url` → `preview_image_url` → legacy `image_url`
   (`templatePreviewSource`). A Templates → Edit upload that was never saved
   leaves the column empty; re-open Edit, upload, and press Save.
2. **The upload landed but the save didn't.** `updateTemplatePreview` only runs
   when the value changed; watch the Network tab for the `templates` PATCH. If
   it 403s, the admin session is gone (new migration/RLS).
3. **The stored value is the legacy seed** `templates/<slug>.png` — an object
   that never existed. `templatePreviewSource` ignores it on purpose; upload a
   real preview.
4. **Signing failed for this session.** The column holds a private path, so
   `resolveTemplateImageUrl` must sign it through
   `GET designer-media?path=templates/<slug>/preview-thumb.webp`. A 401 means
   the designer JWT expired (sign in again); a 403 means the path does not match
   `templates/<slug>/<file>`.
5. **`designer-templates` was not redeployed** after the columns were added to
   its `select`. The function returns no image fields at all until deployed.

**Check:**
- [ ] `select thumbnail_url, preview_image_url, image_url from templates where slug = '…';`
- [ ] DevTools → Network → `designer-media?path=templates/` returns `{ url }`
- [ ] Compare the admin card (same helpers, admin session) — if it paints, the
      row and the object are fine and the problem is the designer session

---

### 14. `external-link` Preview Is Blank or the Check Fails

**Symptom:** the proof page says "The link could not be checked", the iframe
stays empty, or the frame never appears.

**Cause, in order of likelihood:**

1. **The destination refuses framing.** Many sites send `X-Frame-Options` or
   `frame-ancestors`. The stage reports this as `embeddable: 'no'` and offers a
   new tab — this is expected, not a broken link, and **the book can still be
   confirmed and printed**.
2. **The check itself failed.** `link-check` requires a live designer JWT and is
   rate limited (20/min). A 401 means sign in again; a 429 means wait a moment.
   The `try again` button re-runs it.
3. **The page answered an error status.** A 403/404 from a bot filter is shown
   as HTTP `<status>` with an explanation; it never blocks confirmation, because
   the page can still open in a phone browser.
4. **`http://` destination on an https page.** Browsers block mixed-content
   frames. The stage says so and offers the new tab. Prefer the site's `https://`
   address on a printed code.
5. **CSP blocked the frame.** `public/_headers` must keep `frame-src … https:`
   (it exists for this preview). If the header was tightened, no destination can
   ever be embedded; existing redirects are unaffected.

**Check:**
- [ ] DevTools → Network → `POST /functions/v1/link-check` → response fields
      `reachable`, `status`, `embeddable`
- [ ] DevTools → Console: a `frame-ancestors`/`X-Frame-Options` refusal is the
      site's policy, not a Dearune error
- [ ] Confirm the saved row: `select payload from projects where id = '…';`
      → `{ language, destinationUrl }`
- [ ] Scan/preview `/message/<public_id>?token=…` and confirm the redirect target

---

### 15. `External Link To Dearune` Shows "Being Bound" / Opens the Unwritten Page

**Symptom:** the paper appears in the chooser (so it is enabled in the archive),
but its card is stamped **being bound** and pressing it turns to *"This paper is
still being drawn"* instead of the address page. Memorial Message still works.

**Cause:** a paper's chapters are chosen by the **code** the archive stores in
`templates.slug` (`TEMPLATE_SEQUENCES` in `src/templates/stages.js` →
`'external-link'`). The Admin Templates editor does not expose `slug` (it edits
the customer-visible `public_path` instead), and the Create form derives a slug
from the name, so a row created as *External Link To Dearune* can be stored as
`external-link-to-dearune`. No book is bound to that code, so the chooser draws
the placeholder and the pipeline never reaches `external.link`.

A stale bundle is **not** the cause when the card is `being bound`: the card
label comes from the same registry that draws the pages, and the deployed
bundle already carries it.

**Fix:** apply
`supabase/migrations/20261102000002_external_link_slug_alignment.sql`. It is
idempotent, matches the row by name / display name / public path / normalised
slug, renames it to `external-link`, and carries any projects started under the
old spelling across. It does **not** touch `public_path`, so preview images
under `templates/<public_path>/` keep resolving.

**Check:**
- [ ] `select slug, public_path, enabled, deleted_at from templates where name ilike '%external%';`
      → `external-link`
- [ ] Hard-reload Create: the card reads **open**, the right page is *"the address
      the code will open"*
- [ ] No second `external-link` row exists (the migration refuses to create a
      duplicate; two candidate rows are a human decision)

---

### 16. Operations Sections Are Empty After Deploying the New Admin

**Symptom:** **Admin → Operations** loads, but Making / Shipping / Delivery /
After-Sale show no rows (or the badges show `0`), while the old unit list still
has units.

**Cause:** the screen reads the `ops_orders` view, and writes go through the
`ops_*` functions — all created by
`supabase/migrations/20261103000001_order_lifecycle.sql`. If that migration has
not been applied, PostgREST answers `relation "public.ops_orders" does not exist`
and the page shows its error state instead of rows.

**Fix:** apply the migration, then reload. It is idempotent and non-destructive,
so re-running it is safe.

**Check:**
- [ ] `select to_regclass('public.ops_orders');` → not `null`
- [ ] `select count(*) from ops_milestone_counts;` → returns without error (it
      groups by milestone, so it only lists stages that currently have orders)
- [ ] No `order.not_paid` error when moving an order: the order must be paid and
      physical (a digital `/create` submission has no production milestone)
- [ ] Orders that predate the migration were backfilled from their stamps; run
      `select * from ops_identity_report;` to find any order whose identifiers
      disagree or that has no canonical ID

---

### 17. Bosta Chosen in the Manifest Import Shows "not supported yet"

**Symptom:** the manifest dialog accepts an Egypt Post workbook, but selecting
**Bosta** refuses with *"Bosta manifests are not supported yet"*.

**Cause:** this is deliberate, not a bug. The Egypt Post adapter was built from
the real shipment workbook
(`src/assets/productionDocuments/Egypt Post Manifest.xlsx`, sheet `Sheet1`, 16
columns). Dearune only has Bosta's **upload template builder**
(`src/services/bosta.js`, used by the print screen) — no Bosta manifest file was
ever provided, so no column mapping exists to validate against.

**Fix (when a Bosta manifest is available):** add a
`readBostaWorkbook()` / `parseBostaRows()` pair in `src/services/carriers.js`,
make `carrierSupportsManifest()` accept `bosta`, and replace `BOSTA.manifestNote`
with the real column notes. The matching, preview and commit code in the
`admin-operations` edge function is carrier-agnostic and does not change.

**Check:**
- [ ] Do **not** guess Bosta column names from the upload template — the two
      files are different formats
- [ ] Until then, ship Bosta parcels from the Shipping section (carrier +
      tracking) and keep using the existing Bosta CSV export for uploads

---

### 18. A Refund Is Refused (ceiling, duplicate, or missing reason)

**Symptom:** recording a refund fails with `refund.exceeds_sale`,
`refund.reason_required` or returns the earlier refund instead of creating a new
one.

**Cause:** `ops_record_refund` enforces four rules in one transaction:

1. amount > 0 and no more than `sale_price − refunds already completed or
   recorded manually` (pending and failed entries do not consume the ceiling);
2. a reason of at least three characters;
3. an idempotency key unique per order, so a double-click cannot record twice;
4. an administrator session (the same backend check as every Operations write).

The order must also already be delivered (`refund.not_delivered`), so a refund
cannot be recorded against a parcel still with the carrier.

**Fix:** correct the input. If the total really is higher than the sale price,
the sale price is wrong — fix it on the sold record rather than bypassing the
ceiling. There is **no payment-provider integration** in this codebase, so a
recorded refund never moves money; the ledger says *recorded manually*.

**Check:**
- [ ] `select amount, status, method, reference, recorded_by, created_at from refunds where project_id = '…' order by created_at;`
- [ ] `select sale_price, refunded_amount, refund_count from ops_orders where project_id = '…';`
- [ ] A `pending`/`failed` refund still counts in the history but the UI never
      claims the customer was paid

---

### 19. "Mark delivered" Looks Unchanged, or the Row Leaves Delivery

**Symptom:** after **Mark delivered** the row looks the same, or it disappears
from Delivery, or it moves to After-Sale by itself.

**Cause:** delivered is a **state**, not an archive. `ops_deliver` writes
`projects.milestone = 'delivered'` and the Delivery section queries
`milestone in ('delivery', 'delivered')` on purpose, so the order stays visible
with a green tint. Leaving Delivery only happens when someone presses **Move to
After-Sale** (`ops_after_sale`).

**Fix:** if the tint does not change, the milestone did not persist — the read
is showing a stale row. Reload; if it still reads `delivery`, check the edge
function response and `projects.milestone_updated_at` / `milestone_updated_by`
for that order.

**Check:**
- [ ] `select milestone, milestone_updated_at, milestone_updated_by from projects where id = '…';`
- [ ] `select shipment_state, shipped_at, delivered_at, delivered_by from shipping where project_id = '…';`
- [ ] A refusal reading `order.transition_denied` / `milestone.transition_denied`
      means the order is already ahead — the guard trigger blocks going back to
      `delivery`

---

### 20. A Milestone Move Is Refused (`milestone.transition_denied`)

**Symptom:** an admin action or a direct
`update projects set milestone = …` fails with
`milestone.transition_denied` or `milestone.digital_production`.

**Cause:** `projects_milestone_guard` is the single judge of a stage change. It
allows only the next stage forward for a physical order, allows `NULL → value`
once, treats an identical value as a no-op, and forbids a digital order entering
`making` / `shipping` / `delivery`.

**Fix:** call the named action instead of writing the column —
`ops_making_complete`, `ops_ship`, `ops_deliver`, `ops_after_sale`, or
`ops_start_work_order` for `configured → sold → making`. To correct a stage that
was recorded wrongly, use `ops_revert_milestone` (maintenance, service role) —
never `update projects`. See `AUTHORITATIVE_ORDER_MODEL.md`.

**Check:**
- [ ] `select milestone from projects where id = '…';` — compare with where you
      are trying to go
- [ ] `select action, actor_type, detail from project_events where project_id = '…' order by created_at desc limit 10;`
- [ ] A digital order: confirm `wrapper_type` resolves to kind `digital`; it can
      only go `sold → delivered`

---

### 21. `ops_revert_milestone` Refuses ("reverse the sale first")

**Symptom:** a backwards correction to `configured` / `sold` fails with
`order.revert_denied: reverse the sale before returning this Dearune to …`.

**Cause:** the order still has `paid_at` (and therefore a sale). Un-selling is a
financial action, not a stage correction, so the revert path refuses to do it
silently.

**Fix:** reverse the sale explicitly first (the Designer/Admin sale action), then
revert the milestone. The revert also clears the stamps (`manufactured_at`,
`shipped_at`, `arrived_at`, unit stamps) that the old stage implied, so a
reverted order does not keep a phantom production history.

**Check:**
- [ ] `select paid_at, manufactured_at, shipped_at, arrived_at from projects where id = '…';`
- [ ] `select action, detail from project_events where project_id = '…' and action = 'order.milestone.reverted';`

---

### 22. Printing Refuses a Unit Because "the QR will not open"

**Symptom:** the print screen blocks a unit with one of:

| Message | Cause | Fix |
|---|---|---|
| No public link yet | `public_id` or `public_token` is missing | activate/generate the message link |
| The letter is switched off | `message_active = false` | switch the letter on |
| The letter is password-protected | `payload.passwordSet = true` | a scan cannot pass the password — turn it off before printing |

**Cause:** QR readiness is one calculation (`order_qr_state`) and the print gate
(`validateOperationForPaper`) refuses any blocked QR — a sheet whose QR cannot
open is wasted paper. A missing customer phone is only a warning.

**Check:**
- [ ] `select * from order_qr_state(public_id, public_token, message_active, coalesce((payload->>'passwordSet')::boolean,false)) from projects where id = '…';`
- [ ] `select qr_openable, qr_blocked_reason from ops_orders where project_id = '…';`

---

### 23. Two Dashboards Show a Different ID / Sold ID / Stage

**Symptom:** the Designer receipt, the Operations row and the Worker row disagree
about an order's identifier or stage.

**Cause:** this is exactly what the unified order model removed. All surfaces
read `projects.reference`, `order_references` (`kind='sold'`), and
`projects.milestone`. A disagreement means a surface is reading something else —
or the record predates the migration.

**Fix:** run the reconciliation view; it names every order whose identifiers or
stored stage disagree:

```sql
select project_id, canonical_id, sold_id, stored_milestone, derived_milestone,
       milestone_mismatch, missing_units, missing_canonical_id, missing_sold_id
from public.ops_identity_report
where milestone_mismatch or missing_canonical_id or missing_sold_id or missing_units;
```

`derived_milestone` exists **only** to spot these disagreements; no screen may
read it as a stage. Resolve each row with `ops_revert_milestone` / the forward
action, never by editing identifiers.

---

## Debugging Tools

### Browser Console

```javascript
// Enable debug logging
localStorage.setItem('debug', 'true')

// React DevTools
// Install React DevTools browser extension

// Redux DevTools (if using Redux)
// Not used in Dearune (custom state)
```

### Network Debugging

```javascript
// In browser DevTools Network tab:
// 1. Filter by "fetch" or "XHR"
// 2. Check request/response headers
// 3. Look for 401, 403, 500 errors
// 4. Check Supabase RPC calls: /functions/v1/*

// Supabase client debug
supabase.auth.onAuthStateChange((event, session) => {
  console.log('[Auth]', event, session)
})

// Supabase client debug
window.__dearuneFetchDiag = { ... }  // Set by invokeFunction on error
```

### React DevTools

```bash
# Install React DevTools browser extension
# Components tab: inspect component tree, props, state
# Profiler tab: record renders, find performance issues
```

### Supabase Dashboard

```
https://supabase.com/dashboard/project/xwgegarncnxswiswsufx
→ Logs → API Gateway (Edge Functions)
→ Logs → Database (PostgreSQL)
→ Logs → Auth
→ Logs → Storage
→ Logs → Realtime
```

### Supabase CLI

```bash
# Local development
supabase start
supabase db reset
supabase functions serve

# Deploy
supabase db push
supabase functions deploy

# Logs
supabase functions logs project-media --project-ref xwgegarncnxswiswsufx
```

### Log Analysis

```bash
# Filter Edge Function logs
supabase functions logs project-media --project-ref xxx | grep ERROR

# Database slow queries
# Supabase Dashboard → Logs → Database → Slow queries
```

---

## Performance Profiling

### React Profiler

```jsx
// Wrap component
import { Profiler } from 'react'

<Profiler id="OperationsTable" onRender={onRender}>
  <OperationsTable data={data} />
</Profiler>

function onRender(id, phase, actualDuration) {
  if (actualDuration > 16) {
    console.warn(`${id} took ${actualDuration}ms`)
  }
}
```

### Bundle Analysis

```bash
# Analyze bundle size
npm run build
npx vite-bundle-analyzer dist

# Check chunk sizes
# Look for chunks > 500KB
```

### Database Query Performance

```sql
-- Enable auto_explain
SET auto_explain.log_min_duration = 100;
SET auto_explain.log_analyze = true;

-- Run query
EXPLAIN ANALYZE SELECT * FROM operations_units WHERE project_id = '...';

-- Check indexes
\d+ public.physical_products
```

---

## Logging Best Practices

### Structured Logging (Edge Functions)

```typescript
import { logInfo, logError } from '../_shared/cors.ts'

logInfo(requestId, 'project-media request started', { publicId, method: req.method })

logError(requestId, 'Rate limit exceeded', error, { publicId, retryAfter: 60 })
```

### Client-Side Logging

```typescript
// Development only
if (import.meta.env.DEV) {
  console.log('[Feature] Action:', { data })
}

// Production: suppress or send to logging service
```

---

## Test Coverage Goals

| Layer | Target | Current |
|---|---|---|
| Unit Tests | >80% | ~60% |
| Integration | >60% | ~40% |
| E2E Critical Paths | 100% | ~80% |

### Coverage Report

```bash
npm run test -- --coverage
# Opens coverage/index.html
```

---

## CI/CD Integration

### GitHub Actions (`.github/workflows/deploy.yml`)

```yaml
jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm' }
      - run: npm ci
      - run: npm run lint
      - run: npm run test
      - run: npm run build

  deploy:
    needs: lint-and-test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: supabase db push
      - run: supabase functions deploy
```

---

## Debugging Checklist

When debugging an issue:

- [ ] Check browser console for errors
- [ ] Check Network tab for failed requests
- [ ] Check Supabase Dashboard logs
- [ ] Check Edge Function logs
- [ ] Verify database state (run queries manually)
- [ ] Check environment variables
- [ ] Clear browser cache/localStorage
- [ ] Check git history for recent changes
- [ ] Run tests locally
- [ ] Check git diff for recent changes