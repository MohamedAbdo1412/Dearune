# Data Flow

This document describes how data flows through the Dearune system, covering the major data pathways and transformations.

## Overview

Dearune's data flow spans from designer creation through admin/worker processing to recipient delivery. The system uses a combination of client-side state, Supabase database, Edge Functions, and external integrations.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                         DEARUNE DATA FLOW ARCHITECTURE                                      │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                             │
│  DESIGNER (/create)                    ADMIN (/admin)                    WORKER (/worker)              RECIPIENT (/message)     │
│  ┌─────────────────────────────┐    ┌─────────────────────────────┐    ┌─────────────────────────────┐    ┌─────────────────────┐  │
│  │ 1. Compose Letter            │    │ 4. Review & Create Sale     │    │ 7. Process Operations     │    │ 10. Scan QR         │  │
│  │ 2. Upload Media              │    │ 5. Create Project/Units     │    │    - Manufactured         │    │ 11. Verify Token    │  │
│  │ 3. Encrypt Draft             │    │ 6. Generate QR/Token        │    │    - Shipped              │    │ 12. Render Letter   │  │
│  │    (AES-GCM)                 │    │    (public_id + token)      │    │    - Delivered            │    │ 13. Play Audio      │  │
│  └──────────────┬───────────────┘    └──────────────┬───────────────┘    └──────────────┬───────────────┘    └──────────┬──────────┘  │
│                 │                                   │                                   │                                   │             │
│                 ▼                                   ▼                                   ▼                                   ▼             │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────┐   │
│  │                                    SUPABASE BACKEND                                                         │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │   │
│  │  │  Projects   │  │ Physical    │  │ Sales Log   │  │ Designers   │  │ Workers     │  │ Media       │     │   │
│  │  │  Table      │  │ Products    │  │ (Immutable) │  │ Table       │  │ Table       │  │ Storage     │     │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │   │
│  │         │                │                │                │                │                │            │   │
│  │         ▼                ▼                ▼                ▼                ▼                ▼            │   │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │   │
│  │  │                              EDGE FUNCTIONS (16)                                                       │  │   │
│  │  │  designer-login, designer-projects, designer-media, project-media, admin-*, worker-*, create-sale  │  │   │
│  │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │   │
│  │         │                │                │                │                │                │            │   │
│  │         ▼                ▼                ▼                ▼                ▼                ▼            │   │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │   │
│  │  │                              EXTERNAL INTEGRATIONS                                                    │  │   │
│  │  │  Google Drive (media storage)  │  Bosta (courier manifest)  │  Supabase Auth  │  Supabase Storage  │  │   │
│  │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │   │
│  │                                                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Major Data Flow Paths

### 1. Designer Creation Flow (`/create`)

```
User Input → Client State → Media Upload → Draft Encryption → Submit → Edge Function → Database
     │            │              │                │              │                │            │
     ▼            ▼              ▼                ▼              ▼                ▼            ▼
  1. Compose   2. Local       3. Compress      4. AES-GCM      5. POST          6. Validate    7. Insert
  Letter       State          + WebP           Encrypt         /designer-       & Insert      projects
  (Draft)      (Draft)        (1600px)         (AES-GCM)       projects         project       + units
                                localStorage +                         projects        + sales_log
                                IndexedDB
```

**Key Steps:**
1. **Compose Letter**: Designer fills greeting, body, closing, adds photos/audio, sets language/password
2. **Local State**: Draft stored in `localStorage` + `IndexedDB` (encrypted)
3. **Media Upload**: Photos compressed (WebP, 82%, 1600px), uploaded via `designer-media` Edge Function
4. **Draft Encryption**: Full draft AES-GCM encrypted with per-designer secret (PBKDF2 120k iterations)
5. **Submit**: `designer-projects` Edge Function validates template, wrapper, media refs, password hash
6. **Database Insert**: Creates `projects` row + `physical_products` units via `ensure_physical_products` RPC
7. **QR Generation**: `public_id` + `public_token` generated for QR code

**Before any of that — choosing the paper.** `/create` asks
`designer-templates` for the archive; each row carries the admin's uploaded
card art as storage paths (`thumbnail_url`, `preview_image_url`, legacy
`image_url`). `TemplateSelectionStage` signs the chosen one through
`designer-media` and paints it. The admin Templates screen writes those same
columns, so the image an admin uploads is the image the customer chooses from
(no CSS mock-up in between).

