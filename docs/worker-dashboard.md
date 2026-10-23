# Worker Dashboard & Permissions — implementation and parity report

## 1. Scope and source of truth

This work added the worker-facing side of Dearune without replacing or simplifying the existing
admin studio. The admin code was audited first and remains the reference implementation for every
business workflow. Where a worker screen needed the same behaviour, it reuses the admin's pure
helpers/components (status graph, review rules, paper builder, Bosta workbook, CSV writers) but reads
through purpose-built RPCs with explicit, financial-safe field lists.

Goals:

- Every non-security business module is either at real feature parity or deliberately excluded for a
  documented security/financial reason.
- Permissions are granular per module and action, and the database enforces them on every call.
- Workers never receive a broader object and hide fields in React. Money and letter payloads are
  absent at the query boundary.
- Existing IDs, relationships, QR/public IDs, statuses, triggers and records are preserved.
- Migrations are forward-only and already-applied migrations are not edited.

## 2. Identity and authority

| Actor | Identity | Authority |
| --- | --- | --- |
| Admin | Supabase Auth user + row in `public.admin_users` | `public.is_dearune_admin()`; Edge Functions call `requireAdmin()` |
| Worker | Supabase Auth user + row in `public.workers` | live `workers.status` + `worker_permissions`; SQL helpers and `requireWorker()` |
| Designer | `public.designers` + bcrypt passcode (existing) | existing designer Edge Functions; unchanged |

A worker is deliberately **not** an admin. Admin login resolves an admin session; a worker who signs
in there is redirected to `/worker/home`; an inactive/suspended worker is signed out with an
explanation. `admin_users` and `is_dearune_admin()` remain the only admin authority.

The browser is never authoritative:

- `src/lib/permissions.js` mirrors the catalogue for navigation and copy only. Tampering changes no
  server decision.
- SQL helpers and RPCs re-read the live worker row and permission rows on every call.
- Edge Functions resolve the caller from the verified session, never from a browser-supplied role,
  worker id or actor.
- `worker-designers` uses the service role only after checking the worker's live permission.

## 3. Database migrations (forward-only)

1. `supabase/migrations/20261023000001_workers_permissions.sql`
   - `workers`, permission catalogue, `worker_permissions`, `admin_audit_log`.
   - `current_worker_id()`, `is_active_worker()`, `worker_has_permission(text)`, session helpers.
   - Worker messaging tables/RPCs, RLS, least-privilege grants, guarded Realtime publication.
   - `sales_log.voided_by_worker`; widened event actor types to include `worker`.
2. `supabase/migrations/20261023000002_worker_operations_designers.sql`
   - Safe worker Operations list and write RPCs; designer directory/project RPCs.
   - No worker RLS policy or table grant on `projects`, `physical_products`, `sales_log`, pricing or
     catalog tables.
3. `supabase/migrations/20261023000003_worker_financial_qa.sql`
   - Permission-filtered `worker_financial_overview()`.
   - Maintenance-only `worker_void_sale()`.
   - Read-only `worker_qa_lookup()`.
4. `supabase/migrations/20261023000004_fix_sales_log_guard.sql`
   - Fixes a pre-existing generated-column guard that rejected every sale update; profit remains
     protected through immutable `selling_price` and `estimated_cost`.
5. `supabase/migrations/20261023000005_extend_worker_permissions.sql`
   - Adds granular `operations.view_details`, `operations.assign`, `operations.print`,
     `operations.export`; `designers.view_details`, `designers.assign`, `designers.manage`,
     `designers.export`; removes misleading single-switch assumptions.
6. `supabase/migrations/20261023000006_worker_ops_assign_designer.sql`
   - Adds `worker_update_operation_designer()`: Operations assignment through
     `operations.assign` or `operations.edit`, with validation, audit and event rows.
