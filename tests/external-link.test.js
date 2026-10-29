import { describe, expect, it, vi } from 'vitest'
import { normalizeExternalUrl, externalUrlMessage, EXTERNAL_URL_MAX_LENGTH } from '@/services/externalLink'
import { normalizeTemplateDraft, isTemplateStage } from '@/services/draft'
import { TEMPLATE_SEQUENCES, templateStagesFor } from '@/templates/stages'
import { validateExternalLink } from '@/templates/external-link/v1/validate'
import {
  MAX_REDIRECTS,
  frameVerdict,
  inspectDestination,
  isBlockedHost,
  parseTarget,
  sanitizeDestination,
} from '../supabase/functions/_shared/link-check.ts'

// The `external-link` paper prints an address on a physical object, and the
// server is the only party that ever decides whether a saved destination may
// be forwarded to. These tests cover the two questions separately:
//   1. what may be printed / saved (pure format + host rules), and
//   2. what the reachability/embedding check may conclude (with an injected
//      fetch, so no test depends on the network).

describe('external link — client format rules', () => {
  it('accepts absolute http and https addresses', () => {
    expect(normalizeExternalUrl('https://example.com/my-page')).toMatchObject({
      ok: true,
      host: 'example.com',
    })
    expect(normalizeExternalUrl('http://example.com')).toMatchObject({ ok: true })
  })

  it('trims surrounding whitespace before deciding', () => {
    const check = normalizeExternalUrl('   https://example.com/page   ')
    expect(check.ok).toBe(true)
    expect(check.url).toBe('https://example.com/page')
  })

  it('rejects empty and whitespace-only values', () => {
    expect(normalizeExternalUrl('').reason).toBe('empty')
    expect(normalizeExternalUrl('    ').reason).toBe('empty')
    expect(normalizeExternalUrl(undefined).reason).toBe('empty')
    expect(normalizeExternalUrl(null).reason).toBe('empty')
  })

  it('rejects bare hosts and other malformed values', () => {
    expect(normalizeExternalUrl('example.com/my-page').reason).toBe('malformed')
    expect(normalizeExternalUrl('not a url').reason).toBe('malformed')
  })

  it('rejects every non-http scheme, including script-bearing ones', () => {
    expect(normalizeExternalUrl('javascript:alert(1)').reason).toBe('scheme')
    expect(normalizeExternalUrl('data:text/html,<h1>x</h1>').reason).toBe('scheme')
    expect(normalizeExternalUrl('file:///etc/passwd').reason).toBe('scheme')
    expect(normalizeExternalUrl('mailto:hello@example.com').reason).toBe('scheme')
  })

  it('rejects embedded credentials', () => {
    expect(normalizeExternalUrl('https://user:secret@example.com').reason).toBe('credentials')
  })

  it('rejects values longer than the printable limit', () => {
    const long = `https://example.com/${'a'.repeat(EXTERNAL_URL_MAX_LENGTH)}`
    expect(normalizeExternalUrl(long).reason).toBe('too-long')
  })

  it('speaks both languages the book offers', () => {
    expect(externalUrlMessage('scheme', 'en')).toMatch(/http/i)
    expect(externalUrlMessage('scheme', 'ar')).not.toBe(externalUrlMessage('scheme', 'en'))
  })
})

