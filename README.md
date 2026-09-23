# Dearune

**Some words are meant to last.**

Dearune is a premium "message that lasts" studio app — a customer buys a
letter/card/gift, a designer writes and publishes the words, and the recipient
opens a QR-protected page that may be a digital message, or the trigger that
"activates" a physical object once it arrives.

- **Public** — polished landing page (`/`) and the recipient's message page
  (`/message/:publicId`), readable only with the QR token.
- **Designer studio** — sign in with a 6-digit code + passcode, write and
  publish messages, attach media (photos, voice notes, files stored in Google
  Drive), and produce the print-ready A4 insert PDF with the protected QR.
- **Admin dashboard** — sign in with a Supabase account listed in
  `admin_users`; record sales, track the full production pipeline
  (deposit → manufactured → shipped → arrived), generate the shipping label
  and receipt PDFs, maintain designers and templates, export a shipping CSV,
  and pause the whole studio with a maintenance switch.

---

## Stack

| Layer      | Choice                                                        |
| ---------- | ------------------------------------------------------------- |
| Frontend   | React 19 + Vite 8 + Tailwind v4 + shadcn/ui on **Radix**      |
| Backend    | Supabase (Postgres) + RLS, Edge Functions (Deno)              |
| Storage    | Google Drive (media + print files), resumable OAuth + signed GETs |
| Auth       | Admin: Supabase session · Designer: HS256 JWT (jose)          |
| PDFs/QR    | pdf-lib + qrcode (client-side)                                |
| Tests      | Vitest (unit + PDF/QR smoke) · oxlint                          |

There is no custom HTTP server: the app talks to Supabase (REST + the
`get_public_message` RPC) and to a set of Edge Functions under
`supabase/functions/`. Everything under `src/` is plain `.js`/`.jsx`.

---

## Setup

### 1. Prerequisites

- Node 20+ and the Supabase CLI.
- A Supabase project.
- A Google Cloud project with the Drive API enabled, an OAuth 2.0 Client ID /
  secret + refresh token, and a shared Drive folder for media.

### 2. Environment

```sh
cp .env.example .env
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
```

`VITE_PUBLIC_SITE_URL` sets the origin baked into printed QR links when the
site origin may differ from the visitor's (leave empty to use
`window.location.origin`).

### 3. Database

Apply the migrations in order from `supabase/migrations/`:

```bash
supabase link --project-ref YOUR_PROJECT
supabase db push
```

Migrations create the schema, the RLS policies, the helper SQL functions,
and seed **3 templates with 4 wrapper types each** plus the `app_settings` row.

Create your first administrator. In the Supabase dashboard (SQL editor):

```sql
-- 1. create the user in Supabase Auth (via dashboard, or a user invite)

-- 2. link that auth.uid to an admin:
insert into public.admin_users (id, email, display_name)
values ('REPLACE_WITH_AUTH_USER_ID', 'you@example.com', 'You');
```

### 4. Edge functions and secrets

```bash
supabase functions deploy
supabase secrets set \
  SUPABASE_URL="$VITE_SUPABASE_URL" \
  SUPABASE_SERVICE_ROLE_KEY=... \
  SUPABASE_JWT_SECRET=... \
  GOOGLE_CLIENT_ID=... \
  GOOGLE_CLIENT_SECRET=... \
  GOOGLE_REFRESH_TOKEN=... \
  GOOGLE_DRIVE_MEDIA_FOLDER_ID=...
```

`GOOGLE_DRIVE_MEDIA_FOLDER_ID` is the Drive folder where `MessageMedia/` and
`ShippingLabels/` trees are created. Media uploads go through a resumable
upload session obtainable only by admins or designers; reads use short-lived
signed GETs.

### 5. Run

```sh
npm install
npm run dev       # Vite on :5173
```

### 6. Quality gates

```sh
npm run lint    # oxlint
npm test        # vitest run
npm run build   # production build
```

---

## Flow in production

1. **Sale** — admin records an order (template + wrapper, optional designer).
   The price is snapshotted and a `DL…` public id is generated.
2. **Write** — the assigned designer signs in, drafts the message, attaches
   media (uploaded to Drive), and publishes. Publishing locks the words,
   rotates the access token, and produces the A4 insert PDF with a QR that
   points at the token-protected URL. Only the token hash is stored.
3. **Production** — for physical wrappers the admin advances the order
   (paid → manufactured → shipped → arrived) and generates the shipping label
   + receipt PDFs. Irreversible steps are blocked while *maintenance mode* is on.
4. **Reveal** — for digital messages the page goes live immediately on
   publish. For physical items it goes live when the order arrives. The
   recipient opens `/message/:publicId?token=…`, scans the QR, or clicks the
   link; each token matches the stored hash before anything is returned.

## Republishing / reprints

Publishing again issues a fresh token (the old link is retired), which is how
a physical reprint keeps the existing QR/paper valid after the original piece
was already scanned.

## Notes

- The designer token lives in `localStorage` (`dearune.designer.token`).
- Media limits are enforced both client- and server-side: image 20 MB,
  audio 60 MB, video 400 MB, other files 50 MB.
- Maintenance mode (`app_settings.maintenance_mode`) blocks: new sales,
  publishing, production stamps, cancellations, archiving, and price edits.