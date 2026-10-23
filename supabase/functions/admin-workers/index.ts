import { corsHeaders, errorResponse, handleOptions, jsonResponse, readJson } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
import { randomSecret, requireAdmin } from '../_shared/auth.ts'

// Admin management of Worker Dashboard sign-ins.
//
// A worker is a Supabase Auth user plus a `public.workers` row. Creating,
// changing, suspending and re-credentialing that account needs the service
// role, so every action lives here and every action begins with
// `requireAdmin` (the trusted `admin_users` identity).
//
// Nothing in this file is reachable by a worker: `requireAdmin` returns null
// for a non-admin, and the browser never receives the service-role key. A
// worker can never grant themselves a permission because there is no
// client-writable permission table and no worker-callable account endpoint.
//
// Passwords are generated server-side, returned ONCE, and never stored in
// Postgres, the audit log or this function's memory after the response. The
// studio has no outbound email configured, so this is an explicit hand-off
// credential rather than a claimed invitation email.

type Row = Record<string, unknown>

function asText(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function asEmail(value: unknown): string {
  const email = asText(value, 320).toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ''
}

function asStatus(value: unknown): 'active' | 'inactive' | 'suspended' | '' {
  return value === 'active' || value === 'inactive' || value === 'suspended' ? value : ''
}

function asPermissionIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => asText(item, 80)).filter(Boolean))].sort()
}

async function audit(
  sb: ReturnType<typeof adminClient>,
  actorId: string,
  action: string,
  targetId: string,
  metadata: Row = {},
) {
  await sb.from('admin_audit_log').insert({
    actor_id: actorId,
    actor_type: 'admin',
    action,
    target_type: 'worker',
    target_id: targetId,
    metadata,
  })
}

async function validPermissions(sb: ReturnType<typeof adminClient>, ids: string[]): Promise<string[] | null> {
  if (ids.length === 0) return []
  const { data, error } = await sb.from('permissions').select('id').in('id', ids)
  if (error) return null
  const found = new Set((data ?? []).map((row) => String((row as Row).id)))
  if (ids.some((id) => !found.has(id))) return null
  return ids
}

async function loadWorker(sb: ReturnType<typeof adminClient>, workerId: string) {
  const { data: worker, error } = await sb.from('workers').select('*').eq('id', workerId).maybeSingle()
  if (error || !worker) return null
  const { data: permissionRows } = await sb
    .from('worker_permissions')
    .select('permission_id, granted_at')
    .eq('worker_id', workerId)
  return {
    ...(worker as Row),
    permissions: (permissionRows ?? []).map((row) => String((row as Row).permission_id)).sort(),
  }
}

