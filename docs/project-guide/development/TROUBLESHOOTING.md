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