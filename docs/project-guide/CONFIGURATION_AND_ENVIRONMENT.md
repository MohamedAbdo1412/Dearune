# Configuration and Environment

This document describes all configuration options, environment variables, and build settings for Dearune.

## Environment Variables

### Required (Production)

| Variable | Description | Example |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key | `eyJhbGciOiJIUzI1NiIs...` |
| `SUPABASE_ACCESS_TOKEN` | Supabase personal access token | `sbp_xxx` |
| `SUPABASE_PROJECT_ID` | Supabase project reference | `xwgegarncnxswiswsufx` |
| `SUPABASE_DB_PASSWORD` | Database password for migrations | `xxx` |
| `DESIGNER_JWT_SECRET` | HS256 secret for designer JWTs (32+ chars) | `base64-encoded-32-bytes` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | `xxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | `GOCSPX-xxx` |
| `GOOGLE_REFRESH_TOKEN` | Google Drive refresh token | `1//xxx` |
| `GOOGLE_DRIVE_MEDIA_FOLDER_ID` | Drive folder ID for media | `1xxx` |

### Optional (Development)

| Variable | Description | Default |
|---|---|---|
| `VITE_PUBLIC_SITE_URL` | Public site URL for QR codes | `http://localhost:5173` |
| `NODE_ENV` | Environment mode | `development` |

## Environment Files

### `.env` (Local, gitignored)

```bash
# Supabase
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIs...

# Supabase CLI
SUPABASE_ACCESS_TOKEN=sbp_xxx
SUPABASE_PROJECT_ID=xwgegarncnxswiswsufx
SUPABASE_DB_PASSWORD=xxx

# Designer JWT
DESIGNER_JWT_SECRET=base64-encoded-32-bytes

# Google Drive (optional)
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx
GOOGLE_REFRESH_TOKEN=1//xxx
GOOGLE_DRIVE_MEDIA_FOLDER_ID=1xxx

# Public URL
VITE_PUBLIC_SITE_URL=http://localhost:5173
```

### `.env.example` (Committed)

```bash
# Copy to .env and fill in values
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=

SUPABASE_ACCESS_TOKEN=
SUPABASE_PROJECT_ID=
SUPABASE_DB_PASSWORD=

DESIGNER_JWT_SECRET=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_DRIVE_MEDIA_FOLDER_ID=

VITE_PUBLIC_SITE_URL=http://localhost:5173
```

## Build Configuration

### `vite.config.js`

```javascript
// Key configurations:
// - React + Tailwind CSS 4 + VitePWA
// - rolldown for fast bundling
// - Manual chunking for heavy libs (pdf-lib, exceljs)
// - Dev proxy for Supabase functions (/functions/v1)
// - PWA manifests for 3 apps + main
// - Custom inline script for manifest switching
```

### Key Plugins

```javascript
plugins: [
  react(),                    // React 19
  tailwindcss(),              // Tailwind CSS v4
  VitePWA({                   // PWA support
    registerType: 'prompt',
    manifest: { ... },
    workbox: {
      globPatterns: [...],
      globIgnores: ['**/*.html', '**/*.xlsx', '**/paper-texture*.png', '**/Bosta*.xlsx'],
      maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      cleanupOutdatedCaches: true,
      runtimeCaching: [
        { urlPattern: ({ request }) => request.mode === 'navigate', handler: 'NetworkFirst' },
        { urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' },
        { urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co'), handler: 'NetworkOnly' },
      ],
    },
  }),
  dearuneAppManifest(),       // Inline manifest switching script
]
```

### Chunking Strategy

```javascript
manualChunks: {
  'pdf-lib': ['pdf-lib'],
  'exceljs': ['exceljs'],
  'cropper': ['react-easy-crop'],
  'qr': ['qrcode'],
  'vendor': ['@supabase/supabase-js', 'react', 'react-dom', 'react-router-dom'],
}
```

## TypeScript Configuration

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### `tsconfig.node.json` (for config files)

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.js", "vitest.config.js"]
}
```

## Tailwind CSS Configuration

### `tailwind.config.js` (via `src/index.css`)

```css
/* src/index.css */
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "@fontsource-variable/geist";
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Cormorant+Garamond:wght@400;500;600;700&family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap');

:root {
  --font-body: "Manrope", "Noto Sans Arabic", sans-serif;
  --font-display: "Cormorant Garamond", serif;
  /* ... color tokens ... */
}

