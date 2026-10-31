# The Authoritative Order Model

> **Status:** implemented in
> `supabase/migrations/20261104000001_stage_configured.sql`,
> `20261104000002_stage_sold.sql` and
> `20261104000003_unified_order_model.sql` on top of
> `20261103000001_order_lifecycle.sql`. **Not yet applied to a live project**
> (no Supabase CLI / credentials in the build environment).
>
> This is the contract. If code and this document disagree, the document wins
> and the code is the bug. `ORDER_LIFECYCLE.md` is the operational walkthrough.

A Dearune is **one row** — `public.projects` — with one identity, one stage, one
QR answer and one set of production and shipping facts. Designer, Operations,
Admin, Worker and QA are **views** over that row. They differ in what a person
is allowed to see and do; they never differ in what the facts are.

---

## 1. Attribute ownership — exactly one owner per fact

| Fact | Owning column | Written by | Never written by |
|---|---|---|---|
| Canonical Dearune ID | `projects.reference` (`^DR-\d{6}$`) | `project_reference_seq` default + trigger | any screen, any edge function |
| Physical unit ID | `physical_products.reference` (`^DR\d{11}$`) | `physical_product_reference_seq` default | any screen |
| Sold ID | `order_references` row with `kind='sold'` | `order_reference_project` trigger (`SOL-` + canonical digits) | any screen; never built from a unit id |
| Every historical/alias id | `order_references.value` (unique) | reference-registering triggers, reconciliation RPCs | screens |
| Lifecycle stage | `projects.milestone` | `ops_*` transition functions only | direct updates outside `ops_*`, any React code |
| Stage timestamp | `projects.milestone_updated_at` | the transition guard | screens |
| Last admin actor | `projects.milestone_updated_by` | the transition guard | workers (stays `NULL`; see `project_events`) |
| Archive state | `projects.archived_at` | the `admin-dearunes` archive action | `projects.status` (deprecated) |
| Production stamps | `projects.manufactured_at/shipped_at/arrived_at` | `ops_move_milestone` forward only | screens; never set for digital orders |
| Unit production detail | `physical_products.manufacturing_completed_at` etc. | mirrored forward by `ops_move_milestone` | screens |
| Shipment detail | `shipping` (one row per project) | `ops_save_shipment`, `ops_ship`, `ops_deliver` | screens |
| Refunds | `refunds` ledger rows | `ops_record_refund` | screens; totals are derived |
| QR readiness | **computed** by `order_qr_state()` | nobody — it is not stored | every screen, every view |
| Public destination | `projects.public_id` + `projects.public_token` | Create Dearune / activation flow | QR code, screens |

Two rules follow from the table and are enforced by tests:

1. **No current state is stored twice.** There is no second stage column, no
   `qr_ready`, no `printed`, no `sold_as`. Section membership is a filter over
   `milestone`, not a stored `section` field.
2. **No identifier is manufactured in the browser.** Every id a screen shows is
   either a database column or a pure function of one
   (`soldIdFor(canonical)`).

`projects.status` still exists and is **deprecated**: it holds a legacy duplicate
of stage/archive, nothing reads or writes it, and its column comment says so.

---

## 2. The identity model

```
projects.reference          DR-000021         the ONE Dearune ID (quote this)
      │
      ├── SOL-000021       derived Sold ID, registered per project
      │
      └── physical_products.reference   DR00000021001 …   physical units
```

- `order_references` is the registry: `(value UNIQUE, project_id,
  physical_product_id, kind)`, `kind ∈ {canonical, unit, sold, sale, legacy}`.
  A UNIQUE constraint on `value` means one identifier can never point at two
  orders.
- A partial unique index, `order_references_one_sold_per_project`, enforces **at
  most one** `sold` reference per project.
- `AFTER INSERT` triggers on `projects` and `physical_products` register the
  canonical, sold and unit references automatically. No application code has to
  remember to.
- Old `SOL-DR70700000011` values are reclassified as `kind='legacy'` and kept.
  Nothing is deleted, so a customer holding an old paper still resolves.
- Resolving a printed reference, a manifest row or a search term goes through
  `order_references`, never through "best guess by customer name".
- `ops_identity_report` lists orders with a missing canonical id, a missing Sold
  ID, no units when a physical order needs them, more than one shipping row, or
  a stored milestone that disagrees with the stamps — the short list of records a
  human must reconcile. It is a report, not a writer.