7. `supabase/migrations/20261023000008_worker_ops_designers_parity.sql`
   - `worker_operation_events()` — per-unit timeline (exact `view_details` gate).
   - `worker_operations_print()` — production paper/Bosta payload (separate `print` gate; the only
     worker path that exposes `public_token`, required to print a working QR).
   - `worker_export_operations()` — safe CSV payload (`export` gate).
   - `worker_designer_detail()` — designer row, safe related Dearunes and safe project events.
   - `worker_assignable_designers()` — minimum identity fields for the Operations assignment picker,
     independent of `designers.view`.
   - `worker_export_shipments()` — safe shipping-manifest export (`designers.export`).
   - Explicit function revokes and authenticated-only grants.
8. `supabase/migrations/20261023000009_remove_inert_delete_permissions.sql`
   - Removes the never-implemented `operations.delete` / `designers.delete` catalogue rows and any
     grants. Neither dashboard has a delete capability; units are archived and designer access is
     revoked, so exposing a delete switch would be misleading.

No existing table is dropped, no existing row is rewritten, and no admin policy is weakened.

## 4. Admin module audit and worker coverage

| Admin module | Admin workflow | Worker coverage | Notes |
| --- | --- | --- | --- |
| Dashboard (`/admin/overview`) | Money intake, outstanding amounts, recent events, shortcuts | Access-aware Home + category-aware Financial | The mixed admin dashboard joins revenue and operations. Workers get a permission launcher and separate Financial screen so money is never shown to an Operations-only worker. |
| Operations (`/admin/operations`) | List, search, sort, status/filter, archive, detail, notes, phone, designer, add units, bulk, print, export, Bosta | **Full parity** at `/worker/operations` (+ `/worker/operations/print`) | Same status graph and review rules. No prices/costs/payload. |
| Designers (`/admin/designers`) | Directory, create, edit name/sign-in ID, reset passcode, revoke/reactivate, related Dearunes, shipping CSV | **Parity** at `/worker/designers` (+ detail) | Revenue tile and per-project admin messaging are intentionally absent. Shipping CSV uses stable template/wrapper keys because workers have no catalog/pricing read. |
| Designer detail (`/admin/designers/:id`) | Stats, related Dearunes, access actions, admin project messaging | **Parity** at `/worker/designers/:designerId` | Revenue is replaced by a safe “Not sold” count; per-project admin message composer is not provided. Assignment is available separately. |
| QA (`/admin/qa`) | Resolve printed QR → project, units, delivery, timeline | **Parity** at `/worker/qa` | Read-only, safe fields, no money. |
| Financial (`/admin/financial`) | Summary, categories, ledger, corrections, export | **Parity** at `/worker/financial` | Every category is independently gated; the RPC omits absent categories. |
| Sold Logs / Sale detail | Money ledger, voided rows, filters, export | Intentionally merged into category-aware Financial | Workers see the payment ledger only with `financial.view_payments`; no separate route to a wider sale object. |
| Operations print (`/admin/operations/print`) | Review, paper PDF, Bosta workbook | **Parity** at `/worker/operations/print` | Same pure builders. Worker print payload is the only path exposing the QR capability token. |
| Templates (`/admin/templates`) | Catalog + pricing + wrapper options | **Not exposed** | Reads `template_pricing`; would leak financial/catalog data and has no worker workflow. |
| Wrappers (`/admin/wrappers`) | Wrapper catalog + pricing/options | **Not exposed** | Same reason. Workers see raw wrapper keys in operational records only. |
| Settings (`/admin/settings`) | Global studio configuration, maintenance mode | **Not exposed** | Admin-only operational control; workers may observe effects (e.g. maintenance for corrections) but cannot edit settings. |
| Users / User detail (`/admin/users`) | Create workers, permissions, status, password reset, audit | **Not exposed** | This is the authority boundary itself. Workers cannot manage accounts or permissions. |
| Inbox (`/admin/inbox`) | Admin view of every worker thread | Worker sees only their own thread | Admin inbox access is intentionally admin-only; workers use `/worker/messages` and cannot enumerate others. |
| Apps (`/admin/apps`) | Install links/PWA admin tools | **Not exposed** | Admin-only distribution surface; not a studio business workflow. |

