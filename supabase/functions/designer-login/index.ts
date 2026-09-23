import bcrypt from 'npm:bcryptjs@^3.0.2'
import { corsHeaders, errorResponse, handleOptions, jsonResponse, readJson } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
import { signDesignerJwt } from '../_shared/auth.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const body = await readJson(req)
  const enteredCode = typeof body.code === 'string' ? body.code.trim() : ''
  const enteredPasscode = typeof body.passcode === 'string' ? body.passcode.trim() : ''

  if (!/^\d{6}$/.test(enteredCode) || !/^\d{6}$/.test(enteredPasscode)) {
    return errorResponse('Enter a valid 6-digit code and passcode', 400)
  }

  const { data: designer } = await adminClient()
    .from('designers')
    .select('id, name, code, passcode_hash, revoked_at')
    .eq('code', enteredCode)
    .maybeSingle()

  if (!designer || !designer.passcode_hash) {
    return errorResponse('Invalid credentials', 401)
  }
  if (designer.revoked_at) {
    return errorResponse('This designer account is deactivated', 403)
  }

  const valid = await bcrypt.compare(enteredPasscode, designer.passcode_hash)
  if (!valid) return errorResponse('Invalid credentials', 401)

  await adminClient().from('designers').update({ last_login_at: new Date().toISOString() }).eq('id', designer.id)

  const token = await signDesignerJwt({ id: designer.id, code: designer.code })

  return jsonResponse({
    token,
    designer: { id: designer.id, name: designer.name, code: designer.code },
  })
})

export const cors = corsHeaders