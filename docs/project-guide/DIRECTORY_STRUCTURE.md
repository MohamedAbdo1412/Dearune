# Directory Structure

## Repository Root

```
dearune/website/
├── .agents/                    # OpenCode agent configuration
│   └── skills/                 # Installed skills
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions: Supabase deploy on push to main
├── .opencode/                  # OpenCode session data
├── .wrangler/                  # Cloudflare Workers local state
├── docs/                       # Project documentation
│   ├── architecture.md         # Legacy architecture reference
│   ├── asset-licenses.md       # Font/image licenses
│   ├── worker-dashboard.md     # Worker dashboard specification
│   └── project-guide/          # NEW: Comprehensive documentation
├── e2e/                        # Playwright e2e tests (run via `node e2e/*.mjs`)
│   ├── shots/                  # Screenshot outputs
│   ├── admin-mobile.mjs        # Mobile viewport tests
│   ├── admin-shots.mjs         # Admin screenshot generator
│   ├── pipeline.mjs            # Full designer→admin→worker pipeline
│   ├── probe-login.mjs         # Designer login + draft flow
│   ├── pwa-apps.mjs            # PWA manifest/worker verification
│   ├── pwa-install.mjs         # Install prompt verification
│   ├── qa-catalog.mjs          # QA catalog visual regression
│   ├── qa-memorial.mjs         # Memorial letter visual regression
│   ├── qa-real-qr.mjs          # Real QR code scan test
│   ├── qa-scanner.mjs          # QA scanner functionality
│   ├── seek-seal.mjs           # Designer login → template → receiver flow
│   └── shots/                  # Screenshot outputs
├── public/                     # Static assets (served as-is)
│   ├── app-icons/              # PWA icons (192x192, 512x512, maskable)
│   ├── brand/                  # Brand assets (logo.svg)
│   ├── favicon.svg             # Favicon
│   ├── icons/                  # Favicon PNGs (16x16, 32x32)
│   ├── icons.svg               # Icon sprite
│   ├── manifests/              # PWA manifests (3 apps + main)
│   ├── qr-paper/               # Print paper assets
│   │   ├── paper-front.png     # 14.4 MB front texture
│   │   ├── paper-back.png      # 12.6 MB back texture
│   │   ├── paper-texture.png   # 14.4 MB (legacy)
│   │   ├── paper-texture-back.png
│   │   ├── deco-front-a.png    # Decorative elements
│   │   ├── deco-front-b.png
│   │   ├── deco-front-c.png    # REMOVED in migration
│   │   ├── deco-front-d.png
│   │   ├── deco-back-a.png
│   │   ├── deco-back-b.png
│   │   ├── deco-back-c.png     # REMOVED in migration
│   │   └── fonts/              # 5 TTF fonts (Allura, Amiri, Cinzel, Cormorant, Inter)
│   ├── sw-designer.js          # Designer PWA service worker
│   ├── sw-operations.js        # Operations PWA service worker
│   ├── sw-qa.js                # QA PWA service worker
│   ├── _headers                # Cloudflare headers (CSP, security)
│   └── bosta/                  # Bosta Excel template
│       └── MassUploadTemplate-Ar.xlsx
├── scripts/                    # Build-time asset generation
│   ├── generate-app-icons.mjs      # PWA icons from brand/logo
│   ├── generate-app-pwa.mjs        # PWA manifests + service workers
│   └── generate-brand-icons.mjs    # Favicon + apple-touch-icon
├── src/                          # React application source
│   ├── assets/                   # Fonts, images bundled by Vite
│   │   ├── fonts/                # Arniya, Atkinson, LibreBaskerville (TTF)
│   │   ├── hero.png
│   │   ├── productionDocuments/  # QR paper assets (dev)
│   │   │   ├── qr-paper/         # Textures, decorations, fonts
│   │   │   ├── Bosta Upload Template AR V3.5.xlsx
│   │   │   ├── Clear.pdf
│   │   │   └── The Memorial Massege QR.pdf
│   │   ├── react.svg
│   │   └── vite.svg
│   ├── components/               # React components
│   │   ├── admin/                # Admin-specific components
│   │   │   ├── QrScanner.jsx         # BarcodeDetector + jsqr scanner
│   │   │   ├── OperationsPrint.jsx   # Print preview + PDF generation
│   │   │   ├── WrapperSelect.jsx     # Wrapper picker for sale form
│   │   │   └── [20+ more]
│   │   ├── book/                   # CreateBook components
│   │   │   ├── BookShell.jsx         # Page-turning book shell
│   │   │   ├── PageTurn.jsx          # CSS 3D flip animation
│   │   │   ├── TemplateSample.jsx    # Template preview card
│   │   │   └── [4 more]
│   │   ├── ui/                     # Shadcn/Radix primitives (35 components)
│   │   │   ├── button.jsx, badge.jsx, dialog.jsx, etc.
│   │   │   └── [35 files]
│   │   ├── app-install.jsx         # PWA install button
│   │   ├── brand.jsx               # Logo component
│   │   ├── install-app.jsx         # PWA install prompt
│   │   ├── stage-badge.jsx         # Stage indicator badge
│   │   └── worker-brand.jsx        # Worker dashboard logo
│   ├── data/                     # Static data / constants
│   │   └── countries.js            # Country list for shipping
│   ├── hooks/                    # Custom React hooks
│   │   ├── use-app-settings.ts       // App settings + realtime
│   │   ├── use-admin-inbox-unread.ts
│   │   ├── use-admin-unread.ts
│   │   ├── use-media.ts              // Media upload/download
│   │   ├── use-worker-unread.ts
│   │   └── use-worker-session.ts
│   ├── lib/                      # Core libraries / singletons
│   │   ├── supabase.ts               # Supabase client factories
│   │   ├── image-optimizer.ts        # Canvas compression (WebP)
│   │   └── utils.ts                  # cn(), formatters
│   ├── pages/                      # Route components (lazy-loaded where appropriate)
│   ├── pages/
│   │   ├── admin/                    # 19 admin pages
│   │   │   ├── AdminLogin.jsx
│   │   │   ├── AdminShell.jsx
│   │   │   ├── Overview.jsx
│   │   │   ├── Designers.jsx
│   │   │   ├── DesignerDetail.jsx
│   │   │   ├── MessageDetail.jsx
│   │   │   ├── SoldLogs.jsx
│   │   │   ├── SaleDetail.jsx
│   │   │   ├── Templates.jsx
│   │   │   ├── Wrappers.jsx
│   │   │   ├── Settings.jsx
│   │   │   ├── Operations.jsx
│   │   │   ├── OperationsPrint.jsx
│   │   │   ├── QaScanner.jsx
│   │   │   ├── Users.jsx
│   │   │   ├── UserDetail.jsx
│   │   │   ├── Inbox.jsx
│   │   │   ├── Financial.jsx
│   │   │   └── Apps.jsx
│   │   ├── create/                   # Designer book creation
│   │   │   ├── CreateBook.jsx        # 47KB - Main book editor
│   │   │   ├── stages/               # 11 stage components
│   │   │   │   ├── DesignerAccessStage.jsx
│   │   │   │   ├── WrapperSelectionStage.jsx
│   │   │   │   ├── ReceiverStage.jsx
│   │   │   │   ├── PoliciesStage.jsx
│   │   │   │   ├── TemplateSelectionStage.jsx
│   │   │   │   ├── ProjectsBook.jsx
│   │   │   │   ├── ProjectSheet.jsx
│   │   │   │   ├── ReservedStage.jsx
│   │   │   │   ├── ReviewStage.jsx
│   │   │   │   ├── SubmittedStage.jsx
│   │   │   │   ├── UnwrittenStage.jsx
│   │   │   │   └── chapters.jsx
│   │   │   └── state/                # BookMachine state machine
│   │   │       └── bookMachine.js    # XState-like machine
│   │   ├── worker/                   # 11 worker pages
│   │   │   ├── WorkerLogin.jsx
│   │   │   ├── WorkerGate.jsx
│   │   │   ├── WorkerShell.jsx
│   │   │   ├── WorkerHome.jsx
│   │   │   ├── WorkerOperations.jsx
│   │   │   ├── WorkerOperationsPrint.jsx
│   │   │   ├── WorkerDesigners.jsx
│   │   │   ├── WorkerDesignerDetail.jsx
│   │   │   ├── WorkerQa.jsx
│   │   │   ├── WorkerFinancial.jsx
│   │   │   ├── WorkerMessages.jsx
│   │   │   └── WorkerAccount.jsx
│   │   ├── Landing.jsx               # Marketing landing page
│   │   ├── PublicMessage.jsx         # Recipient letter view
│   │   ├── NotFound.jsx
│   │   ├── QaCatalog.jsx             # Visual QA benchmark
│   │   └── QaMemorial.jsx            # Visual QA benchmark
│   ├── policies/                   # Authorization policies (CASL-like)
│   │   ├── admin.ts
│   │   ├── designer.ts
│   │   └── worker.ts
│   ├── pwa/                        # PWA runtime
│   │   ├── apps.ts                   // App registry (3 apps + main)
│   │   ├── app-runtime.ts            // Manifest/SW sync per route
│   │   └── install.ts                # Install prompt state machine
│   ├── services/                   # Business logic, data fetching, RPC calls
│   │   ├── bosta.js                  # Excel manifest generation
│   │   ├── catalog.js                # Template/wrapper catalog sorting
│   │   ├── constants.js              # Constants, patterns, enums
│   │   ├── draft.js                  # Draft state management
│   │   ├── draftCrypto.js            # AES-GCM encryption (Web Crypto)
│   │   ├── draftMediaStore.js        # localStorage + IndexedDB media
│   │   ├── format.js                 # Date/money formatting
│   │   ├── media.js                  # Media upload/download
│   │   ├── messages.js               # Legacy messages API
│   │   ├── operations.js             # Admin operations API
│   │   ├── operationsReview.js       # Print batch validation
│   │   ├── pdf.js                    # PDF generators (insert, shipping, receipt)
│   │   ├── projectPayload.js         # Letter payload parsing
│   │   ├── projects.js               # Project CRUD
│   │   ├── qa.js                     # Admin QA API
│   │   ├── qr.js                     # QR code generation
│   │   ├── qrPaper.js                # QR production paper PDF (24KB)
│   │   ├── sales.js                  # Legacy sales API
│   │   ├── settings.js               // App settings API
│   │   ├── shipping.js               # Shipping CRUD
│   │   ├── sound.js                  # Audio recording/playback
│   │   ├── templates.js              # Template catalog API
│   │   ├── validation.js             # Zod schemas
│   │   ├── workerDesigners.js        # Worker designer API
│   │   ├── workerFinancial.js        # Worker financial API
│   │   ├── workerMessages.js         # Worker messages API
│   │   ├── workerOperations.js       # Worker operations API
│   │   ├── workerQa.js               # Worker QA API
│   │   ├── workerRpc.js              # Worker RPC client
│   │   ├── workers.js                # Worker CRUD API
│   │   ├── wrappers.js               # Wrapper catalog API
│   │   └── workerQa.js               # Worker QA API
│   ├── styles/                     # Global styles
│   │   ├── landing.css               # Landing page styles
│   │   ├── book.css                  # CreateBook styles
│   │   ├── worker.css                # Worker dashboard styles
│   │   └── admin.css                 # Admin dashboard styles
│   ├── templates/                  # Template system
│   │   ├── memorial-message/         # Only template: memorial-message
│   │   │   └── v1/                   # Version 1
│   │   │       ├── MemorialLetter.jsx    # 7.9KB - Renderer
│   │   │       ├── MemorialEditorStage.jsx  # Editor stage
│   │   │       ├── MemorialCardMini.jsx
│   │   │       ├── MemorialLanguageStage.jsx
│   │   │       ├── MemorialPasswordStage.jsx
│   │   │       ├── MessageAudio.jsx
│   │   │       ├── pushpin.jsx
│   │   ├── letterDefaults.js
│   │   ├── manifest.js
│   │   ├── index.js
│   │   ├── registry/               # Template registry
│   │   │   └── index.js            # Template registry + version resolution
│   │   ├── index.js                // Template exports
│   │   └── stages.js               # Stage sequencing
│   ├── utils/                      # Utility functions
│   └── App.jsx                     # Route definitions, guards, lazy loading
├── supabase/                       # Supabase backend
│   ├── config.toml                 # Supabase CLI config (verify_jwt per function)
│   ├── functions/                  # 16 Edge Functions (Deno + TypeScript)
│   │   ├── _shared/                # Shared modules
│   │   │   ├── auth.ts             // Auth helpers (admin, designer, worker)
│   │   │   ├── cors.ts             // CORS + JSON response helpers
│   │   │   ├── drive.ts            // Google Drive abstraction
│   │   │   ├── env.ts              // Env validation
│   │   │   └── supabase.ts         // Service/anon clients
│   │   ├── admin-dearunes/         # Admin project CRUD
│   │   ├── admin-operations/       # Admin operations CRUD
│   │   ├── admin-designers/        # Admin designer management
│   │   ├── admin-workers/          # Admin worker management
│   │   ├── create-sale/            # Sale creation (legacy + new)
│   │   ├── designer-login/         # Designer auth (code + passcode)
│   │   ├── designer-media/         # Draft media upload/download
│   │   ├── designer-message/       # Designer read own project
│   │   ├── designer-messages/      # Designer project list
│   │   ├── designer-projects/      # Project submission
│   │   ├── designer-templates/     # Template catalog for Create
│   │   ├── drive-create-upload/    # Google Drive upload session
│   │   ├── drive-delete-media/     # Drive media deletion
│   │   ├── drive-media/            # Drive media streaming
│   │   ├── project-media/          # Public media signed URLs
│   │   ├── worker-designers/       # Worker designer management
│   │   └── _shared/                # Shared modules
│   └── migrations/                 # 37 SQL migrations (chronological)
│       ├── 20260923000001_initial_schema.sql
│       ├── 20260923000002_functions_policies.sql
│       ├── 20260923000003_seed.sql
│       ├── 20260923000004_google_drive_media.sql
│       ├── 20260923000005_enable_admin_rls.sql
│       ├── 20260923000006_designer_pipeline.sql
│       ├── 20260923000007_designer_media_storage.sql
│       ├── 20260923000008_designer_projects.sql
│       ├── 20260924000001_pipeline_policies.sql
│       ├── 20260924000002_project_template_version.sql
│       ├── 20260925000001_designer_operations.sql
│       ├── 20260926000001_wrapper_catalog.sql
│       ├── 20260927000001_catalog_display_state.sql
│       ├── 20261017000001_operations.sql
│       ├── 20261023000001_workers_permissions.sql
│       ├── 20261023000002_worker_operations_designers.sql
│       ├── 20261023000003_worker_financial_qa.sql
│       ├── 20261023000004_fix_sales_log_guard.sql
│       ├── 20261023000005_extend_worker_permissions.sql
│       ├── 20261023000006_worker_ops_assign_designer.sql
│       ├── 20261023000008_worker_ops_designers_parity.sql
│       ├── 20261023000009_remove_inert_delete_permissions.sql
│       ├── 20261025000001_remove_operations_status_milestones.sql
│       ├── 20261025000002_wrappers_normalize.sql
│       ├── 20261025000003_shipping_egypt_fields.sql
│       ├── 20261025000004_worker_milestone_permissions.sql
│       ├── 20261025000005_worker_dearune_access_milestones.sql
│       ├── 20261025000006_archived_messages_visibility.sql
│       ├── 20261025000007_worker_functions_milestones.sql
│       ├── 20261025000008_fix_worker_functions_milestones.sql
│       ├── 20261028000001_rate_limit.sql
│       ├── 20261028000002_composite_indexes.sql
│       ├── 20261028000003_decommission_legacy.sql
│       ├── 20261028000004_template_current_version.sql
│       ├── 20261028000005_fix_worker_ensure_operations.sql
│       ├── 20261028000006_fix_worker_qa_lookup_columns.sql
│       ├── 20261028000007_fix_worker_ops_print_export_columns.sql
│       ├── 20261028000008_fix_worker_milestone_rpcs.sql
│       ├── 20261028000009_wrapper_thumbnails.sql
│       └── 20261028000010_rate_limit.sql
├── tests/                          # Vitest unit tests (21 files)
│   ├── helpers/                    # Test utilities
│   ├── app-pwa.test.js
│   ├── batch-review.test.js
│   ├── book-machine.test.js
│   ├── bosta-export.test.js
│   ├── catalog-state.test.js
│   ├── dearune-ops.test.js
│   ├── invoke-sdk.test.js
│   ├── operations-db.test.js
│   ├── operations-list.test.js
│   ├── order-stage.test.js
│   ├── pdf.test.js
│   ├── pipeline.test.js
│   ├── qa-lookup.test.js
│   ├── qr-paper.test.js
│   ├── shipping-csv.test.js
│   ├── template-contract.test.js
│   ├── validation.test.js
│   ├── worker-permissions.test.js
│   └── wrappers.test.js
├── .env                            # Local environment (gitignored)
├── .env.example                    # Environment template
├── .gitignore
├── .oxlintrc.json                  # Oxlint config
├── components.json                 # Shadcn config (radix-nova, Tailwind v4)
├── index.html                      # SPA entry (inline manifest script)
├── package.json                    # Dependencies, scripts
├── package-lock.json
├── skills-lock.json                # Skill lockfile
├── vite.config.js                  # Vite 8 + PWA + rolldown config
├── vitest.config.js                # Vitest config (node env, tests/**)
├── worker.js                       # Cloudflare Workers entry (SPA fallback)
├── wrangler.jsonc                  # Cloudflare Workers config
└── codebase_improvement_plan.md    # Audit & improvement plan
```

## Key Directory Purposes

| Directory | Purpose | Modification Frequency |
|---|---|---|
| `src/pages/` | Route components (one per route) | High - new features |
| `src/components/` | Reusable UI components | Medium |
| `src/services/` | Business logic, API calls | High - new features |
| `src/hooks/` | Reusable state/logic | Medium |
| `src/templates/` | Template definitions | Low - new templates |
| `src/lib/` | Singletons, utilities | Low |
| `supabase/migrations/` | Database schema evolution | Medium - schema changes |
| `supabase/functions/` | Edge Functions (Deno) | Medium - API changes |
| `supabase/functions/_shared/` | Shared Edge Function code | Low |
| `e2e/` | Playwright test scripts | Low |
| `tests/` | Vitest unit tests | Medium |
| `scripts/` | Build-time generators | Low |
| `public/` | Static assets (no build) | Low |

## File Naming Conventions

| Type | Convention | Example |
|---|---|---|
| React Components | PascalCase + `.jsx` | `CreateBook.jsx`, `WorkerOperations.jsx` |
| Hooks | `use-` prefix + `.ts`/`.tsx` | `use-app-settings.ts` |
| Services | Lowercase + `.js` | `operations.js`, `qrPaper.js` |
| Components | PascalCase | `WorkerOperations.jsx` |
| Pages | PascalCase | `WorkerOperations.jsx` |
| Hooks | `use-*` | `use-app-settings.ts` |
| Services | Lowercase | `operations.js` |
| Utilities | Lowercase | `format.js` |
| Constants | `constants.js` | `constants.js` |
| Tests | `*.test.js` | `operations-list.test.js` |
| Migrations | `YYYYMMDDHHMMSS_name.sql` | `20261028000003_composite_indexes.sql` |
| Edge Functions | Lowercase dir + `index.ts` | `supabase/functions/admin-operations/index.ts` |
| Shared modules | Lowercase + `.ts` | `supabase/functions/_shared/auth.ts` |

## Import Aliases (`vite.config.js`)

| Alias | Resolves To |
|---|---|
| `@/` | `src/` |
| `@/components/` | `src/components/` |
| `@/hooks/` | `src/hooks/` |
| `@/lib/` | `src/lib/` |
| `@/services/` | `src/services/` |
| `@/pages/` | `src/pages/` |
| `@/templates/` | `src/templates/` |
| `@/assets/` | `src/assets/` |
| `@/utils/` | `src/utils/` |
| `@/styles/` | `src/styles/` |
| `@/policies/` | `src/policies/` |
| `@/pwa/` | `src/pwa/` |
| `@/data/` | `src/data/` |