## 5. Login, routing and UI

Worker routes live under `/worker` behind `WorkerGate`:

- `/worker/login`
- `/worker/home`
- `/worker/operations`
- `/worker/operations/print` (`operations.print`)
- `/worker/designers` (`designers.view`)
- `/worker/designers/:designerId` (`designers.view_details` **or** `designers.assign`)
- `/worker/qa` (`qa.view`)
- `/worker/financial` (`financial.view`)
- `/worker/messages` (message read/send/notification states handled in-page)
- `/worker/account`
- `/worker/denied`

The shell keeps the royal-blue worker theme in `src/styles/worker.css`, reuses the Dearune wordmark,
and builds navigation from live permissions. Loading, empty, error and access-denied states are
implemented with visible focus states. `WorkerGate` re-reads the live worker row and permissions on
focus/visibility/60-second refresh, and refuses inactive, suspended, missing-worker or admin sessions.

Assignment-only workers can open a designer page through the `anyOf` route and get the minimal
directory row; full related Dearunes and history require `designers.view_details`. The Admin
permission editor repairs dependent selections by adding the module view gate (and
`operations.edit` for Operations assignment), but never enables a financial category.

## 6. Permission catalogue

Every permission is grantable independently. Dependency repair only adds the non-sensitive module
view gate; it never enables a financial category.

### Operations

| Permission | Meaning |
| --- | --- |
| `operations.view` | Open the production list and operational details. No prices/costs. |
| `operations.view_details` | Full detail panel, timeline and related delivery/designer information. |
| `operations.create` | Open additional production units for a multi-item Dearune. |
| `operations.edit` | Correct unit notes, customer phone or attached designer. Never money. |
| `operations.update_status` | Advance the workshop status graph; hold/cancel with a reason. |
| `operations.assign` | Change the designer on a unit/Dearune. |
| `operations.manage` | Archive/restore units. Never deletes. |
| `operations.print` | Review and generate production papers / Bosta manifest. |
| `operations.export` | Export the same safe Operations list. |

### Designers

| Permission | Meaning |
| --- | --- |
| `designers.view` | Designer directory and safe related Dearunes/projects. |
| `designers.view_details` | Full designer page, related Dearunes and activity. |
| `designers.create` | Create a designer and receive the one-time passcode. |
| `designers.edit` | Change a designer name or sign-in ID. |
| `designers.assign` | Assign/reassign a Dearune to a designer. |
| `designers.manage` | Reset passcode, revoke or reactivate a designer. |
| `designers.export` | Download the safe shipping manifest. |

### QA

| Permission | Meaning |
| --- | --- |
| `qa.view` | Resolve a printed QR to project, units and delivery record. Read-only. |

### Financial (independent categories)

| Permission | Meaning |
| --- | --- |
| `financial.view` | Open Financial. Reveals **no figures** alone. |
| `financial.view_revenue` | Revenue totals, counts and breakdowns. |
| `financial.view_costs` | Estimated costs and breakdowns. |
| `financial.view_customer_payables` | What each customer owes, per Dearune. |
| `financial.view_profit` | Estimated profit and margin. |
| `financial.view_payments` | Payment/sale ledger rows and void state. |
| `financial.manage` | Void a completed sale in maintenance mode with a reason; audited, never rewrites price. |
| `financial.export` | Export only categories the worker is already allowed to see. |

### Messages and notifications

| Permission | Meaning |
| --- | --- |
| `messages.view` | Read the worker's own private thread. |
| `messages.send` | Send to the admin; sender derived from the session. |
| `notifications.view` | Unread counts/badges without message content. |

## 7. Financial isolation

The financial tables (`sales_log`, `projects`, `app_settings`, legacy `orders`, pricing/catalog
tables) remain admin-only. Workers have no SELECT policy or table grant on them.

- `worker_financial_overview()` is `SECURITY DEFINER`, requires an active worker and `financial.view`,
  and builds its JSON conditionally: absent categories have no key at all.
- Customer payables contain only project identity, reference/title, designer name, amount, currency
  and relevant dates. Revenue/cost/profit/payments are not joined.
