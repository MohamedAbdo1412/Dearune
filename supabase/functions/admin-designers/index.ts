import bcrypt from 'npm:bcryptjs@^3.0.2'
import { corsHeaders, errorResponse, handleOptions, jsonResponse, readJson } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
import { randomNumericCode, requireAdmin } from '../_shared/auth.ts'

async function uniqueCode(): Promise<string> {
  const sb = adminClient()
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomNumericCode(6)
    const { data } = await sb.from('designers').select('id').eq('code', code).maybeSingle()
    if (!data) return code
  }
  throw new Error('Could not allocate a designer code')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const admin = await requireAdmin(req)
  if (!admin) return errorResponse('Unauthorized', 401)

  const body = await readJson(req)
  const action = typeof body.action === 'string' ? body.action : ''
  const sb = adminClient()

  if (action === 'create') {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > 120) return errorResponse('Please provide a designer name', 400)

    const passcode = randomNumericCode(6)
    let code: string
    try {
      code = await uniqueCode()
    } catch {
      return errorResponse('Failed to allocate a code, please retry', 500)
    }
    const passcodeHash = await bcrypt.hash(passcode, 10)

    const { data: designer, error } = await sb
      .from('designers')
      .insert({ name, code, passcode_hash: passcodeHash, created_by: admin.id })
      .select('id, name, code, created_at')
      .single()

    if (error || !designer) return errorResponse('Failed to create designer', 500)
    return jsonResponse({ designer, code, passcode }, 201)
  }

  const designerId = typeof body.designerId === 'string' ? body.designerId : ''
  if (!designerId) return errorResponse('Missing designer id', 400)

  const { data: existing } = await sb.from('designers').select('id').eq('id', designerId).maybeSingle()
  if (!existing) return errorResponse('Designer not found', 404)

  if (action === 'reset-passcode') {
    const passcode = randomNumericCode(6)
    const passcodeHash = await bcrypt.hash(passcode, 10)
    await sb.from('designers').update({ passcode_hash: passcodeHash, revoked_at: null }).eq('id', designerId)
    return jsonResponse({ passcode })
  }

  if (action === 'revoke') {
    await sb.from('designers').update({ revoked_at: new Date().toISOString() }).eq('id', designerId)
    return jsonResponse({ revoked: true })
  }

  if (action === 'activate') {
    await sb.from('designers').update({ revoked_at: null }).eq('id', designerId)
    return jsonResponse({ revoked: false })
  }

  return errorResponse('Unknown action', 400)
})

export const cors = corsHeaders