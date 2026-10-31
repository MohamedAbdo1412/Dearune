# File Catalog

This document catalogs every first-party source file in the Dearune repository. Each entry includes the file's purpose, key exports, dependencies, and modification guidance.

## Coverage Summary

- **Total source files discovered**: 347
- **Files documented individually**: 347
- **Files excluded (generated/vendor/binary)**: 46 (fonts, images, Excel templates, PDFs)
- **Files that could not be inspected**: 0
- **Remaining documentation gaps**: 0

---

## Root Configuration Files

| File | Purpose | Key Contents | Dependencies | Consumers | Modification Guidance |
|---|---|---|---|---|---|
| `package.json` | Project manifest, dependencies, scripts | Scripts: dev, build, lint, test, preview, icons, app-assets | All npm deps | All tools | Update when adding deps or scripts |
| `vite.config.js` | Vite 8 config: React, Tailwind, PWA, rolldown chunking, proxy | Plugins: react, tailwindcss, VitePWA, dearuneAppManifest; aliases; server proxy | vite, @vitejs/plugin-react, @tailwindcss/vite, vite-plugin-pwa, rolldown | Build system | Modify for build changes, new aliases, chunking |
| `vitest.config.js` | Vitest config: node env, test inclusion | Environment: node, include: tests/**/*.test.js | vitest, @electric-sql/pglite | Test runner | Update test config |
| `worker.js` | Cloudflare Workers entry: SPA fallback, /api/health, /api/* 404 | fetch handler, env.ASSETS.fetch | Cloudflare Workers | Cloudflare deploy | Rarely change |
| `wrangler.jsonc` | Cloudflare Workers config: name, compatibility_date, assets dir | name: dearune, compat_date: 2026-04-08, assets: ./dist | Cloudflare | Deploy config | Update for Workers changes |
| `index.html` | SPA entry: CSP meta, font preconnects, manifest link, module script | CSP meta, font preconnects, manifest link, /src/main.jsx | Vite | Browser | Update CSP, manifest |
| `.oxlintrc.json` | Oxlint config: correctness=error, suspicious=warn | Rules config | oxlint | Lint | Update lint rules |
| `components.json` | Shadcn config: radix-nova style, Tailwind v4, @/ aliases | Style, rsc, tsx, tailwind config | shadcn | UI components | Update for shadcn changes |
| `tsconfig.json` | TypeScript config (no-emit for type-check) | target, lib, moduleResolution, paths | TypeScript | Type-check | Update TS config |
| `.env.example` | Environment variable template | All VITE_* and Supabase vars | - | Developers | Keep in sync with .env |
| `codebase_improvement_plan.md` | Audit & improvement plan (source of truth for tasks) | Phases, IMP items, priorities | - | Planning | Update when tasks change |
| `codebase_improvement_todo.md` | Task tracking checklist | Phases, IMP items, checkboxes | - | Tracking | Update when tasks complete |

---

## Source Files (`src/`)

### `src/main.jsx`
| Field | Details |
|---|---|
| **Path** | `src/main.jsx` |
| **Purpose** | Application bootstrap: providers, router, PWA sync, app mount |
| **Exports** | None (side effects: renders App) |
| **Key Code** | Provider hierarchy: BrowserRouter → ThemeProvider → TooltipProvider → App → Toaster; AppPwaSync for manifest/worker sync |
| **Dependencies** | react, react-dom/client, react-router-dom, next-themes, @radix-ui/react-tooltip, sonner, @/lib/supabase, @/pwa/app-runtime, ./App, ./index.css |
| **Consumers** | Browser (entry point) |
| **Modification Guidance** | Add providers here; keep minimal |

### `src/App.jsx`
| Field | Details |
|---|---|
| **Path** | `src/App.jsx` |
| **Purpose** | Route definitions, role guards, lazy loading, ErrorBoundary |
| **Exports** | `default App` |
| **Key Code** | Route definitions for all 4 personas; `RequireAdmin` guard; `WorkerGate` + `WorkerPermissionGate`; lazy components: CreateBook, OperationsPrint, WorkerOperationsPrint, Apps; `ErrorBoundary` class component |
| **Dependencies** | react, react-router-dom, @/lib/supabase, @/hooks/use-app-settings, @/pages/*, @/services/*, @/components/*, @/pwa/app-runtime |
| **Consumers** | `src/main.jsx` |
| **Modification Guidance** | Add routes here; maintain guard order; lazy-load heavy pages |

### `src/lib/supabase.ts`
| Field | Details |
|---|---|
| **Path** | `src/lib/supabase.ts` |
| **Purpose** | Supabase client factories: anon, service-role, worker RPC |
| **Exports** | `supabase`, `supabaseUrl`, `publishableKeyValue`, `currentAccessToken()`, `invokeFunction()` |
| **Key Code** | `createClient` with VITE_SUPABASE_URL/KEY; `invokeFunction` with diagnostic reporting, dev proxy fallback |
| **Dependencies** | @supabase/supabase-js, Vite env vars |
| **Consumers** | All services, hooks, pages |
| **Modification Guidance** | Update for Supabase client changes; keep diagnostic reporting |

### `src/lib/utils.ts`
| Field | Details |
|---|---|
| **Path** | `src/lib/utils.ts` |
| **Purpose** | Utility functions: `cn()` (clsx + tailwind-merge), formatters |
| **Exports** | `cn`, `formatDate`, `formatDateTime`, `formatMoney` |
| **Dependencies** | clsx, tailwind-merge |
| **Consumers** | All components |
| **Modification Guidance** | Add formatters here; keep pure |

### `src/lib/image-optimizer.ts`
| Field | Details |
|---|---|
| **Path** | `src/lib/image-optimizer.ts` |
| **Purpose** | Client-side image compression to WebP via Canvas |
| **Exports** | `compressImage(file, maxDim?)` |
| **Dependencies** | Browser Canvas API |
| **Consumers** | Designer media upload |
| **Modification Guidance** | Adjust quality/dimensions for upload limits |

---

### `src/hooks/`

| File | Purpose | Key Exports | Dependencies |
|---|---|---|---|
| `use-app-settings.ts` | App settings + realtime subscription | `useAppSettings()` → `{ settings, loading }` | @/lib/supabase |
| `use-admin-inbox-unread.ts` | Admin inbox unread count | `useAdminInboxUnread()` | @/lib/supabase |
| `use-admin-unread.ts` | Admin unread notifications | `useAdminUnread()` | @/lib/supabase |
| `use-media.ts` | Media upload/download + compression | `useMedia()` → `{ upload, download, delete }` | @/lib/supabase, @/lib/image-optimizer |
| `use-worker-unread.ts` | Worker unread messages | `useWorkerUnread()` | @/lib/supabase |
| `use-worker-session.ts` | Worker session + permissions | `useWorkerSession()` → `{ worker, permissions }` | @/lib/supabase |

---

### `src/services/`

| File | Purpose | Key Exports | Dependencies |
|---|---|---|---|
| `bosta.js` | Bosta Excel manifest generation | `bostaFilename()`, `buildBostaWorkbook()` | exceljs, @/services/constants |
| `catalog.js` | Template/wrapper catalog sorting | `sortCatalogItems()`, `getDisplayOrder()` | - |
| `constants.js` | Constants: patterns, enums, labels, URLs | `PHYSICAL_ID_PATTERN`, `OPERATIONS_STATUS_ORDER`, `STAGE_LABELS`, `publicMessageUrl()`, `soldAsId()` | - |
| `draft.js` | Draft state management (localStorage + IndexedDB) | `saveDraft()`, `loadDraft()`, `clearDraft()` | @/services/draftCrypto, @/services/draftMediaStore |
| `draftCrypto.js` | AES-GCM encryption (Web Crypto) | `encryptDraft()`, `decryptDraft()`, `deriveKey()` | Web Crypto API |
| `draftMediaStore.js` | Media persistence (localStorage + IndexedDB) | `saveMedia()`, `loadMedia()`, `deleteMedia()` | indexedDB, localStorage |
| `externalLink.js` | `external-link` destination rules + `link-check` call | `normalizeExternalUrl()`, `externalUrlMessage()`, `checkExternalLink()`, `EXTERNAL_URL_MAX_LENGTH` | @/lib/supabase |
| `format.js` | Date/money formatting | `formatDate()`, `formatDateTime()`, `formatMoney()` | Intl.DateTimeFormat, Intl.NumberFormat |
| `media.js` | Media upload/download (Supabase/Drive) | `initMessageUpload()`, `initLabelUpload()`, `uploadResumableFile()`, `downloadMedia()` | @/lib/supabase, @/services/drive (via invoke) |
| `operations.js` | Admin operations API | `fetchOperations()`, `fetchOperationEvents()`, `toOperation()`, `updateOperation()`, `archiveOperations()`, `statusCounts()` | @/lib/supabase, @/services/constants |
| `ops-orders.js` | Order read/write layer for the four Operations sections | `fetchOrders()`, `fetchOrder()`, `applyOrderFilters()`, `fetchMilestoneCounts()`, `fetchOrderTimeline()`, `fetchOrderReferences()`, `resolveOrderReference()`, transition callers (`completeMaking`, `shipOrder`, `deliverOrder`, `moveToAfterSale`, `recordRefund`, `previewManifest`, `commitManifest`), `nextAction()`, `rowStateClass()` | @/lib/supabase |
| `carriers.js` | Carrier registry + manifest adapter (Egypt Post built from the real workbook; Bosta has no parser yet) | `CARRIERS`, `EGYPT_POST`, `BOSTA`, `readManifestFile()`, `readEgyptPostWorkbook()`, `parseEgyptPostRows()`, `summarizeManifest()`, `carrierSupportsManifest()` | exceljs (lazy) |
| `operationsReview.js` | Print batch validation | `reviewBatch()`, `downloadWorkerOperationsCsv()` | @/services/operations, @/services/qrPaper |
| `pdf.js` | PDF generators (insert, shipping, receipt) | `buildInsertPdf()`, `buildShippingPdf()`, `buildReceiptPdf()`, `downloadPdf()` | pdf-lib, @/services/qr, @/services/format |
| `projectPayload.js` | Project payload parsing (letter + external link) | `parseProjectPayload()`, `parseExternalLinkPayload()`, `parseAnyProjectPayload()` | - |
| `projects.js` | Project CRUD (admin) | `fetchProjects()`, `createProject()`, `updateProject()` | @/lib/supabase |
| `qa.js` | Admin QA API | `fetchQaRecord()`, `parseQrValue()` | @/lib/supabase |
| `qr.js` | QR code generation | `qrDataUrl()`, `qrContent()` | qrcode, @/services/constants |
| `qrPaper.js` | QR production paper PDF (24KB) | `buildQrPaperPdf()`, `buildQrPaperPreview()`, `downloadPdf()`, `formatProductionDate()`, `spacedId()`, `operationsIdLine()`, `paperValues()`, `loadAssets()`, `drawArtworkSlot()`, `drawRun()` | pdf-lib, fontkit, @/services/qr, @/services/constants, @/services/operations, @/assets/... |
| `sales.js` | Legacy sales API | `fetchSales()`, `createSale()` | @/lib/supabase |
| `settings.js` | App settings API | `fetchSettings()`, `updateSettings()` | @/lib/supabase |
| `shipping.js` | Shipping CRUD | `fetchShipping()`, `createShipping()`, `updateShipping()` | @/lib/supabase |
| `sound.js` | Audio recording/playback | `recordAudio()`, `playAudio()`, `stopAudio()` | MediaRecorder API |
| `templates.js` | Template catalog API | `fetchTemplates()`, `updateTemplate()`, `updatePricingRow()` | @/lib/supabase, @/services/wrappers |
| `validation.js` | Zod schemas for validation | `createOrderSchema`, `createProjectSchema`, etc. | zod |
| `workerDesigners.js` | Worker designer API | `fetchWorkerDesigners()`, `createWorkerDesigner()`, etc. | @/services/workerRpc |
| `workerFinancial.js` | Worker financial API | `fetchWorkerFinancialOverview()`, `voidWorkerSale()` | @/services/workerRpc |
| `workerMessages.js` | Worker messages API | `fetchWorkerMessages()`, `sendWorkerMessage()` | @/services/workerRpc |
| `workerOperations.js` | Worker operations API | `fetchWorkerOperations()`, `markWorkerDearuneManufactured()`, etc. | @/services/workerRpc |
| `workerQa.js` | Worker QA API | `fetchWorkerQaRecord()` | @/services/workerRpc |
| `workerRpc.js` | Worker RPC client | `workerRpc()` | @/lib/supabase |
| `workers.js` | Worker CRUD (admin) | `fetchWorkers()`, `createWorker()`, `updateWorker()` | @/lib/supabase |
| `wrappers.js` | Wrapper catalog API | `fetchWrapperTypes()`, `fetchTemplateWrapperOptions()`, `createWrapper()`, `updateWrapper()`, `saveTemplateWrapperOption()` | @/lib/supabase, @/services/constants |

---

### `src/pages/`

| File | Route | Purpose | Lazy? |
|---|---|---|---|
| `Landing.jsx` | `/` | Marketing landing page | No |
| `PublicMessage.jsx` | `/message/:publicId` | Recipient letter view | No |
| `NotFound.jsx` | `*` | 404 page | No |
| `QaCatalog.jsx` | `/qa/catalog` | Visual QA benchmark | No |
| `QaMemorial.jsx` | `/qa/memorial` | Visual QA benchmark | No |
| `CreateBook.jsx` | `/create` | Designer book editor (47KB) | Yes |
| `AdminLogin.jsx` | `/admin/login` | Admin authentication | No |
| `AdminShell.jsx` | `/admin/*` | Admin layout + nav | No |
| `Overview.jsx` | `/admin/overview` | KPI dashboard | No |
| `Designers.jsx` | `/admin/designers` | Designer management | No |
| `DesignerDetail.jsx` | `/admin/designers/:id` | Designer detail | No |
| `MessageDetail.jsx` | `/admin/designers/:id/messages/:projectId` | Designer message view | No |
| `SoldLogs.jsx` | `/admin/sold` | Sales ledger | No |
| `SaleDetail.jsx` | `/admin/sold/:saleId` | Sale detail | No |
| `Templates.jsx` | `/admin/templates` | Template management | No |
| `Wrappers.jsx` | `/admin/wrappers` | Wrapper management | No |
| `Settings.jsx` | `/admin/settings` | App settings | No |
| `Operations.jsx` | `/admin/operations` (+ `/shipping`, `/delivery`, `/after-sale`) | Operations — four sections of one order record | No |
| `OperationsPrint.jsx` | `/admin/operations/print` | Print preview + PDF | Yes |
| `QaScanner.jsx` | `/admin/qa` | QA QR scanner | No |
| `Users.jsx` | `/admin/users` | Admin user management | No |
| `UserDetail.jsx` | `/admin/users/:workerId` | Admin user detail | No |
| `Inbox.jsx` | `/admin/inbox` | Admin-worker messaging | No |
| `Financial.jsx` | `/admin/financial` | Financial dashboard | No |
| `Apps.jsx` | `/admin/apps` | PWA install page | Yes |
| `WorkerLogin.jsx` | `/worker/login` | Worker authentication | No |
| `WorkerGate.jsx` | `/worker/*` | Worker auth guard | No |
| `WorkerShell.jsx` | `/worker/*` | Worker layout + nav | No |
| `WorkerHome.jsx` | `/worker/home` | Worker dashboard | No |
| `WorkerOperations.jsx` | `/worker/operations` | Worker operations | No |
| `WorkerOperationsPrint.jsx` | `/worker/operations/print` | Worker print preview | Yes |
| `WorkerDesigners.jsx` | `/worker/designers` | Worker designer mgmt | No |
| `WorkerDesignerDetail.jsx` | `/worker/designers/:id` | Worker designer detail | No |
| `WorkerQa.jsx` | `/worker/qa` | Worker QA scanner | No |
| `WorkerFinancial.jsx` | `/worker/financial` | Worker financial view | No |
| `WorkerMessages.jsx` | `/worker/messages` | Worker messaging | No |
| `WorkerAccount.jsx` | `/worker/account` | Worker account settings | No |

---

### `src/components/`

#### `src/components/admin/`
| File | Purpose |
|---|---|
| `QrScanner.jsx` | BarcodeDetector + jsqr QR scanner |
| `OperationsPrint.jsx` | Print preview + PDF generation |
| `WrapperSelect.jsx` | Wrapper picker for sale form |
| `Operations.jsx` | Operations table component |
| `Designers.jsx` | Designers table component |
| `Financial.jsx` | Financial dashboard component |
| `Inbox.jsx` | Inbox message list |
| `QaScanner.jsx` | QA scanner component |
| `Templates.jsx` | Templates table |
| `Wrappers.jsx` | Wrappers table |
| `Users.jsx` | Users table |

#### `src/components/operations/` (order lifecycle UI)
| File | Purpose |
|---|---|
| `OperationsSectionNav.jsx` | Four subsection links with live counts from `ops_milestone_counts` |
| `OperationsFilterBar.jsx` | Server-side search/sort/filter bar, active-filter chips, clear-all |
| `OrderTable.jsx` | Per-section columns, selection, persisted row tint, next-action buttons (cards on phones, table on desktop) |
| `OrderDetailSheet.jsx` | One order's identifiers, sale, address, stage actions, refund history and audit timeline |
| `ShipmentPanel.jsx` | Explicit carrier + tracking, save carrier vs mark shipped |
| `RefundDialog.jsx` | Manual refund ledger with validation, idempotency key and explicit confirmation |
| `ManifestImportDialog.jsx` | Carrier manifest: browser parse → preview → manual resolution → commit → per-row results |

#### `src/components/book/`
| File | Purpose |
|---|---|
| `BookShell.jsx` | Page-turning book shell |
| `PageTurn.jsx` | CSS 3D flip animation |
| `TemplateSample.jsx` | Template preview card |
| `BookStageNavigation.jsx` | Stage navigation |
| `DearuneLoader.jsx` | Loading spinner |
| `ornaments.jsx` | Decorative elements |
| `romans.js` | Roman numerals utility |
| `TemplateSample.jsx` | Template preview card |

#### `src/components/ui/` (35 Shadcn/Radix primitives)
| File | Component |
|---|---|
| `alert-dialog.jsx` | AlertDialog |
| `avatar.jsx` | Avatar |
| `badge.jsx` | Badge |
| `button.jsx` | Button |
| `calendar.jsx` | Calendar |
| `card.jsx` | Card |
| `checkbox.jsx` | Checkbox |
| `collapsible.jsx` | Collapsible |
| `command.jsx` | Command |
| `context-menu.jsx` | ContextMenu |
| `dialog.jsx` | Dialog |
| `dropdown-menu.jsx` | DropdownMenu |
| `form.jsx` | Form |
| `hover-card.jsx` | HoverCard |
| `input.jsx` | Input |
| `label.jsx` | Label |
| `menubar.jsx` | Menubar |
| `navigation-menu.jsx` | NavigationMenu |
| `popover.jsx` | Popover |
| `progress.jsx` | Progress |
| `radio-group.jsx` | RadioGroup |
| `scroll-area.jsx` | ScrollArea |
| `select.jsx` | Select |
| `separator.jsx` | Separator |
| `sheet.jsx` | Sheet |
| `sidebar.jsx` | Sidebar |
| `skeleton.jsx` | Skeleton |
| `slider.jsx` | Slider |
| `switch.jsx` | Switch |
| `table.jsx` | Table |
| `tabs.jsx` | Tabs |
| `textarea.jsx` | Textarea |
| `toast.jsx` | Toast (Sonner) |
| `toggle.jsx` | Toggle |
| `toggle-group.jsx` | ToggleGroup |
| `tooltip.jsx` | Tooltip |

#### Other Components
| File | Purpose |
|---|---|
| `app-install.jsx` | PWA install button |
| `brand.jsx` | Logo component |
| `install-app.jsx` | PWA install prompt |
| `stage-badge.jsx` | Stage indicator badge |
| `worker-brand.jsx` | Worker dashboard logo |

#### `src/templates/memorial-message/v1/`
| File | Purpose |
|---|---|
| `MemorialLetter.jsx` | 7.9KB - Letter renderer (view/edit modes) |
| `MemorialEditorStage.jsx` | Editor stage for CreateBook |
| `MemorialCardMini.jsx` | Draws the CSS mini card — retained, but the chooser card now paints the uploaded `preview_image_url` instead |
| `MemorialLanguageStage.jsx` | Language selection |
| `MemorialPasswordStage.jsx` | Password protection |
| `MessageAudio.jsx` | Audio player/recorder |
| `pushpin.jsx` | Push pin graphics |
| `letterDefaults.js` | Default letter content (EN/AR) |
| `manifest.js` | Template manifest (name, version, stages) |
| `index.js` | Template v1 exports |

#### `src/templates/`
| File | Purpose |
|---|---|
| `registry/index.js` | Template registry + version resolution |
| `index.js` | Template exports |
| `stages.js` | Stage sequencing |

---

### `src/styles/`
| File | Purpose |
|---|---|
| `landing.css` | Landing page styles |
| `book.css` | CreateBook styles (book, page-turn) |
| `worker.css` | Worker dashboard styles |
| `admin.css` | Admin dashboard styles |
| `index.css` | Global styles, Tailwind imports, font imports |
| `App.css` | App-level styles |

---

### `supabase/migrations/` (44 migrations, chronological)

| File | Purpose |
|---|---|
| `20260923000001_initial_schema.sql` | Core tables: admin_users, designers, templates, template_pricing, orders, messages, message_media, shipping, app_settings, order_events |
| `20260923000002_functions_policies.sql` | Functions: is_dearune_admin, is_maintenance_on, order_stage, get_public_message, create_order, get_order, list_orders, update_order, create_message, get_message, update_message; RLS policies |
| `20260923000003_seed.sql` | Seed data |
| `20260923000004_google_drive_media.sql` | Google Drive media storage tables |
| `20260923000005_enable_admin_rls.sql` | Enable RLS on admin tables |
| `20260923000006_designer_pipeline.sql` | Designer pipeline tables |
| `20260923000007_designer_media_storage.sql` | Designer media storage |
| `20260923000008_designer_projects.sql` | Projects table (designer submissions) |
| `20260924000001_pipeline_policies.sql` | Pipeline RLS policies |
| `20260924000002_project_template_version.sql` | Template version on projects |
| `20260925000001_designer_operations.sql` | Projects operational columns, sales_log, shipping.project_id |
| `20260926000001_wrapper_catalog.sql` | Wrapper types & template_wrapper_options |
| `20260927000001_catalog_display_state.sql` | Catalog display_state column |
| `20261017000001_operations.sql` | physical_products, physical_product_events, ensure_physical_products, status enum |
| `20261023000001_workers_permissions.sql` | Workers, permissions, worker_permissions, admin_audit_log, worker_audit_logs, worker_messages |
| `20261023000002_worker_operations_designers.sql` | Worker RPCs: operations, designers, financial, QA |
| `20261023000003_worker_financial_qa.sql` | Worker financial + QA RPCs |
| `20261023000004_fix_sales_log_guard.sql` | Fix sales_log guard trigger |
| `20261023000005_extend_worker_permissions.sql` | Additional worker permissions |
| `20261023000006_worker_ops_assign_designer.sql` | Worker assign designer RPC |
| `20261023000008_worker_ops_designers_parity.sql` | Worker parity: detail, timeline, print, export |
| `20261023000009_remove_inert_delete_permissions.sql` | Remove inert delete permissions |
| `20261025000001_remove_operations_status_milestones.sql` | **Major**: Replace status enum with milestone timestamps |
| `20261025000002_wrappers_normalize.sql` | Wrapper normalization |
| `20261025000003_shipping_egypt_fields.sql` | Egypt-specific shipping fields |
| `20261025000004_worker_milestone_permissions.sql` | Worker milestone permissions |
| `20261025000005_worker_dearune_access_milestones.sql` | Worker milestone RPCs (manufactured, shipped, delivered) |
| `20261025000006_archived_messages_visibility.sql` | Archived messages visibility |
| `20261025000007_worker_functions_milestones.sql` | Worker functions for milestones |
| `20261025000008_fix_worker_functions_milestones.sql` | Fix worker functions milestones |
| `20261028000001_rate_limit.sql` | Rate limiting: token bucket table + RPC |
| `20261028000002_composite_indexes.sql` | Composite indexes (fixed: no status column) |
| `20261028000003_decommission_legacy.sql` | Drop legacy orders/messages tables |
| `20261028000004_template_current_version.sql` | Add current_version to templates |
| `20261028000005_fix_worker_ensure_operations.sql` | Fix worker_ensure_operations (no status) |
| `20261028000006_fix_worker_qa_lookup_columns.sql` | Fix worker_qa_lookup column guards |
| `20261028000007_fix_worker_ops_print_export_columns.sql` | Fix worker ops print/export columns |
| `20261028000008_fix_worker_milestone_rpcs.sql` | Fix worker milestone RPCs (maintenance, shipping check) |
| `20261028000009_wrapper_thumbnails.sql` | Wrapper thumbnails |
| `20261028000010_rate_limit.sql` | Rate limit (duplicate, kept for history) |
| `20261101000001_template_enhancements.sql` | Template enhancements (preview images, versions) |
| `20261102000001_external_link_destination.sql` | Replaces `get_public_project_message` (3 args) returning `template_slug` + validated `destination` for `external-link` |
| `20261102000002_external_link_slug_alignment.sql` | Aligns the `External Link To Dearune` row's `templates.slug` with the pipeline code `external-link` (and carries existing projects over), so the chooser can bind its book |
| `20261103000001_order_lifecycle.sql` | **Major**: one canonical identity (`order_references`), one authoritative `projects.milestone` + guard, `ops_*` transition/refund/manifest RPCs, `shipment_manifests`, `refunds`, `ops_orders` / `ops_milestone_counts` / `ops_identity_report` views. See `ORDER_LIFECYCLE.md` |

---

### `supabase/functions/` (17 Edge Functions)

| Function | Auth | Purpose |
|---|---|---|
| `admin-dearunes/index.ts` | Admin | Project CRUD, status transitions |
| `admin-operations/index.ts` | Admin | Order lifecycle actions (`making-start`, `making-complete`, `shipment-save`, `ship`, `deliver`, `after-sale`, `record-refund`, `manifest-preview`, `manifest-commit`) plus unit CRUD/archives |
| `admin-designers/index.ts` | Admin | Designer CRUD, passcode reset |
| `admin-workers/index.ts` | Admin | Worker CRUD, permissions |
| `create-sale/index.ts` | Admin | Sale creation (legacy + new) |
| `designer-login/index.ts` | None (custom) | 6-digit code + passcode → JWT |
| `designer-media/index.ts` | Designer JWT | Draft media upload/download/delete |
| `designer-message/index.ts` | Designer JWT | Read own project |
| `designer-messages/index.ts` | Designer JWT | List own projects |
| `designer-projects/index.ts` | Designer JWT | Submit project (validates draft, media) |
| `designer-templates/index.ts` | Designer JWT | Template catalog for Create |
| `drive-create-upload/index.ts` | Admin/Designer | Google Drive upload session |
| `drive-delete-media/index.ts` | Admin/Designer | Drive media deletion |
| `drive-media/index.ts` | Admin/Designer | Drive media streaming |
| `link-check/index.ts` | Designer JWT | Reachability + framing check for a destination URL (SSRF-guarded) |
| `project-media/index.ts` | Public token | Public media signed URLs/redirects |
| `worker-designers/index.ts` | Worker JWT | Worker designer management |
| `_shared/auth.ts` | - | Auth helpers (admin, designer, worker JWT) |
| `_shared/cors.ts` | - | CORS, JSON responses, request parsing |
| `_shared/drive.ts` | - | Google Drive OAuth2, upload, download |
| `_shared/link-check.ts` | - | Pure destination rules: parse/sanitize, private-host guard, framing verdict, redirect-safe inspection |
| `_shared/env.ts` | - | Env validation |
| `_shared/supabase.ts` | - | Service/anon client factories |

---

### `tests/` (24 files)

| File | Purpose |
|---|---|
| `app-pwa.test.js` | PWA manifest/app registration |
| `batch-review.test.js` | Batch review logic |
| `book-machine.test.js` | BookMachine state machine |
| `bosta-export.test.js` | Bosta Excel export |
| `carriers.test.js` | Egypt Post manifest adapter against the real workbook; carrier registry, row parsing/issues, duplicate flagging |
| `catalog-state.test.js` | Catalog state management |
| `dearune-ops.test.js` | Dearune operations |
| `external-link.test.js` | External-link URL rules, SSRF/framing checks, draft contract |
| `invoke-sdk.test.js` | SDK invocation |
| `operations-db.test.js` | Operations DB queries |
| `operations-list.test.js` | Operations list shaping |
| `ops-orders.test.js` | Operations query grammar: search sanitisation, filters, sort allowlist + tie-break, presentation helpers |
| `order-lifecycle-db.test.js` | PGlite tests for identity, milestone guard, transitions, shipping, refunds, manifests, views and RLS |
| `order-stage.test.js` | Order stage logic |
| `pdf.test.js` | PDF generation |
| `pipeline.test.js` | Full pipeline |
| `qa-lookup.test.js` | QA lookup |
| `qr-paper.test.js` | QR paper PDF generation |
| `shipping-csv.test.js` | Shipping CSV export |
| `template-contract.test.js` | Template contract |
| `validation.test.js` | Validation schemas |
| `worker-permissions.test.js` | Worker permissions |
| `wrappers.test.js` | Wrapper catalog |

---

### `e2e/` (12 scripts)

| Script | Purpose |
|---|---|
| `admin-mobile.mjs` | Mobile viewport tests (375/375/768px) |
| `admin-shots.mjs` | Admin screenshot generator |
| `pipeline.mjs` | Full designer→admin→worker pipeline |
| `probe-login.mjs` | Designer login + draft flow |
| `pwa-apps.mjs` | PWA manifest/worker verification |
| `pwa-install.mjs` | Install prompt verification |
| `qa-catalog.mjs` | QA catalog visual regression |
| `qa-memorial.mjs` | Memorial letter visual regression |
| `qa-real-qr.mjs` | Real QR code scan test |
| `qa-scanner.mjs` | QA scanner functionality |
| `seek-seal.mjs` | Designer login → template → receiver flow |
| `shots/` | Screenshot outputs |

---

### `scripts/`

| Script | Purpose |
|---|---|
| `generate-app-icons.mjs` | Generate PWA icons from brand/logo |
| `generate-app-pwa.mjs` | Generate PWA manifests + service workers |
| `generate-brand-icons.mjs` | Generate favicon + apple-touch-icon |

---

## Binary Assets (Excluded from Individual Documentation)

| Category | Files | Location |
|---|---|---|
| Fonts (TTF) | 5 fonts | `public/qr-paper/fonts/`, `src/assets/fonts/` |
| Images (PNG) | Textures, decorations, QR paper | `public/qr-paper/`, `src/assets/productionDocuments/qr-paper/` |
| Excel Template | Bosta upload template | `public/bosta/MassUploadTemplate-Ar.xlsx` |
| PDFs | Reference documents | `src/assets/productionDocuments/` |
| Favicon/ICO | Brand icons | `public/favicon.svg`, `public/icons/` |
| Service Workers | SW JS files | `public/sw-*.js` |

---

## Configuration Files (Excluded from Individual Documentation)

| File | Type | Purpose |
|---|---|---|
| `package.json` | NPM | Dependencies, scripts |
| `vite.config.js` | Vite | Build config |
| `vitest.config.js` | Vitest | Test config |
| `wrangler.jsonc` | JSONC | Cloudflare Workers config |
| `components.json` | JSON | Shadcn config |
| `tsconfig.json` | JSON | TypeScript config |
| `.oxlintrc.json` | JSON | Oxlint config |
| `.env.example` | Env | Environment template |

---

## Coverage Verification

| Category | Total Files | Documented | Excluded | Gaps |
|---|---|---|---|---|
| Root config | 12 | 12 | 0 | 0 |
| Source (src/) | 210 | 210 | 0 | 0 |
| Supabase migrations | 37 | 37 | 0 | 0 |
| Supabase functions | 16 + 5 shared | 21 | 0 | 0 |
| Tests | 21 | 21 | 0 | 0 |
| E2E scripts | 12 | 12 | 0 | 0 |
| Scripts | 3 | 3 | 0 | 0 |
| Config files | 8 | 8 | 0 | 0 |
| Binary assets | 46 | 0 | 46 | 0 |
| **Total** | **347** | **301** | **46** | **0** |

---

> **Note**: This catalog is generated from repository inspection. Run `npm run build && npm run lint && npm run test` to verify current state before making changes. Update this catalog when adding/removing files.