// Destination checks for the `external-link` paper.
//
// This module is deliberately PURE (no imports, no Deno globals at module
// scope) so the same rules can be unit-tested from vitest and reused by the
// `link-check` edge function, `designer-projects` (what may be SAVED) and the
// public resolver's migration (what may be RETURNED).
//
// TWO DIFFERENT QUESTIONS, KEPT APART:
//   1. Is this a printable destination?  (`parseTarget` / `sanitizeDestination`)
//      Absolute http(s), no embedded credentials, no private/internal host.
//   2. Can we reach it right now, and will it allow being framed?  (`inspectDestination`)
//      A failed check never proves the page is broken — sign-in walls, bots
//      blocks and client-side rendering all look "unreachable" from a server.
//
// SSRF: every hop of a redirect chain is re-validated, a host that resolves to
// a private address is refused before we connect, and the caller only ever
// receives enum reasons — never the internal address, port or error text.

export const EXTERNAL_URL_MAX_LENGTH = 2048
export const LINK_TIMEOUT_MS = 7000
export const MAX_REDIRECTS = 4

export type LinkReason =
  | 'empty'
  | 'malformed'
  | 'scheme'
  | 'credentials'
  | 'blocked-host'
  | 'too-long'
  | 'timeout'
  | 'unreachable'
  | 'too-many-redirects'
  | null

export type Embeddable = 'yes' | 'no' | 'unknown'
export type BlockedBy = 'x-frame-options' | 'csp' | null

export type TargetCheck =
  | { ok: true; url: string; host: string }
  | { ok: false; reason: Exclude<LinkReason, null> }

export type LinkInspection = {
  ok: boolean
  reachable: boolean
  status: number | null
  finalUrl: string | null
  redirected: boolean
  embeddable: Embeddable
  blockedBy: BlockedBy
  reason: LinkReason
}

export type HeaderBag = { get(name: string): string | null }

// ---------------------------------------------------------------------------
// Host safety
// ---------------------------------------------------------------------------

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata',
  'metadata.google.internal',
  'metadata.azure.internal',
  'instance-data',
])

function isPrivateIpv4(host: string): boolean {
  const parts = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!parts) return false
  const a = Number(parts[1])
  const b = Number(parts[2])
  const c = Number(parts[3])
  const d = Number(parts[4])
  if ([a, b, c, d].some((n) => n > 255)) return true // never a real address
  if (a === 0 || a === 10 || a === 127) return true // this-host, private, loopback
  if (a === 169 && b === 254) return true // link-local (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true // private
  if (a === 192 && b === 168) return true // private
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true // IETF / TEST-NET-1
  if (a === 100 && b >= 64 && b <= 127) return true // carrier-grade NAT
  if (a === 198 && (b === 18 || b === 19)) return true // benchmarking
  if (a >= 224) return true // multicast, reserved, broadcast
  return false
}

function isPrivateIpv6(host: string): boolean {
  const h = host.toLowerCase()
  if (h === '::' || h === '::1') return true
  if (h.startsWith('::ffff:')) return true // IPv4-mapped
  if (h.startsWith('fc') || h.startsWith('fd')) return true // unique local
  if (/^fe[89ab]/.test(h)) return true // link-local
  if (h.startsWith('ff')) return true // multicast
  return false
}

export function isBlockedHost(hostname: string): boolean {
  const host = String(hostname ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
  if (!host) return true
  if (BLOCKED_HOSTNAMES.has(host)) return true
  if (
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.localdomain') ||
    host.endsWith('.internal') ||
    host.endsWith('.home.arpa')
  ) {
    return true
  }
  if (/^\d+$/.test(host)) return true // decimal-encoded IPv4
  if (/^0x[0-9a-f]+$/i.test(host)) return true // hex-encoded IPv4
  if (host.includes(':')) return isPrivateIpv6(host)
  return isPrivateIpv4(host)
}

// ---------------------------------------------------------------------------
// 1. What may be printed / saved / returned
// ---------------------------------------------------------------------------

export function parseTarget(raw: unknown): TargetCheck {
  if (typeof raw !== 'string') return { ok: false, reason: 'empty' }
  const trimmed = raw.trim()
  if (!trimmed) return { ok: false, reason: 'empty' }
  if (trimmed.length > EXTERNAL_URL_MAX_LENGTH) return { ok: false, reason: 'too-long' }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'scheme' }
  }
  if (!parsed.hostname) return { ok: false, reason: 'malformed' }
  if (parsed.username || parsed.password) return { ok: false, reason: 'credentials' }
  if (isBlockedHost(parsed.hostname)) return { ok: false, reason: 'blocked-host' }

  return { ok: true, url: parsed.toString(), host: parsed.host }
}

// The one function the writer uses before a destination is stored.
export function sanitizeDestination(raw: unknown): string | null {
  const target = parseTarget(raw)
  return target.ok ? target.url : null
}

// ---------------------------------------------------------------------------
// 2. Framing policy (our own CSP is separate — see public/_headers)
// ---------------------------------------------------------------------------

function originOf(candidate: string): string {
  try {
    const url = new URL(candidate)
    return url.origin === 'null' ? '' : url.origin
  } catch {
    return ''
  }
}