- Payments expose ledger columns but not cost or profit.
- Operations RPCs return operational fields only; there is no selling price, cost, profit or letter
  payload. The public QR token appears only in `worker_operations_print`, gated by `operations.print`.
- Designer RPCs omit sales and revenue entirely. The designer detail revenue tile is not reproduced;
  a safe “Not sold” count replaces it.
- QA returns safe project/unit/shipping fields only.
- `worker_void_sale()` requires `financial.view` **and** `financial.manage`, maintenance mode, a reason,
  and refuses a sale whose production has started. It records the worker on the sale and an audit row.
- There is no “fetch the whole object then hide it in React” step anywhere in the worker path.

## 8. Backend enforcement details

- All worker reads use purpose-specific `SECURITY DEFINER` RPCs with explicit `jsonb_build_object`
  field lists. PostgREST cannot widen the response.
- Writes use restricted SQL RPCs or the `worker-designers` Edge Function. They verify caller identity,
  active worker status, exact live permission, input, target existence and business rules; they fail
  closed with `worker.forbidden` / `worker.inactive_or_unknown`.
- `worker_update_operation_designer()` validates the designer and writes both an event and an audit
  row. `worker_assignable_designers()` returns only `id`, `name`, `code` to the assignment picker.
- `worker-designers` supports create, edit, assignment, passcode reset, revoke and reactivate. It uses
  bcrypt/service role only after permission checks, and records the worker as audit actor. It never
  accepts a caller-supplied actor.
- `admin-operations` remains admin-only; workers cannot call it.
- Worker-facing functions have `EXECUTE` revoked from `public`, `anon` and `authenticated`, then
  granted only to `authenticated` (and still permission-gated inside).
- No public registration, no worker account-management endpoint and no worker access to
  `worker_permissions` or `admin_audit_log`.

## 9. Reused components and helpers

- Status graph/labels and `OperationsBadge`: `src/services/constants.js`, `src/components/admin/operations-status.jsx`.
- Row shaping: `toOperation()` and `OPERATION_COLUMNS`/sorts from `src/services/operations.js`.
- Print review rules: `reviewBatch()` from `src/services/operationsReview.js`.
- Papers/PDF: `buildQrPaperPdf()`, `formatProductionDate()` from `src/services/qrPaper.js`.
- QR destination: `qrContent()` from `src/services/qr.js`.
- Bosta manifest: `buildBostaWorkbook()`, `bostaFilename()` from `src/services/bosta.js`.
- Shipping CSV writer: `downloadShippingCsv()` from `src/services/shipping.js`.
- Permission editor/catalogue: `src/components/admin/PermissionEditor.jsx`, `src/lib/permissions.js`.
- Worker-safe RPC wrapper: `src/services/workerRpc.js`.
- Worker services: `workerOperations.js`, `workerDesigners.js`, `workerFinancial.js`, `workerQa.js`,
  `workerMessages.js`, `workerSession.js`.

## 10. Tests and verification

Targeted worker suite (`npx vitest run tests/worker-permissions.test.js`): **47 passed**.

It exercises real migrations in PGlite with Supabase roles and stubbed `auth.uid()`:

