# Adding a Template

This guide explains how to create, register, and maintain templates in Dearune.

## Template Architecture

Dearune uses a versioned template system where each template is a self-contained React module with its own components, stages, and manifest.

### Template Structure

```
src/templates/
├── index.js                    # Main exports
├── stages.js                   # Stage sequencing
├── registry/
│   └── index.js               # Template registry + version resolution
└── memorial-message/          # Template: memorial-message
    └── v1/                    # Version 1
        ├── index.js           # Template v1 exports
        ├── manifest.js        # Template metadata
        ├── letterDefaults.js  # Default content (EN/AR)
        ├── MemorialLetter.jsx # Letter renderer (view/edit)
        ├── MemorialEditorStage.jsx
        ├── MemorialCardMini.jsx
        ├── MemorialLanguageStage.jsx
        ├── MemorialPasswordStage.jsx
        ├── MessageAudio.jsx
        ├── pushpin.jsx
        ├── letterDefaults.js
        ├── manifest.js
        ├── index.js
```

---

## Template Registration

### 1. Template Manifest (`manifest.js`)

```javascript
// src/templates/memorial-message/v1/manifest.js
export const MANIFEST = {
  template: 'memorial-message',
  version: 1,
  name: 'Memorial Message',
  description: 'A single preserved letter in English or Arabic with three pinned prints and optionally a sound.',
  renderAspectRatio: 3 / 4,
  stages: [
    'DesignerAccessStage',
    'TemplateSelectionStage',
    'WrapperSelectionStage',
    'ReceiverStage',
    'PoliciesStage',
    'ProjectsBook',
    'ProjectSheet',
    'ReviewStage',
    'SubmittedStage',
    'ReservedStage',
    'UnwrittenStage'
  ],
};
```

### 2. Template Registration (`src/templates/registry/index.js`)

```javascript
// Register template
const TEMPLATE_DEFINITIONS = {
  'memorial-message': {
    slug: 'memorial-message',
    name: 'Memorial Message',
    defaultVersion: 1,
    versions: {
      1: {
        version: 1,
        module: MEMORIAL_TEMPLATE_V1,
        manifest: MANIFEST_V1,
        stages: [...TEMPLATE_SEQUENCES['memorial-message']],
      },
    },
  },
};
```

### 3. Version Resolution

```javascript
// src/templates/registry/index.js
export function getCurrentTemplateVersion(slug) {
  // 1. Check localStorage override
  // 2. Check templates.current_version table (future)
  // 3. Fall back to defaultVersion
}

export function resolveTemplateVersion(slug, version) {
  const def = TEMPLATE_DEFINITIONS[slug];
  if (!def) return null;
  const targetVersion = version != null ? Number(version) : getCurrentTemplateVersion(slug);
  return def.versions[targetVersion] ?? def.versions[def.defaultVersion] ?? null;
}
```

---

## Creating a New Template

### 1. Create Template Directory

```
src/templates/new-template/
└── v1/
    ├── index.js
    ├── manifest.js
    ├── letterDefaults.js
    ├── NewTemplateLetter.jsx
    ├── NewTemplateEditorStage.jsx
    ├── NewTemplateCardMini.jsx
    └── [other stages...]
```

### 2. Template Manifest (`manifest.js`)

```javascript
export const MANIFEST = {
  template: 'new-template',
  version: 1,
  name: 'New Template',
  description: 'Description of what this template does',
  renderAspectRatio: 3 / 4,  // or 4/3, 1, etc.
  stages: [
    'StageOne',
    'StageTwo',
    // ...
  ],
};
```

### 3. Letter Defaults (`letterDefaults.js`)

```javascript
export const letterDefaults = {
  en: {
    greeting: 'Dear friend,',
    body: 'Your words here...',
    closing: 'With love,',
    senderName: 'Your Name',
  },
  ar: {
    greeting: 'صديقي العزيز،',
    body: 'كلماتك هنا...',
    closing: 'بمحبة،',
    senderName: 'اسمك',
  },
};
```

### 3. Letter Renderer (`NewTemplateLetter.jsx`)

```jsx
export default function NewTemplateLetter({
  draft = {},
  editable = false,
  onField = () => {},
  photoUrls = [],
  onPhotoTap,
  audio = null,
  audioUrl = null,
  compact = false,
}) {
  const language = draft.language === 'ar' ? 'ar' : 'en';
  const isAr = language === 'ar';
  const defaults = letterDefaults[language];

  // Render logic with RTL support for Arabic
  return (
    <div className={`template-new-template${isAr ? ' is-arabic' : ''}${editable ? ' is-editing' : ''}${compact ? ' is-compact' : ''}`}>
      {/* Render letter content */}
    </div>
  );
}
```

