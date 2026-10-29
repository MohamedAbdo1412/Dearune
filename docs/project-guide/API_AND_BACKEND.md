# API and Backend

This document describes all API endpoints, Edge Functions, RPCs, and backend services in Dearune.

## Edge Functions Overview

All 17 Edge Functions are written in Deno + TypeScript and deployed via Supabase. Shared utilities in `_shared/`.

| Function | Auth | Path | Purpose |
|---|---|---|---|
| `admin-dearunes` | Admin | `/functions/v1/admin-dearunes` | Project CRUD, status transitions |
| `admin-operations` | Admin | `/functions/v1/admin-operations` | Physical products CRUD, milestones |
| `admin-designers` | Admin | `/functions/v1/admin-designers` | Designer CRUD, passcode reset |
| `admin-workers` | Admin | `/functions/v1/admin-workers` | Worker CRUD, permissions |
| `create-sale` | Admin | `/functions/v1/create-sale` | Sale creation (legacy + new) |
| `designer-login` | Custom JWT | `/functions/v1/designer-login` | 6-digit code + passcode → JWT |
| `designer-media` | Designer JWT | `/functions/v1/designer-media` | Draft media upload/download/delete |
| `designer-message` | Designer JWT | `/functions/v1/designer-message` | Read own project |
| `designer-messages` | Designer JWT | `/functions/v1/designer-messages` | List own projects |
| `designer-projects` | Designer JWT | `/functions/v1/designer-projects` | Submit project |
| `designer-templates` | Designer JWT | `/functions/v1/designer-templates` | Template catalog for Create |
| `drive-create-upload` | Admin/Designer | `/functions/v1/drive-create-upload` | Google Drive upload session |
| `drive-delete-media` | Admin/Designer | `/functions/v1/drive-delete-media` | Drive media deletion |
| `drive-media` | Admin/Designer | `/functions/v1/drive-media` | Drive media streaming |
| `link-check` | Designer JWT | `/functions/v1/link-check` | Reachability + framing check for `external-link` |
| `project-media` | Public token | `/functions/v1/project-media` | Public media signed URLs/redirects |
| `worker-designers` | Worker JWT | `/functions/v1/worker-designers` | Worker designer management |

## Edge Function Details

### `admin-dearunes` (`supabase/functions/admin-dearunes/index.ts`)

**Auth:** Admin (requireAdmin)

| Method | Action | Body | Response |
|---|---|---|---|
| `GET` | List projects | Query: `includeArchived` | `{ projects }` |
| `POST` | Create project | `{ templateSlug, wrapperType, title, payload }` | `{ project }` |
| `PATCH` | Update project | `{ projectId, ...patches }` | `{ project }` |
| `DELETE` | Archive project | `{ projectId }` | `{ success }` |

**Status Transitions:** Admin can set `status` to `submitted`, `delivered`, `archived`.

### `admin-operations` (`supabase/functions/admin-operations/index.ts`)

**Auth:** Admin (requireAdmin)

| Action | Method | Body | Description |
|---|---|---|---|
| `list` | GET | Query: `includeArchived` | List operations |
| `ensure` | POST | `{ projectId, units }` | Open units via `ensure_physical_products` |
| `update` | PATCH | `{ productId, notes }` | Update notes |
| `archive` | PATCH | `{ productIds, archive }` | Archive/restore |
| `bulk-status` | PATCH | `{ productIds, status }` | Legacy (deprecated) |
| `update-contact` | PATCH | `{ projectId, phone }` | Update contact |
| `update-designer` | PATCH | `{ projectId, designerId }` | Reassign designer |

**Ensure Action:**
```typescript
// Calls ensure_physical_products RPC
// Idempotent: only adds missing units
// Uses unique (project_id, unit_index) index for idempotency
```

### `admin-designers` (`supabase/functions/admin-designers/index.ts`)

**Auth:** Admin (requireAdmin)

