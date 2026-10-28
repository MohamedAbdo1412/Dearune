# Feature Development Guide

This guide provides a repeatable process for adding features to Dearune, from requirements through implementation, testing, and documentation.

## Overview

Dearune follows a structured feature development process that respects the existing architecture, maintains consistency, and ensures quality.

## Feature Development Process

### 1. Requirements & Design

**Before writing code:**

- [ ] Read relevant architecture docs (`ARCHITECTURE.md`, `DATABASE_AND_SCHEMA.md`)
- [ ] Identify affected components, services, routes, and database tables
- [ ] Check for existing similar features to reuse patterns
- [ ] Define API contracts (RPC signatures, Edge Function APIs)
- [ ] Design database schema changes (if needed)
- [ ] Plan authentication/permission requirements
- [ ] Design UI/UX (reference `DESIGN_SYSTEM.md`)

### 2. Implementation Order

**Recommended sequence:**

1. **Database** → Migrations first (if schema changes)
2. **Backend** → Edge Functions, RPCs, RLS policies
3. **Services** → Client-side API layer (`src/services/`)
4. **Components** → Reusable UI components (`src/components/`)
5. **Pages** → Route components (`src/pages/`)
6. **Routing** → Update `src/App.jsx` with guards
7. **Tests** → Unit + e2e coverage
8. **Documentation** → Update relevant `.md` files

## Adding a Database Change

See [ADDING_A_DATABASE_CHANGE.md](./development/ADDING_A_DATABASE_CHANGE.md) for detailed migration guide.

**Quick Checklist:**
- [ ] Create migration file: `supabase migration new descriptive_name`
- [ ] Write idempotent SQL (`IF NOT EXISTS`, `DROP IF EXISTS`)
- [ ] Include backfill in same migration
- [ ] Test locally: `supabase db reset`
- [ ] Update TypeScript types if needed
- [ ] Push: `supabase db push`

## Adding a Page/Route

See [ADDING_A_PAGE_OR_ROUTE.md](./development/ADDING_A_PAGE_OR_ROUTE.md) for complete guide.

**Quick Steps:**
1. Create page component in `src/pages/` (or subdirectory)
2. Add lazy import in `src/App.jsx`
3. Add `<Route>` with appropriate guards
4. Add navigation links in relevant shells
5. Update `ROUTES_AND_PAGES.md`

## Adding a Component

See [ADDING_A_COMPONENT.md](./development/ADDING_A_COMPONENT.md) for complete guide.

**Quick Steps:**
1. Create component in `src/components/` (or subdirectory)
2. Export from `src/components/` or `src/components/ui/`
3. Follow naming conventions (PascalCase + `.jsx`)
4. Use `cn()` for class composition
5. Add TypeScript interfaces for props
6. Add unit test
7. Update `COMPONENTS.md`

## Adding an Edge Function

### 1. Create Function Directory

```
supabase/functions/new-function/
├── index.ts
```

### 2. Boilerplate Template

```typescript
// supabase/functions/new-function/index.ts
import { corsHeaders, errorResponse, handleOptions, jsonResponse, withRequestId } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
import { requireAdmin } from '../_shared/auth.ts'

Deno.serve(async (req) => {
  return withRequestId(req, async (requestId) => {
    if (req.method === 'OPTIONS') return handleOptions()
    if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

    const admin = await requireAdmin(req)
    if (!admin) return errorResponse('Unauthorized', 401)

    try {
      const body = await req.json()
      // Validation
      // Business logic
      return jsonResponse({ success: true })
    } catch (e) {
      return errorResponse(e instanceof Error ? e.message : 'Error', 500, {}, requestId)
    }
  })
})
```

### 3. Shared Module Imports

```typescript
import { corsHeaders, errorResponse, handleOptions, jsonResponse, withRequestId } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
import { requireAdmin, requireDesigner, requireWorker } from '../_shared/auth.ts'
import { googleAccessToken, driveEnsureFolder } from '../_shared/drive.ts'
```