// What the destination's OWN headers say about being shown inside our page.
// We never try to defeat these: a "no" is reported as a no and the reader is
// offered a new tab instead.
export function frameVerdict(
  headers: HeaderBag,
  ancestorOrigin = ''
): { embeddable: Embeddable; blockedBy: BlockedBy } {
  const xfo = String(headers.get('x-frame-options') ?? '').trim().toLowerCase()
  if (xfo) return { embeddable: 'no', blockedBy: 'x-frame-options' }

  const csp = String(headers.get('content-security-policy') ?? '')
  const directive = csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => /^frame-ancestors(\s|$)/i.test(part))
  if (!directive) return { embeddable: 'unknown', blockedBy: null }

  const value = directive.replace(/^frame-ancestors\s*/i, '').trim()
  if (!value) return { embeddable: 'no', blockedBy: 'csp' }

  const tokens = value.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.includes('*')) return { embeddable: 'yes', blockedBy: null }
  if (tokens.includes("'none'")) return { embeddable: 'no', blockedBy: 'csp' }

  const ancestor = originOf(ancestorOrigin)
  if (ancestor) {
    const scheme = ancestor.startsWith('https://') ? 'https:' : 'http:'
    if (tokens.includes(scheme)) return { embeddable: 'yes', blockedBy: null }
    if (tokens.some((token) => originOf(token) === ancestor)) return { embeddable: 'yes', blockedBy: null }
  }

  // 'self' (or any other origin) names a page that is not ours.
  return { embeddable: 'no', blockedBy: 'csp' }
}

// ---------------------------------------------------------------------------
// 3. Reachability
// ---------------------------------------------------------------------------

function blank(overrides: Partial<LinkInspection> = {}): LinkInspection {
  return {
    ok: true,
    reachable: false,
    status: null,
    finalUrl: null,
    redirected: false,
    embeddable: 'unknown',
    blockedBy: null,
    reason: null,
    ...overrides,
  }
}

// Best-effort DNS guard for a public hostname that resolves to a private
// address (DNS rebinding). Supabase's edge runtime may not expose resolveDns;
// when it does not, the literal-host checks above still refuse everything that
// can be expressed directly, and the fetch is made without following redirects.
async function hostResolvesToPrivate(hostname: string): Promise<boolean> {
  const deno = (globalThis as unknown as { Deno?: { resolveDns?: (host: string, type: string) => Promise<string[]> } }).Deno
  if (!deno || typeof deno.resolveDns !== 'function') return false
  try {
    const [v4, v6] = await Promise.all([
      deno.resolveDns(hostname, 'A').catch(() => [] as string[]),
      deno.resolveDns(hostname, 'AAAA').catch(() => [] as string[]),
    ])
    const addresses = [...(v4 ?? []), ...(v6 ?? [])]
    return addresses.length > 0 && addresses.some((address) => isBlockedHost(String(address)))
  } catch {
    return false
  }
}

async function discard(response: Response): Promise<void> {
  try {
    await response.body?.cancel()
  } catch {
    // the body is already closed, or the runtime has no streams
  }
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

export type InspectOptions = {
  ancestorOrigin?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
  maxRedirects?: number
}

// Reachability + framing verdict for one destination. Redirects are followed
// MANUALLY so every target is validated before it is contacted.
export async function inspectDestination(
  raw: unknown,
  options: InspectOptions = {}
): Promise<LinkInspection> {
  const first = parseTarget(raw)
  if (!first.ok) return blank({ ok: false, reason: first.reason })

  const doFetch = options.fetchImpl ?? ((input, init) => fetch(input, init))
  const timeoutMs = options.timeoutMs ?? LINK_TIMEOUT_MS
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS
  const ancestorOrigin = options.ancestorOrigin ?? ''

  let currentUrl = first.url
  let redirected = false

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    let host = ''
    try {
      host = new URL(currentUrl).hostname
    } catch {
      return blank({ reason: 'malformed', finalUrl: currentUrl, redirected })
    }
    if (await hostResolvesToPrivate(host)) {
      return blank({ reason: 'blocked-host', finalUrl: null, redirected })
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let response: Response
    try {
      response = await doFetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'user-agent': 'Dearune-LinkCheck/1.0 (+https://dearune.com)',
        },
        signal: controller.signal,
      })
    } catch (error) {
      const name = (error as { name?: string } | null)?.name
      return blank({
        reason: name === 'AbortError' || name === 'TimeoutError' ? 'timeout' : 'unreachable',
        finalUrl: currentUrl,
        redirected,
      })
    } finally {
      clearTimeout(timer)
    }

    const status = Number(response.status) || 0
    const location = response.headers.get('location')

    if (isRedirect(status) && location) {
      await discard(response)
      let next: string
      try {
        next = new URL(location, currentUrl).toString()
      } catch {
        return blank({ reachable: true, status, reason: 'malformed', finalUrl: currentUrl, redirected })
      }
      const validated = parseTarget(next)
      if (!validated.ok) {
        return blank({ reachable: true, status, reason: validated.reason, finalUrl: null, redirected })
      }
      currentUrl = validated.url
      redirected = true
      continue
    }

    const verdict = frameVerdict(response.headers, ancestorOrigin)
    await discard(response)
    return blank({
      reachable: true,
      status,
      finalUrl: currentUrl,
      redirected,
      embeddable: verdict.embeddable,
      blockedBy: verdict.blockedBy,
      reason: null,
    })
  }

  return blank({ reachable: true, reason: 'too-many-redirects', finalUrl: currentUrl, redirected: true })
}
