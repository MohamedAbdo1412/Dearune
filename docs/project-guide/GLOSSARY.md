# Glossary

This document defines key terms, abbreviations, and domain-specific language used throughout the Dearune codebase and documentation.

## A

| Term | Definition |
|---|---|
| **Admin** | Studio administrator with full access to `/admin/*` routes |
| **AES-GCM** | Advanced Encryption Standard - Galois/Counter Mode; used for draft encryption |
| **App Settings** | Global configuration stored in `app_settings` table (id=1) |

## B

| Term | Definition |
|---|---|
| **Bosta** | Egyptian courier company; integration for shipping manifest export |
| **BookMachine** | XState-like state machine managing the `/create` designer flow |

## C

| Term | Definition |
|---|---|
| **Canonical ID** | Physical product identifier: `DR` + 11 digits (e.g., `DR70700897645`) |
| **CSP** | Content Security Policy |
| **CSS Variables** | Custom properties used for theming (OKLCH color space) |

## D

| Term | Definition |
|---|---|
| **Dearune** | The product name; also refers to a single letter product |
| **Designer** | External creative who composes letters via `/create` |
| **Designer JWT** | Custom HS256 JWT for designer authentication (48h, memory-only) |
| **Draft** | In-progress letter composition, encrypted client-side |
| **Draft Secret** | Per-designer 256-bit key for AES-GCM draft encryption |

## E

| Term | Definition |
|---|---|
| **Edge Function** | Supabase Deno TypeScript functions (16 total) |
| **EGP** | Egyptian Pound (primary currency) |

## F

| Term | Definition |
|---|---|
| **First Activated At** | Timestamp when recipient first opens letter; starts 2-year clock |

## G

| Term | Definition |
|---|---|
| **Google Drive** | Optional storage provider for designer drafts |

## H

| Term | Definition |
|---|---|
| **HS256** | HMAC-SHA256 algorithm for JWT signing |

## I

| Term | Definition |
|---|---|
| **IndexedDB** | Browser database for large draft media storage |

## J

| Term | Definition |
|---|---|
| **JWT** | JSON Web Token |

## K

| Term | Definition |
|---|---|
| **KPI** | Key Performance Indicator |

## M

| Term | Definition |
|---|---|
| **Milestone** | Explicit timestamp replacing generic status: `sold_at`, `manufacturing_completed_at`, `shipped_at`, `delivered_at` |
| **Migration** | SQL file in `supabase/migrations/` (forward-only) |

## N

| Term | Definition |
|---|---|
| **PWA** | Progressive Web App |

## O

| Term | Definition |
|---|---|
| **OKLCH** | Perceptual color space used for design tokens |

## P

| Term | Definition |
|---|---|
| **Physical Product** | A single manufactured unit (one row in `physical_products`) |
| **Public ID** | 24-char hex string identifying a project publicly (e.g., `a1b2c3d4e5f6`) |
| **Public Token** | 32-char capability token printed on QR code |
| **PWA** | Progressive Web App |

## Q

| Term | Definition |
|---|---|
| **QA** | Quality Assurance (scanner, catalog, memorial benchmarks) |
| **QR Code** | Quick Response code linking to `/message/:publicId?token=...` |

## R

| Term | Definition |
|---|---|
| **RLS** | Row Level Security (PostgreSQL policy) |
| **RPC** | Remote Procedure Call (PostgreSQL function) |

## S

| Term | Definition |
|---|---|
| **SEO** | Search Engine Optimization |
| **SPA** | Single Page Application |
| **Sold As** | Derived label: `SOL-{canonical_id}` (e.g., `SOL-DR70700897645`) |
| **Supabase** | Backend-as-a-Service (PostgreSQL + Auth + Storage + Edge Functions) |

## T

| Term | Definition |
|---|---|
| **Template** | Versioned letter layout (e.g., `memorial-message` v1) |
| **Token** | Short for "public token" or "JWT" depending on context |

