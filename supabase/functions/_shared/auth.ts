import { jwtVerify, SignJWT } from 'npm:jose@^6'
import { adminClient } from './supabase.ts'
import { requireEnv } from './env.ts'

function jwtSecret(): Uint8Array {
  return new TextEncoder().encode(requireEnv('DESIGNER_JWT_SECRET'))
}

function bearerToken(req: Request): string {
  const header = req.headers.get('authorization')
  if (!header) return ''
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match ? match[1] : ''
}

export async function verifyDesignerJwt(token: string): Promise<{ designerId: string; code: string } | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret())
    if (payload.role !== 'designer' || typeof payload.sub !== 'string') return null
    return { designerId: payload.sub, code: String(payload.code ?? '') }
  } catch {
    return null
  }
}

export async function signDesignerJwt(designer: { id: string; code: string }, expiresIn = '48h'): Promise<string> {
  return new SignJWT({ role: 'designer', code: designer.code })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(designer.id)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(jwtSecret())
}

export async function requireDesigner(req: Request): Promise<{ designerId: string; code: string } | null> {
  const token = bearerToken(req)
  if (!token) return null
  const designer = await verifyDesignerJwt(token)
  if (!designer) return null
  const { data: row } = await adminClient().from('designers').select('id, revoked_at').eq('id', designer.designerId).maybeSingle()
  if (!row || row.revoked_at) return null
  return designer
}

/**
 * Resolve the authenticated Supabase user id from the bearer token.
 *
 * supabase-js's getUser() fails inside the edge runtime (the response is not
 * JSON), so callers use a raw fetch against /auth/v1/user with the injected
 * anon key. Every privileged function goes through this exact check.
 */
async function sessionUserId(req: Request): Promise<string | null> {
  const token = bearerToken(req)
  if (!token) return null
  const url = requireEnv('SUPABASE_URL')
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: requireEnv('SUPABASE_ANON_KEY'), authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  let payload: { id?: string } | null
  try {
    payload = (await res.json()) as { id?: string } | null
  } catch {
    return null
  }
  return payload?.id ?? null
}

export async function requireAdmin(req: Request): Promise<{ id: string } | null> {
  const id = await sessionUserId(req)
  if (!id) return null
  const { data: adminRow } = await adminClient().from('admin_users').select('id').eq('id', id).maybeSingle()
  if (!adminRow) return null
  return { id }
}

export type WorkerContext = {
  id: string
  email: string
  displayName: string
  permissions: string[]
}

/**
 * Resolve a worker and (optionally) require one permission.
 *
 * This is deliberately a live lookup: the worker row's status and the
 * permission rows are read on every call, so suspending an account or
 * revoking a permission takes effect immediately. It fails closed (null) for
 * a missing worker, an inactive/suspended account, a missing permission, or
 * any error while reading either table. A worker is never treated as an
 * administrator here; admins use `requireAdmin`.
 */
export async function requireWorker(req: Request, permission?: string): Promise<WorkerContext | null> {
  const id = await sessionUserId(req)
  if (!id) return null

  try {
    const sb = adminClient()
    const { data: worker, error } = await sb
      .from('workers')
      .select('id, email, display_name, status')
      .eq('id', id)
      .maybeSingle()
    if (error || !worker || worker.status !== 'active') return null

    const { data: rows, error: permError } = await sb
      .from('worker_permissions')
      .select('permission_id')
      .eq('worker_id', id)
    if (permError) return null

    const permissions = (rows ?? []).map((row) => String(row.permission_id))
    if (permission && !permissions.includes(permission)) return null

    return {
      id: String(worker.id),
      email: String(worker.email ?? ''),
      displayName: String(worker.display_name ?? ''),
      permissions,
    }
  } catch {
    // Fail closed: an unexpected error is never a reason to grant access.
    return null
  }
}

export async function requireAdminOrDesigner(req: Request): Promise<{ role: 'admin'; adminId: string } | { role: 'designer'; designerId: string; code: string } | null> {
  const token = bearerToken(req)
  if (!token) return null
  const designer = await verifyDesignerJwt(token)
  if (designer) {
    const { data: row } = await adminClient().from('designers').select('id, revoked_at').eq('id', designer.designerId).maybeSingle()
    if (!row || row.revoked_at) return null
    return { role: 'designer', designerId: designer.designerId, code: designer.code }
  }
  const admin = await requireAdmin(req)
  if (admin) return { role: 'admin', adminId: admin.id }
  return null
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function randomSecret(bits = 160): string {
  const bytes = new Uint8Array(bits / 8)
  crypto.getRandomValues(bytes)
  const charset = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  let out = ''
  for (const byte of bytes) out += charset[byte % charset.length]
  return out
}

export function randomNumericCode(length = 6): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const byte of bytes) out += String(byte % 10)
  return out
}