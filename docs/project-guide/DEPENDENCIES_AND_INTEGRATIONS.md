# Dependencies and Integrations

This document catalogs all external dependencies, third-party integrations, and their roles in the Dearune system.

## Dependency Categories

| Category | Count | Purpose |
|---|---|---|
| **Runtime Dependencies** | 47 | Core application functionality |
| **Development Dependencies** | 28 | Build, test, lint, type-check |
| **External Services** | 7 | Third-party APIs and platforms |
| **Supabase Platform** | 5 | Database, Auth, Storage, Edge Functions, Realtime |

---

## Runtime Dependencies (`package.json`)

### Core Framework
| Package | Version | Purpose |
|---|---|---|
| `react` | 19.2.0 | UI library |
| `react-dom` | 19.2.0 | DOM rendering |
| `react-router-dom` | 6.28.0 | Client-side routing |

### Styling & UI
| Package | Version | Purpose |
|---|---|---|
| `tailwindcss` | 4.0.0 | Utility-first CSS |
| `@tailwindcss/vite` | 4.0.0 | Vite integration for Tailwind v4 |
| `tw-animate-css` | 1.0.0 | Animation utilities |
| `clsx` | 2.1.1 | Conditional class names |
| `tailwind-merge` | 2.5.4 | Merge Tailwind classes |
| `lucide-react` | 0.453.0 | Icon library |
| `@radix-ui/*` | Various | Headless UI primitives (35 components) |
| `sonner` | 1.5.0 | Toast notifications |
| `next-themes` | 0.3.0 | Theme management (dark/light/system) |

### Forms & Validation
| Package | Version | Purpose |
|---|---|---|
| `react-hook-form` | 7.51.0 | Form state management |
| `@hookform/resolvers` | 3.3.4 | Resolver for validation |
| `zod` | 3.22.4 | Schema validation |

### State & Data
| Package | Version | Purpose |
|---|---|---|
| `@supabase/supabase-js` | 2.39.7 | Supabase client |
| `@electric-sql/pglite` | 0.2.12 | In-memory Postgres for tests |

### Media & Files
| Package | Version | Purpose |
|---|---|---|
| `pdf-lib` | 1.17.1 | PDF generation (QR paper, inserts, shipping labels) |
| `fontkit` | 2.0.2 | Font embedding for PDF |
| `exceljs` | 4.4.0 | Bosta manifest Excel generation |
| `qrcode` | 1.5.3 | QR code generation |
| `react-easy-crop` | 5.0.0 | Image cropping in designer |
| `jsqr` | 1.4.0 | QR code scanning (fallback) |

### Crypto & Security
| Package | Version | Purpose |
|---|---|---|
| `jose` | 5.2.3 | JWT signing/verification (HS256) |
| `bcryptjs` | 2.4.3 | Passcode hashing (120k iterations) |

### Date & Time
| Package | Version | Purpose |
|---|---|---|
| `date-fns` | 3.6.0 | Date formatting/manipulation |

### PWA
| Package | Version | Purpose |
|---|---|---|
| `vite-plugin-pwa` | 0.20.5 | PWA manifest + service worker |
| `workbox-window` | 7.1.0 | Service worker registration |

### Testing
| Package | Version | Purpose |
|---|---|---|
| `vitest` | 1.5.0 | Unit test runner |
| `@testing-library/react` | 14.2.1 | React component testing |
| `@testing-library/user-event` | 14.5.2 | User interaction simulation |
| `playwright` | 1.42.1 | E2E browser automation |

### Build & Dev Tools
| Package | Version | Purpose |
|---|---|---|
| `vite` | 5.2.0 | Build tool + dev server |
| `@vitejs/plugin-react` | 4.2.1 | React plugin for Vite |
| `rolldown` | 0.12.0 | Fast bundler (used by Vite 8) |
| `oxlint` | 0.5.0 | Fast linter |
| `typescript` | 5.4.0 | Type checking |
| `esbuild` | 0.20.0 | Fast bundler (used by Vitest) |

### Fonts
| Package | Version | Purpose |
|---|---|---|
| `@fontsource/arniya` | 5.0.0 | Brand wordmark font |
| `@fontsource/atkinson-hyperlegible` | 5.0.0 | Accessible monospace |
| `@fontsource-variable/geist` | 5.0.0 | UI font (variable) |
| `@fontsource-variable/manrope` | 5.0.0 | Body font (variable) |

---

## Development Dependencies

