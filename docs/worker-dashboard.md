# Worker Dashboard & Permissions — implementation report

## 1. What was built

A worker-facing side of Dearune, separate from the existing black admin studio:

- **Admin → Users** (`/admin/users`): searchable worker directory, create worker, edit details, set status, grant/revoke permissions, reset password, review activity.
- **Worker Dashboard** (`/worker/*`): royal-blue, mobile-first shell whose navigation is generated from live permissions and whose landing page adapts to what the worker can actually do.
- **Independent Financial section** (`/worker/financial`, plus an admin overview at `/admin/financial`): money is split into independently grantable capabilities, not a single “financial” switch.
- **Two-way private messaging** (`/worker/messages`, `/admin/inbox`): unread counts, read receipts, priority messages, and an admin inbox with one thread per worker.
- **Audit log**: worker lifecycle, permission changes, financial corrections, and admin messaging events, readable only by an admin.

The existing admin experience, designer sign-in, public site, Operations, QA and all money tables were left in place. No data is deleted.

## 2. Architecture and identity

| Actor | Identity | Authority |
| --- | --- | --- |
| Admin | Supabase Auth user + row in `public.admin_users` | `public.is_dearune_admin()`; Edge Functions call `requireAdmin()` |
| Worker | Supabase Auth user + row in `public.workers` | live `workers.status` + `worker_permissions`; SQL helpers and `requireWorker()` |
| Designer | `public.designers` + bcrypt passcode (existing) | existing designer Edge Functions; unchanged |

A worker is deliberately **not** an admin. A worker who signs in at the admin login is redirected to `/worker/home`; an inactive or suspended worker is signed out with an explanation. The admin login retains full admin access.

The browser is never the authority:

- `src/lib/permissions.js` only mirrors the catalogue for UI copy and navigation. Tampering with it changes nothing on the server.
- The database RLS policies and RPCs re-read the live worker row and permission rows on every call.
- Realtime and focus-based refreshes never cache permission decisions.

## 3. Database migrations

Forward-only, applied in this order:

1. `supabase/migrations/20261023000001_workers_permissions.sql`
   - `workers`, `permissions` catalogue, `worker_permissions`.
   - `admin_audit_log`.
   - `current_worker_id()`, `is_active_worker()`, `worker_has_permission(text)`, `worker_touch_session()`.
   - `worker_messages` and messaging RPCs.
   - RLS, least-privilege grants, widened actor-type constraints, guarded Realtime publication.
   - `sales_log.voided_by_worker`.
2. `supabase/migrations/20261023000002_worker_operations_designers.sql`
   - Safe worker Operations list and write RPCs; designer directory/project RPCs.
   - No worker RLS policy on `projects`, `physical_products`, `sales_log` or other operational tables.
3. `supabase/migrations/20261023000003_worker_financial_qa.sql`
   - Permission-filtered `worker_financial_overview()`.
   - Maintenance-only `worker_void_sale()`.
   - Read-only `worker_qa_lookup()`.
4. `supabase/migrations/20261023000004_fix_sales_log_guard.sql`
   - Fixes a pre-existing guard that compared the stored generated `estimated_profit` inside a `BEFORE UPDATE` trigger. PostgreSQL evaluates stored generated columns after BEFORE triggers, so the old guard rejected **every** sale update (including the existing admin reverse-paid path). Profit is still protected transitively through immutable `selling_price` and `estimated_cost`.

No existing table is dropped, no existing row is rewritten, and no admin policy is weakened. The new tables do not receive worker `INSERT`/`UPDATE`/`DELETE` grants.

## 4. Permission catalogue

Every permission must be granted explicitly. Dependency repair only ever adds the **non-sensitive module view gate** (e.g. choosing “Edit” adds “View Operations”); it never enables a financial category.

### Operations
| Permission | Meaning |
| --- | --- |
| `operations.view` | See the production list and operational details. No prices, costs or profit. |
| `operations.create` | Open additional production units for a multi-item Dearune. |
| `operations.edit` | Correct unit notes, phone or attached designer. Never money. |
| `operations.update_status` | Advance the workshop status graph; hold/cancel with a reason. |
| `operations.manage` | Archive/restore units. Never deletes. |

### Designers
| Permission | Meaning |
| --- | --- |
| `designers.view` | View the designer directory and their projects, without money fields. |
| `designers.create` | Create a designer and receive the one-time passcode. |
| `designers.edit` | Change a designer name or sign-in ID. |
| `designers.manage` | Reset passcode, revoke or reactivate a designer. |

### QA
| Permission | Meaning |
| --- | --- |
| `qa.view` | Resolve a printed QR to its project, units and delivery record. Read-only. |

