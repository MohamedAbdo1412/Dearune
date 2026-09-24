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

  const diagnostic = (e) => ({
    name: e?.name,
    message: e?.message,
    cause: e?.cause ? { name: e.cause.name, message: e.cause.message, code: e.cause.code, errno: e.cause.errno } : null,
    url: `${supabaseUrl}/functions/v1/${name}`,
  })

  const report = (technical, first, second, notes) => {
    console.info('[supabase] fetch diagnostic (please share this):', diagnostic(first), diagnostic(second))
    if (typeof window !== 'undefined') window.__dearuneFetchDiag = { technical, first: diagnostic(first), second: diagnostic(second), notes }
    throw new Error(
      `The Dearune archive could not be reached — check your connection, and if an ad or privacy blocker is on, allow this site, then try again. [technical: ${technical}]`
    )
  }

  // Preferred path — no custom auth headers involved: let supabase-js own the
  // request (canonical endpoint, apikey, keep-alive, relays). Used for anon
  // calls like designer-login, the exact flow that reports "could not be
  // reached".
  if (!token && !adminToken && supabase) {
    let data, err
    try {
      const result = await supabase.functions.invoke(name, {
        method,
        ...(body !== undefined ? { body } : {}),
      })
      data = result.data
      err = result.error ?? null
    } catch (e) {
      // One retry for flaky DNS/proxy blips, then report with the diagnostic.
      try {
        const result = await supabase.functions.invoke(name, {
          method,
          ...(body !== undefined ? { body } : {}),
        })
        data = result.data
        err = result.error ?? null
      } catch (secondError) {
        const firstError = e
        const technical = [secondError?.cause?.code, secondError?.cause?.errno, secondError?.cause?.name, secondError?.name, firstError?.name].filter(Boolean)[0] ?? 'unknown fetch failure'
        report(technical, firstError, secondError, 'sdk-path')
      }
    }
    if (err) {
      const error = new Error(err.message || `Request failed (${err.status ?? 'unknown'})`)
      error.status = err.status ?? 0
      error.payload = err
      throw error
    }
    return data ?? {}
  }

  const headers = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (token) headers.authorization = `Bearer ${token}`
  if (adminToken) headers.authorization = `Bearer ${adminToken}`
  if (publishableKey) headers.apikey = publishableKey
  headers['x-client-info'] = 'supabase-js-web/2'

  let response
  const request = () =>
    fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  try {
    response = await request()
  } catch (firstError) {
    // One retry: flaky DNS/proxy blips are common and resolve on a second try.
    try {
      response = await request()
    } catch (secondError) {
      const technical = [secondError?.cause?.code, secondError?.cause?.errno, secondError?.cause?.name, secondError?.name, firstError?.name].filter(Boolean)[0] ?? 'unknown fetch failure'
      report(technical, firstError, secondError, 'raw-path')
    }
  }

  if (!response.ok) {
    const message = `Request failed (${response.status})`
    const error = new Error(message)
    error.status = response.status
    try {
      const payload = await response.json()
      if (payload && payload.error) error.message = payload.error
      if (payload && typeof payload === 'object') error.payload = payload
    } catch {
      // ignore
    }
    throw error
  }

  const text = await response.text()
  return text ? JSON.parse(text) : {}
}