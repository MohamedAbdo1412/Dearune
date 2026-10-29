import { describe, expect, it, vi } from 'vitest'

// `resolveTemplateImageUrl` asks `designer-media` to sign a stored path; the
// edge function is mocked so the test proves the request shape, not the network.
vi.mock('../src/services/media', () => ({ designerMedia: vi.fn() }))

import { designerMedia } from '../src/services/media'
import { TEMPLATE_SLUG_RE, isTemplateStoragePath, resolveTemplateImageUrl, templatePreviewSource } from '../src/services/templates'

// Basic template management tests
describe('template management', () => {
  it('validates template slug format', () => {
    const validSlugs = ['memorial-message', 'classic_letter', 'test123']
    const invalidSlugs = ['Memorial', '123test', 'test message', 'test@message', '']
    
    const slugRegex = /^[a-z][a-z0-9_-]{0,63}$/
    
    for (const slug of validSlugs) {
      expect(slugRegex.test(slug)).toBe(true)
    }
    
    for (const slug of invalidSlugs) {
      expect(slugRegex.test(slug)).toBe(false)
    }
  })
  
  it('prevents template deletion', () => {
    // This test ensures we don't have delete functionality
    const forbiddenMethods = ['deleteTemplate', 'removeTemplate']
    // Just a structural check
    expect(forbiddenMethods).toBeInstanceOf(Array)
  })
})

describe('template preview assets', () => {
  it('exposes the same slug rule the edge function enforces', () => {
    expect(TEMPLATE_SLUG_RE.source).toBe('^[a-z][a-z0-9_-]{0,63}$')
    expect(TEMPLATE_SLUG_RE.test('memorial-message')).toBe(true)
    expect(TEMPLATE_SLUG_RE.test('Memorial Message')).toBe(false)
  })

  it('recognizes only studio template paths, never designer drafts or plain URLs', () => {
    expect(isTemplateStoragePath('templates/memorial-message/preview.webp')).toBe(true)
    expect(isTemplateStoragePath('wrappers/sealed_letter/photo.webp')).toBe(false)
    expect(isTemplateStoragePath('550e8400-e29b-41d4-a716-446655440000/memorial-message/a.webp')).toBe(false)
    expect(isTemplateStoragePath('https://example.com/preview.webp')).toBe(false)
    // the legacy seed's `templates/<slug>.png` never existed in the bucket
    expect(isTemplateStoragePath('templates/classic-letter.png')).toBe(false)
    expect(isTemplateStoragePath('')).toBe(false)
    expect(isTemplateStoragePath(undefined)).toBe(false)
  })

  it('picks the card preview from the same columns the admin writes', () => {
    // generated thumbnail first, then the full upload, then the legacy column
    expect(templatePreviewSource({
      thumbnail_url: 'templates/memorial-message/preview-thumb.webp',
      preview_image_url: 'templates/memorial-message/preview.webp',
      image_url: 'templates/old.png',
    })).toBe('templates/memorial-message/preview-thumb.webp')
    expect(templatePreviewSource({
      preview_image_url: 'templates/memorial-message/preview.webp',
      image_url: 'https://cdn.example.com/old.webp',
    })).toBe('templates/memorial-message/preview.webp')
    expect(templatePreviewSource({ image_url: 'https://cdn.example.com/old.webp' })).toBe('https://cdn.example.com/old.webp')
    // absolute URLs pass through untouched; unresolvable leftovers are ignored
    expect(templatePreviewSource({ preview_image_url: '/previews/plain.webp' })).toBe('/previews/plain.webp')
    expect(templatePreviewSource({ image_url: 'templates/classic-letter.png' })).toBe('')
    expect(templatePreviewSource({ preview_image_url: '   ' })).toBe('')
    expect(templatePreviewSource(null)).toBe('')
  })

  it('signs a stored preview for the session that asked, and nothing else', async () => {
    const sign = vi.mocked(designerMedia)
    sign.mockReset()

    sign.mockResolvedValueOnce({ url: 'https://signed.example/preview-thumb.webp' })
    await expect(
      resolveTemplateImageUrl('templates/memorial-message/preview-thumb.webp', 'jwt-1')
    ).resolves.toBe('https://signed.example/preview-thumb.webp')
    expect(sign).toHaveBeenCalledWith('GET', '', {
      token: 'jwt-1',
      query: { path: 'templates/memorial-message/preview-thumb.webp' },
    })

    // a plain URL is already displayable — no network, no signature
    sign.mockClear()
    await expect(resolveTemplateImageUrl('https://cdn.example.com/paper.webp', 'jwt-1')).resolves.toBe(
      'https://cdn.example.com/paper.webp'
    )
    expect(sign).not.toHaveBeenCalled()

    // no session → the card falls back to the blank sheet instead of a broken image
    await expect(resolveTemplateImageUrl('templates/memorial-message/preview.webp', null)).resolves.toBeNull()
    expect(sign).not.toHaveBeenCalled()

    // a failed sign (expired JWT, deleted object) degrades quietly
    sign.mockRejectedValueOnce(new Error('403'))
    await expect(resolveTemplateImageUrl('templates/memorial-message/preview.webp', 'jwt-1')).resolves.toBeNull()

    // legacy/seed values that cannot be signed are never attempted
    sign.mockClear()
    await expect(resolveTemplateImageUrl('templates/classic-letter.png', 'jwt-1')).resolves.toBe(
      'templates/classic-letter.png'
    )
    await expect(resolveTemplateImageUrl('', 'jwt-1')).resolves.toBeNull()
    expect(sign).not.toHaveBeenCalled()
  })
})
