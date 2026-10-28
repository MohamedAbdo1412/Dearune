# Authentication and Permissions

This document describes the authentication systems, authorization model, and permission boundaries in Dearune.

## Three Authentication Systems

Dearune uses three distinct authentication mechanisms:

| System | Users | Mechanism | Session |
|---|---|---|---|
| **Supabase Auth** | Admin, Worker | Email/password + Supabase session cookie | `supabase.auth.getSession()` |
| **Designer JWT** | Designer | Custom HS256 JWT (6-digit code + passcode) | 48h expiry, memory-only |
| **Worker JWT** | Worker | Supabase session + `worker_permissions` checked per-RPC | Per-request via `current_worker_id()` |

## Designer Authentication

### Flow

```
1. Designer enters 6-digit code + 6-digit passcode on /create
2. POST /functions/v1/designer-login
3. Server: bcrypt.compare(passcode, passcode_hash) + designer status check
4. On success: signDesignerJwt({ id, code }, '48h') → HS256 JWT
5. Client stores JWT in memory (not localStorage)
6. Subsequent calls: Authorization: Bearer <jwt>
7. Edge function: verifyDesignerJwt() → { designerId, code }
8. All writes scoped to designerId via RLS / service-role
```

### JWT Payload

```javascript
{
  role: 'designer',
  code: '123456',           // 6-digit designer code
  sub: 'designer-uuid'      // designer.id
}
```

### Token Management

- **Expiry**: 48 hours
- **Storage**: Memory only (never localStorage)
- **Refresh**: Re-login required
- **Draft Secret**: Per-designer 256-bit secret for AES-GCM draft encryption

### Edge Function: `designer-login/index.ts`

```typescript
// Validates code format (6 digits) + passcode format (6 digits)
// Checks designer_login_attempts table for rate limiting (3 failures → 60s lock)
// bcrypt.compare(passcode, passcode_hash)
// Returns: { token, draftSecret, designer: { id, name, code } }
```

## Admin Authentication

### Flow

```
1. Admin enters email/password on /admin/login
2. Supabase Auth: signInWithPassword()
3. Session cookie set by Supabase
4. RequireAdmin guard:
   - supabase.auth.getSession()
   - Check admin_users table for user.id
   - Check workers table (redirect to /worker/home if active worker)
5. If no session → redirect to /admin/login
```

### Guard: `RequireAdmin` (`src/App.jsx:97`)

```typescript
function RequireAdmin({ children }) {
  const [state, setState] = useState('loading'); // 'loading' | 'ok' | 'worker' | 'denied'

  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { setState('denied'); return; }

      const userId = data.session.user.id;
      const [adminResult, workerResult] = await Promise.all([
        supabase.from('admin_users').select('id').eq('id', userId).maybeSingle(),
        supabase.from('workers').select('id, status').eq('id', userId).maybeSingle(),
      ]);

      if (adminResult.data) setState('ok');
      else if (workerResult.data?.status === 'active') setState('worker');
      else setState('denied');
    };
    check();
  }, []);

  if (state === 'loading') return <Loading />;
  if (state === 'worker') return <Navigate to="/worker/home" replace />;
  if (state === 'denied') return <Navigate to="/admin/login" replace />;
  return children;
}
```

## Worker Authentication

### Flow

```
1. Worker enters email/password on /worker/login
2. Supabase Auth: signInWithPassword()
3. WorkerGate guard:
   - Check Supabase session
   - Check workers table (status === 'active')
   - Redirect to /worker/login if denied
4. WorkerPermissionGate checks specific permission per route
```

### Guards

| Guard | File | Checks |
|---|---|---|
| `WorkerGate` | `src/pages/worker/WorkerGate.jsx` | Session + `workers.status = 'active'` |
| `WorkerPermissionGate` | `src/pages/worker/WorkerAccessDenied.jsx` | `worker_has_permission(permission)` |

### Permission Check (RPC)

```sql
-- In worker RPCs:
v_worker_id := public.current_worker_id();
IF v_worker_id IS NULL THEN RAISE EXCEPTION 'worker.unauthenticated';
IF NOT public.worker_has_permission('operations.mark_shipped') THEN RAISE EXCEPTION 'worker.forbidden';
```

### Permission Matrix (24 Permissions)

| Category | Permissions |
|---|---|
| **Operations** | `view`, `view_details`, `create`, `manage`, `edit`, `assign`, `mark_manufactured`, `mark_shipped`, `mark_delivered`, `print`, `export` |
| **Designers** | `view`, `view_details`, `create`, `edit`, `assign`, `manage`, `reset_passcode`, `revoke`, `activate` |
| **Financial** | `view`, `view_revenue`, `view_costs`, `view_profit`, `view_customer_payables`, `view_payments`, `manage`, `export` |
| **QA** | `view` |
| **Messages** | `view`, `send`, `manage` |

## Designer JWT Details

### Signing (`supabase/functions/_shared/auth.ts`)

```typescript
export async function signDesignerJwt(
  designer: { id: string; code: string },
  expiresIn = '48h'
): Promise<string> {
  return new SignJWT({ role: 'designer', code: designer.code })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(designer.id)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(jwtSecret());  // DESIGNER_JWT_SECRET from env
}
```

### Verification