## U

| Term | Definition |
|---|---|
| **UUID** | Universally Unique Identifier (v4) |

## W

| Term | Definition |
|---|---|
| **Wrapper** | Physical enclosure type: `digital`, `open_letter`, `sealed_letter`, `open_card` |
| **Worker** | Studio staff with granular permissions (`/worker/*`) |

## X

| Term | Definition |
|---|---|
| **XSS** | Cross-Site Scripting |

---

## Abbreviations

| Abbr | Full Form |
|---|---|
| **API** | Application Programming Interface |
| **CDN** | Content Delivery Network |
| **CSP** | Content Security Policy |
| **CSV** | Comma-Separated Values |
| **DB** | Database |
| **DPO** | Data Protection Officer |
| **DR** | Disaster Recovery |
| **E2E** | End-to-End |
| **E2EE** | End-to-End Encryption |
| **ETL** | Extract, Transform, Load |
| **GDPR** | General Data Protection Regulation |
| **HSTS** | HTTP Strict Transport Security |
| **HTTP** | Hypertext Transfer Protocol |
| **HTTPS** | HTTP Secure |
| **ID** | Identifier |
| **JWT** | JSON Web Token |
| **MIME** | Multipurpose Internet Mail Extensions |
| **PII** | Personally Identifiable Information |
| **PITR** | Point-in-Time Recovery |
| **PKCE** | Proof Key for Code Exchange |
| **PWA** | Progressive Web App |
| **QR** | Quick Response |
| **RLS** | Row Level Security |
| **RPC** | Remote Procedure Call |
| **RTO** | Recovery Time Objective |
| **RPO** | Recovery Point Objective |
| **SLA** | Service Level Agreement |
| **SLO** | Service Level Objective |
| **SMS** | Short Message Service |
| **SPA** | Single Page Application |
| **SQL** | Structured Query Language |
| **SSO** | Single Sign-On |
| **SSH** | Secure Shell |
| **SSL** | Secure Sockets Layer |
| **SSE** | Server-Sent Events |
| **SST** | Server-Side Template |
| **TLS** | Transport Layer Security |
| **TTL** | Time To Live |
| **UI** | User Interface |
| **URL** | Uniform Resource Locator |
| **UTC** | Coordinated Universal Time |
| **UUID** | Universally Unique Identifier |
| **UX** | User Experience |
| **WAF** | Web Application Firewall |
| **WYSIWYG** | What You See Is What You Get |

---

## File Extensions

| Ext | Meaning |
|---|---|
| `.jsx` | React component (JSX) |
| `.ts` | TypeScript |
| `.tsx` | TypeScript + JSX |
| `.js` | JavaScript |
| `.mjs` | ES Module (Node) |
| `.sql` | SQL migration |
| `.toml` | TOML config |
| `.json` | JSON config |
| `.jsonc` | JSON with comments |
| `.mjs` | ES Module |
| `.css` | Stylesheet |
| `.css` | Tailwind CSS |
| `.svg` | Vector graphic |
| `.png` | Raster image |
| `.webp` | WebP image |
| `.woff2` | Web Font |
| `.ttf` | TrueType font |
| `.pdf` | Portable Document Format |
| `.xlsx` | Excel spreadsheet |

---

## Environment-Specific Terms

| Term | Dev | Preview | Production |
|---|---|---|---|
| **URL** | `http://localhost:5173` | `https://staging.dearune.app` | `https://dearune.app` |
| **Supabase** | Local (`supabase start`) | Staging project | Production project |
| **Cloudflare** | Dev tunnel | Staging zone | Production zone |
| **Storage** | Local Supabase | Staging bucket | Production bucket |

---

## Migration Naming

```
YYYYMMDDHHMMSS_descriptive_name.sql
```

Example: `20261028000003_composite_indexes.sql`

---

## Migration Prefixes

