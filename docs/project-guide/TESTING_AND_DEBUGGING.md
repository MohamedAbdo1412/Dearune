# Testing and Debugging

This document describes the testing strategies, debugging techniques, and quality assurance practices for Dearune.

## Testing Strategy

### Test Pyramid

```
                    ┌─────────────┐
                    │   E2E Tests │  ← Few, high confidence
                    │  (Playwright)│
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │    Integration Tests    │  ← Some, medium confidence
              │      (Vitest + PGLite)  │
              └───────────┬─────────────┘
                          │
       ┌──────────────────┴──────────────────┐
       │          Unit Tests                 │  ← Many, fast
       │        (Vitest)                     │
       └─────────────────────────────────────┘
```

## Unit Tests (Vitest)

### Configuration (`vitest.config.js`)

```javascript
export default defineConfig({
  environment: 'node',
  include: ['tests/**/*.test.js'],
  globals: true,
  setupFiles: ['./tests/helpers/setup.js'],
});
```

### Running Tests

```bash
# Run all tests
npm run test

# Run specific test file
npm run test -- tests/operations-list.test.js

# Watch mode
npm run test -- --watch

# Coverage
npm run test -- --coverage
```

### Test Structure

```
tests/
├── helpers/
│   └── setup.js              # Test utilities, mocks
├── app-pwa.test.js           # PWA manifest/app registration
├── batch-review.test.js      # Batch review logic
├── book-machine.test.js      # BookMachine state machine
├── bosta-export.test.js      # Bosta Excel export
├── catalog-state.test.js     # Catalog state management
├── dearune-ops.test.js       # Dearune operations
├── invoke-sdk.test.js        # SDK invocation
├── operations-db.test.js     # Operations DB queries
├── operations-list.test.js   # Operations list shaping
├── order-stage.test.js       # Order stage logic
├── pdf.test.js               # PDF generation
├── pipeline.test.js          # Full pipeline
├── qa-lookup.test.js         # QA lookup
├── qr-paper.test.js          # QR paper PDF generation
├── shipping-csv.test.js      # Shipping CSV export
├── template-contract.test.js # Template contract
├── validation.test.js        # Validation schemas
├── worker-permissions.test.js # Worker permissions
└── wrappers.test.js          # Wrapper catalog
```

### Writing Unit Tests

```javascript
// tests/feature.test.js
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { transformData } from '@/services/feature'
import { render, screen } from '@testing-library/react'
import { OperationsBadge } from '@/components/admin/operations-status'

describe('feature', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('transforms data correctly', () => {
    const input = { raw: 'data' }
    const output = transformData(input)
    expect(output).toEqual({ expected: 'result' })
  })
})

describe('OperationsBadge', () => {
  test('renders correct phase for delivered status', () => {
    render(<OperationsBadge status="delivered" />)
    expect(screen.getByText('Delivered')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveClass('bg-emerald-500/10')
  })

  test('renders pending as queued phase', () => {
    render(<OperationsBadge status="pending" />)
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })
})
```

### Mocking Supabase

```javascript
// tests/helpers/setup.js
import { vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
  currentAccessToken: vi.fn().mockResolvedValue('mock-token'),
  invokeFunction: vi.fn().mockResolvedValue({ data: null, error: null }),
}))
```

## E2E Tests (Playwright)

### Configuration

E2E tests are standalone Node scripts in `e2e/` run with Playwright directly (not via Vitest).

### Running E2E Tests

```bash
# Start dev server first
npm run dev

# In another terminal, run individual tests
node e2e/admin-mobile.mjs
node e2e/qa-scanner.mjs
node e2e/qa-real-qr.mjs
node e2e/pwa-install.mjs
node e2e/pwa-apps.mjs
node e2e/admin-shots.mjs
```

### E2E Test Structure

| Script | Purpose |
|---|---|
| `admin-mobile.mjs` | Mobile viewport tests (375/375/768px) |
| `admin-shots.mjs` | Admin screenshot generator |
| `pipeline.mjs` | Full designer→admin→worker pipeline |
| `probe-login.mjs` | Designer login + draft flow |
| `pwa-apps.mjs` | PWA manifest/worker verification |
| `pwa-install.mjs` | Install prompt verification |
| `qa-catalog.mjs` | QA catalog visual regression |
| `qa-memorial.mjs` | Memorial letter visual regression |
| `qa-real-qr.mjs` | Real QR code scan test |
| `qa-scanner.mjs` | QA scanner functionality |
| `seek-seal.mjs` | Designer login → template → receiver flow |