function workerJson(worker: Row) {
  return {
    id: String(worker.id),
    email: String(worker.email ?? ''),
    displayName: String(worker.display_name ?? ''),
    status: String(worker.status ?? 'inactive'),
    statusReason: worker.status_reason ?? null,
    lastSignInAt: worker.last_sign_in_at ?? null,
    createdAt: worker.created_at ?? null,
    updatedAt: worker.updated_at ?? null,
    permissions: Array.isArray(worker.permissions) ? worker.permissions : [],
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const admin = await requireAdmin(req)
  if (!admin) return errorResponse('Unauthorized', 401)

  const body = await readJson(req)
  const action = asText(body.action, 40)
  const sb = adminClient()

  // -- list -----------------------------------------------------------------
  if (action === 'list') {
    const { data: workers, error } = await sb
      .from('workers')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) return errorResponse('Could not read the worker directory', 500)

    const ids = (workers ?? []).map((row) => String((row as Row).id))
    const [{ data: permissionRows }, { data: messageRows }] = await Promise.all([
      ids.length
        ? sb.from('worker_permissions').select('worker_id, permission_id').in('worker_id', ids)
        : Promise.resolve({ data: [] }),
      ids.length
        ? sb.from('worker_messages').select('worker_id, sender_type, read_at').in('worker_id', ids)
        : Promise.resolve({ data: [] }),
    ])

    const permissions = new Map<string, string[]>()
    for (const row of permissionRows ?? []) {
      const workerId = String((row as Row).worker_id)
      const list = permissions.get(workerId) ?? []
      list.push(String((row as Row).permission_id))
      permissions.set(workerId, list)
    }

    const unread = new Map<string, { fromWorker: number; fromAdmin: number }>()
    for (const row of messageRows ?? []) {
      const workerId = String((row as Row).worker_id)
      const current = unread.get(workerId) ?? { fromWorker: 0, fromAdmin: 0 }
      if (row.read_at === null || row.read_at === undefined) {
        if (row.sender_type === 'worker') current.fromWorker += 1
        if (row.sender_type === 'admin') current.fromAdmin += 1
      }
      unread.set(workerId, current)
    }

    return jsonResponse({
      workers: (workers ?? []).map((row) => {
        const worker = row as Row
        const counts = unread.get(String(worker.id)) ?? { fromWorker: 0, fromAdmin: 0 }
        return {
          ...workerJson({ ...worker, permissions: (permissions.get(String(worker.id)) ?? []).sort() }),
          unreadFromWorker: counts.fromWorker,
          unreadForWorker: counts.fromAdmin,
        }
      }),
    })
  }

  // -- get (profile + permission history) -----------------------------------
  if (action === 'get') {
    const workerId = asText(body.workerId, 64)
    if (!workerId) return errorResponse('Missing worker id', 400)
    const worker = await loadWorker(sb, workerId)
    if (!worker) return errorResponse('Worker not found', 404)

    const { data: history } = await sb
      .from('admin_audit_log')
      .select('id, actor_id, actor_type, action, target_type, target_id, metadata, created_at')
      .eq('target_type', 'worker')
      .eq('target_id', workerId)
      .order('created_at', { ascending: false })
      .limit(100)

    return jsonResponse({ worker: workerJson(worker), history: history ?? [] })
  }

  // -- create ---------------------------------------------------------------
  if (action === 'create') {
    const displayName = asText(body.displayName, 120)
    const email = asEmail(body.email)
    if (!displayName) return errorResponse('Please provide a worker name', 400)
    if (!email) return errorResponse('Please provide a valid email address', 400)

    const requested = asPermissionIds(body.permissions)
    const permissions = await validPermissions(sb, requested)
    if (permissions === null) return errorResponse('One or more permissions are not recognised', 400)

    const { data: existingWorker } = await sb
      .from('workers')
      .select('id')
      .ilike('email', email)
      .maybeSingle()
    if (existingWorker) return errorResponse('A worker with that email already exists', 409)

    const password = randomSecret(160)
    const { data: created, error: authError } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName, dearune_role: 'worker' },
    })
    if (authError || !created.user) {
      return errorResponse('That email already has an account, or could not be created', 409)
    }

    const workerId = created.user.id
    const { error: workerError } = await sb.from('workers').insert({
      id: workerId,
      email,
      display_name: displayName,
      status: 'active',
      created_by: admin.id,
    })
    if (workerError) {
      await sb.auth.admin.deleteUser(workerId).catch(() => {})
      return errorResponse('Could not create the worker record', 500)
    }

    if (permissions.length > 0) {
      const { error: permissionError } = await sb.from('worker_permissions').insert(
        permissions.map((permissionId) => ({
          worker_id: workerId,
          permission_id: permissionId,
          granted_by: admin.id,
        })),
      )
      if (permissionError) {
        await sb.from('workers').delete().eq('id', workerId)
        await sb.auth.admin.deleteUser(workerId).catch(() => {})
        return errorResponse('Could not set the worker permissions', 500)
      }
    }

    await audit(sb, admin.id, 'worker.created', workerId, {
      email,
      display_name: displayName,
      permissions,
    })

    const worker = await loadWorker(sb, workerId)
    return jsonResponse({ worker: worker ? workerJson(worker) : null, password }, 201)
  }

  const workerId = asText(body.workerId, 64)
  if (!workerId) return errorResponse('Missing worker id', 400)
  const existing = await loadWorker(sb, workerId)
  if (!existing) return errorResponse('Worker not found', 404)

  // -- update-details -------------------------------------------------------
  if (action === 'update-details') {
    const displayName = asText(body.displayName, 120)
    const email = asEmail(body.email)
    if (!displayName) return errorResponse('Please provide a worker name', 400)
    if (!email) return errorResponse('Please provide a valid email address', 400)

    const previousEmail = String(existing.email ?? '')
    if (email !== previousEmail) {
      const { data: clash } = await sb.from('workers').select('id').ilike('email', email).neq('id', workerId).maybeSingle()
      if (clash) return errorResponse('Another worker already uses that email', 409)
      const { error: authError } = await sb.auth.admin.updateUserById(workerId, {
        email,
        email_confirm: true,
        user_metadata: { display_name: displayName, dearune_role: 'worker' },
      })
      if (authError) return errorResponse('That email already has an account, or could not be changed', 409)
    } else {
      await sb.auth.admin.updateUserById(workerId, {
        user_metadata: { display_name: displayName, dearune_role: 'worker' },
      }).catch(() => {})
    }

    const { error } = await sb
      .from('workers')
      .update({ display_name: displayName, email })
      .eq('id', workerId)
    if (error) return errorResponse('Could not save the worker details', 500)

    await audit(sb, admin.id, 'worker.updated', workerId, {
      display_name: displayName,
      email_changed: email !== previousEmail,
    })
    const worker = await loadWorker(sb, workerId)
    return jsonResponse({ worker: worker ? workerJson(worker) : null })
  }

  // -- set-status -----------------------------------------------------------
  if (action === 'set-status') {
    const status = asStatus(body.status)
    if (!status) return errorResponse('Choose active, inactive or suspended', 400)
    const reason = asText(body.reason, 300)
    if (status !== 'active' && !reason) {
      return errorResponse('A short reason is required when deactivating or suspending', 400)
    }

    const { error } = await sb
      .from('workers')
      .update({
        status,
        status_reason: status === 'active' ? null : reason || null,
      })
      .eq('id', workerId)
    if (error) return errorResponse('Could not change the worker status', 500)

    // Belt and braces: block future sign-ins at the Auth service. Every
    // protected SQL/RPC call also re-checks `workers.status`, so an access
    // token that is already in someone's browser still cannot read anything.
    try {
      await sb.auth.admin.updateUserById(workerId, {
        ban_duration: status === 'active' ? 'none' : '876000h',
      })
    } catch {
      // The database status remains the authority; this is extra defence.
    }

    await audit(sb, admin.id, 'worker.status_changed', workerId, {
      from: String(existing.status ?? ''),
      to: status,
      reason: status === 'active' ? null : reason,
    })
    const worker = await loadWorker(sb, workerId)
    return jsonResponse({ worker: worker ? workerJson(worker) : null })
  }

  // -- set-permissions ------------------------------------------------------
  if (action === 'set-permissions') {
    const permissions = await validPermissions(sb, asPermissionIds(body.permissions))
    if (permissions === null) return errorResponse('One or more permissions are not recognised', 400)

    const current = new Set<string>(
      Array.isArray(existing.permissions) ? (existing.permissions as string[]) : [],
    )
    const next = new Set(permissions)
    const granted = permissions.filter((id) => !current.has(id))
    const revoked = [...current].filter((id) => !next.has(id))

    if (granted.length > 0) {
      const { error } = await sb.from('worker_permissions').insert(
        granted.map((permissionId) => ({
          worker_id: workerId,
          permission_id: permissionId,
          granted_by: admin.id,
        })),
      )
      if (error) return errorResponse('Could not grant those permissions', 500)
    }
    if (revoked.length > 0) {
      const { error } = await sb
        .from('worker_permissions')
        .delete()
        .eq('worker_id', workerId)
        .in('permission_id', revoked)
      if (error) return errorResponse('Could not revoke those permissions', 500)
    }

    await audit(sb, admin.id, 'worker.permissions_changed', workerId, { granted, revoked })
    const worker = await loadWorker(sb, workerId)
    return jsonResponse({ worker: worker ? workerJson(worker) : null, granted, revoked })
  }

  // -- reset-password -------------------------------------------------------
  if (action === 'reset-password') {
    const password = randomSecret(160)
    const { error } = await sb.auth.admin.updateUserById(workerId, { password })
    if (error) return errorResponse('Could not reset the password', 500)
    await audit(sb, admin.id, 'worker.password_reset', workerId)
    return jsonResponse({ password })
  }

  // -- hard deletion is deliberately not supported --------------------------
  if (action === 'delete') {
    return errorResponse(
      'Worker accounts are deactivated, not deleted, so message and audit history stays intact',
      400,
    )
  }

  return errorResponse('Unknown action', 400)
})

export const cors = corsHeaders
