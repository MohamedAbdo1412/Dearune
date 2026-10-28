# Adding a Page or Route

This guide explains how to add a new page or route to the Dearune application.

## Overview

Adding a route involves:
1. Creating the page component
2. Adding lazy import in `src/App.jsx`
3. Adding the `<Route>` with appropriate guards
4. Adding navigation links
5. Updating documentation

---

## Step-by-Step

### 1. Create Page Component

Create the page component in `src/pages/` (or appropriate subdirectory):

```jsx
// src/pages/MyNewPage.jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MyComponent } from '@/components/MyComponent'
import { fetchData } from '@/services/myService'
import { formatDate } from '@/services/format'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function MyNewPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const result = await fetchData()
        if (active) setData(result)
      } catch (e) {
        if (active) setError(messageOf(e))
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false; }
  }, [])

  function messageOf(err) {
    return err instanceof Error ? err.message : 'Something went wrong'
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/70 p-8 text-center">
        <h2 className="font-heading text-xl tracking-tight">Could not load</h2>
        <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{error}</p>
        <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-heading text-3xl tracking-tight">Page Title</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Description</p>
      </header>
      
      <div className="space-y-4">
        {data?.map(item => (
          <Card key={item.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle>{item.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{formatDate(item.createdAt)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function messageOf(err) {
  return err instanceof Error ? err.message : 'Something went wrong'
}

export default MyNewPage
```

---

### 2. Add Lazy Import in `src/App.jsx`

```jsx
// src/App.jsx (top of file)
const MyNewPage = lazy(() => import('@/pages/MyNewPage'))
```

---

### 3. Add Route in `src/App.jsx`

#### Public Route (No Auth)

```jsx
<Route path="/my-new-page" element={<MyNewPage />} />
```

#### Admin Route (Requires Admin Auth)

```jsx
<Route
  path="/admin/my-new-page"
  element={
    <RequireAdmin>
      <MyNewPage />
    </RequireAdmin>
  }
/>
```

#### Worker Route (Requires Worker Auth + Permission)

```jsx
<Route
  path="/worker/my-new-page"
  element={
    <WorkerPermissionGate permission="my.permission">
      <MyNewPage />
    </WorkerPermissionGate>
  }
/>
```

#### Public Route (No Auth, e.g., `/message/:publicId`)

```jsx
<Route path="/my-public-page/:id" element={<MyNewPage />} />
```

---

### 4. Add Navigation Links

#### Admin Sidebar (`src/components/admin/AdminShell.jsx`)

```jsx
<NavLink to="/admin/my-new-page" className={({ isActive }) => cn(
  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium',
  isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
)}>
  <IconClassName className="size-4" />
  My New Page
</NavLink>
```

#### Worker Sidebar (`src/components/worker/WorkerShell.jsx`)

```jsx
<NavLink to="/worker/my-new-page" className={({ isActive }) => cn(
  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium',
  isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
)}>
  <IconClassName className="size-4" />
  My New Page
</NavLink>
```

---

### 5. Update Documentation

Update `docs/project-guide/ROUTES_AND_PAGES.md` with the new route entry.

---

## Route Guards Reference

### `RequireAdmin` (`src/App.jsx`)

```jsx
function RequireAdmin({ children }) {
  // Checks Supabase session + admin_users table
  // Redirects to /admin/login if not admin
  // Redirects to /worker/home if active worker
}
```

### `WorkerGate` (`src/pages/worker/WorkerGate.jsx`)

```jsx
function WorkerGate({ children }) {
  // Checks Supabase session + workers table (status=active)
  // Redirects to /worker/login if not authorized
}
```

### `WorkerPermissionGate` (`src/pages/worker/WorkerAccessDenied.jsx`)

```jsx
function WorkerPermissionGate({ permission, anyOf, children }) {
  // Requires WorkerGate first
  // Checks specific permission or anyOf array
  // Shows WorkerAccessDenied if denied
}
```

---

## Lazy Loading Pattern

```jsx
// For heavy pages (PDF generators, large components)
const HeavyPage = lazy(() => import('@/pages/HeavyPage'))

<Route
  path="/heavy-page"
  element={
    <ErrorBoundary>
      <Suspense fallback={<Loading />}>
        <HeavyPage />
      </Suspense>
    </ErrorBoundary>
  }
/>
```

---

## Route with Query Parameters

```jsx
// URL: /my-page?filter=active&sort=date
function MyPage() {
  const [searchParams] = useSearchParams()
  const filter = searchParams.get('filter') || 'all'
  const sort = searchParams.get('sort') || 'newest'
  
  // Use in fetch
  const data = useFetchData({ filter, sort })
  
  return (
    <select value={filter} onChange={e => navigate(`?filter=${e.target.value}&sort=${sort}`)}>
      <option value="all">All</option>
      <option value="active">Active</option>
    </select>
  )
}
```

---

## Route with Dynamic Parameters

```jsx
// Route: /admin/designers/:designerId/messages/:projectId
// Component:
function MessageDetail() {
  const { designerId, projectId } = useParams()
  const { data } = useFetchMessage(designerId, projectId)
  // ...
}

// Route definition:
<Route path="designers/:designerId/messages/:projectId" element={<MessageDetail />} />
```

---

## Route Testing Checklist

- [ ] Direct URL access works
- [ ] Browser refresh (F5) preserves state
- [ ] Back/forward navigation works
- [ ] Unauthorized access redirects correctly
- [ ] Expired session redirects to login
- [ ] Missing permissions shows access denied
- [ ] Invalid route params show 404
- [ ] Mobile viewport (375px) works
- [ ] Desktop viewport (1440px) works
- [ ] Print preview works (if applicable)
- [ ] QR scan → message flow works

---

## Adding Route to Documentation

Update `docs/project-guide/ROUTES_AND_PAGES.md`:

```markdown
### New Feature Routes

| Route | Component | Purpose | Auth | Required Permission |
|---|---|---|---|---|
| `/my-new-page` | `MyNewPage` | Description | None | - |
| `/admin/my-new-page` | `MyNewPage` | Admin feature | Admin | - |
| `/worker/my-new-page` | `MyNewPage` | Worker feature | Worker | `my.permission` |
```

---

## Quick Checklist

- [ ] Page component created in `src/pages/`
- [ ] Lazy import added to `src/App.jsx`
- [ ] `<Route>` added with correct guards
- [ ] Navigation link added to sidebar
- [ ] `ROUTES_AND_PAGES.md` updated
- [ ] Route tested: direct access, refresh, back/forward
- [ ] Unauthorized access tested
- [ ] Mobile viewport tested (375px)
- [ ] Desktop viewport tested (1440px)
- [ ] Print preview tested (if applicable)
- [ ] QR scan → message flow works