### Writing E2E Tests

```javascript
// e2e/feature.mjs
import { chromium } from 'playwright'
import { expect } from 'playwright/test'

const browser = await chromium.launch()
const page = await browser.newPage()

try {
  await page.goto('http://localhost:5173/feature')
  await expect(page.locator('h1')).toContainText('Feature')
  
  await page.fill('#input', 'test value')
  await page.click('button[type=submit]')
  
  await expect(page.locator('.success')).toBeVisible()
} finally {
  await browser.close()
}
```

### Visual Regression

```javascript
// Screenshot comparison
await page.screenshot({ path: 'shots/feature.png', fullPage: true })

// Compare with baseline
// e2e/shots/feature.png (baseline)
```

## Debugging Techniques

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

```bash
# Go to Supabase Dashboard → Project → Logs
# Check:
# - API Gateway logs (Edge Function invocations)
# - Database logs (slow queries, errors)
# - Auth logs (sign-ins, failures)
# - Realtime subscriptions
# - Storage operations
```

## Common Debugging Scenarios

### 1. "Shipping is not defined" Error

**Error:** `ReferenceError: shipping is not defined`
**Location:** `src/services/operations.js:127`

**Fix:** The `toOperation` function references `shipping` but it's not destructured.

```javascript
// Fix in toOperation(row)
const shipping = row.shipping ?? {}  // Add this line
recipientName: row.recipient_name ?? shipping?.recipient_name ?? row.project_title ?? '',
```

### 2. Build Fails: Missing Module

**Error:** `Could not load src/components/create/MemorialLetter`

**Fix:** Fix import path in `PublicMessage.jsx`

```javascript
// Wrong
import MemorialLetter from '@/components/create/MemorialLetter'

// Correct
import MemorialLetter from '@/templates/memorial-message/v1/MemorialLetter'
```

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

### 4. Migration Fails: Column "status" Does Not Exist

**Error:** `ERROR: column "status" does not exist`

**Cause:** Migration references dropped `status` column.

**Fix:** Update migration to use milestone timestamps.

```sql
-- Instead of: WHERE pp.status = 'delivered'
-- Use: WHERE pp.delivered_at IS NOT NULL
```

### 5. PWA Install Not Showing

**Cause:** Missing manifest, service worker, or HTTPS requirement.

**Checklist:**
- [ ] `npm run build` completed
- [ ] `npm run preview` serves `dist/` on HTTPS (localhost works)
- [ ] `public/manifest.webmanifest` exists
- [ ] `public/sw.js` registers
- [ ] `vite.config.js` has `VitePWA` plugin
- [ ] `index.html` has `<link rel="manifest">`

### 6. Designer Login Fails

**Error:** "We couldn't verify those details"

**Checklist:**
- [ ] Designer exists in `designers` table
- [ ] `code` is 6 digits
- [ ] `passcode_hash` exists and matches bcrypt
- [ ] `revoked_at` is null
- [ ] `designer_login_attempts` not locked out

### 7. Worker Can't Advance Milestone

**Error:** `maintenance_mode` or `shipping_address_missing`

**Checklist:**
- [ ] `app_settings.maintenance_mode = false`
- [ ] Shipping record exists with `recipient_name`, `address_line1`, `city`, `country`
- [ ] Worker has `operations.mark_shipped` permission
- [ ] Project `manufactured_at` is set

### 8. QR Code Not Scanning

**Checklist:**
- [ ] QR code generated with correct `publicId` + `token`
- [ ] `public_id` matches project
- [ ] `public_token` matches project
- [ ] QR size ≥ 2cm × 2cm on paper
- [ ] Lighting adequate
- [ ] Camera permission granted

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

### 10. Rate Limit Exceeded

**Error:** `rate_limit_exceeded` (429)

**Check:**
- [ ] `rate_limit_buckets` table has entries
- [ ] `consume_rate_limit` RPC deployed
- [ ] Client handles 429 with retry-after

## Debugging Tools

### Supabase Dashboard

```
https://supabase.com/dashboard/project/xwgegarncnxswiswsufx
→ Logs → API Gateway (Edge Functions)
→ Logs → Database (PostgreSQL)
→ Logs → Auth
→ Logs → Storage
```

### Browser DevTools

| Tab | Use For |
|---|---|
| Console | JS errors, logs |
| Network | Failed requests, timing |
| Application | localStorage, IndexedDB, Service Workers |
| Elements | DOM inspection |
| Sources | Breakpoints, stack traces |

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