### 4. Editor Stage (`NewTemplateEditorStage.jsx`)

```jsx
export default function NewTemplateEditorStage({
  draft = {},
  onField = () => {},
  photoUrls = [],
  onPhotoTap,
  audio = null,
  audioUrl = null,
  onAudioChange,
}) {
  // Editable form fields with onField callbacks
  return (
    <div className="editor-stage">
      <label>
        <span className="caption">Greeting</span>
        <input
          value={draft.greeting || ''}
          onChange={(e) => onField('greeting', e.target.value)}
        />
      </label>
      {/* More fields */}
    </div>
  );
}
```

### 5. Template Registration (`src/templates/registry/index.js`)

```javascript
// Add to TEMPLATE_DEFINITIONS
const TEMPLATE_DEFINITIONS = {
  'memorial-message': { ... },
  'new-template': {
    slug: 'new-template',
    name: 'New Template',
    defaultVersion: 1,
    versions: {
      1: {
        version: 1,
        module: NEW_TEMPLATE_V1,  // Import from new-template/v1/index.js
        manifest: NEW_TEMPLATE_MANIFEST,
        stages: [...TEMPLATE_SEQUENCES['new-template']],
      },
    },
  },
};

// Add to TEMPLATE_SEQUENCES
export const TEMPLATE_SEQUENCES = {
  'memorial-message': [...],
  'new-template': [
    'DesignerAccessStage',
    'TemplateSelectionStage',
    'WrapperSelectionStage',
    'ReceiverStage',
    'PoliciesStage',
    'ProjectsBook',
    'ProjectSheet',
    'ReviewStage',
    'SubmittedStage',
    'ReservedStage',
    'UnwrittenStage',
  ],
};
```

### 6. Database Migration

```sql
-- migration: add new template
INSERT INTO public.templates (slug, name, description, enabled, sort_order, current_version)
VALUES ('new-template', 'New Template', 'Description', true, 10, 1)
ON CONFLICT (slug) DO NOTHING;

-- Add wrapper options
INSERT INTO public.template_wrapper_options (template_id, wrapper_id, enabled, display_order)
SELECT t.id, w.id, true, 1
FROM templates t, wrapper_types w
WHERE t.slug = 'new-template' AND w.key IN ('open_letter', 'sealed_letter')
ON CONFLICT (template_id, wrapper_id) DO NOTHING;
```

---

## Versioning Strategy

### Version Resolution Priority

1. **Explicit version** passed to `resolveTemplateVersion(slug, version)`
2. **localStorage override** (`dearune.templateVersion.{slug}`)
3. **Database** `templates.current_version` (future)
4. **Default version** from `TEMPLATE_DEFINITIONS[slug].defaultVersion`

### Version Persistence

```javascript
// src/templates/registry/index.js
export function setCurrentTemplateVersion(slug, version) {
  const def = TEMPLATE_DEFINITIONS[slug];
  if (!def) throw new Error(`Unknown template: ${slug}`);
  if (!def.versions[version]) throw new Error(`Version ${version} not registered for ${slug}`);
  
  currentVersionOverrides[slug] = version;
  try {
    localStorage.setItem(`dearune.templateVersion.${slug}`, String(version));
  } catch {}
  return version;
}
```

### Adding a New Version

1. Create `v2/` directory with new components
2. Update `TEMPLATE_DEFINITIONS[slug].versions[2] = { ... }`
3. Update `defaultVersion` if desired
4. Existing messages on v1 continue to render with v1
5. New submissions use v2 (or configured version)

---

## Template Integration Points

### In CreateBook (`src/pages/create/CreateBook.jsx`)

```javascript
// Template selection
const template = useTemplate(slug, version);

// Template provides:
// - stages: array of stage component names
// - manifest: metadata
// - module: React components
```

### In PublicMessage

```jsx
// src/pages/PublicMessage.jsx
import MemorialLetter from '@/templates/memorial-message/v1/MemorialLetter';

<MemorialLetter
  draft={letter}
  photoUrls={photos.map(p => projectMediaUrl(p.path, { publicId, token }))}
  audioUrl={audio?.url}
/>
```

### In Admin Templates Page

