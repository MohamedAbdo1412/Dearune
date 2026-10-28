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

**Features:**
- List all physical product units via `operations_units` view
- Filters: Search, Sort (newest/oldest/updated/status/id/customer), Milestone filter, Archive toggle
- Bulk actions: Archive/Restore selected
- Print papers (opens `/admin/operations/print`)
- Export CSV (Bosta manifest)
- Unit detail sheet with timeline

**Key Actions:**
| Action | Permission | RPC/Service |
|---|---|---|
| Open units | `operations.create` | `admin_operations_ensure` |
| Update notes | `operations.edit` | `admin_operations_update` |
| Archive/Restore | `operations.manage` | `admin_operations_archive` |
| Change designer | `operations.assign` | `admin_operations_update_designer` |
| Update contact | `operations.edit` | `admin_operations_update_contact` |
| Print papers | `operations.print` | `admin_operations_print` |
| Export CSV | `operations.export` | `admin_operations_export` |

**Unit Detail Sheet:**
- Timeline of events (`physical_product_events`)
- Edit notes
- Update contact phone
- Reassign designer
- Archive/Restore
- Print individual papers

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
- List units via `fetchWorkerOperations(true)`
- Milestone actions: Manufactured → Shipped → Delivered
- Archive/Restore
- Designer assignment
- Print papers (with `?ids=`)
- Export CSV

**Milestone Actions (Permission-Gated):**

| Action | Permission | RPC |
|---|---|---|
| Mark Manufactured | `operations.mark_manufactured` | `worker_mark_dearune_manufactured` |
| Mark Shipped | `operations.mark_shipped` | `worker_mark_dearune_shipped` |
| Mark Delivered | `operations.mark_delivered` | `worker_mark_dearune_delivered` |

**Milestone Validation (RPC):**
```sql
-- worker_mark_dearune_shipped
-- Checks: maintenance_mode, paid, manufactured, shipping address complete
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

```
DESIGNER SUBMITS
      ↓
ADMIN REVIEWS & RECORDS SALE
      ↓
UNITS ALLOCATED (ensure_physical_products)
      ↓
WORKER: MANUFACTURED
      ↓
WORKER: SHIPPED (+ tracking)
      ↓
WORKER: DELIVERED
      ↓
RECIPIENT SCANS QR
      ↓
LETTER OPENED (first_activated_at set)
      ↓
2-YEAR WINDOW STARTS
```

## Milestone Validation Rules

### Manufactured
- Project paid
- Not archived
- Not digital wrapper
- Units exist

### Shipped
- Project manufactured
- Shipping address complete (recipient_name, address_line1, city, country)
- Tracking code optional but recommended

### Delivered
- Project shipped
- No additional validation

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