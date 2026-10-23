import { supabase } from '@/lib/supabase'

/**
 * Call a worker RPC.
 *
 * The functions behind these names are `security definer` and check the live
 * session and permission themselves. This helper only turns a PostgREST error
 * into a normal Error so screens can show a useful message. It never adds a
 * role, permission or actor to the request: the database derives those from
 * the access token.
 */
export async function workerRpc(name, args = {}) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.rpc(name, args)
  if (error) {
    const failure = new Error(error.message || 'The request was refused')
    failure.code = error.code
    failure.details = error.details
    failure.hint = error.hint
    throw failure
  }
  return data
}
