import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { requireEnv } from './env.ts'

let cached: SupabaseClient | null = null

export function adminClient(): SupabaseClient {
  if (!cached) {
    cached = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return cached
}