**Data Artifacts:**
- `projects` row: `payload` (encrypted draft refs), `public_id`, `public_token`, `wrapper_type`, `template_slug`, `status`
- `physical_products` rows: one per unit, `reference` (DR + 11 digits), milestone timestamps
- `sales_log` row: immutable ledger entry (if admin creates sale)

---

### 2. Admin Sale Creation Flow

```
Admin Form → create-sale Edge Function → Projects + Sales Log + Physical Products → QR Generation
     │                    │                        │                          │
     ▼                    ▼                        ▼                          ▼
  1. Form            2. Validate              3. Insert                   4. Allocate
  Input              Template +               projects +                public_id +
  (template,         Wrapper                sales_log +              public_token
   wrapper,          Offered                 physical_                on project
   recipient,                                 products
   designer)
```

**Key Operations:**
1. Validates template enabled + wrapper offered for template
2. Looks up designer by code (optional)
3. Allocates `public_id` via `allocate_message_public_id()` RPC
4. Inserts `projects` row (with `paid_at`, `wrapper_type`, `snapshot_price`)
5. Inserts `sales_log` row (immutable ledger)
6. Allocates physical units via `ensure_physical_products` RPC

---

### 3. Worker Operations Flow

```
Worker Dashboard → worker-operations RPCs → Physical Products + Events → Bosta Manifest
       │                  │                       │                        │
       ▼                  ▼                       ▼                        ▼
  1. List            2. Milestone             3. Update                4. Export
  Units              Actions                  Timestamps +             Bosta CSV
  (RPC)              (Manufactured/           Events                   (ExcelJS)
  (worker_           Shipped/Delivered)                   (physical_product_
  operations_                              events)
  units)
```

**Milestone Validation (RPC):**
```sql
-- worker_mark_dearune_shipped checks:
-- 1. maintenance_mode = false
-- 2. Project paid (paid_at IS NOT NULL)
-- 3. Project manufactured (manufactured_at IS NOT NULL)
-- 4. Not digital wrapper
-- 5. Shipping address complete (recipient_name, address_line1, city, country)
-- 5. Units exist
```

**Bosta Export:** Maps units to Bosta Excel template columns (recipient_name, address, city, governorate, phone, etc.)

---

### 4. Recipient Public Message Flow

```
QR Scan → /message/:publicId?token=xxx → project-media Edge Function → Signed URLs → Render
     │              │                        │                        │
     ▼              ▼                        ▼                        ▼
  1. QR            2. Parse               3. Validate              4. Stream
  Scan             publicId +             Access Control:          Media via
  (Barcode-        token from             - public_token match     signed URLs
  Detector/        URL                    - message_active=true
  jsqr)                            - not password protected
                                                   - not expired (2yr window)
                                                   - path in payload
```

**Access Control Checks:**
1. Project exists by `public_id`
2. `public_token` matches exactly
3. `message_active = true`
4. Not password protected (`payload.passwordSet !== true`)
5. Not expired: `first_activated_at + 2 years > now()`
6. Requested media path exists in payload

**`external-link` papers** use the same flow and the same QR: the code always
opens `/message/:publicId?token=…`. The resolver (`get_public_project_message`)
returns `template_slug` plus the saved `destination`, and `PublicMessage`
performs `window.location.replace(destination)`. The destination is never taken
from the scan URL, so a printed code cannot be re-pointed; a project whose
destination is missing shows a controlled "not set" page rather than guessing.

---

### 5. Media Storage & Retrieval Flow

```
Upload (Designer)          Download (Recipient)
      │                          │
      ▼                          ▼
1. Client                    1. GET /functions/v1/
   Compress                   project-media?project=
   (WebP, 82%)                  publicId&token=xxx&
      │                          path=xxx
      ▼                          ▼
2. POST                        2. Verify token,
   /functions/v1/               access control
   designer-media?              (see above)
   kind=photo&                  │
   name=xxx&fixed=cover         ▼
      │                     3. Generate signed
      ▼                       URL (900s TTL)
3. Validate MIME,             │
   size, magic bytes          ▼
      │                     4. Return JSON { url }
      ▼                          │
4. Upload to provider          ▼
   (Supabase/Drive)            ▼
      │                     5. Browser fetches
      ▼                          media via URL
5. Return MediaRef            │
   { path, provider,           ▼
   mimeType, size,             6. Render in
   originalName }              <img>/<audio>
```

**Providers:**
- **Supabase Storage** (default): `designer-drafts` bucket, path namespacing by designerId
- **Google Drive** (optional): OAuth2 resumable upload, per-designer folders

---

## Data Transformations

### Draft → Project Payload