**Invariant:** one order ⇒ one canonical id ⇒ at most one Sold ID ⇒ many unit
ids. Any query that returns two canonical ids for one project is a bug.

---

## 3. The milestone model

```
configured → sold → making → shipping → delivery → delivered → after_sale
```

- The PostgreSQL enum `public.dearune_milestone` is declared **in lifecycle
  order**, so ranking is `array_position` and not a second table. A new stage
  requires `ALTER TYPE … ADD VALUE … BEFORE/AFTER` in its **own** migration file,
  which is why `20261104000001_stage_configured.sql` and
  `20261104000002_stage_sold.sql` exist separately.
- `projects.milestone` is `NOT NULL DEFAULT 'configured'`. Reading a NULL stage
  or deriving a stage from timestamps is gone.
- `archived_at` is **orthogonal**. It is not a stage; a screen may show an
  archived order as "Archived", but the stored milestone is untouched.
- Digital Dearunes (`wrapper_type` resolving to kind `digital`) never enter
  `making`, `shipping` or `delivery`; they go `sold → delivered` when the
  message is opened. The guard enforces it, and the production sections exclude
  them.

### The only transition judge

`projects_milestone_guard()` (BEFORE UPDATE on `projects`) decides:

| Situation | Outcome |
|---|---|
| `NULL → anything` | allowed — initialisation only |
| identical value | no-op; retrying a request cannot duplicate an event |
| `dearune.milestone_override = 'on'` | allowed — reconciliation RPCs only |
| physical, exactly the next stage | allowed |
| physical, skip or backwards | `milestone.transition_denied` |
| digital into production | `milestone.digital_production` |
| digital `sold → delivered`, or any forward jump | allowed |

There is no second opinion anywhere: not in React, not in an edge function, not
in a worker RPC.

### The only writers

| Function | Role | Purpose |
|---|---|---|
| `ops_move_milestone(project, to, actor, reason, actor_type)` | service_role | one forward step; mirrors stamps; audits |
| `ops_advance_to(project, to, actor, reason, actor_type)` | service_role | forward-only walk, one event per hop (legacy stamps, worker paths) |
| `ops_start_work_order`, `ops_making_complete`, `ops_ship`, `ops_deliver`, `ops_after_sale` | service_role | named business actions; each calls the mover in the same transaction |
| `worker_mark_dearune_manufactured`, `worker_mark_dearune_shipped`, `worker_mark_dearune_delivered` | authenticated + `worker_has_permission` | worker actions; delegate to the same movers with `actor_type='worker'` |
| `ops_revert_milestone(project, to, actor, reason, actor_type)` | service_role | **maintenance only**: backwards correction with the override, stamp clearing, `order.milestone.reverted` event, refuses to un-sell a sold order |

Every transition appends to `project_events` with `actor_type` (`admin` |
`worker`), the actor id, the from/to stages and the reason. **The event log is
history, never a current-state source** — nothing computes the stage by replaying
events, and nothing may edit an event.

---

## 4. The QR model

The workshop asks four questions; there is exactly one answer to all four.

```sql
public.order_qr_state(public_id, public_token, message_active, password_set)
  → public.order_qr_status(destination, activated, openable, blocked_reason)
```

| Field | Meaning |
|---|---|
| `destination` | Is there a link to encode at all? (`public_id` **and** `public_token`) |
| `activated` | Is the letter switched on? |
| `openable` | Will scanning the QR open the letter **right now**? |
| `blocked_reason` | `missing_destination` \| `not_activated` \| `password_protected` \| `NULL` |

- `ops_orders`, `operations_units`, `ops_identity_report` and the worker read
  RPCs all project these four fields from that one function. There is no
  `qr_ready` column and no `printed` column.
- `src/services/qrState.js` is the browser mirror (`qrState`, `qrStateOf`,
  `qrBlockedMessage`, `QR_BLOCKED_LABELS`, `QR_BLOCKED_FIXES`) for questions
  asked before a row exists. A test asserts SQL and JS agree on every case.
- Printing is client-side (`qrPaper.js`). A sheet is "printed" when it comes out
  of the printer; a database flag cannot know that, so none is kept.
- `validateOperationForPaper` hard-fails on any `blockedReason`; a missing
  customer phone is only a warning.
- Generation is one process: the QR encodes the order's public destination, so
  every unit of one Dearune scans to the same letter and no QR ever encodes a
  unit id.

