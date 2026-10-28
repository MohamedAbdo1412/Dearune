# Adding a Storage Provider

This guide explains how to add a new storage provider to Dearune's storage abstraction layer.

## Current Architecture

Dearune supports two storage providers:
1. **Supabase Storage** (default) - `designer-drafts` bucket
2. **Google Drive** - Optional, configured via `app_settings.storage_provider`

The provider is resolved at runtime via `resolveStorageProvider()`.

---

## Adding a New Provider

### 1. Implement Provider Interface

Create `src/services/storage/newProvider.ts`:

```typescript
// src/services/storage/newProvider.ts
import { SupabaseClient } from '@supabase/supabase-js'

export interface MediaRef {
  path: string
  storageProvider: 'newProvider'
  mimeType: string
  sizeBytes: number
  originalName: string
  addedAt: string
}

export async function uploadToNewProvider(
  sb: SupabaseClient,
  designerId: string,
  bytes: Uint8Array,
  mimeType: string,
  originalName: string,
  fixedName?: string
): Promise<MediaRef> {
  // 1. Authenticate with provider
  // 2. Upload bytes to provider
  // 3. Return media reference
  
  const objectName = fixedName
    ? `designer-drafts/${designerId}/memorial-message/${fixedName}${extension}`
    : `designer-drafts/${designerId}/memorial-message/${crypto.randomUUID()}${extension}`
  
  // Upload implementation here
  // ...
  
  return {
    path: objectName,
    storageProvider: 'newProvider',
    mimeType,
    sizeBytes: bytes.byteLength,
    originalName,
    addedAt: new Date().toISOString(),
  }
}

export async function downloadFromNewProvider(
  path: string
): Promise<Blob | ReadableStream> {
  // Return blob or stream for download/streaming
}

export async function deleteFromNewProvider(
  path: string
): Promise<void> {
  // Delete from provider
}
```

### 2. Update Provider Resolution

Update `src/services/media.js` or create a storage abstraction:

```typescript
// src/services/storage/providers.ts
export type StorageProvider = 'supabase' | 'google_drive' | 'newProvider'

export async function resolveStorageProvider(sb): Promise<StorageProvider> {
  const { data } = await sb.from('app_settings')
    .select('storage_provider').eq('id', 1).maybeSingle()
  
  const provider = data?.storage_provider
  if (provider === 'google_drive') return 'google_drive'
  if (provider === 'newProvider') return 'newProvider'
  return 'supabase'
}

// Provider-specific upload
export async function uploadToProvider(
  sb, designerId, bytes, mimeType, originalName, fixedName
) {
  const provider = await resolveStorageProvider(sb)
  
  switch (provider) {
    case 'google_drive':
      return uploadToDrive(sb, designerId, bytes, mimeType, originalName)
    case 'newProvider':
      return uploadToNewProvider(sb, designerId, bytes, mimeType, originalName)
    default:
      return uploadToSupabase(sb, designerId, bytes, mimeType, extension, fixedName)
  }
}
```

### 3. Update Upload/Download Logic

Update `src/services/media.js`:

```typescript
// In upload logic
const provider = await resolveStorageProvider(sb)
const storagePath = provider === 'newProvider'
  ? await uploadToNewProvider(sb, designerId, bytes, mimeType, originalName, fixedName)
  : await uploadToSupabase(sb, designerId, bytes, mimeType, extension, fixedName)

return mediaRef({ storageProvider: provider, path: storagePath, ... })
```

```typescript
// In download logic
const provider = providerHint === 'newProvider' ? 'newProvider' 
  : providerHint === 'google_drive' ? 'google_drive'
  : providerHint === 'supabase' ? 'supabase'
  : await resolveStorageProvider(sb)

if (provider === 'newProvider') {
  // Handle new provider download
}
```

### 4. Update Media Reference Type

```typescript
// src/services/media.js
export interface MediaRef {
  path: string
  storageProvider: 'supabase' | 'google_drive' | 'newProvider'
  mimeType: string
  sizeBytes: number
  originalName: string
  addedAt: string
}
```

### 5. Update Deletion Logic

```typescript
// In designer-media DELETE handler
const provider = providerHint === 'newProvider' ? 'newProvider'
  : providerHint === 'google_drive' ? 'google_drive'
  : providerHint === 'supabase' ? 'supabase'
  : await resolveStorageProvider(sb)

if (provider === 'supabase') {
  if (!path.startsWith(`${designerId}/`)) return errorResponse('Not yours to remove', 403)
  await sb.storage.from(BUCKET).remove([path])
} else if (provider === 'google_drive') {
  const token = await googleAccessToken()
  await driveTrash(token, path)
} else if (provider === 'newProvider') {
  await deleteFromNewProvider(path)
}
```

---

## Adding to App Settings

