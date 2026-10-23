import bcrypt from 'npm:bcryptjs@^3.0.2'
import { corsHeaders, errorResponse, handleOptions, jsonResponse, readJson } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
import { randomNumericCode, requireWorker, type WorkerContext } from '../_shared/auth.ts'

// Worker-side designer management.
//
// The heavy parts (bcrypt, passcode rotation, unique sign-in IDs) already live
// in `admin-designers`. This function exposes the same capabilities to a
// worker who holds the relevant `designers.*` permission, and writes an audit
// row for every change. It never accepts a caller-supplied actor: the worker
// comes from the verified session.
//
// `designers.created_by` references `admin_users`, so a worker-created
// designer leaves it null. The audit row records the real worker actor.

type Row = Record<string, unknown>

function asText(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

async function uniqueCode(sb: ReturnType<typeof adminClient>): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomNumericCode(6)
    const { data } = await sb.from('designers').select('id').eq('code', code).maybeSingle()
    if (!data) return code
  }
  throw new Error('Could not allocate a designer code')
}

async function audit(
  sb: ReturnType<typeof adminClient>,
  worker: WorkerContext,
  action: string,
  designerId: string,
  metadata: Row = {},
) {
  await sb.from('admin_audit_log').insert({
    actor_id: worker.id,
    actor_type: 'worker',
    action,
    target_type: 'designer',
    target_id: designerId,
    metadata,
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const body = await readJson(req)
  const action = asText(body.action, 40)
  const sb = adminClient()

  const permission =
    action === 'create'
      ? 'designers.create'
      : action === 'update'
        ? 'designers.edit'
        : action === 'reset-passcode' || action === 'revoke' || action === 'activate'
          ? 'designers.manage'
          : ''

  if (!permission) return errorResponse('Unknown action', 400)

  // Live lookup: inactive/suspended workers and revoked permissions fail here.
  const worker = await requireWorker(req, permission)
  if (!worker) return errorResponse('Forbidden', 403)

  if (action === 'create') {
    const name = asText(body.name, 120)
    if (!name) return errorResponse('Please provide a designer name', 400)

    const passcode = randomNumericCode(6)
    let code: string
    try {
      code = await uniqueCode(sb)
    } catch {
      return errorResponse('Could not allocate a designer ID, please retry', 500)
    }
    const passcodeHash = await bcrypt.hash(passcode, 10)

    const { data: designer, error } = await sb
      .from('designers')
      .insert({ name, code, passcode_hash: passcodeHash, created_by: null })
      .select('id, name, code, created_at')
      .single()
    if (error || !designer) return errorResponse('Could not create the designer', 500)

    await audit(sb, worker, 'worker.designer.created', String((designer as Row).id), {
      name,
      code,
    })
    return jsonResponse({ designer, code, passcode }, 201)
  }

  const designerId = asText(body.designerId, 64)
  if (!designerId) return errorResponse('Missing designer id', 400)
  const { data: existing } = await sb.from('designers').select('id').eq('id', designerId).maybeSingle()
  if (!existing) return errorResponse('Designer not found', 404)

  if (action === 'update') {
    const name = asText(body.name, 120)
    const code = asText(body.code, 40)
    if (!name) return errorResponse('A designer name is required', 400)
    if (!code) return errorResponse('A designer sign-in ID is required', 400)

    const { error } = await sb.from('designers').update({ name, code }).eq('id', designerId)
    if (error) {
      if (error.code === '23505') return errorResponse('That designer ID is already in use', 409)
      return errorResponse('Could not save the designer', 500)
    }
    await audit(sb, worker, 'worker.designer.updated', designerId, { name, code })
    return jsonResponse({ designer: { id: designerId, name, code } })
  }

  if (action === 'reset-passcode') {
    const passcode = randomNumericCode(6)
    const passcodeHash = await bcrypt.hash(passcode, 10)
    const { error } = await sb
      .from('designers')
      .update({ passcode_hash: passcodeHash, revoked_at: null })
      .eq('id', designerId)
    if (error) return errorResponse('Could not reset the passcode', 500)
    await audit(sb, worker, 'worker.designer.passcode_reset', designerId)
    return jsonResponse({ passcode })
  }

  if (action === 'revoke') {
    const { error } = await sb.from('designers').update({ revoked_at: new Date().toISOString() }).eq('id', designerId)
    if (error) return errorResponse('Could not revoke the designer', 500)
    await audit(sb, worker, 'worker.designer.revoked', designerId)
    return jsonResponse({ revoked: true })
  }

  if (action === 'activate') {
    const { error } = await sb.from('designers').update({ revoked_at: null }).eq('id', designerId)
    if (error) return errorResponse('Could not activate the designer', 500)
    await audit(sb, worker, 'worker.designer.activated', designerId)
    return jsonResponse({ revoked: false })
  }

  return errorResponse('Unknown action', 400)
})

export const cors = corsHeaders