| Prefix | Meaning |
|---|---|
| `create` | New table |
| `alter` | Schema change |
| `drop` | Removal |
| `fix` | Bug fix |
| `add` | New column/constraint |
| `remove` | Deletion |
| `fix` | Bug fix |
| `seed` | Data seeding |

---

## Git Conventions

| Prefix | Meaning |
|---|---|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `refactor:` | Code restructuring |
| `docs:` | Documentation |
| `test:` | Test changes |
| `chore:` | Maintenance |
| `migration:` | Database migration |
| `config:` | Configuration change |

---

## Branch Naming

| Pattern | Example |
|---|---|
| `feature/description` | `feature/add-notes-to-operations` |
| `fix/description` | `fix/shipping-address-validation` |
| `refactor/description` | `refactor/operations-service` |
| `chore/description` | `chore/update-dependencies` |

---

## Commit Message Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Example:**
```
feat(operations): add notes field to physical products

- Add notes column to physical_products
- Update toOperation() mapper
- Add OperationNotes component

Closes #123
```

---

## Code Review Labels

| Label | Meaning |
|---|---|
| `approved` | Approved |
| `changes-requested` | Changes needed |
| `blocked` | Blocked by dependency |
| `wip` | Work in progress |
| `ready-for-review` | Ready for review |
| `needs-test` | Needs test coverage |
| `breaking-change` | Breaking change |

---

## Issue Templates

| Template | Use For |
|---|---|
| `bug_report.md` | Bug reports |
| `feature_request.md` | New features |
| `security.md` | Security vulnerabilities |
| `performance.md` | Performance issues |

---

## Labels

| Label | Color | Meaning |
|---|---|---|
| `bug` | 🔴 Red | Something isn't working |
| `feature` | 🟢 Green | New functionality |
| `enhancement` | 🔵 Blue | Improvement |
| `documentation` | 🟣 Purple | Documentation |
| `good first issue` | 🟡 Yellow | Good for newcomers |
| `help wanted` | 🟠 Orange | Community help |
| `priority: high` | 🔴 Red | Urgent |
| `priority: low` | 🟢 Green | Low priority |
| `blocked` | ⚫ Black | Blocked |
| `wip` | 🟡 Yellow | Work in progress |
| `ready for review` | 🟢 Green | Ready for review |
| `needs test` | 🟡 Yellow | Needs test coverage |
| `breaking change` | 🔴 Red | Breaking change |

---

## Keyboard Shortcuts (VS Code)

| Shortcut | Action |
|---|---|
| `Ctrl+P` | Quick open |
| `Ctrl+Shift+P` | Command palette |
| `Ctrl+Shift+F` | Search in files |
| `Ctrl+Shift+E` | Explorer |
| `Ctrl+Shift+G` | Git |
| `Ctrl+Shift+D` | Debug |
| `Ctrl+Shift+X` | Extensions |
| `Ctrl+Shift+T` | Reopen closed tab |
| `Ctrl+K Ctrl+S` | Keyboard shortcuts |
| `Ctrl+K Ctrl+Z` | Zen mode |

---

## Regex Patterns

| Pattern | Use Case |
|---|---|
| `/^DR\d{11}$/` | Physical product ID |
| `/^[0-9a-f]{16,64}$/` | Public ID |
| `/^[0-9a-f]{16,128}$/` | Public token |
| `/^\d{6}$/` | Designer code/passcode |
| `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/` | UUID |

---

## Port Reference

| Service | Local | Production |
|---|---|---|
| Vite Dev | 5173 | - |
| Vite Preview | 4173 | - |
| Supabase API | 54321 | 443 |
| Supabase DB | 54322 | 5432 |
| Supabase Studio | 54323 | - |
| Inbucket | 54324 | - |
| Cloudflare Workers | - | 443 |
| Supabase API | - | 443 |

---

## Keyboard Shortcuts (App)