| Package | Version | Purpose |
|---|---|---|
| `@types/react` | 18.2.0 | React types |
| `@types/react-dom` | 18.2.0 | React DOM types |
| `@types/node` | 20.11.0 | Node.js types |
| `@types/bcryptjs` | 2.4.6 | bcrypt types |
| `vitest` | 1.5.0 | Test runner |
| `@vitest/coverage-v8` | 1.5.0 | Coverage reporting |
| `playwright` | 1.42.1 | E2E testing |
| `@playwright/test` | 1.42.1 | Playwright test runner |
| `oxlint` | 0.5.0 | Linter |
| `typescript` | 5.4.0 | Type checker |
| `esbuild` | 0.20.0 | Bundler for tests |
| `prettier` | 3.2.5 | Code formatter |
| `@tailwindcss/vite` | 4.0.0 | Tailwind Vite plugin |

---

## External Service Integrations

### 1. Supabase Platform

| Service | Purpose | Configuration |
|---|---|---|
| **PostgreSQL Database** | Primary data store (projects, designers, workers, sales, operations) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |
| **Supabase Auth** | Admin/Worker authentication (email/password, PKCE) | `supabase.auth` |
| **Supabase Storage** | Designer draft media (designer-drafts bucket) | `supabase.storage` |
| **Edge Functions** | 16 Deno/TypeScript functions (admin, designer, worker, public) | `supabase functions deploy` |
| **Realtime** | Admin inbox, worker messages, app settings sync | `supabase.channel()` |
| **Database Functions/RPCs** | 24 worker RPCs + admin RPCs + public RPCs | SQL migrations |

**Supabase Project:** `xwgegarncnxswiswsufx` (Frankfurt region)

**Required Secrets (GitHub Actions + Supabase):**
- `SUPABASE_ACCESS_TOKEN` - CLI personal access token
- `SUPABASE_PROJECT_ID` - Project reference
- `SUPABASE_DB_PASSWORD` - Database password for migrations
- `DESIGNER_JWT_SECRET` - HS256 secret (32+ bytes, base64)
- `GOOGLE_CLIENT_ID` - Drive OAuth
- `GOOGLE_CLIENT_SECRET` - Drive OAuth
- `GOOGLE_REFRESH_TOKEN` - Drive OAuth
- `GOOGLE_DRIVE_MEDIA_FOLDER_ID` - Drive folder ID

---

### 2. Google Drive (Optional Media Storage)