### 4. Deploy

```bash
supabase functions deploy new-function
```

## Adding a Service Function

### Pattern: `src/services/feature.js`

```javascript
import { supabase, invokeFunction } from '@/lib/supabase'
import { SOME_CONSTANT } from './constants'

// Pure functions first (testable)
export function transformData(raw) {
  return { ... }
}

// Async API calls
export async function fetchFeature(params = {}) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('table')
    .select(COLUMNS)
    .eq('id', params.id)
  if (error) throw error
  return mapToUI(data)
}

export async function createFeature(payload) {
  const { data, error } = await supabase.from('table').insert(payload).select().single()
  if (error) throw error
  return mapToUI(data)
}
```

**Guidelines:**
- Pure functions first (testable)
- Single responsibility per file
- Consistent error handling (`throw error`)
- Map DB shapes to UI shapes in service layer

## Adding a Database Change

See [ADDING_A_DATABASE_CHANGE.md](./development/ADDING_A_DATABASE_CHANGE.md) for full guide.

**Migration Template:**

```sql
-- ============================================================================
-- Description: Brief description of change
-- ============================================================================

-- 1. Schema changes (idempotent)
ALTER TABLE public.table_name
  ADD COLUMN IF NOT EXISTS new_column text;

-- 2. Constraints/Indexes
CREATE INDEX IF NOT EXISTS idx_table_column
  ON public.table (column);

-- 3. Data migration (in same migration)
UPDATE public.table
SET new_column = 'default'
WHERE new_column IS NULL;

-- 4. RLS policies (if needed)
ALTER TABLE public.table ENABLE ROW LEVEL SECURITY;
CREATE POLICY policy_name ON public.table
  FOR SELECT TO authenticated
  USING (condition);

-- 5. Grants
GRANT SELECT ON public.table TO authenticated;
```

**Naming:** `YYYYMMDDHHMMSS_descriptive_name.sql`

## Adding a Template

See [ADDING_A_TEMPLATE.md](./development/ADDING_A_TEMPLATE.md) for complete guide.

**Quick Steps:**
1. Create `src/templates/new-template/v1/` with components
2. Add manifest + registration in `src/templates/registry/index.js`
3. Add to `TEMPLATE_VERSIONS` in `src/services/constants.js`
4. Create migration for `templates` table insert
5. Add wrapper options in `template_wrapper_options`

## Adding a Storage Provider

### 1. Implement Provider Interface

```typescript
// src/services/storage/newProvider.ts
export async function uploadToNewProvider(sb, designerId, bytes, mimeType, originalName) {
  // 1. Auth with provider
  // 2. Upload bytes
  // 4. Return { path, storageProvider: 'newProvider', mimeType, sizeBytes, originalName }
}

export async function downloadFromNewProvider(path) {
  // Return Blob or ReadableStream
}
```

### 2. Update Provider Resolution

```typescript
// src/services/media.js or storage abstraction
async function resolveStorageProvider(sb) {
  const { data } = await sb.from('app_settings')
    .select('storage_provider').eq('id', 1).maybeSingle()
  return data?.storage_provider === 'google_drive' ? 'google_drive' : 'supabase'
  // Add new provider here
}
```

### 3. Update Upload/Download Logic

```typescript
const provider = await resolveStorageProvider(sb)
const storagePath = provider === 'newProvider'
  ? await uploadToNewProvider(sb, designerId, bytes, mimeType, originalName)
  : await uploadToSupabase(sb, designerId, bytes, mimeType, extension, fixedName)
```

## Testing Strategy

### Unit Tests (Vitest)

```javascript
// tests/feature.test.js
import { describe, test, expect } from 'vitest'
import { transformData } from '@/services/feature'
import { render, screen } from '@testing-library/react'
import { OperationsBadge } from '@/components/admin/operations-status'

describe('feature', () => {
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

**Run:** `npm run test`

### E2E Tests (Playwright)

```javascript
// e2e/feature.mjs
import { chromium } from 'playwright'

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

