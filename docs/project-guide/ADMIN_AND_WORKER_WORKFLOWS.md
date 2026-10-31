# Admin and Worker Workflows

This document describes the operational workflows for Admin and Worker dashboards in Dearune.

## Admin Dashboard Workflows

### Overview

The Admin dashboard (`/admin/*`) provides full studio management capabilities with 19 pages covering operations, designers, sales, templates, financials, QA, and settings.

### Admin Login Flow

```
/admin/login → AdminLogin.jsx
  → Supabase Auth signInWithPassword()
  → RequireAdmin guard validates admin_users table
  → Redirect to /admin/overview
```

### Admin Shell (`AdminShell.jsx`)

**Layout:**
- Left sidebar navigation (collapsible on mobile)
- Top bar: user menu, notifications, theme toggle
- Main content area with breadcrumbs

**Navigation Sections:**
- Overview (KPIs)
- Designers & Messages
- Operations (Production)
- QA Scanner
- Templates & Wrappers
- Financial
- Settings
- Users (Admins + Workers)
- Inbox (Admin-Worker messaging)
- Apps (PWA install)

## Operations Workflow (Admin)

### Operations Dashboard (`/admin/operations`)

Operations is **one order record with four subsections**, not four screens with
their own data. The routes render the same page component with a different
`section`:

| Section | Route | Shows |
|---|---|---|
| Making | `/admin/operations` | `sold` (paid, not started) and `making` — printing, assembling, QC |
| Shipping | `/admin/operations/shipping` | `shipping` — waiting for a carrier hand-off |
| Delivery | `/admin/operations/delivery` | `delivery` and `delivered` — parcels with a carrier, plus delivered ones |
| After-Sale | `/admin/operations/after-sale` | `after_sale` — refunds, complaints, corrections |

**Features:**
- One row per order from the `ops_orders` view; the canonical Dearune ID is
  shown first, with the unit and Sold references beside it. Digital Dearunes
  carry `is_digital`; they appear in the section their milestone falls in but
  have no production action.
- Search by canonical ID, any registered historical reference, unit ID, title,
  recipient, phone, tracking or carrier reference.
- Server-side filters (carrier, governorate, city, designer, wrapper, refund,
  shipment, QR, archive, paid/moved date ranges), sort allowlist and pagination.
- Subsection badges come from `ops_milestone_counts`; a delivered order stays in
  Delivery (tinted from the persisted state) until moved to After-Sale.
- Making keeps the print pipeline: selection hands unit IDs to
  `/admin/operations/print?ids=…`.
- The detail sheet shows identifiers, sale, address, shipment, refund history
  and the unified audit timeline, and offers **Start making** on a sold order.
- A blocked QR is shown on the row and in the sheet with its fix; printing is
  refused until it is openable.

**Key Actions:**
| Action | Edge action | RPC |
|---|---|---|
| Start / open Making | `making-start` | `ops_start_work_order` |
| Finish Making → Shipping | `making-complete` | `ops_making_complete` |
| Save carrier | `shipment-save` | `ops_save_shipment` |
| Mark shipped → Delivery | `ship` | `ops_ship` |
| Mark delivered (stays in Delivery) | `deliver` | `ops_deliver` |
| Move to After-Sale | `after-sale` | `ops_after_sale` |
| Record a refund | `record-refund` | `ops_record_refund` |
| Import a carrier manifest | `manifest-preview` / `manifest-commit` | `ops_create_manifest` + `ops_ship` |

Every action records the operator and the time, and the database refuses a move
that skips a stage (see [AUTHORITATIVE_ORDER_MODEL.md](./AUTHORITATIVE_ORDER_MODEL.md)).

### Operations Print (`/admin/operations/print`)

**Flow:**
1. Select units via checkboxes → "Print papers"
2. URL: `/admin/operations/print?ids=uuid1,uuid2`
3. Review page with live preview
4. Batch validation via `reviewBatch()`
5. Generate PDF via `buildQrPaperPdf()`
6. Download or print

**Batch Validation:**
```javascript
const review = reviewBatch(selected, drafts);
// Returns { items, printable, blocked, allValid }
```

### Bosta Manifest Export

```javascript
// src/services/bosta.js
export function buildBostaWorkbook(operations) {
  // Generates Excel with columns matching Bosta template
  // Maps: recipient_name, address, city, governorate, phone, etc.
}
```

**Export:** Downloads `.xlsx` matching Bosta's official template.

## Designer Management (Admin)

### Designer List (`/admin/designers`)