```typescript
// Client draft (encrypted locally)
interface Draft {
  templateSlug: string;
  wrapperType: string;
  receiverName: string;
  letter: {
    language: 'en' | 'ar';
    greeting: string;
    body: string;
    closing: string;
    senderName: string;
    photos: Array<{ path, originalName, mimeType }>;
    audio: { path, originalName, mimeType } | null;
    passwordSet: boolean;
    letterPasswordHash?: string;  // base64 SHA-256
  };
  media: MediaRef[];
}

// Server project.payload (stored in DB)
interface ProjectPayload {
  language: 'en' | 'ar';
  greeting: string;
  body: string;
  closing: string;
  senderName: string;
  photos: Array<{ path, originalName, mimeType }>;
  audio: { path, originalName, mimeType } | null;
  passwordSet: boolean;
  letterPasswordHash?: string;  // base64 SHA-256
}
```

### Project → Public Message

```typescript
// project-media Edge Function builds response
interface PublicMessageResponse {
  // Success
  url: string;  // signed URL or 302 redirect
  
  // Error
  available: false;
  reason: 'expired' | 'password_protected' | 'unavailable';
}
```

### Operations Unit Shape

```typescript
// operations_units view → UI Operation
interface Operation {
  id: string;
  reference: string;           // DR + 11 digits (physical unit)
  soldId: string;              // SOL-###### (derived from the ORDER's canonical id)
  hasValidId: boolean;
  unitIndex: number;
  soldAt: string | null;
  manufacturingCompletedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  notes: string;
  archivedAt: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  milestone: 'configured' | 'sold' | 'making' | 'shipping' | 'delivery' | 'delivered' | 'after_sale';
  status: 'pending' | 'sold' | 'manufactured' | 'shipped' | 'delivered'; // derived from milestone
  projectId: string;
  projectReference: string;
  projectTitle: string;
  publicId: string;
  publicToken: string;
  wrapperType: string;
  templateSlug: string;
  paidAt: string | null;
  messageActive: boolean;
  messageProtected: boolean;
  qr: { destination: boolean; activated: boolean; openable: boolean; blockedReason: string | null };
  designerId: string | null;
  designerName: string;
  designerCode: string;
  recipientName: string;
  customerPhone: string;
  trackingCode: string;
  provider: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: string;
  specialInstructions: string;
}
```

---

## State Transitions

### Project Status Machine

```
submitted → (Admin creates sale) → paid → manufactured → shipped → delivered → archived
     │                                        │                │           │
     ▼                                        ▼                ▼           ▼
  Designer                            Admin records    Worker RPCs    Auto/Manual
  submits                             sale, sets        advance         after 2yrs
  project                             paid_at           milestones    or manual
```

### Physical Product Milestones

> Updated by `20261103000001_order_lifecycle.sql`: the **order's stage** now
> lives in `projects.milestone` (`making → shipping → delivery → delivered →
> after_sale`) and is moved only by the `ops_*` RPCs. `physical_products` keeps
> its production stamps as Making detail and no longer owns a competing stage.
> See [ORDER_LIFECYCLE.md](./ORDER_LIFECYCLE.md).

```
paid → making → shipping → delivery → delivered → after_sale
       printing   carrier     on the     recipient   refund /
       QR, QC     chosen      way        has it      complaint
```

Each transition is one transactional RPC that writes the milestone, the
matching timestamp and an audit event together; the `projects_milestone_guard`
trigger refuses backwards or skipping moves.

**Validation Rules:**
- `manufactured_at` requires `paid_at`
- `shipped_at` requires `manufactured_at` + complete shipping address
- `arrived_at` requires `shipped_at`
- Digital wrappers skip physical milestones (`projects.milestone` stays `NULL`)

---

## External Integrations Data Flow

### Google Drive (Optional Media Storage)

```
OAuth2 Refresh Token → Access Token (50min TTL) → Resumable Upload (8MB chunks)
     │                      │                        │
     ▼                      ▼                        ▼
  Stored in            Auto-refreshed           Folder: Dearune Designer Drafts/
  Supabase secrets     by Edge Function         /{designerId}/memorial-message/
```

### Bosta Courier Integration

```
Worker Export → buildBostaWorkbook() → ExcelJS → .xlsx → Bosta Portal Upload
     │              │                     │           │
     ▼              ▼                     ▼           ▼
  Selected      Maps units to          Generates    Manual upload
  units         Bosta columns:         .xlsx file   by operations
                recipient_name,        matching     team
                address, city,
                governorate, phone,
                weight, COD amount
```

### Supabase Auth