```jsx
// src/pages/admin/Templates.jsx
const { templates } = await fetchTemplates();
// templates[i].current_version from DB
// templates[i].versions from registry
```

### The card's artwork

The chooser card on `/create` paints the preview the admin uploaded for that
paper, not a CSS sketch of it. Templates → **Preview image** writes
`templates/<slug>/preview.webp` (≤1600px) plus `preview-thumb.webp` (≤400px)
into `preview_image_url` / `thumbnail_url`; `designer-templates` returns those
columns and `templatePreviewSource()` + `resolveTemplateImageUrl()` sign the
chosen one for the session. Adding a paper therefore means uploading its
artwork — `CardMini` is optional decoration and no longer the card preview.

---

## Template Development Checklist

- [ ] Create `src/templates/new-template/v1/` with all components
- [ ] Create `manifest.js` with metadata
- [ ] Create `letterDefaults.js` (EN/AR)
- [ ] Create letter renderer (`NewTemplateLetter.jsx`)
- [ ] Create editor stage (`NewTemplateEditorStage.jsx`)
- [ ] Upload the paper's preview image on **Templates** (the chooser card paints the upload; a `CardMini` is optional)
- [ ] Add to `TEMPLATE_DEFINITIONS` in `registry/index.js`
- [ ] Add to `TEMPLATE_SEQUENCES` in `stages.js`
- [ ] Add migration for `templates` table insert
- [ ] Add wrapper options in `template_wrapper_options`
- [ ] Test in CreateBook flow
- [ ] Test in PublicMessage rendering
- [ ] Test version switching
- [ ] Update `TEMPLATE_DEVELOPMENT_GUIDE.md`

---

## Template Data Contract

### Letter Payload Schema

```typescript
interface LetterPayload {
  language: 'en' | 'ar';
  greeting: string;
  body: string;
  closing: string;
  senderName: string;
  photos: Array<{
    path: string;        // Storage path
    originalName: string;
    mimeType: string;
  }>;
  audio: {
    path: string;
    originalName: string;
    mimeType: string;
  } | null;
  passwordSet: boolean;
  letterPasswordHash?: string;  // base64 SHA-256
}
```

### Template Manifest

```typescript
interface TemplateManifest {
  template: string;           // slug
  version: number;
  name: string;
  description: string;
  renderAspectRatio: number;  // e.g., 3/4
  stages: string[];           // Stage component names
}
```

---

## Testing Templates

### Unit Tests

```javascript
// tests/template-contract.test.js
import { resolveTemplateVersion, getTemplate } from '@/templates/registry';

test('resolves memorial-message v1', () => {
  const template = resolveTemplateVersion('memorial-message', 1);
  expect(template).toBeTruthy();
  expect(template.manifest.name).toBe('Memorial Message');
});
```

### Visual Regression

```bash
# Run visual regression tests
node e2e/qa-memorial.mjs
node e2e/qa-catalog.mjs
```

### Rendering Tests

```javascript
// tests/pdf.test.js
test('renders template correctly in PDF', async () => {
  const { bytes } = await buildQrPaperPdf(operations, { dateLabel });
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  expect(doc.numPages).toBeGreaterThan(0);
});
```

---

## Template Constraints

| Constraint | Description |
|---|---|
| **Single template** | Only `memorial-message` exists currently |
| **Version pinning** | Messages locked to template version at submission |
| **Arabic RTL** | Must support RTL layout |
| **Print fidelity** | Must match artwork specs exactly |
| **Media references** | Paths only, resolved at render time |

---

## Adding a Template Checklist

- [ ] Create `src/templates/new-template/v1/` with all components
- [ ] Create `manifest.js` with metadata
- [ ] Create `letterDefaults.js` (EN/AR)
- [ ] Create letter renderer (`NewTemplateLetter.jsx`)
- [ ] Create editor stage (`NewTemplateEditorStage.jsx`)
- [ ] Upload the paper's preview image on **Templates** (the chooser card paints the upload; a `CardMini` is optional)
- [ ] Add to `TEMPLATE_DEFINITIONS` in `registry/index.js`
- [ ] Add to `TEMPLATE_SEQUENCES` in `stages.js`
- [ ] Add migration for `templates` table insert
- [ ] Add wrapper options in `template_wrapper_options`
- [ ] Test in CreateBook flow
- [ ] Test in PublicMessage rendering
- [ ] Test version switching
- [ ] Update `TEMPLATE_DEVELOPMENT_GUIDE.md`