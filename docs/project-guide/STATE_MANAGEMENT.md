# State Management

This document describes the state management patterns, data fetching strategies, and client-side state in Dearune.

## State Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           STATE MANAGEMENT LAYERS                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    SERVER STATE (TanStack Query-like)               │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │   │
│  │  │ Operations  │  │   Templates │  │   Wrappers  │  │  Workers  │  │   │
│  │  │   List      │  │   Catalog   │  │   Catalog   │  │   List    │  │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬─────┘  │   │
│  │         │                │                │                │         │   │
│  │         ▼                ▼                ▼                ▼         │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │              Custom Hooks (useOperations, etc.)             │    │   │
│  │  │  - Stale-while-revalidate                                   │    │   │
│  │  │  - Manual refetch on mutation                               │    │   │
│  │  │  - Optimistic updates (where applicable)                    │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    CLIENT STATE (React State)                       │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────────┐   │   │
│  │  │ Theme      │ │ Draft      │ │ Install    │ │ Auth Sessions  │   │   │
│  │  │ (localStorage)│ │ (localStorage│ │ Dismissals  │ │ (Supabase)   │   │   │
│  │  │            │ │  + IndexedDB)│ │ (localStorage)│ │              │   │   │
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Server State (Custom Query Hooks)

### Pattern: Custom Fetch Hooks

All server state uses custom hooks wrapping `supabase` calls with consistent patterns:

```typescript
// src/hooks/use-operations.ts
export function useOperations({ includeArchived = false } = {}) {
  return useQuery({
    queryKey: ['operations', includeArchived],
    queryFn: () => fetchOperations({ includeArchived }),
    staleTime: 30_000,
  });
}
```

### Available Query Hooks

| Hook | File | Query Function | Stale Time |
|---|---|---|---|
| `useOperations` | `src/hooks/use-operations.ts` | `fetchOperations` | 30s |
| `useWorkerOperations` | `src/hooks/use-worker-operations.ts` | `fetchWorkerOperations` | 30s |
| `useTemplates` | `src/hooks/use-templates.ts` | `fetchTemplates` | 5min |
| `useWrappers` | `src/hooks/use-wrappers.ts` | `fetchWrapperTypes` | 10min |
| `useWorkers` | `src/hooks/use-workers.ts` | `fetchWorkers` | 5min |
| `useFinancialOverview` | `src/hooks/use-financial.ts` | `fetchWorkerFinancialOverview` | 2min |

### Query Hook Pattern

```typescript
// Standard pattern used across all hooks
export function useXxx(params = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const result = await fetchXxx(params);
        if (active) setData(result);
      } catch (e) {
        if (active) setError(messageOf(e));
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [params]);

  const refetch = useCallback(() => load(), [params]);

  return { data, error, loading, refetch };
}
```

## Client State

### Theme (`next-themes`)

```typescript
// src/main.jsx
<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
  <App />
</ThemeProvider>
```

**Storage:** `localStorage` key `theme`
**Values:** `light` | `dark` | `system`

### Designer Draft State

**Storage:** Dual persistence
- **Primary:** `localStorage` (refs + small data)
- **Large files:** `IndexedDB` (photos, audio)

**Key:** `dearune.draft.v2.{designerId}`

```typescript
// src/services/draft.js
export async function saveDraft(designerId, draft) {
  const key = `dearune.draft.v2.${designerId}`;
  localStorage.setItem(key, JSON.stringify(draft));
  // Large media → IndexedDB
}

export async function loadDraft(designerId) {
  const key = `dearune.draft.v2.${designerId}`;
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : null;
}
```

**Draft Structure:**
```typescript
interface Draft {
  templateSlug: string;
  templateVersion: number;
  wrapperType: string;
  receiverName: string;
  letter: {
    greeting: string;
    body: string;
    closing: string;
    senderName: string;
    language: 'en' | 'ar';
    photos: Array<{ path, originalName, mimeType }>;
    audio: { path, originalName, mimeType } | null;
    passwordSet: boolean;
    letterPasswordHash?: string;
  };
  media: MediaRef[];
  updatedAt: string;
}
```

### PWA Install State

**Keys:**
- `dearune:install-dismissed` - Timestamp (30-day TTL)
- `dearune:installed-apps` - Array of installed app IDs

```typescript
// src/pwa/install.ts
const DISMISSED_KEY = 'dearune:install-dismissed';
const DISMISSED_FOR = 30 * 24 * 60 * 60 * 1000; // 30 days
const INSTALLED_KEY = 'dearune:installed-apps';
```

### Install Dismissal Logic

```typescript
function readDismissedUntil() {
  return Number(localStorage.getItem(DISMISSED_KEY)) || 0;
}

function writeDismissedUntil(value) {
  localStorage.setItem(DISMISSED_KEY, String(value));
}
```

### Worker Session

**Source:** Supabase Auth session cookie
**Refreshed via:** `onAuthStateChange`

