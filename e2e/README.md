# Browser checks

Playwright scripts that drive the real app in a real browser. They need
`npm run dev` to be free on the ports they pick; each script starts and stops
its own Vite server.

The Supabase backend is **mocked**: every PostgREST call is answered from a
fixture in the script, so the screens render with realistic rows without
touching the live archive. The admin session is faked by seeding
`localStorage` with a session for the `admin_users` row the guard checks.

| script | what it proves |
| --- | --- |
| `admin-mobile.mjs` | No page of the admin dashboard scrolls sideways at 320, 375 or 768 px — including the Operations table, the unit sheet, the hold dialog and the nav drawer. |
| `pwa-install.mjs` | The built site is served the way Cloudflare serves it, and a real browser proves the manifest, the service worker at the site root, the untouched `/api/*`, deep links, and the install action (native prompt, dismissal, and the hand-written steps for a browser that never offers one). Needs `npm run build` first. |
| `pwa-apps.mjs` | The three Dearune apps: each has its own manifest, name, short name, colours, start address and scope; each worker registers for its own section only and the three scopes never overlap; no app's worker stands in front of another app's pages and nothing private reaches a cache; the Apps page offers the three apps with a working install action; and nothing on it scrolls sideways. Needs `npm run build` first. |
| `qa-scanner.mjs` | The QA desk writes nothing; the three identifiers are shown apart and copy correctly; the token is never rendered; every camera failure path says its own thing. |
| `qa-real-qr.mjs` | A genuine Dearune QR (built with the same `qrcode` call and the same content format the printed paper uses) fed to Chromium's file-backed fake camera resolves to the right record — and so does the same QR uploaded as a picture. |
| `admin-shots.mjs` | Regenerates the screenshots in `shots/admin/`. |
| `pipeline.mjs`, `qa-memorial.mjs`, `qa-catalog.mjs`, `seek-seal.mjs`, `probe-login.mjs` | The customer-facing and public visual-QA checks that were already here. |

```sh
node e2e/admin-mobile.mjs
node e2e/qa-scanner.mjs
node e2e/qa-real-qr.mjs
node e2e/pwa-install.mjs
node e2e/pwa-apps.mjs
```

`pwa-install.mjs` and `pwa-apps.mjs` serve the **built** site (`dist/`) the
way Cloudflare does — the same `_headers`, the same single-page-application
fallback — so they need `npm run build` first. The other scripts start their
own Vite server.