| Method | Action | Body | Response |
|---|---|---|---|
| `GET` | List designers | Query: `includeRevoked` | `{ designers }` |
| `POST` | Create designer | `{ name }` | `{ designer, code, passcode }` |
| `PATCH` | Update designer | `{ designerId, name?, revokedAt? }` | `{ designer }` |
| `POST` (action: `reset-passcode`) | Reset passcode | `{ designerId }` | `{ designer, passcode }` |
| `POST` (action: `revoke`) | Revoke designer | `{ designerId }` | `{ success }` |
| `POST` (action: `activate`) | Activate designer | `{ designerId }` | `{ success }` |

**Passcode Generation:**
```typescript
const passcode = randomNumericCode(6);  // 6 digits
const passcodeHash = await bcrypt.hash(passcode, 12);
```

### `admin-workers` (`supabase/functions/admin-workers/index.ts`)

**Auth:** Admin (requireAdmin)

| Method | Action | Body | Response |
|---|---|---|---|
| `GET` | List workers | - | `{ workers }` |
| `POST` | Create worker | `{ email, displayName, permissions[] }` | `{ worker }` |
| `PATCH` | Update worker | `{ workerId, displayName?, status?, permissions[] }` | `{ worker }` |
| `DELETE` | Delete worker | `{ workerId }` | `{ success }` |

### `create-sale` (`supabase/functions/create-sale/index.ts`)

**Auth:** Admin (requireAdmin)

**Purpose:** Record sale, create project + order + message, allocate units.

**Body:**
```typescript
{
  templateId: string;           // UUID
  wrapperType: string;          // wrapper key
  recipientName: string;
  templateId: string;
  customerEmail?: string;
  customerPhone?: string;
  occasion?: string;
  eventDate?: string;           // YYYY-MM-DD
  recipientMessage?: string;
  designerCode?: string;        // 6 digits
}
```

**Response:**
```typescript
{
  order: Order,
  orderId: string,
  orderPublicId: string,    // public_id
  publicId: string
}
```

**Flow:**
1. Validate template enabled, wrapper offered
2. Lookup designer by code (optional)
3. Allocate `public_id` via `allocate_message_public_id()`
4. Insert `orders` (legacy) + `messages` (legacy) → DEPRECATED
5. Insert `projects` (new) with `paid_at`, `wrapper_type`, `snapshot_price`
6. Insert `sales_log` (immutable ledger)
7. Allocate units via `ensure_physical_products`

### `designer-login` (`supabase/functions/designer-login/index.ts`)

**Auth:** None (custom JWT)

**Body:**
```typescript
{ code: string, passcode: string }  // Both 6 digits
```

**Response:**
```typescript
{
  token: string;           // HS256 JWT (48h)
  draftSecret: string;     // 256-bit for AES-GCM
  designer: { id, name, code }
}
```

**Rate Limiting:**
- 3 failed attempts → 60s lockout
- Tracked in `designer_login_attempts` table

### `designer-media` (`supabase/functions/designer-media/index.ts`)

**Auth:** Designer JWT (requireDesigner) or Admin

| Method | Action | Query Params | Body | Response |
|---|---|---|---|---|
| `GET` | Download/Signed URL | `path`, `storageProvider?` | - | `{ url }` or `{ drive: true }` |
| `POST` | Upload | `kind=photo\|audio`, `name`, `fixed?`, `wrapper?`, `template?` | File bytes | `{ path, storageProvider, ... }` |
| `DELETE` | Delete | `path`, `storageProvider?` | - | `{ removed: path }` |

**Namespaces:**
- `{designerId}/memorial-message/…` — designer drafts (designer or admin writes; designer reads own only)
- `wrappers/<key>/…` — wrapper catalog photos (admin writes; any studio member reads)
- `templates/<slug>/…` — template preview images, `slug` = `templates.slug` (admin writes; any studio member reads)

**Upload Features:**
- Magic byte sniffing (JPEG, PNG, WebP, GIF, MP3, WAV, OGG, WebM, M4A)
- Path sanitization (prevent traversal)
- Fixed-name upsert for template slots
- Storage provider: Supabase (default) or Google Drive

**Signed URL TTL:** 50 minutes (configurable)

### `designer-projects` (`supabase/functions/designer-projects/index.ts`)

**Auth:** Designer JWT (requireDesigner)