### Financial (independent categories)
| Permission | Meaning |
| --- | --- |
| `financial.view` | Open the Financial section. Reveals **no figures** on its own. |
| `financial.view_revenue` | Revenue totals, sales counts and breakdowns. |
| `financial.view_costs` | Estimated production costs and cost breakdowns. |
| `financial.view_customer_payables` | What each customer owes, per Dearune. Does not imply revenue, cost or profit. |
| `financial.view_profit` | Estimated profit totals and margin. |
| `financial.view_payments` | Sale/payment ledger rows: reference, amount, currency, status, date. |
| `financial.manage` | Void a completed sale while maintenance mode is on. Audited; never rewrites a price. |
| `financial.export` | Export only the categories the worker is already allowed to see. |

### Messages and notifications
| Permission | Meaning |
| --- | --- |
| `messages.view` | Read the worker’s own private thread. |
| `messages.send` | Send to the admin. The sender is derived from the session. |
| `notifications.view` | See unread counts/badges. Does **not** grant message content. |

## 5. Financial protection

The financial tables (`sales_log`, `projects`, `app_settings`, legacy `orders`) remain admin-only. Workers receive no SELECT policy on them.

- `worker_financial_overview()` is `SECURITY DEFINER`, requires an active worker and `financial.view`, and builds its JSON object conditionally: a category key simply does not exist unless its permission is held.
- Customer payables are returned from `projects`, but only `projectId`, reference, title, designer name, amount, currency, paid date and created date. Revenue/cost/profit/payments are not joined in.
- Payments expose the ledger columns but not cost or profit.
- `worker_void_sale()` requires `financial.view` **and** `financial.manage`, maintenance mode, a reason, and refuses a sale whose production has started. It records `sales_log.voided_by_worker` and an audit row.
- There is no worker table grant, no broad view and no “hide it in React” step. Forged IDs still return no rows because RLS compares against `auth.uid()` through `current_worker_id()`.
- The admin Financial page reads the existing admin-authorized sales/Dearune/designer services and summarizes them in `buildAdminFinancialOverview`.

## 6. Worker account management

`supabase/functions/admin-workers` (service-role, `verify_jwt = false`, every action starts with `requireAdmin`) supports:

- `list`, `get` (worker + activity history)
- `create`
- `update-details`
- `set-status`
- `set-permissions`
- `reset-password`
- `delete` → deliberately returns an error: accounts are deactivated, not deleted, so messages and audit history survive.

Creation:

1. Admin submits name, email and optional permissions in the black admin UI.
2. The function creates the Supabase Auth user with a server-generated password, creates the `public.workers` row and permission rows, and audits the creation without storing the password.
3. The password is shown **once** in `CredentialOnceDialog`; it is not stored in Postgres, the audit log, or the response after that dialog closes.
4. There is no public worker registration and no worker-callable account endpoint.
5. Status changes also ban/unban the Auth user through the admin API as defence in depth; the database row remains the authority.

Workers cannot reach these actions: `admin-workers` rejects any caller without an `admin_users` row. Workers also cannot modify `worker_permissions` or `admin_audit_log` directly (no grants, RLS reads only).

## 7. Worker Dashboard

Routes live under `/worker` behind `WorkerGate` and `WorkerPermissionGate`:

- `/worker/login`
- `/worker/home`
- `/worker/operations`
- `/worker/designers`
- `/worker/qa`
- `/worker/financial`
- `/worker/messages`
- `/worker/account`
- `/worker/denied` (access-denied state)

The shell uses a royal-blue theme in `src/styles/worker.css`, reuses the Dearune wordmark (`WorkerBrand`), and generates navigation from `workerModuleAccess()`. A worker with only one module still gets a complete landing page and account screen. Loading, empty, error and access-denied states are implemented, with visible focus indicators.

`WorkerGate` validates the session with `auth.getUser()`, re-reads the live worker row and permissions, refreshes on focus/visibility/60-second intervals, and refuses to render for inactive, suspended, missing-worker or admin accounts.

## 8. Messaging and notifications

- One private thread per worker in `worker_messages`.
- Workers read through RLS only their own rows and only with `messages.view`.
- Workers send through `worker_send_message()`, which ignores any browser-supplied sender and stamps `auth.uid()`.
- Workers can mark only admin messages as read; admin replies are counted by `worker_unread_count()`.
- Admin send/read/inbox RPCs require `is_dearune_admin()`.
- Message bodies are validated/trimmed (title ≤ 200, body 1–5000).
- Realtime is an enhancement. `subscribeToWorkerMessages`/`subscribeToAllWorkerMessages` use a unique channel topic per subscription so the unread badge, Messages screen and admin inbox can all listen simultaneously and React StrictMode re-mounts cannot attach callbacks after `subscribe()`. Screens also refresh on focus and on a timer, so notifications still work without a Realtime publication.
- Audit metadata records message id, priority and body length — never the body.

## 9. Audit log

`public.admin_audit_log` records actor, action, target, timestamp and small metadata. Examples: worker created, details changed, status changed, permissions granted/revoked, password reset, notification sent, sale voided, worker operations. It is admin-SELECT only; API roles have no INSERT/UPDATE/DELETE grants, and workers see zero rows. No passwords, tokens, service keys or message bodies are written.