**Features:**
- List all designers with status, last login, project counts
- Create new designer (generates 6-digit code + passcode)
- Edit name, status
- Reset passcode
- Revoke/Activate
- View messages (designer's projects)

**Create Designer:**
1. Click "Add Designer"
2. Enter name
3. System generates 6-digit code + 6-digit passcode
4. Returns `{ designer, code, passcode }`

### Designer Detail (`/admin/designers/:id`)

**Tabs:**
- Overview: Stats, status, last login
- Messages: List of designer's projects
- Activity: Audit log

### Message Detail (`/admin/designers/:id/messages/:projectId`)

**View:** Full letter content, media, status, timeline

## Sales & Financial (Admin)

### Sold Logs (`/admin/sold`)

- Immutable `sales_log` table
- Filters: date range, designer, status
- Export CSV
- Void sale (creates voided entry, never deletes)

### Financial Dashboard (`/admin/financial`)

**KPIs:**
- Revenue (by currency)
- Costs
- Profit/Margin
- By designer, by month, by wrapper
- Customer payables (unpaid projects)

**Permissions:** `financial.view`, `financial.view_revenue`, etc.

## QA Scanner (Admin)

### `/admin/qa`

**Features:**
- Camera scan (BarcodeDetector + jsqr fallback)
- File upload fallback
- Manual entry
- Token verification
- Read-only display of project, units, shipping, events

**Read-only guarantee:** Uses `worker_qa_lookup` RPC with `qa.view` permission.

## Worker Dashboard Workflows

### Worker Login

```
/worker/login → WorkerLogin.jsx
  → Supabase Auth signInWithPassword()
  → WorkerGate validates workers table (status=active)
  → Redirect to /worker/home
```

### Worker Home (`/worker/home`)

**KPI Cards:**
- Pending, Sold, Manufactured, Shipped, Delivered, Archived counts
- Quick actions

### Worker Operations (`/worker/operations`)

**Features (mirrors admin but permission-gated):**
- List units via `fetchWorkerOperations(true)`; each row shows the same
  Dearune ID, Sold ID, `milestone` and QR answer the Admin screen shows.
- Milestone actions derived from `MILESTONE_ORDER` + `WORKER_STEPS`
  (`making → shipping` = Mark manufactured, `shipping → delivery` = Mark shipped,
  `delivery → delivered` = Mark delivered).
- Archive/Restore
- Print papers (with `?ids=`), refused when the QR is blocked
- Export CSV

**Milestone Actions (Permission-Gated):**

| Action | Permission | RPC (delegates to) |
|---|---|---|
| Mark Manufactured (`making → shipping`) | `operations.mark_manufactured` | `worker_mark_dearune_manufactured` → `ops_making_complete` |
| Mark Shipped (`shipping → delivery`) | `operations.mark_shipped` | `worker_mark_dearune_shipped` → `ops_ship` |
| Mark Delivered (`delivery → delivered`) | `operations.mark_delivered` | `worker_mark_dearune_delivered` → `ops_deliver` |

The worker RPCs write the **same** `projects.milestone` as the admin, with
`actor_type='worker'` and `milestone_updated_by` left NULL. `worker_set_operation_status`
was dropped — there is no worker-only status.

**Milestone Validation (RPC):**
```sql
-- worker_mark_dearune_shipped
-- Checks: maintenance_mode, worker permission, paid, milestone >= shipping,
--         shipping address complete, carrier + tracking (shipping_carrier)
-- Then delegates to ops_ship with the worker as actor.
```

### Worker QA (`/worker/qa`)

**Features:**
- Camera scan (BarcodeDetector + jsqr)
- File upload fallback
- Manual entry
- Token verification
- Read-only display (permission: `qa.view`)

**Read-only enforcement:** Uses `worker_qa_lookup` RPC.

### Worker Designers (`/worker/designers`)

**Permissions:** `designers.view`, `designers.view_details`, `designers.create`, `designers.edit`, `designers.assign`, `designers.manage`

**Actions:**
- List designers
- Create designer (generates code + passcode)
- Edit name
- Assign to project
- Reset passcode
- Revoke/Activate

### Worker Financial (`/worker/financial`)

**Permissions:** `financial.view`, `financial.view_revenue`, `financial.view_costs`, `financial.view_profit`, `financial.view_customer_payables`, `financial.view_payments`, `financial.export`

**Views:**
- Revenue by month/designer
- Cost breakdown
- Profit margins
- Customer payables

## Cross-Dashboard Workflows

### Designer → Admin → Worker Pipeline

```
1. DESIGNER (/create)
   └─ Creates book, uploads media, submits project
   └─ POST /functions/v1/designer-projects
   └─ Creates project (status=submitted)

2. ADMIN (/admin)
   └─ Reviews project in /admin/designers/:id/messages/:projectId
   └─ Records sale in /admin (create-sale)
   └─ Creates project + sales_log + physical_products
   └─ Allocates units via ensure_physical_products

3. WORKER (/worker/operations)
   └─ Sees units in /worker/operations
   └─ Advances milestones:
       manufactured → shipped → delivered
   └─ Each milestone calls worker RPC
   └─ Updates physical_products + projects + events

4. RECIPIENT (/message/:publicId)
   └─ Scans QR on printed paper
   └─ GET /functions/v1/project-media?project=xxx&token=xxx&path=xxx
   └─ Views MemorialLetter with media
```

## Permission Boundaries

### Admin vs Worker

| Capability | Admin | Worker |
|---|---|---|
| View all projects | ✅ | Via RPC only |
| Create projects | ✅ (via sale) | ❌ |
| Advance milestones | Via admin-operations | ✅ (own permissions) |
| Manage designers | ✅ | Limited (permissions) |
| View financials | Full | Permission-gated |
| Access QA | ✅ | Read-only |
| Manage workers | ✅ | ❌ |
| Manage templates | ✅ | ❌ |
| Manage wrappers | ✅ | ❌ |

### Designer vs Worker

| Capability | Designer | Worker |
|---|---|---|
| Create project | ✅ (own) | ❌ |
| View own projects | ✅ | ✅ (if assigned) |
| Edit own project | ❌ (submitted) | ❌ |
| Upload media | ✅ (own namespace) | ❌ |
| Advance milestones | ❌ | ✅ (permissions) |

## Cross-Dashboard Notifications

### Admin → Worker (Inbox)

```
Admin Inbox (/admin/inbox) ↔ Worker Messages (/worker/messages)
  → worker_messages table
  → Real-time via Supabase Realtime
```

### Worker → Admin (Audit)

```
worker_audit_logs table
  → Every worker RPC writes audit entry
  → Visible in admin Users → UserDetail
```

## Status Flow Diagram

One order, one stage, whichever dashboard acts:

```
DESIGNER SUBMITS                milestone = configured
      ↓
ADMIN RECORDS SALE              configured → sold
      ↓
UNITS ALLOCATED                 (ensure_physical_products, milestone unchanged)
      ↓
ADMIN OR WORKER: START MAKING   sold → making
ADMIN OR WORKER: MANUFACTURED   making → shipping
ADMIN OR WORKER: SHIPPED        shipping → delivery   (+ tracking)
ADMIN OR WORKER: DELIVERED      delivery → delivered
      ↓
RECIPIENT SCANS QR              milestone unchanged; first_activated_at set
      ↓
LETTER OPENED
      ↓
2-YEAR WINDOW STARTS
      ↓
AFTER-SALE (optional)           delivered → after_sale
```

Digital Dearunes skip the three production stages: `sold → delivered` when the
message is opened. `archived_at` is separate from the chain and can be set at any
point.

## Milestone Validation Rules

All of these are enforced by the transition guard plus the named RPC; no screen
re-implements them.

### Configured → Sold
- A recorded sale (`paid_at` / `sales_log`)
- A digital Dearune may not enter production from here

### Sold → Making
- Project paid, not archived, not digital
- Units exist (or are created in the same transaction)

### Manufactured (`making → shipping`)
- Project paid
- Not archived
- Not digital wrapper
- Units exist

### Shipped (`shipping → delivery`)
- Project manufactured (milestone `shipping`)
- Shipping address complete (recipient_name, address_line1, city, country)
- An explicit carrier (`bosta` or `egypt_post`), normalised by `shipping_carrier`
- A tracking number / carrier reference

### Delivered (`delivery → delivered`)
- Project shipped
- Records arrival time and operator; the order stays in Delivery
- No archive is implied

### After-Sale (`delivered → after_sale`)
- Project delivered
- Refunds are manual ledger entries with amount, reason, method, reference,
  operator, timestamp and an idempotency key; the total can never exceed the
  sale price

### Any backwards move
- Only `ops_revert_milestone`, maintenance-only, with a reason; it clears the
  stamps the stage implied and refuses to un-sell a paid order

## Audit Trail

Every mutation writes to:
- `physical_product_events` (unit-level)
- `project_events` (project-level)
- `worker_audit_logs` (worker actions)
- `admin_audit_log` (admin actions)

**Audit Entry:**
```json
{
  "actor_id": "uuid",
  "actor_type": "admin|worker|system|customer",
  "action": "operations.milestone.shipped",
  "target_type": "project|physical_product",
  "target_id": "uuid",
  "metadata": { "tracking_code": "TRACK123", "worker_id": "uuid" },
  "created_at": "2026-10-28T10:30:00Z"
}
```

## Cross-Dashboard Testing Checklist

- [ ] Designer submits → Admin sees in dashboard
- [ ] Admin creates sale → Units appear in Worker Operations
- [ ] Worker advances Manufactured → Admin sees updated
- [ ] Worker advances Shipped → Tracking visible in Admin
- [ ] Worker advances Delivered → Recipient can access
- [ ] Recipient scans QR → Letter opens with media
- [ ] Password-protected letter → Blocks without password
- [ ] Expired letter → Shows expired state
- [ ] Admin voids sale → Worker units archived
- [ ] Worker revokes designer → Designer can't login
- [ ] Admin creates worker → Worker can login
- [ ] Worker permissions enforced at RPC level