| Key | Action |
|---|---|
| `Enter` | Submit form / Next stage |
| `Escape` | Close modal / Cancel |
| `Tab` | Next field |
| `Shift+Tab` | Previous field |
| `Ctrl+S` | Save draft |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+P` | Print (print pages) |
| `Ctrl+F` | Search (admin tables) |

---

## Emoji Reference (Status Indicators)

| Emoji | Meaning |
|---|---|
| ✅ | Success / Passed |
| ❌ | Failure / Failed |
| ⚠️ | Warning |
| ℹ️ | Information |
| 🔄 | In Progress |
| ⏳ | Pending |
| 🚫 | Blocked |
| 🔒 | Secured / Private |
| 🔓 | Public / Unlocked |
| 📦 | Package / Bundle |
| 📄 | Document / Page |
| 🖼️ | Image / Media |
| 🔊 | Audio |
| 🔧 | Settings / Config |
| 📊 | Dashboard / Metrics |
| 📈 | Analytics |
| 📉 | Decline |
| 📅 | Date / Schedule |
| ⏰ | Time / Timeout |
| 💰 | Financial / Price |
| 💵 | Money / Currency |
| 💎 | Premium / Featured |
| ⭐ | Favorite / Starred |
| 🏷️ | Tag / Label |
| 🏠 | Home / Root |
| 🚀 | Deploy / Launch |
| 🧪 | Test |
| 🐛 | Bug |
| 🛡️ | Security |
| 🔐 | Auth / Encryption |
| 🔑 | Key / Secret |
| 📝 | Notes / Draft |
| ✏️ | Edit |
| 🗑️ | Delete |
| ♻️ | Recycle / Restore |
| 📥 | Import / Download |
| 📤 | Export / Upload |
| 🔄 | Sync / Refresh |
| ➡️ | Next / Forward |
| ⬅️ | Previous / Back |
| 🔍 | Search |
| 🏷️ | Tag |
| 📋 | Checklist |
| ✔️ | Done |
| ❌ | Cancel / Error |
| ⏸️ | Pause |
| ▶️ | Play / Start |
| ⏹️ | Stop |
| ⏭️ | Skip |
| ⏮️ | Previous |
| 🔀 | Shuffle |
| 🔁 | Repeat |
| 🎲 | Random |
| 🎯 | Target / Goal |
| 🏁 | Finish |
| 🎉 | Celebration |
| 💡 | Idea / Tip |
| ❓ | Question |
| ❗ | Important / Alert |
| 🛑 | Stop / Critical |
| 📌 | Pin |
| 📎 | Attachment |
| 🔗 | Link |
| 🌐 | Global / Web |
| 📱 | Mobile |
| 💻 | Desktop |
| ☁️ | Cloud |
| 🗄️ | Database |
| ⚙️ | Settings / Gear |
| 🛠️ | Tools |
| 📦 | Package |
| 📦 | Bundle |
| 📦 | Module |
| 📦 | Component |

---

## File Size Reference

| Size | Description |
|---|---|
| `< 1 KB` | Tiny |
| `1-10 KB` | Small |
| `10-100 KB` | Medium |
| `100 KB - 1 MB` | Large |
| `> 1 MB` | Very Large |

---

## Time Formats

| Format | Example | Use Case |
|---|---|---|
| ISO 8601 | `2026-10-28T10:30:00Z` | API, database |
| Display | `14 September 2026 - 17:30` | UI display |
| Relative | `2 hours ago` | Recent activity |
| Duration | `2h 30m` | Processing time |

---

## Currency Codes

| Code | Currency | Symbol |
|---|---|---|
| `EGP` | Egyptian Pound | EGP |
| `USD` | US Dollar | $ |
| `EUR` | Euro | € |
| `GBP` | British Pound | £ |

---

## Language Codes

| Code | Language | Direction |
|---|---|---|
| `en` | English | LTR |
| `ar` | Arabic | RTL |

---

## Country Codes (ISO 3166-1 alpha-2)

| Code | Country |
|---|---|
| `EG` | Egypt |
| `SA` | Saudi Arabia |
| `AE` | UAE |
| `US` | United States |
| `GB` | United Kingdom |
| `DE` | Germany |
| `FR` | France |

---

## Wrapper Keys

| Key | Label (EN) | Label (AR) | Kind |
|---|---|---|---|
| `digital` | Digital only | رقمي فقط | digital |
| `open_letter` | Open letter | خطاب مفتوح | physical |
| `sealed_letter` | Sealed letter | خطاب مختوم | physical |
| `open_card` | Open card | بطاقة مفتوحة | physical |

---

## Milestone Order

```javascript
export const OPERATIONS_STATUS_ORDER = [
  'pending',
  'sold',
  'manufactured',
  'shipped',
  'delivered'
]
```

---

## Stage Order (Designer Flow)

```javascript
export const STAGE_SEQUENCE = [
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
]
```

---

## Permission IDs

```
operations.view
operations.view_details
operations.create
operations.edit
operations.manage
operations.assign
operations.mark_manufactured
operations.mark_shipped
operations.mark_delivered
operations.print
operations.export