.dark {
  /* dark mode overrides */
}
```

### Theme Configuration (`components.json`)

```json
{
  "style": "radix-nova",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components/ui",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

## Supabase Configuration

### `supabase/config.toml`

```toml
[project]
id = "xwgegarncnxswiswsufx"

[api]
port = 54321

[db]
port = 54322

[studio]
port = 54323

[inbucket]
port = 54324

[functions]
  # verify_jwt = false for public endpoints
  admin-dearunes = { verify_jwt = false }
  admin-operations = { verify_jwt = false }
  admin-designers = { verify_jwt = false }
  admin-workers = { verify_jwt = false }
  create-sale = { verify_jwt = false }
  designer-login = { verify_jwt = false }
  designer-media = { verify_jwt = false }
  designer-message = { verify_jwt = false }
  designer-messages = { verify_jwt = false }
  designer-projects = { verify_jwt = false }
  designer-templates = { verify_jwt = false }
  drive-create-upload = { verify_jwt = false }
  drive-delete-media = { verify_jwt = false }
  drive-media = { verify_jwt = false }
  project-media = { verify_jwt = false }
  worker-designers = { verify_jwt = false }

[auth]
  site_url = "http://localhost:5173"
  additional_redirect_urls = []
  jwt_expiry = 3600
  refresh_token_reuse_interval = 10
```

## Cloudflare Workers Configuration

### `wrangler.jsonc`

```jsonc
{
  "name": "dearune",
  "compatibility_date": "2026-04-08",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS"
  },
  "vars": {
    "ENVIRONMENT": "production"
  }
}
```

### Worker Entry (`worker.js`)

```javascript
export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/api/health') {
      return Response.json({ ok: true, now: new Date().toISOString() })
    }

    if (url.pathname.startsWith('/api/')) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }

    // SPA fallback to index.html
    return env.ASSETS.fetch(request)
  }
}
```

## Package.json Scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "oxlint",
    "test": "vitest run",
    "preview": "vite preview",
    "icons": "node scripts/generate-brand-icons.mjs",
    "app-assets": "node scripts/generate-app-icons.mjs && node scripts/generate-app-pwa.mjs",
    "typecheck": "tsc --noEmit"
  }
}
```

## Oxlint Configuration (`.oxlintrc.json`)

```json
{
  "plugins": ["react", "jsx-a11y"],
  "categories": {
    "correctness": "error",
    "suspicious": "warn",
    "style": "off",
    "perf": "warn",
    "nursery": "off"
  },
  "rules": {
    "react/jsx-no-target-blank": "off",
    "react/require-default-props": "off",
    "jsx-a11y/anchor-is-valid": "off",
    "jsx-a11y/click-events-have-key-events": "off",
    "jsx-a11y/no-noninteractive-element-interactions": "off",
    "jsx-a11y/no-static-element-interactions": "off"
  },
  "ignorePatterns": ["dist/", "node_modules/", "e2e/", "*.config.*", "*.mjs"]
}
```

## Environment-Specific Behavior

### Development (`npm run dev`)

- Vite dev server on port 5173
- HMR enabled
- Dev proxy for `/functions/v1` → Supabase
- Source maps enabled
- React Fast Refresh

### Preview (`npm run preview`)

- Serves `dist/` on port 4173
- Production build
- No HMR
- Used for e2e tests

### Production Build (`npm run build`)

- Minified, tree-shaken
- Code-split chunks
- PWA manifests + SW generated
- Assets fingerprinted
- CSP meta tag in `index.html`

## Feature Flags

### `app_settings` Table

| Setting | Type | Default | Description |
|---|---|---|---|
| `maintenance_mode` | boolean | `false` | Disables worker milestone RPCs |
| `allow_new_orders` | boolean | `true` | Allows new sales |
| `currency` | text | `EGP` | Default currency |
| `storage_provider` | text | `supabase` | `supabase` or `google_drive` |

## Secrets Management

### Local Development

```bash
# .env (gitignored)
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
DESIGNER_JWT_SECRET=...
```

### Production (GitHub Actions Secrets)

| Secret | Purpose |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI auth |
| `SUPABASE_PROJECT_ID` | Project reference |
| `SUPABASE_DB_PASSWORD` | Database password |
| `DESIGNER_JWT_SECRET` | JWT signing key |
| `GOOGLE_CLIENT_ID` | Drive OAuth |
| `GOOGLE_CLIENT_SECRET` | Drive OAuth |
| `GOOGLE_REFRESH_TOKEN` | Drive OAuth |
| `GOOGLE_DRIVE_MEDIA_FOLDER_ID` | Drive folder ID |

### Supabase Edge Function Secrets

```bash
# Set via Supabase CLI
supabase secrets set DESIGNER_JWT_SECRET=xxx --project-ref xxx
supabase secrets set GOOGLE_CLIENT_ID=xxx --project-ref xxx
# etc.
```

## Configuration Validation

### Startup Checks

```typescript
// src/lib/supabase.ts
const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !publishableKey) {
  console.warn(`Missing env: ${[url ? null : 'VITE_SUPABASE_URL', publishableKey ? null : 'VITE_SUPABASE_PUBLISHABLE_KEY'].filter(Boolean).join(', ')}`)
}
```

### Runtime Validation

```typescript
// supabase/functions/_shared/env.ts
export function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export function optionalEnv(name: string, defaultValue?: string): string | undefined {
  return Deno.env.get(name) ?? defaultValue
}
```

## Configuration Checklist

### Pre-Deploy Checklist

- [ ] All required env vars set in GitHub Secrets
- [ ] Supabase secrets configured
- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] `npm run test` passes
- [ ] `npm run build` produces `dist/`
- [ ] `npm run preview` works locally
- [ ] PWA manifests accessible at `/manifests/`
- [ ] Service workers register
- [ ] CSP headers correct

### Environment Comparison

| Setting | Development | Preview | Production |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Local/staging | Staging | Production |
| `VITE_PUBLIC_SITE_URL` | `http://localhost:5173` | `https://staging.dearune.app` | `https://dearune.app` |
| `NODE_ENV` | `development` | `production` | `production` |
| CSP | Dev-friendly | Strict | Strict |
| Source Maps | Yes | Yes | No |
| Minification | No | Yes | Yes |