| Method | Action | Body | Response |
|---|---|---|---|
| `GET` | List projects | - | `{ projects }` |
| `POST` | Submit project | `{ projectId, templateSlug, receiverName, draft, policyVersion, policiesAcceptedAt, wrapperType?, letterPassword? }` | `{ project }` |
| `GET` `/unlock` | Get draft secret | - | `{ draftSecret }` |
| `GET` `/:id` | Get project | - | `{ project }` |

**Validation:**
- Template must be enabled + `display_state ∈ {normal, new}`
- Wrapper must be active + offered for template
- Media refs must be under designer's namespace
- Password → SHA-256 hash stored in payload
- `external-link` stores only `{ language, destinationUrl }`; the destination is re-validated with `sanitizeDestination` (`_shared/link-check.ts`) — absolute http(s), no credentials, no private/internal host

### `link-check` (`supabase/functions/link-check/index.ts`)

**Auth:** Designer JWT · **Rate limit:** 20/min per designer (`link-check:<id>`)

| Method | Action | Body | Response |
|---|---|---|---|
| `POST` | Check one destination | `{ url }` | `{ ok, reachable, status, finalUrl, redirected, embeddable, blockedBy, reason }` |

The only endpoint that makes an outbound request. It follows redirects manually and re-validates every hop against private/internal hosts (SSRF), with a timeout and a redirect cap. `embeddable` reflects the destination's own `X-Frame-Options` / `frame-ancestors` (`yes` / `no` / `unknown`); a `no` is never bypassed — the book offers a new tab instead. `reachable: false` is advisory: sign-in walls, bot filters and JS-only pages can still open on a phone. Responses carry enum reasons and a status code only — never an internal address, port or server error text — and neither the URL nor its query string is logged.

### `designer-templates` (`supabase/functions/designer-templates/index.ts`)

**Auth:** Designer JWT

**Response:**
```typescript
{
  templates: Array<{
    id, slug, name, display_name, description, public_path,
    image_url,           // legacy column — oldest fallback for the card art
    preview_image_url,   // the image the admin uploaded on Templates (storage path)
    thumbnail_url,       // 400px rendition of that same upload
    print_config, sort_order, display_state, created_at,
    wrappers: Array<{
      id, key, name, name_ar, description, description_ar, image_url,
      display_state, base_price, production_cost,
      estimated_production_days, display_order, created_at,
      option: { price_override, cost_override, display_order }
    }>
  }>
}
```

**Card artwork:** `thumbnail_url` / `preview_image_url` hold private-bucket
paths (`templates/<slug>/…`), not URLs. Create signs them per session through
`designer-media?path=…` with the designer JWT — see `templatePreviewSource`
(which column a card paints) and `resolveTemplateImageUrl` in
`src/services/templates.js`. The admin Templates screen resolves the same pair
with its own session, so one row drives both previews.

**Filters:** `enabled=true`, `deleted_at IS NULL`. `display_state` is returned
as-is: Create draws the NEW seal or the "resting" veil from it, and refuses
selection of `not_available` rows client-side (`getCatalogItemState`).

### `project-media` (`supabase/functions/project-media/index.ts`)

**Auth:** Public token (query params)

**Query Params:**
- `project` - public_id (required)
- `token` - public_token (required)
- `path` - media path (required)
- `redirect=1` - 302 redirect vs JSON
- `dl=1` - force download

**Response:**
```typescript
// Success
{ url: "signed-url" }  // or 302 redirect

// Error
{ available: false, reason: 'expired' | 'password_protected' | 'unavailable' }
```

**Access Control:**
- `public_token` match
- `message_active = true`
- Not password protected
- Not expired (2-year window from `first_activated_at`)
- Path must exist in project payload

### `worker-designers` (`supabase/functions/worker-designers/index.ts`)

**Auth:** Worker JWT + permission

| Action | Permission | Body |
|---|---|---|
| `create` | `designers.create` | `{ name }` |
| `update` | `designers.edit` | `{ designerId, name?, revokedAt? }` |
| `assign` | `designers.assign` | `{ designerId, projectId }` |
| `reset-passcode` | `designers.manage` | `{ designerId }` |
| `revoke` | `designers.manage` | `{ designerId }` |
| `activate` | `designers.manage` | `{ designerId }` |

