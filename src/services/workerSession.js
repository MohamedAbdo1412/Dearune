import { supabase } from '@/lib/supabase'
import { workerRpc } from '@/services/workerRpc'

/**
 * Resolve the signed-in account and, if it is a worker, its live status and
 * permission ids.
 *
 * `getUser()` validates the session with the Auth service instead of trusting
 * localStorage. The permission rows are read from Postgres on every call, so a
 * returning tab cannot keep an access level that an admin has already revoked.
 * Nothing in the returned object is treated as authority by the server.
 */
export async function fetchWorkerSession() {
  if (!supabase) return { error: new Error('Supabase is not configured') }

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError) return { session: null, error: userError }
    const user = userData?.user
    if (!user) return { session: null, error: null }

    const [adminResult, workerResult, permissionResult] = await Promise.all([
      supabase.from('admin_users').select('id, display_name').eq('id', user.id).maybeSingle(),
      supabase
        .from('workers')
        .select('id, email, display_name, status, status_reason, last_sign_in_at, created_at, updated_at')
        .eq('id', user.id)
        .maybeSingle(),
      supabase.from('worker_permissions').select('permission_id').eq('worker_id', user.id),
    ])

    const readError = adminResult.error ?? workerResult.error ?? permissionResult.error
    if (readError) return { session: null, error: readError }

    const permissions = (permissionResult.data ?? [])
      .map((row) => row.permission_id)
      .filter((id) => typeof id === 'string')
      .sort()

    return {
      session: {
        user,
        isAdmin: Boolean(adminResult.data),
        adminName: adminResult.data?.display_name ?? '',
        worker: workerResult.data ?? null,
        permissions,
        active: workerResult.data?.status === 'active',
      },
      error: null,
    }
  } catch (error) {
    return { session: null, error }
  }
}

/** Honest last-sign-in stamp for the admin directory. Never grants access. */
export async function touchWorkerSession() {
  return workerRpc('worker_touch_session')
}

export async function signOutWorker() {
  if (!supabase) return
  await supabase.auth.signOut()
}