```typescript
// src/hooks/use-worker-session.ts
export function useWorkerSession() {
  const [worker, setWorker] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) { setWorker(null); setPermissions([]); setLoading(false); return; }
      // Check admin_users, then workers table
      // Fetch permissions from worker_permissions
    });
  }, []);

  return { worker, permissions, loading };
}
```

## Data Fetching Patterns

### Standard List Fetch

```typescript
export async function fetchXxx(params = {}) {
  if (!supabase) throw new Error('Supabase not configured');
  let query = supabase.from('table').select(COLUMNS);
  // Apply filters
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapToUI);
}
```

### Single Item Fetch

```typescript
export async function fetchXxxById(id) {
  const { data, error } = await supabase
    .from('table')
    .select(COLUMNS)
    .eq('id', id)
    .single();
  if (error) throw error;
  return mapToUI(data);
}
```

### Pagination (Operations)

```typescript
// Pattern for future pagination
export async function fetchPaginated({ page = 1, pageSize = 50 } = {}) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await supabase
    .from('table')
    .select(COLUMNS, { count: 'exact' })
    .range(from, to);
  return { data: (data ?? []).map(mapToUI), count };
}
```

### Operations order screen (server state)

`src/pages/admin/Operations.jsx` keeps **no order data of its own**. Its state is
only the query (filters, sort key, page, debounced search) plus the last
response:

- `fetchOrders()` sends the query to `ops_orders`; filtering, sorting and
  paging happen in Postgres, and the response includes `count` for pagination.
- Typing is instant; the search value is debounced 300 ms before it becomes a
  query, so a keystroke does not hit the network.
- Every mutation calls the `admin-operations` edge function and then re-reads the
  database (`refreshToken`); there is no optimistic stage change, because the
  database is the authority on the milestone.
- Row tint, delivered state and the next action are derived from the fetched
  row (`rowStateClass`, `isDelivered`, `nextAction`), so a refresh shows the same
  colour as the click did.
- Loading, empty and error states are explicit; a failed read shows the error
  and a retry, never an empty table that looks like "no orders".

## Mutation Patterns

### Optimistic Updates (Where Used)

```typescript
// Example: Archive operation
const archive = async (productIds, shouldArchive) => {
  setBulkBusy(true);
  try {
    // Optimistic update
    setRows(current => current.map(r => 
      productIds.includes(r.id) ? { ...r, archived: shouldArchive } : r
    ));
    await archiveWorkerOperations(productIds, shouldArchive);
    toast.success(...);
  } catch (e) {
    // Rollback on error
    setRows(prev => prev.map(r => 
      productIds.includes(r.id) ? { ...r, archived: !shouldArchive } : r
    ));
    throw e;
  } finally {
    setBulkBusy(false);
  }
}
```

### Standard Mutation (No Optimistic)

```typescript
const saveEdit = async () => {
  if (!detail) return;
  setBusyId(detail.id);
  try {
    await updateWorkerOperation(detail.id, { notes });
    if (detail.customer_phone !== phone) {
      await updateWorkerOperationContact(detail.project_id, phone);
    }
    toast.success('Saved');
    setEditOpen(false);
    await load(); // Full refetch
  } catch (e) {
    toast.error(messageOf(e));
  } finally {
    setBusyId('');
  }
}
```

## Real-time Subscriptions

### App Settings (Admin)

```typescript
// src/hooks/use-app-settings.ts
useEffect(() => {
  const channel = supabase
    .channel('app_settings_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, 
      () => refetch())
    .subscribe();
  return () => supabase.removeChannel(channel);
}, [refetch]);
```

### Auth State Changes

```typescript
// In RequireAdmin, WorkerGate, etc.
const sub = supabase.auth.onAuthStateChange(() => {
  void check();
});
return () => sub.data.subscription.unsubscribe();
```

## Caching Strategy

| Data Type | Cache Strategy | Invalidation |
|---|---|---|
| Operations list | Stale-while-revalidate (30s) | Manual refetch |
| Templates | Stale-while-revalidate (5min) | Manual refetch |
| Wrappers | Stale-while-revalidate (10min) | Manual refetch |
| Workers | Stale-while-revalidate (5min) | Manual refetch |
| Drafts | localStorage + IndexedDB | Manual clear |
| Theme | localStorage | N/A |
| Install dismissals | localStorage (30-day TTL) | Time-based |

## State Modification Checklist

When adding/modifying state:

- [ ] Determine if server or client state
- [ ] Choose appropriate persistence (memory, localStorage, IndexedDB, Supabase)
- [ ] Define TypeScript interfaces
- [ ] Add to appropriate hook/service
- [ ] Handle loading/error/empty states
- [ ] Add cache invalidation strategy
- [ ] Update TypeScript types
- [ ] Test offline/flaky network scenarios
- [ ] Document in STATE_MANAGEMENT.md