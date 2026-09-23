import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { requireEnv } from './env.ts'

let cached: SupabaseClient | null = null

function secretKey(): string {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (raw) {
    try {
      const keys = JSON.parse(raw) as Record<string, unknown>
      if (typeof keys['default'] === 'string' && keys['default']) return keys['default']
    } catch {
      // fall through to the legacy variable
    }
  }
  return requireEnv('SUPABASE_SERVICE_ROLE_KEY')
}

export function adminClient(): SupabaseClient {
  if (!cached) {
    cached = createClient(requireEnv('SUPABASE_URL'), secretKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return cached
}