## 10. Files

### New backend
- `supabase/migrations/20261023000001_workers_permissions.sql`
- `supabase/migrations/20261023000002_worker_operations_designers.sql`
- `supabase/migrations/20261023000003_worker_financial_qa.sql`
- `supabase/migrations/20261023000004_fix_sales_log_guard.sql`
- `supabase/functions/admin-workers/index.ts`
- `supabase/functions/worker-designers/index.ts`
- `supabase/functions/_shared/auth.ts` (worker context, admin resolution, fail-closed checks)
- `supabase/config.toml` (new function entries)

### New frontend
- `src/lib/permissions.js`
- `src/services/workerRpc.js`, `workerSession.js`, `workers.js`, `workerOperations.js`, `workerDesigners.js`, `workerFinancial.js`, `workerQa.js`, `workerMessages.js`, `financialSummary.js`
- `src/hooks/use-worker-unread.js`, `use-admin-inbox-unread.js`
- `src/components/worker-brand.jsx`, `src/components/admin/PermissionEditor.jsx`, `src/components/admin/CredentialOnceDialog.jsx`
- `src/pages/worker/*` (gate, shell, login, home, operations, designers, QA, financial, messages, account, access denied)
- `src/pages/admin/Users.jsx`, `UserDetail.jsx`, `Inbox.jsx`, `Financial.jsx`
- `src/styles/worker.css`

### Modified
- `src/App.jsx` — admin/worker routes and role-aware redirects.
- `src/pages/admin/AdminShell.jsx` — Users, Inbox badge, Financial navigation.
- `src/pages/admin/AdminLogin.jsx` — worker-aware sign-in routing.
- `src/services/workerMessages.js` — realtime channel fix.
- `src/pages/worker/WorkerGate.jsx` — unused import cleanup.
- `tests/helpers/database.js` — worker seeding/grant helpers.

### Tests
- `tests/worker-permissions.test.js` — 41 tests: catalogue parity, permission UX rules, live status, direct-table denial, operations gates/revocation, financial category isolation, customer-payables-only, read-only corrections, maintenance/void/audit, QA leakage, messaging privacy/spoofing/unread/read receipts, audit isolation and sensitive-data checks.

## 11. Permissions meaning in the UI

`PermissionEditor` groups checkboxes by Operations, Designers, QA, Financial, and Messages & notifications. Financial permissions are visually separated and marked sensitive. Selecting a dependent permission adds only the module view gate; no financial category is auto-enabled. Saving is explicit with feedback, and summaries use compact labels such as “Operations: View, Edit”.

## 12. Environment and deployment

Frontend (existing, no new variables):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Supabase Edge Functions:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEYS.default`)
- `DESIGNER_JWT_SECRET` (existing designer functions)

Deploy:

```bash
supabase db push
supabase functions deploy admin-workers worker-designers
```

The site itself still deploys as Cloudflare static assets (`wrangler.jsonc`, `dist`). There are no new frontend environment variables and no service-role key in the client bundle.

## 13. Verification

Commands run in this environment:

| Command | Result |
| --- | --- |
| `npm run lint` | exits 0, warnings only |
| `npm run build` | succeeds (Vite + PWA) |
| `npx vitest run tests/worker-permissions.test.js` | **41 passed** |
| `npm test` | **303 passed, 10 failed** |

The 10 failures are the same pre-existing failures recorded before this task:

- `tests/qr-paper.test.js` — 9 failures (font/asset URLs under Vitest).
- `tests/operations-list.test.js` — 1 failure (expected recipient name differs from fixture).

All new worker/permission/messaging tests pass. The database tests run the real migrations against PGlite with Supabase roles and `auth.uid()` stubbed, so RLS, grants, triggers and SECURITY DEFINER behaviour are exercised, not just mocked.

## 14. Known limitations

- **No hard deletion.** Deactivation is the supported removal path so message/audit history remains.
- **No email delivery.** The studio has no outbound mail configuration, so worker credentials are handed over once in the UI; the product does not claim an invitation email was sent.
- **Admin Financial is a summary.** Detailed reconciliation and corrections remain in the existing admin sale/ledger screens.
- **Realtime requires the Supabase publication.** The migration guards its publication change for bare/self-hosted Postgres; screens fall back to focus/interval refresh.
- **PWA console message.** Chrome logs “Banner not shown: beforeinstallpromptevent.preventDefault() called…” because the app intentionally captures the event for its own install UI (`promptInstall()` calls `prompt()` on the user’s gesture). This is an informational browser message, not an application error; calling `prompt()` automatically is not permitted.
- **Browser coverage.** The automated suite is database/pure-helper level. Admin/worker screen flows were exercised by build and manual code review, not a full Playwright worker journey.
