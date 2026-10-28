# Adding a Feature

This guide provides a step-by-step process for adding a new feature to Dearune.

## Overview

Adding a feature typically involves changes across multiple layers:
1. **Database** (if schema changes needed)
2. **Backend** (Edge Functions, RPCs)
3. **Services** (client-side API layer)
4. **Components** (React components)
5. **Pages** (route components)
6. **Routing** (guards, navigation)
7. **Tests** (unit + e2e)
8. **Documentation** (update relevant .md files)

---

## Step-by-Step Process

### 1. Requirements & Design

Before writing code:

- [ ] Read relevant architecture docs (`ARCHITECTURE.md`, `DATABASE_AND_SCHEMA.md`)
- [ ] Identify affected components, services, routes, and database tables
- [ ] Check for existing similar features to reuse patterns
- [ ] Define API contracts (RPC signatures, Edge Function APIs)
- [ ] Design database schema changes (if needed)
- [ ] Plan authentication/permission requirements
- [ ] Design UI/UX (reference `DESIGN_SYSTEM.md`)

### 2. Database Changes (if needed)

See [ADDING_A_DATABASE_CHANGE.md](./development/ADDING_A_DATABASE_CHANGE.md)

1. Create migration: `supabase migration new descriptive_name`
2. Write idempotent SQL (`IF NOT EXISTS`, `DROP IF EXISTS`)
3. Include backfill in same migration
4. Test locally: `supabase db reset`
6. Push: `supabase db push`

### 3. Backend (Edge Functions / RPCs)

See [API_AND_BACKEND.md](../API_AND_BACKEND.md)

1. Create or modify Edge Function in `supabase/functions/`
2. Add/update RPCs in migration
3. Handle auth (`requireAdmin`, `requireDesigner`, `requireWorker`)
4. Add rate limiting if public-facing
5. Add structured logging

### 4. Service Layer (`src/services/`)

```javascript
// src/services/feature.js
import { supabase, invokeFunction } from '@/lib/supabase'

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

---

## Adding a Component

See [ADDING_A_COMPONENT.md](./development/ADDING_A_COMPONENT.md)

**Quick Steps:**
1. Create component in `src/components/` (or subdirectory)
2. Export from `src/components/` or `src/components/ui/`
3. Follow naming conventions (PascalCase + `.jsx`)
4. Use `cn()` for class composition
5. Add TypeScript interfaces for props
5. Add unit test
6. Update `COMPONENTS.md`

---

## Adding a Page/Route

See [ADDING_A_PAGE_OR_ROUTE.md](./development/ADDING_A_PAGE_OR_ROUTE.md)

**Quick Steps:**
1. Create page component in `src/pages/` (or subdirectory)
2. Add lazy import in `src/App.jsx`
3. Add `<Route>` with appropriate guards
4. Add navigation links in relevant shells
5. Update `ROUTES_AND_PAGES.md`

---

## Adding Tests

### Unit Tests (Vitest)

```javascript
// tests/feature.test.js
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { transformData } from '@/services/feature'
import { render, screen } from '@testing-library/react'
import { MyComponent } from '@/components/MyComponent'

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

describe('MyComponent', () => {
  test('renders correctly', () => {
    render(<MyComponent prop="value" />)
    expect(screen.getByText('Expected')).toBeInTheDocument()
  })
})
```

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

---

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

---

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

---

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

---

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

---

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

---

> **Remember**: Always verify against current implementation before making changes. Update documentation alongside code changes.