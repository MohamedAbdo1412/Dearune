import { corsHeaders, errorResponse, handleOptions, jsonResponse, readJson } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
import { requireDesigner } from '../_shared/auth.ts'
import { inspectDestination } from '../_shared/link-check.ts'

// POST /link-check  body { url }
//
// The `external-link` preview asks this function one question: can the studio
// reach the destination, and will the destination allow being shown inside our
// page? It is advisory only — a "no" here never blocks a PRINTABLE link, since
// sign-in walls, bot blocks and JavaScript-only pages all look unreachable to a
// server while opening perfectly on a phone.
//
// SAFETY
//   • designer session required (the preview lives inside the book);
//   • rate limited per designer — this is the only endpoint that makes an
//     outbound request, and it must not become a general-purpose fetcher;
//   • the URL is validated and every redirect hop is re-validated against
//     private/internal hosts (`_shared/link-check.ts`), so the function cannot
//     be pointed at localhost, RFC1918 space or a cloud metadata endpoint;
//   • the answer carries enum reasons and a status code only — never an
//     internal address, port or server error text;
//   • the URL and its query string are deliberately NOT logged.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const designer = await requireDesigner(req)
  if (!designer) return errorResponse('This book is closed to you', 401)

  const sb = adminClient()
  const rateLimit = await sb.rpc('consume_rate_limit', {
    p_key: 'link-check:' + designer.designerId,
    p_tokens: 1,
    p_capacity: 20,
    p_refill_per_minute: 20,
  })
  const limit = rateLimit.data as { allowed: boolean; retry_after_seconds: number } | null
  if (limit && !limit.allowed) {
    return errorResponse('Too many checks just now — try again in a moment', 429, {
      retryAfterSeconds: limit.retry_after_seconds,
    })
  }

  const body = await readJson(req)
  const ancestorOrigin = req.headers.get('origin') ?? ''

  try {
    const result = await inspectDestination(body.url, { ancestorOrigin })
    return jsonResponse(result)
  } catch {
    // Never surface an exception body: it can carry a resolved address.
    return jsonResponse({
      ok: false,
      reachable: false,
      status: null,
      finalUrl: null,
      redirected: false,
      embeddable: 'unknown',
      blockedBy: null,
      reason: 'unreachable',
    })
  }
})

export const cors = corsHeaders
