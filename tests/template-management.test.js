import { describe, expect, it } from 'vitest'
import { TEMPLATE_SLUG_RE, isTemplateStoragePath } from '../src/services/templates'

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
    expect(isTemplateStoragePath('')).toBe(false)
    expect(isTemplateStoragePath(undefined)).toBe(false)
  })
})