designers.view
designers.view_details
designers.create
designers.edit
designers.assign
designers.manage
designers.reset_passcode
designers.revoke
designers.activate

financial.view
financial.view_revenue
financial.view_costs
financial.view_profit
financial.view_customer_payables
financial.view_payments
financial.manage
financial.export

qa.view

messages.view
messages.send
messages.manage
```

---

## Template Stages

```
memorial-message v1 stages:
1. DesignerAccessStage
2. TemplateSelectionStage
3. WrapperSelectionStage
4. ReceiverStage
5. PoliciesStage
6. ProjectsBook
7. ProjectSheet
8. ReviewStage
9. SubmittedStage
10. ReservedStage
11. UnwrittenStage
```

---

## Error Codes

| Code | HTTP | Meaning |
|---|---|---|
| `worker.unauthenticated` | 401 | No valid worker session |
| `worker.forbidden` | 403 | Missing permission |
| `worker.inactive_or_unknown` | 401 | Worker not found/inactive |
| `operations.units_out_of_range` | 422 | Units < 1 or > 20 |
| `operations.selection_too_large` | 422 | > 200 units for print |
| `operations.not_physical` | 400 | Digital wrapper |
| `operations.not_found` | 404 | Unit not found |
| `dearune.not_found` | 404 | Project not found |
| `dearune.archived` | 409 | Project archived |
| `dearune.not_sold` | 409 | Not paid |
| `dearune.not_manufactured` | 409 | Not manufactured |
| `dearune.not_shipped` | 409 | Not shipped |
| `dearune.digital` | 409 | Digital wrapper |
| `qa.invalid_public_id` | 400 | Invalid public ID format |
| `qa.invalid_token` | 400 | Invalid token format |
| `qa.not_found` | 404 | No matching project |
| `qa.token_mismatch` | 400 | Token mismatch |
| `financial.maintenance_required` | 55000 | Maintenance mode |
| `financial.sale_not_found` | P0002 | Sale not found |
| `financial.sale_already_voided` | 55000 | Already voided |
| `financial.reason_required` | 22023 | Void reason required |
| `financial.reason_too_long` | 22001 | Reason too long |
| `financial.production_started` | 55000 | Can't void after manufacturing |

---

## HTTP Status Codes

| Code | Meaning |
|---|---|
| 200 | OK |
| 201 | Created |
| 204 | No Content |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict |
| 422 | Unprocessable Entity |
| 429 | Too Many Requests |
| 500 | Internal Server Error |
| 502 | Bad Gateway |
| 503 | Service Unavailable |

---

## MIME Types

| Extension | MIME Type |
|---|---|
| `.webp` | `image/webp` |
| `.jpg` | `image/jpeg` |
| `.png` | `image/png` |
| `.gif` | `image/gif` |
| `.mp3` | `audio/mpeg` |
| `.wav` | `audio/wav` |
| `.ogg` | `audio/ogg` |
| `.webm` | `audio/webm` |
| `.m4a` | `audio/mp4` |
| `.pdf` | `application/pdf` |
| `.xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| `.json` | `application/json` |
| `.js` | `application/javascript` |
| `.wasm` | `application/wasm` |