**Audit:** Every action logs to `admin_audit_log` with `actor_type: 'worker'`.

## Database RPCs

### Worker RPCs (24 functions)

| Function | Purpose | Auth |
|---|---|---|
| `worker_operations_units(p_include_archived)` | List operations | Worker |
| `worker_operation_events(p_product_id)` | Unit timeline | Worker |
| `worker_dearune_detail(p_project_id)` | Project detail | Worker |
| `worker_mark_dearune_manufactured(p_project_id)` | Mark manufactured | Worker |
| `worker_mark_dearune_shipped(p_project_id, p_tracking_code, p_provider)` | Mark shipped | Worker |
| `worker_mark_dearune_delivered(p_project_id)` | Mark delivered | Worker |
| `worker_update_operation(p_product_id, p_notes)` | Update notes | Worker |
| `worker_archive_operations(p_product_ids, p_archive)` | Archive/restore | Worker |
| `worker_update_operation_contact(p_project_id, p_phone)` | Update contact | Worker |
| `worker_update_operation_designer(p_project_id, p_designer_id)` | Reassign designer | Worker |
| `worker_ensure_operations(p_project_id, p_units)` | Open units | Worker |
| `worker_operation_events(p_product_id)` | Unit events | Worker |
| `worker_assignable_designers()` | List designers | Worker |
| `worker_operations_print(p_product_ids)` | Print payload | Worker |
| `worker_export_operations(p_include_archived)` | Export CSV | Worker |
| `worker_qa_lookup(p_public_id, p_token)` | QA scan | Worker |
| `worker_designer_detail(p_designer_id)` | Designer detail | Worker |
| `worker_assignable_designers()` | List for assignment | Worker |
| `worker_export_shipments()` | Export shipments | Worker |
| `worker_create_designer(...)` | Create designer | Worker |
| `worker_update_designer(...)` | Update designer | Worker |
| `worker_reset_passcode(...)` | Reset passcode | Worker |
| `worker_revoke_designer(...)` | Revoke designer | Worker |
| `worker_activate_designer(...)` | Activate designer | Worker |

### Admin RPCs

| Function | Purpose |
|---|---|
| `admin_operations_ensure(p_project_id, p_units)` | Open units |
| `admin_operations_update(p_product_id, p_notes)` | Update notes |
| `admin_operations_archive(p_product_ids, p_archive)` | Archive/restore |
| `admin_operations_update_contact(p_project_id, p_phone)` | Update contact |
| `admin_operations_update_designer(p_project_id, p_designer_id)` | Reassign designer |
| `admin_operations_status(p_product_id, p_status)` | Status transition (legacy) |
| `admin_operations_print(p_product_ids)` | Print payload |
| `admin_operations_export(p_include_archived)` | Export CSV |
| `admin_dearunes_*` | Project CRUD |
| `admin_designers_*` | Designer CRUD |
| `admin_workers_*` | Worker CRUD |
| `admin_operations_*` | Operations CRUD |

### Public RPCs

| Function | Purpose |
|---|---|
| `get_public_message(p_public_id, p_bump?)` | Legacy public message (deprecated) |
| `get_public_project_message(p_public_id, p_token, p_password?)` | Public project reader (token + optional password); returns `template_slug` and, for `external-link`, the saved `destination` |
| `allocate_message_public_id()` | Mint public_id |

The project reader publishes only when `message_active`, the token matches and the letter is not password-protected. `p_password` is accepted for API compatibility but does not unlock a locked project. `destination` is read from the saved `projects.payload` — never from a scan-time parameter — so a printed QR can only ever forward to the address stored with the order.

## Service Layer (Client-Side)

### `src/services/workerRpc.js`

```typescript
export async function workerRpc(functionName, params) {
  const token = await currentAccessToken();
  const { data, error } = await supabase.functions.invoke(functionName, {
    body: params,
    headers: { Authorization: `Bearer ${token}` }
  });
  if (error) throw error;
  return data;
}
```

### Worker Service Functions (`src/services/workerOperations.js`)