```
Admin/Worker Login → Supabase Auth (email/password) → Session Cookie (HttpOnly)
     │                    │                           │
     ▼                    ▼                           ▼
  Email/              PKCE flow,              Auto-refresh via
  Password            JWT tokens               onAuthStateChange
```

---

## Data Consistency & Invariants

### Database Constraints

| Constraint | Purpose |
|---|---|
| `physical_products.reference` CHECK `^DR\d{11}$` | Physical unit ID format (not the canonical order ID) |
| `projects.reference` UNIQUE | Canonical Dearune ID (`DR-######`) |
| `order_references.value` UNIQUE | Every historical identifier resolves to exactly one order |
| `projects_milestone_guard` | Milestone may only move forward one step |
| `projects (milestone)` INDEX | Section queries stay fast |
| `refunds (project_id, idempotency_key)` UNIQUE | A refund request cannot be recorded twice |
| `physical_products (project_id, unit_index)` UNIQUE | One unit per index per project |
| `sales_log (project_id) WHERE status='completed'` UNIQUE | One active sale per project |
| `projects` CHECK `(manufactured_at IS NULL OR paid_at IS NOT NULL)` | Milestone order |
| `projects` CHECK `(shipped_at IS NULL OR manufactured_at IS NOT NULL)` | Milestone order |
| `projects` CHECK `(arrived_at IS NULL OR shipped_at IS NOT NULL)` | Milestone order |

### Immutability Guarantees

| Table | Protection |
|---|---|
| `sales_log` | Trigger `sales_log_guard` prevents UPDATE/DELETE on money fields |
| `physical_product_events` | Append-only, no UPDATE/DELETE |
| `worker_audit_logs` | INSERT only via RPCs |
| `admin_audit_log` | INSERT only via Edge Functions |

### Idempotency

| Operation | Mechanism |
|---|---|
| `ensure_physical_products` | Unique `(project_id, unit_index)` index |
| `ops_ship` / `ops_deliver` | A repeat of the current milestone is a no-op; no second shipment/event |
| `ops_record_refund` | Unique `(project_id, idempotency_key)`; amount ceiling re-checked in the transaction |
| `ops_create_manifest` | Manifest snapshot is written once per commit and linked to every shipped row |
| `allocate_message_public_id` | `public_id` UNIQUE, retry on collision |
| Media upload (fixed name) | Supabase Storage upsert |
| Draft save | localStorage/IndexedDB overwrite |

---

## Performance Considerations

### Query Patterns

| Query | Optimization |
|---|---|
| Operations list | `operations_units` view (security_invoker), composite indexes on `(project_id, milestone)` |
| Designer projects | Index on `(designer_id, created_at DESC)` |
| Project by public_id | UNIQUE index on `public_id` |
| Media by path | Supabase Storage path prefix |
| QA lookup | RPC with indexed `public_id` + `public_token` |

### Caching Strategy

| Data | Cache | Invalidation |
|---|---|---|
| Templates | localStorage (5min TTL) | Manual refetch |
| Wrappers | localStorage (10min TTL) | Manual refetch |
| Drafts | localStorage + IndexedDB | Manual clear |
| Theme | localStorage | N/A |
| Install dismissals | localStorage (30-day TTL) | Time-based |

---

## Security Boundaries

| Boundary | Enforcement |
|---|---|
| Designer namespace | `path.startsWith('${designerId}/')` in Edge Function |
| Worker permissions | `worker_has_permission()` per RPC |
| Admin access | `is_dearune_admin()` RPC + RLS |
| Public media | `public_token` + `message_active` + expiry check |
| Draft encryption | AES-GCM per-designer key (PBKDF2 120k iterations) |
| JWT secrets | `DESIGNER_JWT_SECRET` (256-bit), rotated quarterly |

---

## Monitoring & Debugging Data Points

### Key Metrics to Track

| Metric | Source | Alert Threshold |
|---|---|---|
| Edge Function latency | API Gateway logs | > 2s p95 |
| Edge Function error rate | API Gateway logs | > 1% |
| Database CPU | Supabase Dashboard | > 80% |
| Storage usage | Supabase Dashboard | > 80% |
| Auth failure rate | Auth logs | > 5% |
| Rate limit hits | `rate_limit_buckets` table | > 100/min |

### Debugging Endpoints

```bash
# Edge Function logs
supabase functions logs project-media --project-ref xxx

# Database slow queries
# Supabase Dashboard → Logs → Database → Slow queries

# Client debug
window.__dearuneFetchDiag  # Set by invokeFunction on error
```