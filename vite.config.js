import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const srcDir = fileURLToPath(new URL('./src', import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const supabaseUrl = env.VITE_SUPABASE_URL
  return {
    plugins: [react(), tailwindcss()],
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