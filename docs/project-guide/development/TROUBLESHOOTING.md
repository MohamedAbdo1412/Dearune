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