- catalogue parity between SQL/frontend, dependency repair, sensitive-category isolation;
- live status and revocation fail closed;
- direct-table denial for workers;
- Operations status/notes/archive gates, detail timeline, print and export payloads;
- Operations designer assignment and independent assignable-designer picker;
- designer directory/detail scoping (another designer's Dearunes are excluded), passcode/revoke/activate
  through the Edge contract, and shipping export;
- financial category isolation, customer-payables-only, maintenance/void/audit;
- QA and messaging privacy/spoofing/unread/read receipts;
- audit isolation and sensitive-data checks.

Full suite (`npm test`): **309 passed, 10 failed**. The 10 failures are the same pre-existing failures
recorded before this task and are unrelated to worker changes:

- `tests/qr-paper.test.js` — 9 failures (font/asset URL resolution under Vitest plus an outdated
  expected label string).
- `tests/operations-list.test.js` — 1 failure (fixture expects recipient `Hana`, production mapper
  returns `Nour`).

Other commands:

| Command | Result |
| --- | --- |
| `npm run lint` | exits 0, warnings only (no new worker errors) |
| `npm run build` | succeeds (Vite + PWA; chunk-size and CSS `@import` notices are pre-existing) |

## 11. Deployment

Frontend environment (existing, unchanged):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Supabase Edge Function environment:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEYS.default`)
- `DESIGNER_JWT_SECRET` (existing designer functions)

Deploy:

```bash
supabase db push
supabase functions deploy admin-workers worker-designers
```

The site deploys as Cloudflare static assets (`wrangler.jsonc`, `dist`). There are no new frontend
environment variables and no service-role key in the client bundle.

## 12. Deliberate omissions and known limitations

- **Templates / Wrappers:** not exposed because their admin screens read pricing/catalog tables.
  Workers see stable template/wrapper keys on operational records, not human catalog labels.
- **Settings / Users / Apps / Admin Inbox:** admin-only surfaces, excluded by design. Worker account
  management is limited to the worker's own account/password screen.
- **Sold Logs / Sale detail:** no separate worker route; safe payment rows appear only under the
  independently granted Financial category.
- **Admin dashboard revenue and designer revenue tile:** replaced by permission-aware summaries or a
  safe “Not sold” count; revenue is available only through Financial category permissions.
- **Designer per-project admin messaging:** not reproduced on the worker designer page. Workers have
  their own admin conversation under Messages.
- **No hard deletion:** deactivation is the removal path for workers; Operations units are archived;
  designer access is revoked. Inert delete permissions were removed.
- **Realtime** depends on the Supabase publication; screens fall back to focus/interval refresh.
- **PWA console notice** about `beforeinstallprompt` is intentional (the app captures the event for
  its own install UI), not an application error.
- **Browser coverage:** the suite is database/pure-helper level; screen flows are covered by build,
  lint and code review rather than a full Playwright worker journey.

## 13. File map

### New backend

- `supabase/migrations/20261023000005_extend_worker_permissions.sql`
- `supabase/migrations/20261023000006_worker_ops_assign_designer.sql`
- `supabase/migrations/20261023000008_worker_ops_designers_parity.sql`
- `supabase/migrations/20261023000009_remove_inert_delete_permissions.sql`
- `supabase/functions/worker-designers/index.ts`
- `supabase/functions/admin-workers/index.ts`
- `supabase/functions/_shared/auth.ts`

Earlier worker backend files are listed in section 3.

### New frontend

- `src/pages/worker/WorkerOperationsPrint.jsx`
- `src/pages/worker/WorkerDesignerDetail.jsx`
- `src/components/admin/PermissionEditor.jsx`
- `src/lib/permissions.js`
- `src/services/workerOperations.js`, `workerDesigners.js`, `workerFinancial.js`, `workerQa.js`,
  `workerMessages.js`, `workerRpc.js`, `workerSession.js`
- `src/pages/worker/*` (gate, shell, login, home, operations, operations print, designers, designer
  detail, QA, financial, messages, account, access denied)
- `src/styles/worker.css`

### Modified

- `src/App.jsx` — worker/admin routes, lazy print route and gated designer detail route.
- `src/pages/worker/WorkerOperations.jsx` — Operations parity, timeline, bulk, export, print,
  assignment.
- `src/pages/worker/WorkerDesigners.jsx` — detail links and safe shipping export.
- `src/services/workerOperations.js`, `src/services/workerDesigners.js` — safe RPC wrappers.
- `supabase/functions/worker-designers/index.ts` — worker assignment and audited management.
- `tests/worker-permissions.test.js` — parity/security tests.
- `src/pages/admin/Users.jsx`, `UserDetail.jsx`, `Inbox.jsx`, `Financial.jsx`,
  `AdminShell.jsx`, `AdminLogin.jsx` — worker administration and navigation.
