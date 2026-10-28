# Project Overview

## What is Dearune?

**Dearune** is a bespoke physical-and-digital correspondence studio platform operating in Egypt (EGP primary currency, Bosta courier integration, bilingual English/Arabic support). It serves four distinct personas across four runtime surfaces inside a single React SPA:

1. **Public Visitors & Recipients** (`/` and `/message/:publicId`): A marketing landing page with an editorial antique-paper aesthetic and a QR-code recipient reader that unlocks a keepsake letter, three mounted photographs, and an optional voice note once the physical item arrives (or immediately upon activation for digital items).

2. **Designers** (`/create`): A custom 3D page-turning book pipeline (`CreateBook.jsx` + `bookMachine.js`) where external or studio designers authenticate with a 6-digit Designer ID and 6-digit one-time passcode (`designer-login` custom HS256 JWT), compose letters using versioned templates (`memorial-message` v1), crop photos (`react-easy-crop`), attach audio, encrypt local drafts in `localStorage` + `IndexedDB` (AES-GCM via Web Crypto), and hand over configured Dearunes to the studio (`designer-projects`).

3. **Studio Administrators** (`/admin/*`): A full-featured back-office dashboard authenticated via Supabase Auth (`admin_users` table) covering Overview KPIs, Operations (physical unit tracking, A4 QR production paper PDF generation via `pdf-lib`, Bosta `.xlsx` manifest export via `exceljs`), Designers & Dearune lifecycle management (`admin-dearunes`), Templates & Wrappers catalog merchandising, Immutable Sales Ledger (`sold_orders`), Financial reporting, QA QR Scanner (`jsqr` + `BarcodeDetector`), Worker user/permission management (`admin-workers`), and Worker-Admin private Inbox (`worker_messages`).

3. **Workshop Workers** (`/worker/*`): A permission-gated royal-blue dashboard (`workers` + `worker_permissions` tables, enforced by 24 `SECURITY DEFINER` PostgreSQL RPCs) providing scoped access to Operations, Designers, QA, Financial categories, and private Admin messaging, plus three standalone installable PWAs (`/admin/qa`, `/admin/operations`, `/create`).

## Application Stack

- **Frontend**: React 19.2 + Vite 8 + Tailwind CSS 4 + Shadcn/Radix UI
- **Backend**: Supabase (PostgreSQL 17, Auth, Storage, Realtime, 16 Deno Edge Functions, 29 SQL Migrations)
- **Deployment**: Cloudflare Workers Static Assets (`wrangler.jsonc`)
- **Courier**: Bosta (Egypt) integration

## Key Architectural Decisions

1. **Single SPA, Four Personas** - Route-based access control via React Router
2. **Immutable Sales Ledger** - `sold_orders` table with void-and-replace semantics
3. **Fine-grained Worker Permissions** - 24 granular permissions enforced by PostgreSQL RPCs
4. **Template Versioning** - Templates are versioned; messages lock to template version at submission
5. **Milestone-based Operations** - Replaced generic status with explicit timestamps (`sold_at`, `manufacturing_completed_at`, `shipped_at`, `delivered_at`)
6. **Client-side Draft Encryption** - AES-GCM via Web Crypto, keys derived from per-designer secrets
7. **Three Scoped PWAs** - Separate manifests/service workers for QA, Operations, Designer apps