```typescript
export async function fetchWorkerOperations(includeArchived = false) {
  return workerRpc('worker_operations_units', { p_include_archived: includeArchived });
}

export async function markWorkerDearuneManufactured(projectId) {
  return workerRpc('worker_mark_dearune_manufactured', { p_project_id: projectId });
}

export async function markWorkerDearuneShipped(projectId, trackingCode, provider) {
  return workerRpc('worker_mark_dearune_shipped', { p_project_id: projectId, p_tracking_code: trackingCode, p_provider: provider });
}

export async function fetchWorkerQaRecord(publicId, token = '') {
  return workerRpc('worker_qa_lookup', { p_public_id: publicId, p_token: token });
}
```

## Rate Limiting

### `consume_rate_limit` RPC

```sql
consume_rate_limit(
  p_key text,
  p_tokens int default 1,
  p_capacity int default 60,
  p_refill_per_minute int default 60
) returns jsonb
```

**Returns:** `{ allowed: boolean, remaining: int, retry_after_seconds: int }`

**Applied To:**
- `project-media`: 60/min per `public_id`
- `designer-projects`: 10/min per designer
- `link-check`: 20/min per designer
- `worker-designers`: 30/min per worker

## Error Response Format

```typescript
interface ErrorResponse {
  error: string;
  status: number;
  extra?: Record<string, unknown>;
  requestId?: string;  // X-Request-Id header
}
```

**Common Errors:**
- `worker.inactive_or_unknown` (401)
- `worker.forbidden` (403)
- `worker.invalid_parameter` (400)
- `dearune.not_found` (404)
- `dearune.archived` (409)
- `dearune.not_sold` (409)
- `dearune.not_manufactured` (409)
- `dearune.not_shipped` (409)
- `dearune.digital` (409)
- `maintenance_mode` (503)
- `shipping_address_missing` (409)
- `shipping_address_incomplete` (409)
- `rate_limit_exceeded` (429)

## Client-Side API Clients

### `src/services/workerRpc.js`

```javascript
export async function workerRpc(functionName, params) {
  const token = await currentAccessToken();
  const { data, error } = await supabase.functions.invoke(functionName, {
    body: params,
    headers: { Authorization: `Bearer ${token}` }
  });
  if (error) throw error;
  return data;
}
```

### Admin Client (`src/services/operations.js`)

```javascript
export async function fetchOperations({ includeArchived = false, ids = null } = {}) {
  let query = supabase.from('operations_units').select(OPERATION_COLUMNS);
  if (!includeArchived) query = query.is('archived_at', null);
  if (ids) query = query.in('id', ids);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(toOperation);
}
```

### Admin Invoke (`src/lib/supabase.ts`)

```typescript
export async function invokeFunction(name, { method = 'GET', token = null, adminToken = null, body = undefined } = {}) {
  const headers = { 'x-client-info': 'supabase-js-web/2' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  if (adminToken) headers.authorization = `Bearer ${adminToken}`;
  if (publishableKey) headers.apikey = publishableKey;

  // Dev proxy fallback for CORS
  // Diagnostic error reporting
}
```

## Webhook / Callback Endpoints

| Endpoint | Purpose |
|---|---|
| `/functions/v1/drive-create-upload` | Google Drive resumable upload session |
| `/functions/v1/drive-media` | Drive file streaming |
| `/functions/v1/drive-delete-media` | Drive file deletion |
| `/functions/v1/drive-create-upload` | Create resumable upload session |

## Versioning & Compatibility

- **RPC signatures**: Forward-compatible (optional params with defaults)
- **Edge Functions**: Versioned by deployment; clients handle gracefully
- **Database**: Migrations are forward-only; `CREATE OR REPLACE FUNCTION` for RPCs
- **Breaking Changes**: New function name (e.g., `worker_mark_dearune_shipped_v2`)

## Monitoring & Debugging

### Request ID
- Every request gets `X-Request-Id` header (UUID v4)
- Logged via `logInfo`/`logError` in `_shared/cors.ts`
- Available in `window.__dearuneFetchDiag` for debugging

### Structured Logging
```typescript
logInfo(requestId, 'message', { meta });
logError(requestId, 'message', error, { meta });
```

Outputs JSON to console for log aggregation.