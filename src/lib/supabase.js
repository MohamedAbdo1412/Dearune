import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !publishableKey) {
  const missing = [url ? null : 'VITE_SUPABASE_URL', publishableKey ? null : 'VITE_SUPABASE_PUBLISHABLE_KEY'].filter(Boolean)
  console.warn(`Missing env: ${missing.join(', ')}. Supabase features will not work in dev. Create .env from .env.example.`)
}

export const supabase = url && publishableKey ? createClient(url, publishableKey) : null
export const supabaseUrl = url ?? ''
export const publishableKeyValue = publishableKey ?? ''

export async function currentAccessToken() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export async function invokeFunction(name, { method = 'GET', token = null, adminToken = null, body = undefined } = {}) {
  if (!supabaseUrl) throw new Error('Supabase is not configured')

  const directUrl = `${supabaseUrl}/functions/v1/${name}`
  const diagnostic = (e) => ({
    name: e?.name,
    message: e?.message,
    cause: e?.cause ? { name: e.cause.name, message: e.cause.message, code: e.cause.code, errno: e.cause.errno } : null,
    url: directUrl,
  })

  // Pick the most meaningful cause across a chain of underlying errors.
  // A bare `TypeError` is what browsers throw for a CORS/extension block —
  // real network codes (ERR_*, errno) are far more actionable.
  const causeLabel = (...errs) =>
    errs
      .flatMap((e) => (e ? [e.cause?.code, e.cause?.errno, e.cause?.name, e.code, e.errno, e.name] : []))
      .filter(Boolean)
      .find((value) => value !== 'TypeError') ?? null

  const report = (technical, first, second, notes, extra = null) => {
    console.info('[supabase] fetch diagnostic (please share this):', diagnostic(first), diagnostic(second))
    if (typeof window !== 'undefined') window.__dearuneFetchDiag = { technical, first: diagnostic(first), second: diagnostic(second), notes, extra }
    throw new Error(
      `The Dearune archive could not be reached (${name}) — check your connection, and if an ad or privacy blocker is on, allow this site, then try again. [technical: ${technical}]`
    )
  }

  const headers = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (token) headers.authorization = `Bearer ${token}`
  if (adminToken) headers.authorization = `Bearer ${adminToken}`
  if (publishableKey) headers.apikey = publishableKey
  headers['x-client-info'] = 'supabase-js-web/2'

  // Raw fetch to any URL. On 2xx it returns parsed data; if the server (or a
  // proxy) answered with a non-2xx it throws with `.answered` (plus status and
  // any `{ error }` envelope); if the network layer swallowed the request it
  // throws with `.answered === false` and the underlying error attached.
  const requestJson = async (url) => {
    let response
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    } catch (networkError) {
      networkError.answered = false
      throw networkError
    }
    if (!response.ok) {
      const error = new Error(`Request failed (${response.status}) — ${name}`)
      error.status = response.status
      error.answered = true
      try {
        const payload = await response.json()
        if (payload && payload.error) error.message = payload.error
        if (payload && typeof payload === 'object') error.payload = payload
      } catch {
        // not JSON
      }
      throw error
    }
    const text = await response.text()
    return text ? JSON.parse(text) : {}
  }

  // In dev the Vite server proxies /functions/v1 to Supabase, so the browser
  // can retry same-origin after a cross-origin call was blocked by a privacy
  // extension or proxy that strips the CORS headers.
  const devProxyFallback = async () => {
    if (import.meta.env.DEV !== true) return { used: false }
    try {
      const data = await requestJson(`/functions/v1/${name}`)
      return { used: true, data }
    } catch (error) {
      return { used: true, error }
    }
  }

  // Preferred path — no custom auth headers involved: let supabase-js own the
  // request (canonical endpoint, apikey, keep-alive, relays). Used for anon
  // calls like designer-login. The SDK never throws: an unreachable network
  // comes back inside result.error as FunctionsFetchError / FunctionsRelayError,
  // and a non-2xx answer from our own function as FunctionsHttpError.
  if (!token && !adminToken && supabase) {
    const options = { method, ...(body !== undefined ? { body } : {}) }
    const runOnce = async () => {
      try {
        return await supabase.functions.invoke(name, options)
      } catch (caught) {
        return { data: undefined, error: caught }
      }
    }
    const throwBusiness = async (err) => {
      const context = err.context
      let status = null
      let serverMessage = null
      if (context && typeof context.status === 'number') status = context.status
      try {
        if (context && typeof context.json === 'function') {
          const payload = await context.json()
          if (payload && payload.error) serverMessage = payload.error
        }
      } catch {
        // body was not JSON or already consumed
      }
      const error = new Error(serverMessage || `Request failed (${status ?? 'unknown'}) — ${name}`)
      error.status = status ?? 0
      error.payload = err
      throw error
    }

    const first = await runOnce()
    if (first.error) {
      if (first.error.name === 'FunctionsHttpError') {
        return throwBusiness(first.error)
      }
      // Network-class failure (FunctionsFetchError / FunctionsRelayError):
      // retry once for flaky DNS/proxy blips, then the dev same-origin proxy,
      // then surface the same friendly diagnostic as the raw-fetch path.
      const second = await runOnce()
      if (second.error) {
        if (second.error.name === 'FunctionsHttpError') {
          return throwBusiness(second.error)
        }
        const firstUnderlying = first.error.context ?? first.error
        const secondUnderlying = second.error.context ?? second.error
        const relayClass = second.error.name === 'FunctionsRelayError' ? 'relay-error' : 'no-response (cors or blocker)'
        const fb = await devProxyFallback()
        if (fb.used) {
          if (fb.error) {
            if (fb.error.answered) throw fb.error
            report(causeLabel(firstUnderlying, secondUnderlying, fb.error) ?? relayClass, firstUnderlying, secondUnderlying, 'sdk-path→proxy', fb.error)
          }
          return fb.data
        }
        report(causeLabel(firstUnderlying, secondUnderlying) ?? relayClass, firstUnderlying, secondUnderlying, 'sdk-path')
      }
      return second?.data ?? {}
    }
    return first.data ?? {}
  }

  // Raw path: used when a custom JWT is attached (the SDK would stamp its own
  // Authorization header) or when the client was not created.
  let firstError = null
  if (import.meta.env.DEV) {
    try {
      return await requestJson(`/functions/v1/${name}`)
    } catch (devErr) {
      if (devErr.answered) throw devErr
      firstError = devErr
    }
  }
  try {
    return await requestJson(directUrl)
  } catch (rawError) {
    if (rawError.answered) throw rawError
    firstError = rawError
  }
  // One retry: flaky DNS/proxy blips are common and resolve on a second try.
  try {
    return await requestJson(directUrl)
  } catch (rawError) {
    if (rawError.answered) throw rawError
    const fb = await devProxyFallback()
    if (fb.used) {
      if (fb.error) {
        if (fb.error.answered) throw fb.error
        report(causeLabel(firstError, rawError, fb.error) ?? 'no-response (cors or blocker)', firstError, rawError, 'raw-path→proxy', fb.error)
      }
      return fb.data
    }
    report(causeLabel(firstError, rawError) ?? 'no-response (cors or blocker)', firstError, rawError, 'raw-path')
  }
}