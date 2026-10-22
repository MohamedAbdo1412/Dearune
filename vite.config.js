import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

const srcDir = fileURLToPath(new URL('./src', import.meta.url))

// The Dearune brand colours, taken from the site's own tokens
// (src/styles/landing.css) so the installed app matches the printed logo in
// production/logo.png: warm paper, printer's ink.
const DEARUNE_PAPER = '#fbf4e4'
const DEARUNE_INK = '#32281e'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const supabaseUrl = env.VITE_SUPABASE_URL
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // The Dearune app is a shell around the same site. A new deployment is
        // picked up on the next navigation (the shell is always fetched from
        // the network), so the service worker never needs to interrupt a
        // letter that is being written.
        registerType: 'prompt',
        manifest: {
          id: '/',
          name: 'Dearune',
          short_name: 'Dearune',
          description:
            'Some words are meant to last. Dearune sets chosen words on aged paper — a letter written for one person, sealed, and opened by them alone.',
          lang: 'en',
          dir: 'ltr',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          background_color: DEARUNE_PAPER,
          theme_color: DEARUNE_INK,
          categories: ['lifestyle', 'productivity'],
          icons: [
            { src: '/icons/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            {
              src: '/icons/pwa-maskable-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: '/icons/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // Only the app's own static files are pre-cached. The HTML shell is
          // deliberately left out: it is fetched from the network on every
          // navigation so a new release is never held back by a cached page.
          globPatterns: [
            '**/*.{js,css,woff,woff2,ttf,otf,png,jpg,jpeg,svg,webp,gif,ico}',
          ],
          globIgnores: [
            '**/*.html',
            '**/*.xlsx',
            // Two 12-14 MB print textures and the courier workbook: far too
            // large to pre-cache, and only the operations desk ever needs them.
            '**/paper-texture*.png',
            '**/Bosta*.xlsx',
            // Heavy admin-only chunks, fetched on demand.
            '**/exceljs.min-*.js',
            '**/OperationsPrint-*.js',
          ],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          cleanupOutdatedCaches: true,
          skipWaiting: false,
          clientsClaim: false,
          navigateFallback: null,
          runtimeCaching: [
            {
              // The app shell. Network first, so a new deployment is always
              // the one being served; the cache is only a fallback for the
              // offline case. It holds the public shell and nothing else.
              urlPattern: ({ request }) => request.mode === 'navigate',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'dearune-pages',
                networkTimeoutSeconds: 3,
                cacheableResponse: { statuses: [200] },
                expiration: { maxEntries: 8, maxAgeSeconds: 24 * 60 * 60 },
              },
            },
            {
              // The studio's own API is never cached.
              urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
              handler: 'NetworkOnly',
            },
            {
              // Supabase carries the session, the private letters and the edge
              // functions. It is a different origin and is never cached.
              urlPattern: ({ url }) =>
                url.hostname.endsWith('.supabase.co') || url.pathname.startsWith('/functions/v1/'),
              handler: 'NetworkOnly',
            },
          ],
        },
      }),
    ],
    // The Bosta upload workbook is a real asset handed to the courier as-is;
    // without this Vite tries to parse its bytes as JavaScript.
    assetsInclude: ['**/*.xlsx'],
    resolve: {
      alias: {
        '@': srcDir,
      },
    },
    server: supabaseUrl
      ? {
          proxy: {
            // Dev-only: let the browser reach edge functions through the dev
            // server (same-origin), so ad/privacy blockers that strip CORS
            // headers from cross-origin supabase.co calls can't break the app
            // locally. ChangeOrigin rewrites the Host header Supabase expects.
            '/functions/v1': { target: supabaseUrl, changeOrigin: true },
          },
        }
      : undefined,
  }
})