---

## Magic Bytes (File Type Detection)

| Format | Bytes | MIME |
|---|---|---|
| JPEG | `FF D8 FF` | `image/jpeg` |
| PNG | `89 50 4E 47` | `image/png` |
| GIF | `47 49 46 38` | `image/gif` |
| WebP | `52 49 46 46 ... 57 45 42 50` | `image/webp` |
| WAV | `52 49 46 46 ... 57 41 56 45` | `audio/wav` |
| OGG | `4F 67 67 53` | `audio/ogg` |
| MP3 | `ID3` or `FF FB` | `audio/mpeg` |
| WebM | `1A 45 DF A3` | `audio/webm` |
| M4A/MP4 | `ftyp` at offset 4 | `audio/mp4` |

---

## Mathematical Constants

| Constant | Value | Use |
|---|---|---|
| `PI` | 3.14159... | Geometry |
| `GOLDEN_RATIO` | 1.618... | Layout |
| `ASPECT_RATIO_A4` | 1.4142... | Print |
| `ASPECT_RATIO_3_4` | 0.75 | Template |
| `ASPECT_RATIO_4_3` | 1.333... | Template |

---

## Color Reference (OKLCH)

| Token | Light | Dark | Description |
|---|---|---|---|
| `--color-ink` | `oklch(0.2039 0.1529 0.0902)` | Same | Warm antique brown |
| `--color-brand` | `oklch(0.2039 0.1529 0.0902)` | Same | Brand color |
| `--color-strip` | `oklch(0 0 0)` | Same | Pure black |
| `--color-fields` | `oklch(0 0 0)` | Same | Pure black |
| `--color-note` | `oklch(1 0 0)` | Same | Pure red |
| `--color-order-id` | `oklch(0 0 0)` | Same | Pure black |
| `--color-accent-id` | `oklch(0 0.0118 1)` | Same | Blue |
| `--color-qr-bg` | `oklch(1 1 1)` | Same | White |

---

## Regex Quick Reference

```javascript
// Physical ID
/^DR\d{11}$/

// Public ID
/^[0-9a-f]{16,64}$/

// Public Token
/^[0-9a-f]{16,128}$/

// Designer Code/Passcode
/^\d{6}$/

// UUID
/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Email
/^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Date (YYYY-MM-DD)
/^\d{4}-\d{2}-\d{2}$/

// Egyptian Phone
/^01[0-9]{9}$/
```

---

## Useful Commands Quick Reference

```bash
# Development
npm run dev                    # Start dev server
npm run build                  # Production build
npm run preview                # Preview production build
npm run lint                   # Lint with oxlint
npm run test                   # Run unit tests
npm run test -- --watch        # Watch mode
npm run test -- --coverage     # Coverage report

# Database
supabase start                 # Start local stack
supabase db reset              # Reset + apply migrations
supabase db push               # Push migrations to prod
supabase migration new name    # Create new migration
supabase db dump -f backup.sql # Backup

# Edge Functions
supabase functions serve       # Local dev
supabase functions deploy      # Deploy to prod
supabase functions logs fn     # View logs

# Deployment
npx wrangler deploy            # Deploy to Cloudflare
npm run build && npx wrangler deploy  # Full deploy

# PWA
npm run icons                  # Generate icons
npm run app-assets             # Generate PWA manifests + SWs

# Testing
npm run test                   # Unit tests
node e2e/admin-mobile.mjs      # Mobile viewport test
node e2e/qa-scanner.mjs        # QA scanner test
```

---

> **Tip**: Bookmark this glossary for quick reference during development!