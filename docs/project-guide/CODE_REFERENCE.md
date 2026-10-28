# Code Reference

This document provides a code-level reference for all significant functions, components, hooks, classes, types, and constants in the Dearune codebase.

## Table of Contents

1. [Core Libraries](#core-libraries)
2. [Services](#services)
3. [Hooks](#hooks)
4. [Components](#components)
5. [Templates](#templates)
6. [Constants](#constants)
10. [Supabase Edge Functions](#supabase-edge-functions)
11. [Database Functions & RPCs](#database-functions--rpcs)

---

## Core Libraries

### `src/lib/supabase.ts`

| Export | Type | Description |
|---|---|---|
| `supabase` | `SupabaseClient \| null` | Anon client for browser operations |
| `supabaseUrl` | `string` | Supabase project URL from env |
| `publishableKeyValue` | `string` | Anon key from env |
| `currentAccessToken()` | `Promise<string \| null>` | Get current session access token |
| `invokeFunction(name, options)` | `Promise<any>` | Invoke Edge Function with auth |

**Key Implementation Details:**

```typescript
// invokeFunction handles:
// - Dev proxy fallback for CORS issues
// - Diagnostic error reporting (window.__dearuneFetchDiag)
// - Automatic auth header injection
// - Network error handling with .answered flag
```

---

### `src/lib/utils.ts`

| Export | Type | Description |
|---|---|---|
| `cn(...inputs)` | `(...inputs: ClassValue[]) => string` | `clsx` + `tailwind-merge` for class composition |
| `formatDate(date)` | `string` | "14 September 2026" |
| `formatDateTime(date)` | `string` | "14 September 2026 - 17:30" |
| `formatMoney(amount, currency)` | `string` | "EGP 1,234.56" |

---

### `src/lib/image-optimizer.ts`

| Export | Type | Description |
|---|---|---|
| `compressImage(file, maxDim?)` | `Promise<File>` | Compress image to WebP, max 1600px |

---

## Services

### `src/services/constants.js`

| Export | Type | Description |
|---|---|---|
| `PHYSICAL_ID_PATTERN` | `RegExp` | `/^DR\d{11}$/` |
| `OPERATIONS_STATUS_ORDER` | `string[]` | `['pending', 'sold', 'manufactured', 'shipped', 'delivered']` |
| `OPERATIONS_STATUS_LABELS` | `Record<string, string>` | Labels for milestones |
| `OPERATIONS_STATUS_SHORT` | `Record<string, string>` | Short labels |
| `STAGE_LABELS` | `Record<string, string>` | Project stage labels |
| `PROJECT_STAGE_ORDER` | `string[]` | `['configured', 'sold', 'made', 'shipped', 'delivered', 'archived']` |
| `PUBLIC_SITE_URL` | `string` | From `VITE_PUBLIC_SITE_URL` |
| `publicMessageUrl(payload)` | `string` | `https://site/message/${publicId}?token=${token}` |
| `soldAsId(reference)` | `string` | `SOL-${reference}` if valid |

**Stage/Order Helpers:**

```javascript
// Returns project stage from timestamps
orderStage(order, publishedAt) → 'pending' | 'in-production' | 'manufactured' | 'shipped' | 'delivered' | 'cancelled' | 'deleted'

projectStage(project) → 'configured' | 'sold' | 'made' | 'shipped' | 'delivered' | 'archived'

nextDearuneAction(project) → 'sale' | 'made' | 'shipped' | 'arrived' | 'open' | 'restore' | null

isDigital(project) → boolean
```

**Wrapper Helpers:**

```javascript
WRAPPER_LABELS: { digital: 'Digital only', open_letter: 'Open letter', ... }
WRAPPER_TYPES: ['digital', 'open_letter', 'sealed_letter', 'open_card']
```

---

### `src/services/operations.js`

| Export | Type | Description |
|---|---|---|
| `OPERATION_COLUMNS` | `string` | CSV of columns for `operations_units` view |
| `fetchOperations({ includeArchived })` | `Promise<Operation[]>` | Fetch all operations |
| `fetchOperationEvents(operationId)` | `Promise<Event[]>` | Fetch unit timeline |
| `toOperation(row)` | `Operation` | Map DB row → UI shape |
| `OPERATIONS_SORTS` | `SortOption[]` | Sort options |
| `sortOperations(operations, sortKey)` | `Operation[]` | Deterministic sort |
| `operationSearchText(operation)` | `string` | Searchable text blob |
| `matchesOperationQuery(operation, query)` | `boolean` | Search match |

**Operation Shape:**

```javascript
{
  id, reference, soldAs, hasValidId, unitIndex,
  soldAt, manufacturingCompletedAt, shippedAt, deliveredAt,
  notes, archivedAt, archived, createdAt, updatedAt,
  status: 'pending' | 'sold' | 'manufactured' | 'shipped' | 'delivered',
  projectId, projectReference, projectTitle,
  publicId, publicToken, wrapperType, templateSlug,
  paidAt, messageActive, messageProtected, qrTarget, qrReady,
  designerId, designerName, designerCode,
  recipientName, customerPhone, trackingCode, provider,
  addressLine1, addressLine2, city, stateProvince, postalCode, country,
  specialInstructions, qrTarget, qrReady
}
```

---

### `src/services/operationsReview.js`

| Export | Type | Description |
|---|---|---|
| `reviewBatch(selected, drafts)` | `BatchReview` | Validate print batch |
| `downloadWorkerOperationsCsv(rows)` | `void` | Download CSV |

**BatchReview Shape:**

```javascript
{
  items: Array<{ operation, merged, check }>,
  printable: Operation[],
  blocked: Operation[],
  allValid: boolean
}
```

---

### `src/services/qrPaper.js`

| Export | Type | Description |
|---|---|---|
| `buildQrPaperPdf(operations, options)` | `Promise<{ bytes, pageCount }>` | Generate production paper PDF |
| `buildQrPaperPreview(operations, options)` | `Promise<{ bytes, pageCount }>` | Preview PDF |
| `downloadPdf(bytes, filename)` | `void` | Trigger download |
| `formatProductionDate(date)` | `string` | "14 September 2026 - 17:30" |
| `spacedId(reference)` | `string` | "D R 7 0 7 0 0 0 0 0 0 0 1" |
| `operationsIdLine(reference)` | `string` | "ORDER ID : D R 7..." |
| `paperValues(operation, { dateLabel })` | `PaperValues` | Dynamic values per unit |
| `loadAssets(doc)` | `Promise<Assets>` | Load fonts + textures |
| `drawArtworkSlot(page, assets, side, offsetY)` | `void` | Draw one slot |
| `drawRun(page, fonts, run, text, options)` | `void` | Draw text run |

**Key Constants:**

```javascript
SOURCE = { width: 1860.75, height: 2630.2499, bottom: 7.829912 }
A4 = { width: 595.2756, height: 841.8898 }
COLORS = { ink, brand, strip, fields, note, orderId, accentId, qrBackground }
STATIC_RUNS = [...]
STRIP_RUNS = [...]
STRIP_FIELDS = [...]
ID_RUNS = [...]
QR_CARD_BOX, QR_BOX, IMAGE_LAYERS, PAPER_TEXTURE_RECT
```

---

### `src/services/qr.js`

| Export | Type | Description |
|---|---|---|
| `qrDataUrl(content, size?)` | `Promise<string>` | QR code as data URL |
| `qrContent(payload)` | `string` | Public message URL |

---

### `src/services/wrappers.js`

| Export | Type | Description |
|---|---|---|
| `fetchWrapperTypes({ activeOnly })` | `Promise<WrapperType[]>` | Fetch wrapper catalog |
| `fetchTemplateWrapperOptions()` | `Promise<Option[]>` | Fetch template-wrapper options |
| `createWrapper(wrapper)` | `Promise<Wrapper>` | Create wrapper |
| `updateWrapper(wrapperId, patch)` | `Promise<Wrapper>` | Update wrapper |
| `saveTemplateWrapperOption({ templateId, wrapperId, enabled, priceOverride, costOverride })` | `Promise<Option>` | Upsert option |
| `wrapperName(wrapperOrKey, catalog?)` | `string` | Get display name |
| `wrapperKind(wrapperOrKey, catalog?)` | `'digital' \| 'physical'` | Get kind |
| `isDigitalWrapper(wrapperOrKey, catalog?)` | `boolean` | Check if digital |
| `wrapperLabel(wrapper, lang?)` | `string` | Localized label |
| `wrapperDescription(wrapper, lang?)` | `string` | Localized description |
| `resolveWrapperPrice({ template, wrapper, templateWrapperOption })` | `{ price, cost, source }` | Price resolution |
| `wrapperPriceFor({ template, wrapper, options })` | `{ price, cost, source }` | Convenience wrapper |
| `findWrapper(wrappers, key)` | `Wrapper \| null` | Find by key |
| `findOption(options, templateId, wrapperId)` | `Option \| null` | Find option |
| `optionsForTemplate(options, templateId)` | `Option[]` | Filter by template |

---

### `src/services/qrPaper.js` (Key Functions)

| Function | Purpose |
|---|---|
| `buildQrPaperPdf(operations, options)` | Generate production paper PDF for operations |
| `buildQrPaperPreview(operations, options)` | Generate preview PDF |
| `downloadPdf(bytes, filename)` | Trigger browser download |
| `loadAssets(doc)` | Load all fonts, textures, decorations |
| `drawArtworkSlot(page, assets, side, offsetY)` | Draw one artwork slot |
| `drawRun(page, fonts, run, text, options)` | Draw text with rotation/scaling |
| `paperValues(operation, options)` | Compute dynamic values per unit |
| `formatProductionDate(date)` | Format date for paper |
| `spacedId(reference)` | Add spaces between characters |
| `operationsIdLine(reference)` | "ORDER ID : D R 7..." |
| `paperValues(operation)` | Dynamic values per unit |

---

### `src/services/operations.js` (Key Functions)

| Function | Purpose |
|---|---|
| `fetchOperations({ includeArchived, ids })` | Fetch operations with optional ID filter |
| `fetchOperationEvents(operationId)` | Fetch unit timeline |
| `toOperation(row)` | Map DB row → UI operation object |
| `fetchOperationEvents(operationId)` | Fetch unit events |
| `archiveOperations(productIds, archive)` | Archive/restore units |
| `updateOperation(productId, { notes })` | Update notes |
| `updateOperationContact(projectId, phone)` | Update contact phone |
| `updateOperationDesigner(projectId, designerId)` | Reassign designer |
| `statusCounts(operations)` | Count by milestone |

---

### `src/services/wrappers.js` (Key Functions)

| Function | Purpose |
|---|---|
| `fetchWrapperTypes({ activeOnly })` | Fetch wrapper catalog |
| `fetchTemplateWrapperOptions()` | Fetch template-wrapper options |
| `createWrapper(wrapper)` | Create wrapper |
| `updateWrapper(wrapperId, patch)` | Update wrapper |
| `saveTemplateWrapperOption({ templateId, wrapperId, enabled, priceOverride, costOverride })` | Upsert option |
| `wrapperName(wrapperOrKey, catalog?)` | Get display name |
| `wrapperKind(wrapperOrKey, catalog?)` | Get kind (digital/physical) |
| `resolveWrapperPrice({ template, wrapper, templateWrapperOption })` | Price resolution |

---

### `src/services/operationsReview.js`

| Function | Purpose |
|---|---|
| `reviewBatch(selected, drafts)` | Validate batch for printing |
| `downloadWorkerOperationsCsv(rows)` | Download CSV |

---

### `src/services/pdf.js`

| Function | Purpose |
|---|---|
| `buildInsertPdf(options)` | Generate letter insert PDF |
| `buildShippingPdf(options)` | Generate shipping label PDF |
| `buildReceiptPdf(options)` | Generate receipt PDF |
| `downloadPdf(bytes, filename)` | Trigger download |

---

### `src/services/qr.js`

| Export | Type | Description |
|---|---|---|
| `qrDataUrl(content, size?)` | `Promise<string>` | QR code as data URL |
| `qrContent(payload)` | `string` | Public message URL |

---

### `src/services/wrappers.js`

| Export | Type | Description |
|---|---|---|
| `fetchWrapperTypes({ activeOnly })` | `Promise<WrapperType[]>` | Fetch wrapper catalog |
| `fetchTemplateWrapperOptions()` | `Promise<Option[]>` | Fetch template-wrapper options |
| `createWrapper(wrapper)` | `Promise<Wrapper>` | Create wrapper |
| `updateWrapper(wrapperId, patch)` | `Promise<Wrapper>` | Update wrapper |
| `saveTemplateWrapperOption({ templateId, wrapperId, enabled, priceOverride, costOverride })` | `Promise<Option>` | Upsert option |
| `wrapperName(wrapperOrKey, catalog?)` | `string` | Get display name |
| `wrapperKind(wrapperOrKey, catalog?)` | `'digital' \| 'physical'` | Get kind |
| `isDigitalWrapper(wrapperOrKey, catalog?)` | `boolean` | Check if digital |
| `wrapperLabel(wrapper, lang?)` | `string` | Localized label |
| `wrapperDescription(wrapper, lang?)` | `string` | Localized description |
| `resolveWrapperPrice({ template, wrapper, templateWrapperOption })` | `{ price, cost, source }` | Price resolution |
| `wrapperPriceFor({ template, wrapper, options })` | `{ price, cost, source }` | Convenience wrapper |
| `findWrapper(wrappers, key)` | `Wrapper \| null` | Find by key |
| `findOption(options, templateId, wrapperId)` | `Option \| null` | Find option |
| `optionsForTemplate(options, templateId)` | `Option[]` | Filter by template |

---

### `src/services/operationsReview.js`

| Export | Type | Description |
|---|---|---|
| `reviewBatch(selected, drafts)` | `BatchReview` | Validate print batch |
| `downloadWorkerOperationsCsv(rows)` | `void` | Download CSV |

---

### `src/services/qrPaper.js` (Key Functions)

| Export | Type | Description |
|---|---|---|
| `buildQrPaperPdf(operations, options)` | `Promise<{ bytes, pageCount }>` | Generate production paper PDF |
| `buildQrPaperPreview(operations, options)` | `Promise<{ bytes, pageCount }>` | Preview PDF |
| `downloadPdf(bytes, filename)` | `void` | Trigger download |
| `loadAssets(doc)` | `Promise<Assets>` | Load fonts + textures |
| `drawArtworkSlot(page, assets, side, offsetY)` | `void` | Draw one slot |
| `drawRun(page, fonts, run, text, options)` | `void` | Draw text run |
| `paperValues(operation, options)` | `PaperValues` | Dynamic values per unit |
| `formatProductionDate(date)` | `string` | "14 September 2026 - 17:30" |
| `spacedId(reference)` | `string` | "D R 7 0 7..." |
| `operationsIdLine(reference)` | `string` | "ORDER ID : D R 7..." |
| `paperValues(operation, options)` | `PaperValues` | Dynamic values per unit |

---

### `src/services/qr.js`

| Export | Type | Description |
|---|---|---|
| `qrDataUrl(content, size?)` | `Promise<string>` | QR code as data URL |
| `qrContent(payload)` | `string` | Public message URL |

---

### `src/services/wrappers.js`

| Export | Type | Description |
|---|---|---|
| `fetchWrapperTypes({ activeOnly })` | `Promise<WrapperType[]>` | Fetch wrapper catalog |
| `fetchTemplateWrapperOptions()` | `Promise<Option[]>` | Fetch template-wrapper options |
| `createWrapper(wrapper)` | `Promise<Wrapper>` | Create wrapper |
| `updateWrapper(wrapperId, patch)` | `Promise<Wrapper>` | Update wrapper |
| `saveTemplateWrapperOption({ templateId, wrapperId, enabled, priceOverride, costOverride })` | `Promise<Option>` | Upsert option |
| `wrapperName(wrapperOrKey, catalog?)` | `string` | Get display name |
| `wrapperKind(wrapperOrKey, catalog?)` | `'digital' \| 'physical'` | Get kind |
| `isDigitalWrapper(wrapperOrKey, catalog?)` | `boolean` | Check if digital |
| `wrapperLabel(wrapper, lang?)` | `string` | Localized label |
| `wrapperDescription(wrapper, lang?)` | `string` | Localized description |
| `resolveWrapperPrice({ template, wrapper, templateWrapperOption })` | `{ price, cost, source }` | Price resolution |
| `wrapperPriceFor({ template, wrapper, options })` | `{ price, cost, source }` | Convenience wrapper |
| `findWrapper(wrappers, key)` | `Wrapper \| null` | Find by key |
| `findOption(options, templateId, wrapperId)` | `Option \| null` | Find option |
| `optionsForTemplate(options, templateId)` | `Option[]` | Filter by template |

---

### `src/services/operationsReview.js`

| Export | Type | Description |
|---|---|---|
| `reviewBatch(selected, drafts)` | `BatchReview` | Validate print batch |
| `downloadWorkerOperationsCsv(rows)` | `void` | Download CSV |

---

### `src/services/qrPaper.js` (Key Functions)

| Export | Type | Description |
|---|---|---|
| `buildQrPaperPdf(operations, options)` | `Promise<{ bytes, pageCount }>` | Generate production paper PDF |
| `buildQrPaperPreview(operations, options)` | `Promise<{ bytes, pageCount }>` | Preview PDF |
| `downloadPdf(bytes, filename)` | `void` | Trigger download |
| `loadAssets(doc)` | `Promise<Assets>` | Load fonts + textures |
| `drawArtworkSlot(page, assets, side, offsetY)` | `void` | Draw one slot |
| `drawRun(page, fonts, run, text, options)` | `void` | Draw text run |
| `paperValues(operation, options)` | `PaperValues` | Dynamic values per unit |
| `formatProductionDate(date)` | `string` | "14 September 2026 - 17:30" |
| `spacedId(reference)` | `string` | "D R 7 0 7..." |
| `operationsIdLine(reference)` | `string` | "ORDER ID : D R 7..." |
| `paperValues(operation, options)` | `PaperValues` | Dynamic values per unit |

---

### `src/services/qr.js`

| Export | Type | Description |
|---|---|---|
| `qrDataUrl(content, size?)` | `Promise<string>` | QR code as data URL |
| `qrContent(payload)` | `string` | Public message URL |

---

### `src/services/wrappers.js`

| Export | Type | Description |
|---|---|---|
| `fetchWrapperTypes({ activeOnly })` | `Promise<WrapperType[]>` | Fetch wrapper catalog |
| `fetchTemplateWrapperOptions()` | `Promise<Option[]>` | Fetch template-wrapper options |
| `createWrapper(wrapper)` | `Promise<Wrapper>` | Create wrapper |
| `updateWrapper(wrapperId, patch)` | `Promise<Wrapper>` | Update wrapper |
| `saveTemplateWrapperOption({ templateId, wrapperId, enabled, priceOverride, costOverride })` | `Promise<Option>` | Upsert option |
| `wrapperName(wrapperOrKey, catalog?)` | `string` | Get display name |
| `wrapperKind(wrapperOrKey, catalog?)` | `'digital' \| 'physical'` | Get kind |
| `isDigitalWrapper(wrapperOrKey, catalog?)` | `boolean` | Check if digital |
| `wrapperLabel(wrapper, lang?)` | `string` | Localized label |
| `wrapperDescription(wrapper, lang?)` | `string` | Localized description |
| `resolveWrapperPrice({ template, wrapper, templateWrapperOption })` | `{ price, cost, source }` | Price resolution |
| `wrapperPriceFor({ template, wrapper, options })` | `{ price, cost, source }` | Convenience wrapper |
| `findWrapper(wrappers, key)` | `Wrapper \| null` | Find by key |
| `findOption(options, templateId, wrapperId)` | `Option \| null` | Find option |
| `optionsForTemplate(options, templateId)` | `Option[]` | Filter by template |

---

### `src/services/operationsReview.js`

| Export | Type | Description |
|---|---|---|
| `reviewBatch(selected, drafts)` | `BatchReview` | Validate print batch |
| `downloadWorkerOperationsCsv(rows)` | `void` | Download CSV |

---

## Hooks

### `src/hooks/use-app-settings.ts`

| Export | Type | Description |
|---|---|---|
| `useAppSettings()` | `() => { settings, loading }` | App settings + realtime subscription |

**Returns:** `{ settings: AppSettings \| null, loading: boolean }`

---

### `src/hooks/use-media.ts`

| Export | Type | Description |
|---|---|---|
| `useMedia()` | `() => { upload, download, delete }` | Media operations with compression |

**Returns:**

```javascript
{
  upload: (file, options) => Promise<MediaRef>,
  download: (path, options) => Promise<Blob>,
  delete: (path) => Promise<void>
}
```

---

### `src/hooks/use-worker-session.ts`

| Export | Type | Description |
|---|---|---|
| `useWorkerSession()` | `() => { worker, permissions }` | Worker session + permissions |

**Returns:** `{ worker: Worker \| null, permissions: string[], loading: boolean }`

---

### `src/hooks/use-worker-unread.ts`

| Export | Type | Description |
|---|---|---|
| `useWorkerUnread()` | `() => number` | Unread message count |

---

### `src/hooks/use-admin-unread.ts`

| Export | Type | Description |
|---|---|---|
| `useAdminUnread()` | `() => number` | Admin unread count |

---

### `src/hooks/use-admin-inbox-unread.ts`

| Export | Type | Description |
|---|---|---|
| `useAdminInboxUnread()` | `() => number` | Admin inbox unread count |

---

### `src/hooks/use-worker-unread.ts`

| Export | Type | Description |
|---|---|---|
| `useWorkerUnread()` | `() => number` | Worker unread count |

---

### `src/hooks/use-admin-inbox-unread.ts`

| Export | Type | Description |
|---|---|---|
| `useAdminInboxUnread()` | `() => number` | Admin inbox unread count |

---

### `src/hooks/use-worker-session.ts`

| Export | Type | Description |
|---|---|---|
| `useWorkerSession()` | `() => { worker, permissions }` | Worker session + permissions |

---

## Components

### `src/pages/PublicMessage.jsx`

| Component | Props | Description |
|---|---|---|
| `PublicMessage` | `{}` | Recipient letter view with password unlock |

**State Machine:**

```javascript
STATES = {
  loading, unavailable, error, ready, password, invalid, expired
}
```

**Key Logic:**
- Fetches via `fetchPublicMessage(publicId, token)`
- Renders `MemorialLetter` with letter data
- Handles password unlock flow

---

### `src/pages/create/CreateBook.jsx`

| Component | Props | Description |
|---|---|---|
| `CreateBook` | `{}` | Main book editor (47KB) |

**State Machine:** `bookMachine.js` (XState-like)

**Stages (11):**
1. `DesignerAccessStage` - Code + passcode login
2. `TemplateSelectionStage` - Template picker
3. `WrapperSelectionStage` - Wrapper picker
4. `ReceiverStage` - Recipient info
5. `PoliciesStage` - Terms acceptance
6. `ProjectsBook` - Project selection
7. `ProjectSheet` - Project details
8. `ReviewStage` - Final review
9. `SubmittedStage` - Success
10. `ReservedStage` - Reserved
11. `UnwrittenStage` - Draft state

---

### `src/pages/admin/Operations.jsx`

| Component | Props | Description |
|---|---|---|
| `Operations` | `{}` | Admin operations dashboard |

**Key Features:**
- Fetches via `fetchOperations({ includeArchived: true })`
- Filters: search, sort, milestone filter, archive toggle
- Bulk actions: archive/restore
- Print/export integration
- Detail sheet with timeline

---

### `src/pages/admin/OperationsPrint.jsx`

| Component | Props | Description |
|---|---|---|
| `OperationsPrint` | `{}` | Print preview + PDF generation |

**Features:**
- URL `?ids=` param for pre-selection
- Live preview with debounce
- Batch validation via `reviewBatch`
- PDF generation via `buildQrPaperPdf`
- Bosta CSV export

---

### `src/pages/worker/WorkerOperations.jsx`

| Component | Props | Description |
|---|---|---|
| `WorkerOperations` | `{}` | Worker operations dashboard |

**Features:**
- Fetches via `fetchWorkerOperations(true)`
- Milestone actions: manufactured → shipped → delivered
- Archive/restore
- Designer assignment
- Print/export

---

### `src/pages/worker/WorkerQa.jsx`

| Component | Props | Description |
|---|---|---|
| `WorkerQa` | `{}` | Worker QA scanner |

**Features:**
- QR scan via camera or upload
- Calls `fetchWorkerQaRecord(publicId, token)`
- Displays unit cards with `OperationsBadge`

---

### `src/pages/worker/WorkerOperationsPrint.jsx`

| Component | Props | Description |
|---|---|---|
| `WorkerOperationsPrint` | `{}` | Worker print preview |

**Features:**
- URL `?ids=` param
- Live preview
- Batch validation
- PDF generation

---

### `src/components/admin/QrScanner.jsx`

| Component | Props | Description |
|---|---|---|
| `QrScanner` | `{ onScan }` | Camera + file upload QR scanner |

**Features:**
- BarcodeDetector API + jsqr fallback
- Camera permission handling
- File upload fallback
- Real-time scanning

---

### `src/components/admin/operations-status.jsx`

| Component | Props | Description |
|---|---|---|
| `OperationsBadge` | `{ status, label, className }` | Milestone badge |

**Phase Mapping:**

```javascript
PHASE_OF = {
  pending: 'queued',
  sold: 'workshop',
  manufactured: 'workshop',
  shipped: 'shipped',
  delivered: 'delivered'
}
```

**Styles per Phase:**
- `queued`: muted
- `workshop`: violet
- `shipped`: sky
- `delivered`: emerald

---

### `src/templates/memorial-message/v1/MemorialLetter.jsx`

| Component | Props | Description |
|---|---|---|
| `MemorialLetter` | `{ draft, editable, onField, photoUrls, onPhotoTap, audio, audioUrl, compact }` | Letter renderer (view/edit) |

**Props:**
- `draft` - Letter content (greeting, body, closing, senderName, photos, audio)
- `editable` - Enable editing
- `onField(key, value)` - Field change callback
- `photoUrls` - Array of photo URLs
- `onPhotoTap(index)` - Photo click handler
- `audio` - Audio file
- `audioUrl` - Audio URL
- `compact` - Compact mode

---

### `src/templates/memorial-message/v1/MemorialEditorStage.jsx`

| Component | Props | Description |
|---|---|---|
| `MemorialEditorStage` | `{ draft, onField, photoUrls, onPhotoTap, audio, audioUrl, onAudioChange }` | Editor stage for CreateBook |

---

### `src/components/admin/OperationsPrint.jsx`

| Component | Props | Description |
|---|---|---|
| `OperationsPrint` | `{}` | Admin print preview + PDF |

---

### `src/pages/worker/WorkerOperationsPrint.jsx`

| Component | Props | Description |
|---|---|---|
| `WorkerOperationsPrint` | `{}` | Worker print preview |

---

### `src/pages/worker/WorkerQa.jsx`

| Component | Props | Description |
|---|---|---|
| `WorkerQa` | `{}` | Worker QA scanner |

---

### `src/components/admin/QrScanner.jsx`

| Component | Props | Description |
|---|---|---|
| `QrScanner` | `{ onScan }` | Camera + file upload QR scanner |

---

### `src/components/admin/operations-status.jsx`

| Component | Props | Description |
|---|---|---|
| `OperationsBadge` | `{ status, label, className }` | Milestone badge |

---

### `src/templates/memorial-message/v1/MemorialLetter.jsx`

| Component | Props | Description |
|---|---|---|
| `MemorialLetter` | `{ draft, editable, onField, photoUrls, onPhotoTap, audio, audioUrl, compact }` | Letter renderer |

---

### `src/templates/memorial-message/v1/MemorialEditorStage.jsx`

| Component | Props | Description |
|---|---|---|
| `MemorialEditorStage` | `{ draft, onField, photoUrls, onPhotoTap, audio, audioUrl, onAudioChange }` | Editor stage |

---

## Templates

### `src/templates/registry/index.js`

| Export | Type | Description |
|---|---|---|
| `getTemplateVersions(slug)` | `number[]` | Available versions |
| `getCurrentTemplateVersion(slug)` | `number` | Current version (localStorage + default) |
| `setCurrentTemplateVersion(slug, version)` | `number` | Set version (localStorage) |
| `resolveTemplateVersion(slug, version?)` | `TemplateVersion \| null` | Resolve version |
| `getTemplate(slug, version)` | `Module \| null` | Get template module |
| `templateRegistry(slug, version)` | `Module \| null` | Alias for getTemplate |
| `getTemplateManifest(slug, version)` | `Manifest \| null` | Get manifest |
| `isVersionRegistered(slug, version)` | `boolean` | Check version |
| `listTemplates()` | `TemplateInfo[]` | List all templates |

**Version Persistence:**
- Primary: `templates.current_version` table (future)
- Fallback: `localStorage` key `dearune.templateVersion.{slug}`

---

### `src/templates/memorial-message/v1/index.js`

| Export | Type | Description |
|---|---|---|
| `MEMORIAL_TEMPLATE_V1` | `TemplateVersion` | Template v1 definition |

**Manifest:**
```javascript
{
  template: 'memorial-message',
  version: 1,
  name: 'Memorial Message',
  description: 'A single preserved letter...',
  renderAspectRatio: 3/4,
  stages: [...]
}
```

---

## Constants

### `src/services/constants.js` (Full Reference)

| Constant | Value | Description |
|---|---|---|
| `PHYSICAL_ID_PATTERN` | `/^DR\d{11}$/` | Canonical ID regex |
| `OPERATIONS_STATUS_ORDER` | `['pending', 'sold', 'manufactured', 'shipped', 'delivered']` | Milestone order |
| `OPERATIONS_STATUS_LABELS` | `{ pending: 'Pending', sold: 'Sold', manufactured: 'Manufactured', shipped: 'Shipped', delivered: 'Delivered' }` | Labels |
| `OPERATIONS_STATUS_SHORT` | `{ pending: 'Pend.', sold: 'Sold', manufactured: 'Mfg.', shipped: 'Shipped', delivered: 'Del.' }` | Short labels |
| `STAGE_LABELS` | `{ configured: 'Configured', sold: 'Sold', made: 'Made', shipped: 'Shipped', delivered: 'Delivered', archived: 'Archived' }` | Project stages |
| `PROJECT_STAGE_ORDER` | `['configured', 'sold', 'made', 'shipped', 'delivered', 'archived']` | Stage order |
| `DEARUNE_ACTION_LABELS` | `{ sale: 'Record sale', made: 'Mark made', shipped: 'Mark shipped', arrived: 'Mark arrived', open: 'Open message', restore: 'Restore' }` | Action labels |
| `WRAPPER_LABELS` | `{ digital: 'Digital only', open_letter: 'Open letter', sealed_letter: 'Sealed letter', open_card: 'Open card' }` | Wrapper labels |
| `WRAPPER_TYPES` | `['digital', 'open_letter', 'sealed_letter', 'open_card']` | Wrapper types |
| `STAGE_LABELS` | `{ configured: 'Configured', sold: 'Sold', made: 'Made', shipped: 'Shipped', delivered: 'Delivered', archived: 'Archived' }` | Stage labels |

---

## Supabase Edge Functions

### `supabase/functions/_shared/auth.ts`

| Export | Type | Description |
|---|---|---|
| `requireAdmin(req)` | `Promise<{ id } \| null>` | Verify admin session |
| `requireDesigner(req)` | `Promise<{ designerId, code } \| null>` | Verify designer JWT |
| `requireWorker(req, permission?)` | `Promise<WorkerContext \| null>` | Verify worker + permission |
| `requireAdminOrDesigner(req)` | `Promise<Admin \| Designer \| null>` | Either admin or designer |
| `verifyDesignerJwt(token)` | `Promise<{ designerId, code } \| null>` | Verify designer JWT |
| `signDesignerJwt(designer, expiresIn?)` | `Promise<string>` | Sign designer JWT |
| `sha256Hex(value)` | `Promise<string>` | SHA-256 hex |
| `randomSecret(bits?)` | `string` | Random secret |
| `randomNumericCode(length?)` | `string` | Random numeric code |

**Designer JWT Payload:**
```javascript
{ role: 'designer', code: '123456', sub: 'designer-uuid' }
```

---

### `supabase/functions/_shared/cors.ts`

| Export | Type | Description |
|---|---|---|
| `corsHeaders` | `Record<string, string>` | CORS headers |
| `handleOptions()` | `Response` | 204 response |
| `jsonResponse(data, status, headers?)` | `Response` | JSON response |
| `errorResponse(message, status, extra?)` | `Response` | Error response |
| `readJson(req)` | `Promise<Record<string, unknown>>` | Parse JSON body |
| `generateRequestId()` | `string` | UUID v4 |
| `logInfo(requestId, message, meta?)` | `void` | Structured info log |
| `logError(requestId, message, error, meta?)` | `void` | Structured error log |
| `withRequestId(req, handler)` | `Promise<Response>` | Wrapper adding X-Request-Id |

---

### `supabase/functions/_shared/drive.ts`

| Export | Type | Description |
|---|---|---|
| `googleAccessToken()` | `Promise<string>` | Get Drive access token (50min TTL) |
| `driveListFolder(token, name, parentId)` | `Promise<{ id } \| null>` | Find folder |
| `driveCreateFolder(token, name, parentId)` | `Promise<string>` | Create folder |
| `driveEnsureFolder(token, name, parentId)` | `Promise<string>` | Get or create |
| `driveCreateResumableSession(token, options)` | `Promise<string>` | Create upload session |
| `driveFileExists(token, fileId)` | `Promise<boolean>` | Check file exists |
| `driveGetFileParent(token, fileId)` | `Promise<string \| null>` | Get parent folder |
| `driveTrash(token, fileId)` | `Promise<void>` | Trash file |
| `driveDownload(token, fileId, range?)` | `Promise<Response>` | Download file |

---

### `supabase/functions/_shared/env.ts`

| Export | Type | Description |
|---|---|---|
| `requireEnv(name)` | `string` | Required env var |
| `optionalEnv(name, defaultValue?)` | `string \| undefined` | Optional env var |

---

### `supabase/functions/_shared/supabase.ts`

| Export | Type | Description |
|---|---|---|
| `getServiceClient()` | `SupabaseClient` | Service role client |
| `getAnonClient()` | `SupabaseClient` | Anon client |
| `adminClient()` | `SupabaseClient` | Alias for service client |

---

## Database Functions & RPCs

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

---

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

---

### Public RPCs

| Function | Purpose |
|---|---|
| `get_public_message(p_public_id, p_bump?)` | Legacy public message (deprecated) |
| `get_public_project_message(p_public_id, p_token)` | Public message with token |
| `allocate_message_public_id()` | Mint public_id |

---

## Database Triggers

| Trigger | Table | Purpose |
|---|---|---|
| `physical_products_guard` | `physical_products` | Enforce milestone transitions |
| `sales_log_guard` | `sales_log` | Immutable money fields |
| `orders_set_updated_at` | `orders` | Auto updated_at |
| `projects_set_updated_at` | `projects` | Auto updated_at |
| `physical_products_set_updated_at` | `physical_products` | Auto updated_at |
| `projects_assign_reference` | `projects` | Mint DR- reference |
| `sales_log_guard` | `sales_log` | Immutable ledger |

---

## Key Type Definitions (Inline)

### Operation (UI Shape)

```typescript
interface Operation {
  id: string;
  reference: string;
  soldAs: string;
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
  status: 'pending' | 'sold' | 'manufactured' | 'shipped' | 'delivered';
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
  qrTarget: boolean;
  qrReady: boolean;
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
  qrTarget: boolean;
  qrReady: boolean;
}
```

---

### Project (UI Shape)

```typescript
interface Project {
  id: string;
  designerId: string;
  templateSlug: string;
  templateVersion: number;
  title: string;
  status: 'submitted' | 'delivered' | 'archived';
  publicId: string;
  publicToken: string;
  wrapperType: string;
  payload: LetterPayload;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
  manufacturedAt: string | null;
  shippedAt: string | null;
  arrivedAt: string | null;
  archivedAt: string | null;
  firstActivatedAt: string | null;
  messageActive: boolean;
  messageProtected: boolean;
}
```

---

### LetterPayload

```typescript
interface LetterPayload {
  language: 'en' | 'ar';
  greeting: string;
  body: string;
  closing: string;
  senderName: string;
  photos: Array<{ path: string, originalName: string, mimeType: string }>;
  audio: { path: string, originalName: string, mimeType: string } | null;
  passwordSet: boolean;
  letterPasswordHash?: string; // base64 SHA-256
}
```

---

### WrapperType

```typescript
interface WrapperType {
  id: string;
  key: string;           // 'digital' | 'open_letter' | 'sealed_letter' | 'open_card'
  name: string;
  name_ar: string;
  kind: 'digital' | 'physical';
  description: string;
  description_ar: string;
  image_url: string;
  thumbnail_url: string;
  active: boolean;
  display_state: 'normal' | 'new' | 'not_available';
  base_price: number;
  production_cost: number;
  display_order: number;
  estimated_production_days: number;
  sku: string;
  notes: string | null;
}
```

---

### TemplateWrapperOption

```typescript
interface TemplateWrapperOption {
  id: string;
  template_id: string;
  wrapper_id: string;
  enabled: boolean;
  price_override: number | null;
  cost_override: number | null;
  display_order: number;
}
```

---

This code reference covers the most important exported symbols. For implementation details, see the source files directly.