---

## 5. Views, not parallel systems

| Surface | Reads | Writes through |
|---|---|---|
| Designer | `projects` (`reference`, `milestone`) + designer edge function metadata | `admin-dearunes` → `ops_advance_to` / `ops_revert_milestone` |
| Admin → Operations | `ops_orders`, `operations_units`, `ops_milestone_counts`, `ops_identity_report` | `admin-operations` → `ops_*` |
| Worker → Operations / QA | `worker_operations_units`, `worker_dearune_detail`, `worker_qa_lookup` | `worker_mark_dearune_*` |
| QA scanner | `qa` service over the order + units | read-only |
| Print | `operations_units` shaped by `toOperation()` | read-only |

Consequences that are guaranteed, and tested:

- Moving an order between Operations sections changes `projects.milestone`. It
  does **not** create a row, an id, a Sold ID, a milestone row or a QR state.
- Admin and Worker acting on the same order produce the same stage, the same
  Sold ID and the same QR answer; only the permission check differs.
- `ops_orders` exposes `is_digital` so a screen can suppress production actions
  for a letter that has no parcel (the order still appears in the section its
  milestone falls in).

---

## 6. Layering — where logic is allowed to live

| Layer | Owns |
|---|---|
| PostgreSQL (`supabase/migrations`) | identity generation, uniqueness, the transition guard, stamp mirroring, QR calculation, permission checks, audit rows |
| Edge functions | authentication of the admin session, request shape, mapping a named action onto `ops_*` |
| `src/services/*` | query construction, row shaping, pure presentation helpers, the QR mirror |
| `src/pages/*`, `src/components/*` | rendering; never a stage transition, never an id, never a QR flag |

A React component that computes a stage or a QR state is a defect, even if it
happens to agree with the database today.

---

## 7. Migration guarantees

`20261104000003_unified_order_model.sql` is **non-destructive and idempotent**:

- it creates the enum type and the QR composite type only if absent;
- it backfills `milestone` **only where NULL**, from the furthest reliable stamp
  (`arrived_at → delivered`, `shipped_at → delivery`, `manufactured_at →
  shipping`, `paid_at → sold`, else `configured`) — it never moves a stage that
  is already set and never invents a milestone for a record it cannot read;
- it registers identifiers with `ON CONFLICT DO NOTHING` and reclassifies old
  sold values to `legacy` without deleting them;
- it `DROP VIEW IF EXISTS` before recreating views (column sets changed) and
  re-grants afterwards;
- it drops and recreates triggers, and drops the old `ops_*` overloads before
  creating the new signatures;
- it never resets production: stamps are only ever filled forward, and only
  `ops_revert_milestone` lowers them, with an explicit reason;
- re-applying it is asserted by `tests/unified-order-model.test.js` to change no
  identifier and no stage.

A dry-run report is emitted with `RAISE NOTICE` — the number of orders reconciled
to the furthest stamped stage, the totals of sold orders / units / registered
identifiers, the count of milestone mismatches, orders with no unit or no Sold
ID, and how many sold orders have a QR that will not open. Nothing is fabricated
for the records it flags; they are listed for a human in `ops_identity_report`.

---

## 8. Tests that prevent regression

| Concern | Where |
|---|---|
| identity: uniqueness, derivation, alias resolution, one Sold ID | `tests/unified-order-model.test.js`, `tests/order-lifecycle-db.test.js` |
| milestones: guard, digital path, idempotent retry, revert semantics | `tests/unified-order-model.test.js` |
| QR: one answer across views, SQL↔JS parity, print gate | `tests/unified-order-model.test.js`, `tests/operations-list.test.js` |
| constraints: NOT NULL stage, unique references, stage-order check | `tests/order-lifecycle-db.test.js` |
| permissions: worker RPCs, RLS, service-role-only `ops_*` | `tests/worker-permissions.test.js`, `tests/order-lifecycle-db.test.js` |
| cross-dashboard parity: same milestone, Sold ID, QR | `tests/unified-order-model.test.js` |
| concurrency/idempotency: double submit, same-value write | `tests/unified-order-model.test.js`, `tests/order-lifecycle-db.test.js` |
| migration idempotency | `tests/unified-order-model.test.js` |

Baseline when this model was introduced: **456 passing**, 14 pre-existing
failures (`qr-paper` 9, `app-pwa` 4, `order-stage` 1) unrelated to the order
model.
