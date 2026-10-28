# Architecture

## System Overview

Dearune is a **single React SPA** serving four personas through route-based access control, backed by **Supabase (PostgreSQL + Auth + Storage + Edge Functions + Realtime)** and deployed to **Cloudflare Workers**.

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│                              DEARUNE SYSTEM ARCHITECTURE                           │
├────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                    │
│  ┌──────────────────────────────────────────────────────────────────────────────┐  │
│  │                        CLIENT (React 19 + Vite 8)                            │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐   │  │
│  │  │ Landing │  │ /create │  │ /admin/*│  │/worker/*│  │ /message/:id    │   │  │
│  │  │  Page   │  │ Designer│  │  Admin  │  │ Worker  │  │ Public Message  │   │  │
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────────┬────────┘   │  │
│  │       │            │            │            │                  │            │  │
│  │       └────────────┴────────────┴────────────┴──────────────────┘            │  │
│  │                              │                                                │  │
│  │       ┌────────────────────┴──────────────────────────────────────────┐     │  │
│  │       │              REACT CONTEXT PROVIDERS                          │     │  │
│  │       │  ThemeProvider • TooltipProvider • Toaster • PWA Sync        │     │  │
│  │       └──────────────────────────────────────────────────────────────┘     │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                           │
│                    ┌─────────────────┼─────────────────┐                       │
│                    ▼                 ▼                 ▼                       │
│         ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐            │
│         │   SUPABASE      │ │   EDGE FUNCTIONS│ │   STORAGE       │            │
│         │   (PostgreSQL)  │ │   (Deno/TypeScript)                │            │
│         │                 │ │                 │                  │            │
│         │ • Tables        │ │ • admin-dearunes│ • designer-drafts│            │
│         │ • RLS Policies  │ │ • admin-operations                  │            │
│         │ • RPCs (24)     │ │ • designer-*    │ • designer-drafts │            │
│         │ • Triggers      │ │ • worker-*      │   (private)      │            │
│         │ • Realtime      │ │ • project-media │   • public/      │            │
│         │ • Auth          │ │ • create-sale   │   brand/         │            │
│         │                 │ │ • project-media │   qr-paper/      │            │
│         └─────────────────┘ └─────────────────┘ └─────────────────┘            │
│                                    │                                         │
│         ┌──────────────────────────┼──────────────────────────┐              │
│         ▼                          ▼                          ▼              │
│  ┌──────────────┐         ┌──────────────┐          ┌──────────────┐        │
│  │  GOOGLE DRIVE│          │   BOSTA API  │          │  SUPABASE    │        │
│  │  (Optional   │          │  (Courier    │          │  STORAGE     │        │
│  │  Designer    │          │  Manifest)   │          │  (Fallback)  │        │
│  │  Media)      │          │              │          │              │        │
│  └──────────────┘          └──────────────┘          └──────────────┘        │
│                                                                              │
└────────────────────────────────────────────────────────────────────────────────┘
```

## Frontend Architecture

### Entry Points

| File | Purpose |
|---|---|
| `src/main.jsx` | Bootstrap: providers, router, PWA sync, app mount |
| `src/App.jsx` | Route definitions, role guards, lazy loading |
| `src/lib/supabase.ts` | Supabase client factories (anon, service-role, worker) |

### Provider Hierarchy (`src/main.jsx`)

```
<BrowserRouter>
  <ThemeProvider>           // next-themes (system/dark/light)
    <TooltipProvider>       // Radix Tooltip
      <App />               // Routes + guards
      <Toaster />           // Sonner notifications
    </TooltipProvider>
  </ThemeProvider>
</BrowserRouter>
<AppPwaSync />              // PWA manifest/worker sync per route
```

### Routing Architecture (`src/App.jsx`)

```
Routes:
├── /                          → Landing (public)
├── /message/:publicId         → PublicMessage (public, token-gated)
├── /create                    → CreateBook (designer auth)
├── /admin/login               → AdminLogin
├── /admin/*                   → RequireAdmin → AdminShell → nested routes
│   ├── overview, designers, sold, operations, qa, templates, wrappers, settings, users, inbox, financial, apps, operations/print
├── /qa/memorial, /qa/catalog  → Visual QA benches (no auth)
├── /worker/login              → WorkerLogin
├── /worker/*                  → WorkerGate → WorkerShell → WorkerPermissionGate → nested
│   ├── home, operations, operations/print, designers, designers/:id, qa, financial, messages, account
└── *                          → NotFound
```

### Lazy Loading Strategy

| Chunk | Trigger | Contents |
|---|---|---|
| `CreateBook` | `/create` | Book editor, `react-easy-crop`, `pdf-lib` (preview) |
| `OperationsPrint` | `/admin/operations/print` | `pdf-lib`, `exceljs`, QR paper generator |
| `WorkerOperationsPrint` | `/worker/operations/print` | Same as above |
| `Apps` | `/admin/apps` | PWA install UI |

**Code-splitting**: Manual via `lazy()` + `Suspense` + `ErrorBoundary` (class-based for React 19 compatibility)

### PWA Architecture

Three **scoped PWAs** with separate manifests, service workers, and install prompts:

| App | Scope | Manifest | Service Worker |
|---|---|---|---|
| **Dearune** (main) | `/` | `/manifest.webmanifest` | `/sw.js` (pass-through) |
| **QA** | `/admin/qa` | `/manifests/dearune-qa.webmanifest` | `/sw-qa.js` |
| **Operations** | `/admin/operations` | `/manifests/dearune-operations.webmanifest` | `/sw-operations.js` |
| **Designer** | `/create` | `/manifests/dearune-designer.webmanifest` | `/sw-designer.js` |

**Manifest switching**: Inline script in `index.html` (via `vite.config.js` → `dearuneAppManifest()`) reads `data-dearune-app` attribute and swaps `<link rel="manifest">` on navigation.

**Service Workers**: Pass-through (no offline caching of API responses); only cache static assets.

---

## Backend Architecture

### Supabase Database (PostgreSQL 17)

#### Core Tables

| Table | Purpose | Key Columns |
|---|---|---|
| `projects` | Dearune records (designer submissions) | `id`, `designer_id`, `template_slug`, `payload`, `status`, `public_id`, `public_token`, `paid_at`, `manufactured_at`, `shipped_at`, `arrived_at`, `archived_at` |
| `physical_products` | Physical units (one per unit) | `id`, `project_id`, `unit_index`, `reference` (DR###########), `sold_at`, `manufacturing_completed_at`, `shipped_at`, `delivered_at`, `archived_at` |
| `physical_product_events` | Append-only unit timeline | `physical_product_id`, `actor_type`, `actor_id`, `action`, `detail`, `created_at` |
| `sales_log` | Immutable ledger | `sale_reference`, `project_id`, `selling_price`, `estimated_cost`, `estimated_profit`, `status` (`completed`/`voided`) |
| `designers` | Designer accounts | `code` (6-digit), `passcode_hash`, `draft_secret`, `revoked_at` |
| `workers` | Studio staff | `email`, `display_name`, `status` (`active`/`inactive`) |
| `worker_permissions` | Granular permissions | `worker_id`, `permission_id` (24 permissions) |
| `templates` | Template catalog | `slug`, `current_version`, `enabled`, `display_state` |
| `wrapper_types` | Wrapper catalog | `key`, `name`, `kind` (digital/physical), `base_price`, `production_cost` |
| `template_wrapper_options` | Template-wrapper pricing | `template_id`, `wrapper_id`, `enabled`, `price_override`, `cost_override` |
| `shipping` | Delivery info | `project_id`/`order_id`, address fields, `tracking_code` |
| `app_settings` | Global config | `maintenance_mode`, `allow_new_orders`, `currency`, `storage_provider` |

#### Key Relationships

```
designer (1) ───< project >───< physical_products (N)
project (1) ───< physical_products (N)
project (1) ───< sales_log (0..1)
project (1) ───< shipping (0..1)
project (N) ───< template_wrapper_options >─── wrapper_types (N)
worker (N) ───< worker_permissions (N)
physical_products (1) ───< physical_product_events (N)
```

#### Critical Constraints

- **One active sale per project**: Partial unique index on `sales_log(project_id) WHERE status='completed'`
- **Sales immutability**: `sales_log_guard` trigger prevents UPDATE/DELETE on money fields
- **Physical product ID format**: `DR` + 11 digits (`CHECK (reference ~ '^DR\d{11}$')`)
- **Unique unit per project**: `UNIQUE (project_id, unit_index)`
- **Milestone order enforced**: `CHECK (manufactured_at IS NULL OR paid_at IS NOT NULL)` etc.

### Supabase Edge Functions (16 Functions)

All functions in `supabase/functions/` use Deno + TypeScript. Shared utilities in `_shared/`.

| Function | Auth | Purpose |
|---|---|---|
| `admin-dearunes` | Admin | CRUD for projects, status transitions, template assignment |
| `admin-operations` | Admin | Physical product CRUD, milestone transitions, archive/restore |
| `admin-designers` | Admin | Designer CRUD, passcode reset, passcode rotation |
| `admin-workers` | Admin | Worker CRUD, permission assignment |
| `admin-workers` | Admin | Worker CRUD, permission assignment |
| `create-sale` | Admin | Record sale, create order+message, mint public_id/token |
| `designer-login` | None (custom JWT) | 6-digit code + 6-digit passcode → HS256 JWT + draft_secret |
| `designer-media` | Designer JWT | Upload/download/delete draft media (Supabase/Drive) |
| `designer-projects` | Designer JWT | Submit project (validates draft, media refs, template) |
| `designer-templates` | Designer JWT | Template catalog for Create screen (enabled, display_state) |
| `designer-message` | Designer JWT | Read own project (metadata only, no payload) |
| `designer-messages` | Designer JWT | List own projects (metadata) |
| `designer-templates` | Designer JWT | Template catalog for Create screen |
| `project-media` | Public token | Signed URLs / redirects for public letter media |
| `worker-designers` | Worker JWT + permissions | Designer CRUD (create, update, assign, reset-passcode) |
| `worker-operations` | Worker JWT + permissions | Read operations, milestone actions, archive, print, export |

#### Shared Modules (`supabase/functions/_shared/`)

| Module | Purpose |
|---|---|
| `auth.ts` | `requireAdmin`, `requireDesigner`, `requireWorker`, `signDesignerJwt`, `verifyDesignerJwt`, PBKDF2 passcode hashing |
| `cors.ts` | CORS headers, `jsonResponse`, `errorResponse`, `readJson` |
| `drive.ts` | Google Drive OAuth2, folder hierarchy, resumable upload, download |
| `env.ts` | `requireEnv`, `optionalEnv` |
| `supabase.ts` | `getServiceClient` (service role), `getAnonClient` |

### Authentication & Authorization

#### Three Auth Systems

| System | Who | Mechanism | Session |
|---|---|---|---|
| **Supabase Auth** | Admin, Worker | Email/password + Supabase session cookie | `supabase.auth.getSession()` |
| **Designer JWT** | Designer | Custom HS256 JWT (code + passcode) | 48h expiry, stored in memory |
| **Worker JWT** | Worker | Same Supabase session, but `worker_permissions` checked per-RPC | Per-request `current_worker_id()` |

#### Designer Auth Flow

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

#### Worker Permission Matrix (24 Permissions)

| Category | Permissions |
|---|---|
| **Operations** | `view`, `view_details`, `create`, `manage`, `edit`, `assign`, `mark_manufactured`, `mark_shipped`, `mark_delivered`, `print`, `export` |
| **Designers** | `view`, `view_details`, `create`, `edit`, `assign`, `manage`, `reset_passcode`, `revoke`, `activate` |
| **Financial** | `view`, `view_revenue`, `view_costs`, `view_profit`, `view_customer_payables`, `view_payments`, `manage`, `export` |
| **QA** | `view` |
| **Messages** | `view`, `send`, `manage` |

**Enforcement**: Every worker RPC calls `current_worker_id()` + `worker_has_permission()` at start. RLS on `worker_audit_logs` enforces read-own.

---

## Data Flow Patterns

### Designer Submission Flow

```
1. Designer completes book in /create (BookMachine state machine)
2. Client encrypts draft locally (AES-GCM, key from draft_secret)
3. Media uploaded via designer-media → designer-drafts bucket (paths: {designerId}/memorial-message/{fixed|uuid})
3. POST /functions/v1/designer-projects with { projectId, templateSlug, payload, mediaRefs, wrapperType }
4. Edge function validates:
   - Template enabled & display_state ∈ {normal, new}
   - Wrapper offered for template (template_wrapper_options)
   - Media refs belong to this designer (path prefix check)
   - Password hashing (SHA-256) if letterPassword provided
4. Insert projects row (status='submitted', payload, wrapper_type, template_version)
5. Return { project, publicId, publicToken }
5. Client clears local draft, shows success
```

### Admin Sale Creation Flow

```
1. Admin fills sale form (template, wrapper, recipient, designer code optional)
2. POST /functions/v1/create-sale
3. Edge function:
   - Validates template enabled, wrapper offered
   - Looks up designer by code (if provided)
   - Allocates public_id (allocate_message_public_id RPC)
   - Inserts orders row (legacy) + messages row (legacy) — DEPRECATED
   - Inserts projects row (new) with paid_at, wrapper_type, snapshot_price
   - Inserts sales_log row (immutable ledger)
   - Allocates physical_products via ensure_physical_products
5. Returns { order, orderId, publicId }
```

### Worker Milestone Flow

```
1. Worker clicks "Advance to Manufactured/Shipped/Delivered"
2. POST /functions/v1/worker_mark_dearune_<milestone> { project_id, tracking_code?, provider? }
3. RPC worker_mark_dearune_<milestone>:
   - Checks maintenance_mode (app_settings)
   - Verifies worker permission (operations.mark_<milestone>)
   - Validates project: paid, not archived, not digital, previous milestone met
   - For shipped: validates shipping address completeness (recipient_name, address_line1, city, country)
   - Updates physical_products (milestone timestamp) + projects (project-level timestamp)
   - Inserts physical_product_events + worker_audit_logs
4. Worker UI refreshes
```

### Public Message Access Flow

```
1. Recipient scans QR → /message/{publicId}?token={token}
2. GET /functions/v1/project-media?project={publicId}&token={token}&path={mediaPath}
3. Edge function:
   - Fetches project by public_id
   - Verifies: public_token matches, message_active=true, password_protected=false, not expired (2-year window from first_activated_at)
   - Validates path exists in project payload
   - Creates signed URL (900s TTL) or 302 redirect for images/audio
4. Browser renders MemorialLetter with media via signed URLs
```

---

## State Management

### Server State (TanStack Query-like patterns via custom hooks)

| Hook | Purpose | Cache Strategy |
|---|---|---|
| `useOperations` | Admin operations list | Stale-while-revalidate, manual refetch |
| `useWorkerOperations` | Worker operations list | Same |
| `useWorkerQa` | QA scan results | No cache (fresh per scan) |
| `useTemplates` | Admin template catalog | Stale-while-revalidate |
| `useWrappers` | Wrapper catalog | Stale-while-revalidate |

### Client State

| State | Location | Persistence |
|---|---|---|
| **Theme** | `next-themes` (localStorage) | Persistent |
| **Designer draft** | `draft` atom (Jotai-like) + `localStorage` + `IndexedDB` | AES-GCM encrypted |
| **Install dismissals** | `dearune:install-dismissed` (localStorage) | 30-day TTL |
| **Worker session** | React context + Supabase session | Session cookie |
| **Admin session** | Supabase session | Session cookie |

### Draft Encryption (Designer)

- **Algorithm**: AES-GCM (Web Crypto API)
- **Key derivation**: PBKDF2-SHA256, 120k iterations, `draft_secret` (per-designer, 256-bit) + salt
- **Storage**: `localStorage` (immediate) + `IndexedDB` (persistent)
- **Key rotation**: New secret generated on first login if missing

---

## File-Based Documentation Structure

```
docs/
├── project-guide/
│   ├── README.md                 # This file - entry point
│   ├── PROJECT_OVERVIEW.md       # High-level system overview
│   ├── ARCHITECTURE.md           # This file - system architecture
│   ├── DIRECTORY_STRUCTURE.md    # Repository layout
│   ├── FILE_CATALOG.md           # Every source file cataloged
│   ├── CODE_REFERENCE.md         # Functions, components, hooks reference
│   ├── ROUTES_AND_PAGES.md       # Complete route inventory
│   ├── COMPONENTS.md             # React component inventory
│   ├── DATABASE_AND_SCHEMA.md    # Schema, migrations, RLS
│   ├── AUTHENTICATION_AND_PERMISSIONS.md
│   ├── API_AND_BACKEND.md        # Edge functions, RPCs
│   ├── STORAGE_SYSTEM.md         # Upload/download, providers
│   ├── STATE_MANAGEMENT.md       # React state, data fetching
│   ├── DESIGN_SYSTEM.md          # Tokens, components, theming
│   ├── FEATURE_DEVELOPMENT_GUIDE.md
│   ├── TEMPLATE_DEVELOPMENT_GUIDE.md
│   ├── ADMIN_AND_WORKER_WORKFLOWS.md
│   ├── TESTING_AND_DEBUGGING.md
│   ├── CONFIGURATION_AND_ENVIRONMENT.md
│   ├── DEPLOYMENT_AND_OPERATIONS.md
│   ├── SECURITY_CONSIDERATIONS.md
│   ├── GLOSSARY.md
│   ├── skills/
│   │   ├── README.md
│   │   └── SKILL_INVENTORY.md
│   └── development/
│       ├── ADDING_A_FEATURE.md
│       ├── ADDING_A_PAGE_OR_ROUTE.md
│       ├── ADDING_A_COMPONENT.md
│       ├── ADDING_A_DATABASE_CHANGE.md
│       ├── ADDING_A_STORAGE_PROVIDER.md
│       ├── ADDING_A_TEMPLATE.md
│       ├── TROUBLESHOOTING.md
│       └── DOCUMENTATION_MAINTENANCE.md
```

---

## Development Guides Quick Reference

| Task | Guide | Key Files |
|---|---|---|
| Add a page/route | [ADDING_A_PAGE_OR_ROUTE.md](./development/ADDING_A_PAGE_OR_ROUTE.md) | `src/App.jsx`, `src/pages/` |
| Add a component | [ADDING_A_COMPONENT.md](./development/ADDING_A_COMPONENT.md) | `src/components/` |
| Add a database change | [ADDING_A_DATABASE_CHANGE.md](./development/ADDING_A_DATABASE_CHANGE.md) | `supabase/migrations/` |
| Add a template | [ADDING_A_TEMPLATE.md](./development/ADDING_A_TEMPLATE.md) | `src/templates/`, `supabase/migrations/` |
| Add storage provider | [ADDING_A_STORAGE_PROVIDER.md](./development/ADDING_A_STORAGE_PROVIDER.md) | `supabase/functions/_shared/drive.ts` |
| Debug production issue | [TROUBLESHOOTING.md](./development/TROUBLESHOOTING.md) | Browser console, Supabase logs |
| Update documentation | [DOCUMENTATION_MAINTENANCE.md](./development/DOCUMENTATION_MAINTENANCE.md) | `docs/project-guide/` |

---

> **Remember**: This documentation reflects the codebase as of October 2026. Always verify against current implementation before making changes. Update documentation alongside code changes.