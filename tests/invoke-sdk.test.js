import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest'

let invokeFunction
let invokeMock

function classErr(name) {
  return class extends Error {
    constructor(message, context) {
      super(message)
      this.name = name
      this.context = context
    }
  }
}

vi.mock('@supabase/supabase-js', () => {
  const FunctionsFetchError = classErr('FunctionsFetchError')
  const FunctionsHttpError = classErr('FunctionsHttpError')
  const FunctionsRelayError = classErr('FunctionsRelayError')
  return {
    createClient: vi.fn(() => ({
      auth: { getSession: async () => ({ data: { session: null } }) },
      functions: { invoke: vi.fn() },
    })),
    FunctionsFetchError,
    FunctionsHttpError,
    FunctionsRelayError,
  }
})

beforeAll(async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://xwgegarncnxswiswsufx.supabase.co')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test_key')
  vi.stubEnv('DEV', true)
  const mod = await import('../src/lib/supabase')
  invokeFunction = mod.invokeFunction
  invokeMock = mod.supabase.functions.invoke
})

afterAll(() => {
  vi.unstubAllEnvs()
  delete globalThis.window
})

function networkError() {
  return {
    name: 'FunctionsFetchError',
    message: 'Failed to send a request to the Edge Function',
    context: { name: 'TypeError', message: 'fetch failed', cause: { name: 'TypeError', code: 'ERR_NETWORK_CHANGED' } },
  }
}

function httpError(status, body) {
  return {
    name: 'FunctionsHttpError',
    message: 'Edge Function returned a non-2xx status code',
    context: { status, json: async () => body },
  }
}

describe('invokeFunction SDK path (no custom token)', () => {
  it('returns data on success without a retry', async () => {
    invokeMock.mockResolvedValueOnce({ data: { ok: true }, error: null })
    await expect(invokeFunction('designer-templates', { method: 'GET' })).resolves.toEqual({ ok: true })
    expect(invokeMock).toHaveBeenCalledTimes(1)
  })

  it('retries once and recovers when only the first attempt fails', async () => {
    invokeMock
      .mockResolvedValueOnce({ data: undefined, error: networkError() })
      .mockResolvedValueOnce({ data: { ok: true }, error: null })
    await expect(invokeFunction('designer-login', { method: 'POST', body: {} })).resolves.toEqual({ ok: true })
    expect(invokeMock).toHaveBeenCalledTimes(2)
  })

  it('surfaces business envelopes (401) with the server message and no retry', async () => {
    invokeMock.mockResolvedValueOnce({ data: undefined, error: httpError(401, { error: 'The code or password did not match our records' }) })
    let caught
    try {
      await invokeFunction('designer-login', { method: 'POST', body: {} })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Error)
    expect(caught.message).toBe('The code or password did not match our records')
    expect(caught.status).toBe(401)
    expect(invokeMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to a status message when the business body has no error field', async () => {
    invokeMock.mockResolvedValueOnce({ data: undefined, error: httpError(404, '') })
    await expect(invokeFunction('missing-function', { method: 'GET' })).rejects.toThrow('Request failed (404)')
  })

  it('reports the underlying technical cause when the network fails both ways', async () => {
    globalThis.window = { __dearuneFetchDiag: null }
    invokeMock
      .mockResolvedValueOnce({ data: undefined, error: networkError() })
      .mockResolvedValueOnce({ data: undefined, error: networkError() })
    await expect(invokeFunction('designer-login', { method: 'POST', body: {} })).rejects.toThrow(/\[technical: ERR_NETWORK_CHANGED\]/)
    expect(invokeMock).toHaveBeenCalledTimes(2)
    expect(globalThis.window.__dearuneFetchDiag.technical).toBe('ERR_NETWORK_CHANGED')
    expect(globalThis.window.__dearuneFetchDiag.notes).toContain('sdk-path')
    delete globalThis.window
  })

  it('labels relay failures without a useful underlying cause', async () => {
    globalThis.window = { __dearuneFetchDiag: null }
    const realFetch = globalThis.fetch
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const relay = { name: 'FunctionsRelayError', message: 'Relay Error invoking the Edge Function', context: { status: 502 } }
    invokeMock
      .mockResolvedValueOnce({ data: undefined, error: relay })
      .mockResolvedValueOnce({ data: undefined, error: relay })
    await expect(invokeFunction('designer-login', { method: 'POST', body: {} })).rejects.toThrow(/\[technical: relay-error\]/)
    expect(globalThis.window.__dearuneFetchDiag.technical).toBe('relay-error')
    delete globalThis.window
    vi.stubGlobal('fetch', realFetch)
  })

  it('falls back to the dev same-origin proxy when the direct calls are blocked', async () => {
    const realFetch = globalThis.fetch
    const proxyFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({ ok: true, via: 'proxy' }) })
    vi.stubGlobal('fetch', proxyFetch)
    invokeMock
      .mockResolvedValueOnce({ data: undefined, error: networkError() })
      .mockResolvedValueOnce({ data: undefined, error: networkError() })
    await expect(invokeFunction('designer-login', { method: 'POST', body: {} })).resolves.toEqual({ ok: true, via: 'proxy' })
    expect(invokeMock).toHaveBeenCalledTimes(2)
    expect(proxyFetch).toHaveBeenCalledWith('/functions/v1/designer-login', expect.anything())
    vi.stubGlobal('fetch', realFetch)
  })

  it('surfaces the server {error} envelope when the dev proxy answers', async () => {
    const realFetch = globalThis.fetch
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "We couldn't verify those details. Please check your code and passcode." }) })
    )
    invokeMock
      .mockResolvedValueOnce({ data: undefined, error: networkError() })
      .mockResolvedValueOnce({ data: undefined, error: networkError() })
    await expect(invokeFunction('designer-login', { method: 'POST', body: {} })).rejects.toThrow(
      "We couldn't verify those details. Please check your code and passcode."
    )
    expect(invokeMock).toHaveBeenCalledTimes(2)
    vi.stubGlobal('fetch', realFetch)
  })
})