```typescript
export async function verifyDesignerJwt(token: string): Promise<{ designerId: string; code: string } | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret());
    if (payload.role !== 'designer' || typeof payload.sub !== 'string') return null;
    return { designerId: payload.sub, code: String(payload.code ?? '') };
  } catch {
    return null;
  }
}
```

### Passcode Hashing

```typescript
// bcrypt with 120,000 iterations
const passcodeHash = await bcrypt.hash(passcode, 12);
const valid = await bcrypt.compare(enteredPasscode, passcodeHash);
```

## Public Message Access (Recipient)

### URL Format

```
https://dearune.app/message/{publicId}?token={publicToken}
```

### Access Control (`supabase/functions/project-media/index.ts`)

```typescript
const allowed =
  project.public_token &&
  project.public_token === token &&
  project.message_active === true &&
  !protectedLetter &&
  !expired;  // first_activated_at + 2 years > now()
```

### States

| State | Condition | UI |
|---|---|---|
| `loading` | Fetching | Spinner |
| `unavailable` | No project / not active | "Message not available" |
| `password` | `password_protected` | Password form |
| `invalid` | Wrong password | Error + form |
| `expired` | > 2 years from `first_activated_at` | "Message expired" |
| `ready` | Valid | `MemorialLetter` |

### Token Verification

```typescript
const tokenVerified = parsed.token ? parsed.token === storedToken : null;
if (parsed.token && !tokenVerified) {
  throw new QaError(QA_ERROR_KINDS.TOKEN_MISMATCH, 'Wrong token');
}
```

## RLS Policies Summary

### `projects`
- Admin: Full access
- Designer: Own projects only (`designer_id = auth.uid()`)
- Worker: None (via RPCs)

### `physical_products`
- Admin: Full access
- Worker: Via `operations_units` view (security_invoker)

### `sales_log`
- Admin: Full access
- Worker: None (via RPCs)

### `workers` / `worker_permissions`
- Admin: Full access
- Worker: Read own row + permissions

### `designers`
- Admin: Full access
- Designer: Own row (via JWT)

## API Authentication Patterns

### Edge Function Auth Helpers (`supabase/functions/_shared/auth.ts`)

| Function | Purpose |
|---|---|
| `requireAdmin(req)` | Returns `{ id }` or `null` |
| `requireDesigner(req)` | Returns `{ designerId, code }` or `null` |
| `requireWorker(req, permission?)` | Returns `WorkerContext` or `null` |
| `requireAdminOrDesigner(req)` | Returns `{ role, ... }` or `null` |
| `verifyDesignerJwt(token)` | Verifies designer JWT |
| `signDesignerJwt(designer, expiresIn?)` | Signs JWT |

### Usage Pattern

```typescript
Deno.serve(async (req) => {
  const admin = await requireAdmin(req);
  if (!admin) return errorResponse('Unauthorized', 401);

  const designer = await requireDesigner(req);
  if (!designer) return errorResponse('Unauthorized', 401);

  const worker = await requireWorker(req, 'operations.view');
  if (!worker) return errorResponse('Forbidden', 403);
  // ...
});
```

## Session Management

| System | Storage | Expiry | Refresh |
|---|---|---|---|
| Supabase (Admin/Worker) | HttpOnly cookie | 1 hour (access) / 24h (refresh) | Auto via `onAuthStateChange` |
| Designer JWT | Memory only | 48 hours | Re-login |
| Draft Secret | localStorage + IndexedDB | Until revoked | N/A |

## Security Considerations

### JWT Security
- HS256 with 256-bit secret (`DESIGNER_JWT_SECRET`)
- 48h expiry, memory-only storage
- No refresh token (re-login required)

### Passcode Security
- bcrypt with 120,000 iterations
- Rate limiting: 3 failures → 60s lockout
- Passcode never logged

### Public Token
- 32-char cryptographically random
- Printed on QR code (capability)
- 2-year reading window from `first_activated_at`
- Never shown in UI

### Rate Limiting
- `consume_rate_limit` RPC (token bucket)
- Applied to: project-media, designer-projects, worker-designers
- 60 req/min default, configurable

### CORS
- Configured per-function in `_shared/cors.ts`
- `ALLOWED_ORIGINS` env var
- Credentials: true for auth endpoints

## Audit Logging

| Table | Trigger |
|---|---|
| `admin_audit_log` | Admin actions (Edge Functions) |
| `worker_audit_logs` | Worker actions (RPCs) |
| `physical_product_events` | Unit timeline |
| `project_events` | Project lifecycle |
| `order_events` | Legacy orders |

## Session Invalidation

| Event | Action |
|---|---|
| Admin password change | Supabase revokes all sessions |
| Worker status → inactive | Next RPC fails `is_active_worker()` |
| Designer revoked | JWT verification fails `designer.revoked_at` |
| Passcode reset | Old JWT still valid until expiry (48h max) |

## Testing Authentication

### Unit Tests

```javascript
// Vitest
test('verifyDesignerJwt rejects expired token', async () => {
  const expired = await signDesignerJwt({ id: '1', code: '123456' }, '-1h');
  const result = await verifyDesignerJwt(expired);
  expect(result).toBeNull();
});
```

### E2E Tests

```javascript
// Playwright
test('Designer login flow', async ({ page }) => {
  await page.goto('/create');
  await page.fill('#bk-code', '123456');
  await page.fill('#bk-pass', '123456');
  await page.press('#bk-pass', 'Enter');
  await expect(page.locator('#bk-receiver')).toBeVisible();
});
```