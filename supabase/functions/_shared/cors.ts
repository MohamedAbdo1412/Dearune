export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type, range',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Range, Content-Length, Content-Type, Location',
}

export function handleOptions(): Response {
  return new Response(null, { status: 204, headers: corsHeaders })
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' },
  })
}

export function errorResponse(message: string, status = 400, extra: Record<string, unknown> = {}): Response {
  return jsonResponse({ error: message, ...extra }, status)
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text()
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}