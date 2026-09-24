import bcrypt from 'npm:bcryptjs@^3.0.2'
import { corsHeaders, errorResponse, handleOptions, jsonResponse, readJson } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
import { signDesignerJwt } from '../_shared/auth.ts'

const FAIL_LIMIT = 3
const LOCK_SECONDS = 60
const GENERIC_FAILURE = "We couldn't verify those details. Please check your code and passcode."

function lockResponse(lockedUntil: Date): Response {
  const retryAfterSeconds = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000))
  return errorResponse('Too many incorrect attempts — this door is resting for a moment. Please try again shortly.', 429, {
    retryAfterSeconds,
    lockedUntil: lockedUntil.toISOString(),
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const body = await readJson(req)
  const enteredCode = typeof body.code === 'string' ? body.code.trim() : ''
  const enteredPasscode = typeof body.passcode === 'string' ? body.passcode.trim() : ''

  if (!/^\d{6}$/.test(enteredCode) || !/^\d{6}$/.test(enteredPasscode)) {
    return errorResponse('Codes and passcodes are six digits', 400)
  }

  // Server-enforced cooldown: secrets never live in the browser, so an open
  // page cannot reset the timer. Check the lock before doing any work.
  const sb = adminClient()
  const { data: attempt } = await sb
    .from('designer_login_attempts')
    .select('locked_until')
    .eq('identifier', enteredCode)
    .maybeSingle()
  if (attempt?.locked_until) {
    const lockedUntil = new Date(String(attempt.locked_until))
    if (lockedUntil.getTime() > Date.now()) return lockResponse(lockedUntil)
  }

  const { data: designer } = await sb
    .from('designers')
    .select('id, name, code, passcode_hash, revoked_at')
    .eq('code', enteredCode)
    .maybeSingle()

  if (designer?.revoked_at) {
    return errorResponse('This designer account is deactivated', 403)
  }

  const valid = Boolean(designer?.passcode_hash) && (await bcrypt.compare(enteredPasscode, designer!.passcode_hash))

  if (!designer || !valid) {
    // Count every failed attempt the same way — whether the code exists or
    // not — so the response never reveals which part was wrong.
    const { data: failure } = await sb.rpc('record_designer_login_failure', {
      p_identifier: enteredCode,
      p_lock_after: FAIL_LIMIT,
      p_lock_seconds: LOCK_SECONDS,
    })
    if (failure && typeof failure === 'object' && 'lock_until' in failure && failure.lock_until) {
      return lockResponse(new Date(String(failure.lock_until)))
    }
    return errorResponse(GENERIC_FAILURE, 401)
  }

  await sb.rpc('clear_designer_login_attempts', { p_identifier: enteredCode })
  await sb.from('designers').update({ last_login_at: new Date().toISOString() }).eq('id', designer.id)

  // A missing secret would throw deep inside signDesignerJwt and surface as a
  // bare 500 with no readable envelope. Check for it so the setup gap is
  // obvious instead of a mystery failure.
  if (!Deno.env.get('DESIGNER_JWT_SECRET')) {
    return errorResponse('Server setup is incomplete — the designer token secret is not configured.', 500)
  }

  const token = await signDesignerJwt({ id: designer.id, code: designer.code })

  return jsonResponse({
    token,
    designer: { id: designer.id, name: designer.name, code: designer.code },
  })
})

export const cors = corsHeaders