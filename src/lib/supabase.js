import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  const missing = [url ? null : 'VITE_SUPABASE_URL', anonKey ? null : 'VITE_SUPABASE_ANON_KEY'].filter(Boolean)
  console.warn(`Missing env: ${missing.join(', ')}. Supabase features will not work in dev. Create .env from .env.example.`)
}

export const supabase = url && anonKey ? createClient(url, anonKey) : null
export const supabaseUrl = url ?? ''
export const anonKeyValue = anonKey ?? ''

export async function currentAccessToken() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export async function invokeFunction(name, { method = 'GET', token = null, adminToken = null, body = undefined } = {}) {
  if (!supabaseUrl) throw new Error('Supabase is not configured')
  const headers = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (token) headers.authorization = `Bearer ${token}`
  if (adminToken) headers.authorization = `Bearer ${adminToken}`
  if (anonKey) headers.apikey = anonKey
  headers['x-client-info'] = 'supabase-js-web/2'

  let response
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error('Network error — could not reach the Supabase function')
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const payload = await response.json()
      if (payload && payload.error) message = payload.error
    } catch {
      // ignore
    }
    throw new Error(message)
  }

  const text = await response.text()
  return text ? JSON.parse(text) : {}
}