**Run:** `node e2e/feature.mjs` (requires `npm run dev` running)

## Code Review Checklist

Before submitting PR:

- [ ] `npm run lint` passes
- [ ] `npm run test` passes
- [ ] `npm run build` passes
- [ ] TypeScript compiles (`npx tsc --noEmit`)
- [ ] No console.log/debugger in production code
- [ ] No hardcoded secrets
- [ ] Proper error handling
- [ ] Proper TypeScript types
- [ ] Responsive design
- [ ] Dark mode support
- [ ] Accessibility (ARIA, keyboard)
- [ ] Unit tests for new logic
- [ ] E2E test for critical paths
- [ ] Documentation updated

## Documentation Updates Required

After implementing a feature, update:

| Document | When |
|---|---|
| `FILE_CATALOG.md` | New files added |
| `CODE_REFERENCE.md` | New exports/functions |
| `ROUTES_AND_PAGES.md` | New routes |
| `COMPONENTS.md` | New components |
| `DATABASE_AND_SCHEMA.md` | Schema changes |
| `API_AND_BACKEND.md` | New RPCs/Edge Functions |
| `STORAGE_SYSTEM.md` | Storage changes |
| `ROUTES_AND_PAGES.md` | New routes |
| `COMPONENTS.md` | New components |
| `DESIGN_SYSTEM.md` | New design tokens/components |
| `FEATURE_DEVELOPMENT_GUIDE.md` | New patterns |
| `TEMPLATE_DEVELOPMENT_GUIDE.md` | Template changes |
| `ADMIN_AND_WORKER_WORKFLOWS.md` | Workflow changes |

## Example: Adding a "Notes" Feature to Operations

### 1. Database
```sql
-- migration
ALTER TABLE physical_products ADD COLUMN IF NOT EXISTS notes text;
```

### 2. Service
```javascript
// src/services/operations.js
export async function updateOperationNotes(productId, notes) {
  const { data, error } = await supabase
    .from('physical_products')
    .update({ notes, updated_at: new Date().toISOString() })
    .eq('id', productId)
    .select('notes')
    .single()
  if (error) throw error
  return data.notes
}
```

### 3. Component
```jsx
// src/components/admin/OperationNotes.jsx
export function OperationNotes({ operation, onSave }) {
  const [notes, setNotes] = useState(operation.notes);
  return <Textarea value={notes} onChange={e => setNotes(e.target.value)} />;
}
```

### 4. Page Integration
```jsx
// In Operations.jsx detail sheet
<OperationNotes operation={detail} onSave={saveEdit} />
```

### 5. Documentation
- Update `FILE_CATALOG.md`
- Update `COMPONENTS.md`
- Update `ROUTES_AND_PAGES.md`

## Common Patterns Reference

| Task | Reference |
|---|---|
| Add page/route | `ROUTES_AND_PAGES.md`, `ADDING_A_PAGE_OR_ROUTE.md` |
| Add component | `COMPONENTS.md`, `ADDING_A_COMPONENT.md` |
| Add service | `CODE_REFERENCE.md`, `src/services/` |
| Add migration | `DATABASE_AND_SCHEMA.md`, `ADDING_A_DATABASE_CHANGE.md` |
| Add Edge Function | `API_AND_BACKEND.md` |
| Add template | `TEMPLATE_DEVELOPMENT_GUIDE.md`, `ADDING_A_TEMPLATE.md` |
| Add storage provider | `STORAGE_SYSTEM.md`, `ADDING_A_STORAGE_PROVIDER.md` |
| Add test | `TESTING_AND_DEBUGGING.md` |
| Deploy | `DEPLOYMENT_AND_OPERATIONS.md` |

> **Remember**: Always verify against current implementation before making changes. Update documentation alongside code changes.