### 1. Database Migration

```sql
-- migration: add_new_provider_option.sql
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS storage_provider text NOT NULL DEFAULT 'supabase'
  CHECK (storage_provider IN ('supabase', 'google_drive', 'newProvider'));

-- Update existing
UPDATE public.app_settings SET storage_provider = 'supabase' WHERE storage_provider IS NULL;
```

### 2. Admin UI

Update `src/pages/admin/Settings.jsx`:

```jsx
// In Settings component
const [storageProvider, setStorageProvider] = useState('supabase')

const providers = [
  { value: 'supabase', label: 'Supabase Storage' },
  { value: 'google_drive', label: 'Google Drive' },
  { value: 'newProvider', label: 'New Provider' },
]

<Select value={storageProvider} onValueChange={setStorageProvider}>
  <SelectTrigger><SelectValue /></SelectTrigger>
  <SelectContent>
    {providers.map(p => (
      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
    ))}
  </SelectContent>
</Select>
```

---

## Provider Interface Contract

Each provider must implement:

```typescript
interface StorageProvider {
  // Upload
  upload(designerId: string, bytes: Uint8Array, mimeType: string, originalName: string, fixedName?: string): Promise<MediaRef>
  
  // Download
  download(path: string): Promise<Blob | ReadableStream>
  
  // Delete
  delete(path: string): Promise<void>
  
  // List (optional)
  list?(prefix: string): Promise<string[]>
  
  // Health check
  healthCheck(): Promise<boolean>
}
```

### MediaRef Structure

```typescript
interface MediaRef {
  path: string                    // Storage path
  storageProvider: 'supabase' | 'google_drive' | 'newProvider'
  mimeType: string                // MIME type
  sizeBytes: number               // File size in bytes
  originalName: string            // Original filename
  addedAt: string                 // ISO timestamp
}
```

---

## Testing New Provider

### Unit Tests

```javascript
// tests/newProvider.test.js
import { describe, test, expect, vi } from 'vitest'
import { uploadToNewProvider, downloadFromNewProvider } from '@/services/storage/newProvider'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ /* mock client */ }))
})

describe('New Provider', () => {
  test('uploads file and returns media ref', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    const result = await uploadToNewProvider(mockSb, 'designer-1', bytes, 'image/webp', 'test.webp')
    
    expect(result).toMatchObject({
      storageProvider: 'newProvider',
      mimeType: 'image/webp',
      sizeBytes: 3,
      originalName: 'test.webp'
    })
    expect(result.path).toMatch(/^designer-drafts\/designer-1\/memorial-message\//)
  })
})
```

### E2E Test

```javascript
// e2e/storage-new-provider.mjs
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage()

// Login as designer
// Upload file using new provider
// Verify file appears in project
// Verify download works

await browser.close()
```

---

## Configuration

### Environment Variables

```bash
# .env
NEW_PROVIDER_API_KEY=xxx
NEW_PROVIDER_ENDPOINT=https://api.newprovider.com
NEW_PROVIDER_BUCKET=dearune-drafts
```

### Supabase Secrets

```bash
supabase secrets set NEW_PROVIDER_API_KEY=xxx --project-ref xwgegarncnxswiswsufx
supabase secrets set NEW_PROVIDER_ENDPOINT=xxx --project-ref xwgegarncnxswiswsufx
```

### App Settings

```sql
-- In app_settings table
storage_provider = 'newProvider'
new_provider_api_key = 'xxx'
new_provider_endpoint = 'https://api.newprovider.com'
```

---

## Migration Checklist

When adding a new provider:

- [ ] Implement provider interface (`upload`, `download`, `delete`)
- [ ] Add to `resolveStorageProvider()`
- [ ] Update `media.js` upload/download logic
- [ ] Update `designer-media` Edge Function
- [ ] Add `storage_provider` option to `app_settings`
- [ ] Add admin UI for provider selection
- [ ] Add environment variables
- [ ] Add Supabase secrets
- [ ] Write unit tests
- [ ] Write e2e tests
- [ ] Update `STORAGE_SYSTEM.md`
- [ ] Update `FILE_CATALOG.md`
- [ ] Test with both providers

---

## Testing New Provider

```bash
# 1. Unit tests
npm run test -- tests/storage/newProvider.test.js

# 2. E2E test
node e2e/storage-new-provider.mjs

# 3. Manual verification
# - Upload file via designer
# - Verify file appears in new provider
# - Verify download works
# - Verify delete works
# - Verify signed URLs work
```

---

## Rollback Plan

If new provider causes issues:

```bash
# 1. Disable in app_settings
UPDATE app_settings SET storage_provider = 'supabase' WHERE id = 1;

# 2. Or disable in code
# resolveStorageProvider() returns 'supabase' by default
```