describe('external link — server destination rules', () => {
  it('accepts and canonicalises a printable address', () => {
    expect(parseTarget('https://example.com/page')).toMatchObject({ ok: true })
    expect(sanitizeDestination('  https://example.com/page  ')).toBe('https://example.com/page')
    expect(sanitizeDestination('https://example.com/page')).toMatch(/^https:\/\/example\.com\//)
  })

  it('refuses everything the client refuses', () => {
    expect(sanitizeDestination('javascript:alert(1)')).toBeNull()
    expect(sanitizeDestination('https://user:pass@example.com')).toBeNull()
    expect(sanitizeDestination('')).toBeNull()
    expect(sanitizeDestination(null)).toBeNull()
  })

  it.each([
    'localhost',
    'app.localhost',
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '0.0.0.0',
    '100.64.0.1',
    '198.18.0.1',
    '224.0.0.1',
    '::1',
    'fc00::1',
    'fe80::1',
    'metadata.google.internal',
    'printer.local',
    'service.internal',
    '2130706433',
    '0x7f000001',
  ])('treats %s as internal', (host) => {
    expect(isBlockedHost(host)).toBe(true)
    expect(parseTarget(`http://${host}/x`).ok).toBe(false)
  })

  it.each(['example.com', 'www.example.com', 'dearune.com', 'sub.example.co.uk'])(
    'allows the public host %s',
    (host) => {
      expect(isBlockedHost(host)).toBe(false)
      expect(parseTarget(`https://${host}/page`).ok).toBe(true)
    }
  )
})

describe('external link — framing policy', () => {
  const headers = (bag) => ({ get: (name) => bag[name] ?? null })

  it('honours X-Frame-Options', () => {
    expect(frameVerdict(headers({ 'x-frame-options': 'DENY' }))).toEqual({
      embeddable: 'no',
      blockedBy: 'x-frame-options',
    })
    expect(frameVerdict(headers({ 'x-frame-options': 'SAMEORIGIN' })).embeddable).toBe('no')
  })

  it('honours frame-ancestors', () => {
    expect(frameVerdict(headers({ 'content-security-policy': "frame-ancestors 'none'" }))).toEqual({
      embeddable: 'no',
      blockedBy: 'csp',
    })
    expect(
      frameVerdict(
        headers({ 'content-security-policy': 'frame-ancestors https://dearune.com' }),
        'https://dearune.com'
      ).embeddable
    ).toBe('yes')
    expect(
      frameVerdict(
        headers({ 'content-security-policy': 'frame-ancestors https://other.example' }),
        'https://dearune.com'
      ).embeddable
    ).toBe('no')
    expect(frameVerdict(headers({ 'content-security-policy': 'frame-ancestors *' })).embeddable).toBe('yes')
  })

  it('reports "unknown" only when nothing was declared', () => {
    expect(frameVerdict(headers({}))).toEqual({ embeddable: 'unknown', blockedBy: null })
    expect(frameVerdict(headers({ 'content-security-policy': 'default-src self' })).embeddable).toBe('unknown')
  })
})

describe('external link — reachability check', () => {
  const response = (status, headers = {}) => new Response(null, { status, headers })

  it('reports a reachable page without claiming it will render', async () => {
    const fetchImpl = vi.fn(async () => response(200))
    const result = await inspectDestination('https://example.com', { fetchImpl })
    expect(result).toMatchObject({
      ok: true,
      reachable: true,
      status: 200,
      redirected: false,
      embeddable: 'unknown',
      reason: null,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('follows a redirect and reads the framing policy of the final page', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(302, { location: 'https://example.com/final' }))
      .mockResolvedValueOnce(response(200, { 'x-frame-options': 'SAMEORIGIN' }))
    const result = await inspectDestination('https://example.com/start', { fetchImpl })
    expect(result.redirected).toBe(true)
    expect(result.finalUrl).toBe('https://example.com/final')
    expect(result.embeddable).toBe('no')
    expect(result.blockedBy).toBe('x-frame-options')
  })

  it('refuses a redirect that points at a private address', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(302, { location: 'http://127.0.0.1/admin' }))
    const result = await inspectDestination('https://example.com', { fetchImpl })
    expect(result.reachable).toBe(true)
    expect(result.reason).toBe('blocked-host')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('stops after too many redirects', async () => {
    const fetchImpl = vi.fn(async () => response(302, { location: 'https://example.com/again' }))
    const result = await inspectDestination('https://example.com', { fetchImpl, maxRedirects: 1 })
    expect(result.reason).toBe('too-many-redirects')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(MAX_REDIRECTS).toBeGreaterThan(1)
  })

  it('does not treat an HTTP error as "unusable"', async () => {
    const fetchImpl = vi.fn(async () => response(403))
    const result = await inspectDestination('https://example.com', { fetchImpl })
    expect(result).toMatchObject({ ok: true, reachable: true, status: 403 })
  })

  it('separates a timeout from an unreachable host', async () => {
    const aborted = Object.assign(new Error('aborted'), { name: 'AbortError' })
    const timedOut = await inspectDestination('https://example.com', {
      fetchImpl: vi.fn(async () => {
        throw aborted
      }),
    })
    expect(timedOut.reason).toBe('timeout')

    const unreachable = await inspectDestination('https://example.com', {
      fetchImpl: vi.fn(async () => {
        throw new TypeError('fetch failed')
      }),
    })
    expect(unreachable.reason).toBe('unreachable')
  })

  it('never contacts a malformed destination', async () => {
    const fetchImpl = vi.fn()
    const result = await inspectDestination('javascript:alert(1)', { fetchImpl })
    expect(result.ok).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('external link — draft and contract', () => {
  it('keeps only this paper\'s fields in its draft', () => {
    const normalized = normalizeTemplateDraft('external-link', {
      language: 'ar',
      destinationUrl: 'https://example.com',
      body: 'a letter must not ride along',
      photos: [{ path: 'x' }],
    })
    expect(normalized).toEqual({ language: 'ar', destinationUrl: 'https://example.com' })
  })

  it('keeps an over-long paste intact so it is refused, not silently shortened', () => {
    const long = `https://example.com/${'a'.repeat(3000)}`
    const normalized = normalizeTemplateDraft('external-link', { language: 'en', destinationUrl: long })
    expect(normalized.destinationUrl).toHaveLength(long.length)
    expect(normalizeExternalUrl(normalized.destinationUrl).reason).toBe('too-long')
  })

  it('recognises its own stages but not shared book pages', () => {
    expect(isTemplateStage('external.link')).toBe(true)
    expect(isTemplateStage('external.preview')).toBe(true)
    expect(isTemplateStage('wrapper')).toBe(false)
    expect(isTemplateStage('review')).toBe(false)
  })

  it('declares its full sequence through the shared contract', () => {
    expect(templateStagesFor('external-link')).toEqual(TEMPLATE_SEQUENCES['external-link'])
    expect(TEMPLATE_SEQUENCES['external-link']).toEqual([
      'external.link',
      'external.preview',
      'wrapper',
      'review',
      'policies',
    ])
  })

  it('refuses to advance on an empty or unsupported destination', () => {
    expect(validateExternalLink({ destinationUrl: 'https://example.com' })).toEqual([])
    expect(validateExternalLink({ destinationUrl: '' })).toHaveLength(1)
    expect(validateExternalLink({ destinationUrl: 'ftp://example.com' })).toHaveLength(1)
  })
})
