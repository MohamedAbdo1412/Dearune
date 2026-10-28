export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type, range, x-request-id',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Range, Content-Length, Content-Type, Location, x-request-id',
}

export function handleOptions(): Response {
  return new Response(null, { status: 204, headers: corsHeaders })
}

export function generateRequestId(): string {
  return crypto.randomUUID()
}

export function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8', ...headers },
  })
}

export function errorResponse(message: string, status = 400, extra: Record<string, unknown> = {}, requestId?: string): Response {
  const errorData = { error: message, ...extra }
  if (requestId) errorData.requestId = requestId
  return jsonResponse(errorData, status, requestId ? { 'x-request-id': requestId } : {})
}

export function withRequestId(req: Request, handler: (requestId: string) => Promise<Response>): Promise<Response> {
  const requestId = req.headers.get('x-request-id') ?? generateRequestId()
  return handler(requestId).then((response) => {
    const newHeaders = new Headers(response.headers)
    newHeaders.set('x-request-id', requestId)
    return new Response(response.body, { status: response.status, headers: newHeaders })
  })
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

// Structured logging
export function logInfo(requestId: string, message: string, meta?: Record<string, unknown>) {
  console.log(JSON.stringify({ level: 'info', requestId, message, meta, timestamp: new Date().toISOString() }))
}

export function logError(requestId: string, message: string, error: unknown, meta?: Record<string, unknown>) {
  console.error(JSON.stringify({ level: 'error', requestId, message, error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error, meta, timestamp: new Date().toISOString() }))
}