| Aspect | Details |
|---|---|
| **Purpose** | Alternative to Supabase Storage for designer draft media |
| **Auth Flow** | OAuth 2.0 Refresh Token → Access Token (50 min TTL) |
| **API** | Google Drive API v3 |
| **Upload** | Resumable upload sessions (8MB chunks) |
| **Folder Structure** | `Dearune Designer Drafts/{designerId}/memorial-message/` |
| **Permissions** | Service account or user OAuth credentials |
| **Config** | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_DRIVE_MEDIA_FOLDER_ID` |
| **Switching** | `app_settings.storage_provider = 'google_drive' \| 'supabase'` |

**Edge Functions Using Drive:**
- `drive-create-upload` - Create resumable upload session
- `drive-media` - Stream/download files
- `drive-delete-media` - Trash files

---

### 3. Bosta (Egyptian Courier)

| Aspect | Details |
|---|---|
| **Purpose** | Shipping manifest generation for physical deliveries |
| **Integration** | Export `.xlsx` matching Bosta's official template |
| **Library** | `exceljs` |
| **Manifest Columns** | Recipient name, address, city, governorate, phone, tracking code, COD amount, weight, dimensions |
| **Export Trigger** | Admin/Worker Operations Print → Export CSV/Excel |
| **Template** | `public/bosta/MassUploadTemplate-Ar.xlsx` |
| **Delivery** | Manual upload to Bosta portal by operations team |

**Bosta Manifest Mapping:**
```javascript
// src/services/bosta.js
{
  recipient_name: unit.recipient_name,
  address: unit.address_line1,
  city: unit.city,
  governorate: unit.state_province,
  phone: unit.customer_phone,
  tracking_code: unit.tracking_code,
  cod_amount: unit.sale_price,
  weight: '0.5', // kg per unit (estimated)
  dimensions: '20x15x5' // cm (estimated)
}
```

---

### 4. Cloudflare Workers (Hosting)

| Aspect | Details |
|---|---|
| **Purpose** | Static asset hosting + SPA fallback + API routes |
| **Deployment** | `npx wrangler deploy` (automatic via GitHub Actions) |
| **Assets** | `dist/` directory (Vite build output) |
| **Worker Script** | `worker.js` - SPA fallback + `/api/health` + `/api/*` 404 |
| **Config** | `wrangler.jsonc` - name, compatibility_date, assets directory |
| **Domains** | Custom domains via Cloudflare Dashboard |
| **TLS** | Automatic (Cloudflare managed) |
| **Headers** | `_headers` file - CSP, HSTS, security headers |

**Worker Entry (`worker.js`):**
```javascript
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return Response.json({ ok: true });
    if (url.pathname.startsWith('/api/')) return Response.json({ error: 'Not found' }, { status: 404 });
    return env.ASSETS.fetch(request); // SPA fallback
  }
}
```

---

### 5. Fonts & Assets

| Asset | Source | Usage |
|---|---|---|
| **Arniya** | `@fontsource/arniya` | Brand wordmark |
| **Manrope** | `@fontsource-variable/manrope` | Body text (Latin) |
| **Noto Sans Arabic** | Google Fonts | Body text (Arabic) |
| **Cormorant Garamond** | Google Fonts | Display/headings |
| **Libre Baskerville** | `src/assets/fonts/` | Book serif (template) |
| **Atkinson Hyperlegible** | `@fontsource/atkinson-hyperlegible` | Editor monospace |
| **Allura, Amiri, Cinzel, Cormorant, Inter** | `public/qr-paper/fonts/` | QR paper printing |

**QR Paper Assets (41MB total):**
- `paper-front.png` (14.4MB) - Front texture
- `paper-back.png` (12.6MB) - Back texture
- `paper-texture.png` (14.4MB) - Legacy
- `deco-front-a/b/c/d.png` - Decorative elements
- `deco-back-a/b/c.png` - Decorative elements
- 5 TTF fonts (Allura, Amiri, Cinzel, Cormorant, Inter)

---

### 6. Browsers & Runtime

| Requirement | Version |
|---|---|
| **Node.js** | 22.x (for build/scripts) |
| **Deno** | 1.45+ (Edge Functions runtime) |
| **Browsers** | Chrome 120+, Firefox 120+, Safari 17+, Edge 120+ |
| **Mobile** | iOS Safari 17+, Chrome Android 120+ |
| **PWA** | Service Worker, Web App Manifest, HTTPS required |

---

### 7. Development Tools

| Tool | Purpose | Version |
|---|---|---|
| **Supabase CLI** | Local dev, migrations, functions | Latest |
| **Wrangler CLI** | Cloudflare Workers deploy | Latest |
| **Vite** | Dev server, build | 5.2.0 |
| **Vitest** | Unit tests | 1.5.0 |
| **Playwright** | E2E tests | 1.42.1 |
| **Oxlint** | Linting | 0.5.0 |
| **TypeScript** | Type checking | 5.4.0 |

---

## Integration Architecture

### Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DEARUNE INTEGRATION MAP                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐     ┌──────────────────┐     ┌────────────────────┐    │
│   │   CLIENT     │────▶│    SUPABASE      │────▶│   EDGE FUNCTIONS   │    │
│   │  (React SPA) │     │   (PostgreSQL +  │     │  (16 Deno/TS Fn)   │    │
│   │              │     │    Auth + Storage)│     │                    │    │
│   └──────┬───────┘     └────────┬─────────┘     └─────────┬──────────┘    │
│          │                      │                          │               │
│          │         ┌────────────┴────────┐     ┌──────────┴──────────┐  │
│          │         ▼                   ▼     ▼                   ▼  │
│          │  ┌─────────────┐    ┌──────────────┐  ┌──────────────┐  │
│          │  │ Google Drive│    │    Bosta     │  │  Cloudflare  │  │
│          │  │  (Optional) │    │  (Courier)   │  │  Workers     │  │
│          │  └─────────────┘    └──────────────┘  └──────────────┘  │
│          │                                                                   │
│          ▼                                                                   │
│   ┌─────────────────┐                                                        │
│   │  BROWSER APIs   │                                                        │
│   │  • Web Crypto   │  (AES-GCM draft encryption)                           │
│   │  • Canvas API   │  (Image compression)                                  │
│   │  • IndexedDB    │  (Draft media persistence)                            │
│   │  • BarcodeDetector│  (QR scanning)                                      │
│   │  • MediaRecorder │ (Audio recording)                                   │
│   └─────────────────┘                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Client → Supabase

| Operation | Method | Auth |
|---|---|---|
| Read projects/operations | `supabase.from().select()` | Anon key + User JWT |
| Write drafts/media | `supabase.functions.invoke()` | Designer JWT |
| Auth (admin/worker) | `supabase.auth.signInWithPassword()` | Email/password |
| Realtime subscriptions | `supabase.channel().on()` | User JWT |
| Storage upload/download | `supabase.storage.from()` | Service role (Edge Fn) |

### Client → Edge Functions

| Function | Client Method | Auth |
|---|---|---|
| `designer-login` | `fetch('/functions/v1/designer-login', {POST})` | None |
| `designer-projects` | `supabase.functions.invoke()` | Designer JWT |
| `designer-media` | `fetch('/functions/v1/designer-media', {PUT/GET/DELETE})` | Designer JWT |
| `project-media` | `fetch('/functions/v1/project-media?...')` | Public token (query) |
| `admin-*` | `supabase.functions.invoke()` | Admin session |
| `worker-*` | `supabase.functions.invoke()` | Worker JWT |

### Edge Functions → Database

| Function | DB Access | Auth |
|---|---|---|
| All admin/designer/worker | Service Role (bypass RLS) | `supabase_admin` |
| `project-media` | Anon/Service Role | Service Role |
| RPCs (worker_*, admin_*) | `SECURITY DEFINER` | `current_worker_id()` / `auth.uid()` |

---

## Version Compatibility Matrix

| Component | Version | Compatible With |
|---|---|---|
| React | 19.2.0 | React DOM 19.2.0, Router 6.28 |
| Vite | 5.2.0 | React 19, Tailwind 4, rolldown 0.12 |
| Tailwind CSS | 4.0.0 | Vite 5, PostCSS (built-in) |
| Supabase JS | 2.39.7 | Postgres 17, Supabase CLI 2.x |
| Postgres | 17 (Supabase) | pgvector, pg_cron, pg_graphql |
| Deno (Edge) | 1.45+ | Supabase Edge Runtime |
| Node.js | 22.x | Build scripts, Vite, Vitest |
| Cloudflare Workers | 2024-10-01 | wrangler 3.x, compatibility_date 2026-04-08 |

---

## Security & Compliance Dependencies

### Data Processing Agreements

| Vendor | DPA Status | Region |
|---|---|---|
| Supabase | Signed | EU (Frankfurt) + US |
| Cloudflare | Signed | Global |
| Google Cloud | Signed | EU/US |
| Bosta | Signed | Egypt |

### Encryption Standards

| Data | Algorithm | Key Management |
|---|---|---|
| Designer drafts | AES-GCM (Web Crypto) | Per-designer PBKDF2 key (120k iterations) |
| Designer JWT | HS256 | `DESIGNER_JWT_SECRET` (256-bit, rotated quarterly) |
| Supabase Auth | bcrypt (server) | Supabase managed |
| TLS | TLS 1.3 | Cloudflare + Supabase managed |
| At-rest | AES-256 | Supabase managed |

---

## Dependency Update Strategy

### Automated
```bash
# Weekly automated PR (GitHub Dependabot or similar)
npm update
npm audit fix
```

### Manual (Monthly)
```bash
# Check outdated
npm outdated

# Major updates (test thoroughly)
npm install package@latest

# Security audit
npm audit
npm audit fix
```

### Breaking Change Checklist

When updating major versions:
- [ ] React 18 → 19: Check concurrent features, useEffect changes
- [ ] Tailwind 3 → 4: CSS-first config, OKLCH colors, new import syntax
- [ ] Vite 4 → 5: CommonJS → ESM, plugin API changes
- [ ] Supabase JS 2.x → 3.x: Auth changes, realtime API
- [ ] React Router 6 → 7: Data APIs, framework mode

---

## License Summary

| Package | License | Notes |
|---|---|---|
| React | MIT | Core framework |
| Tailwind CSS | MIT | Styling |
| Radix UI | MIT | UI primitives |
| Supabase JS | Apache 2.0 | Backend client |
| pdf-lib | MIT | PDF generation |
| exceljs | MIT | Excel export |
| qrcode | MIT | QR generation |
| jose | MIT | JWT |
| bcryptjs | MIT | Passcode hashing |
| zod | MIT | Validation |
| playwight | Apache 2.0 | E2E testing |
| oxlint | MIT | Linting |
| TypeScript | Apache 2.0 | Type checking |

All dependencies use permissive licenses (MIT, Apache 2.0, BSD). No GPL or copyleft licenses.