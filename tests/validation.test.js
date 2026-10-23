import { describe, expect, it } from 'vitest'
import { createOrderSchema, messageEditSchema, designerLoginSchema } from '../src/services/validation'

const TEMPLATE_ID = '10000000-0000-4000-8000-000000000001'

const base = {
  customerEmail: 'a@example.com',
  recipientName: 'Mia',
  templateId: TEMPLATE_ID,
  wrapperType: 'open_letter',
  occasion: null,
  eventDate: null,
  recipientMessage: null,
  designerCode: null,
}

describe('createOrderSchema', () => {
  it('accepts a minimal valid sale', () => {
    expect(createOrderSchema.safeParse(base).success).toBe(true)
  })

  it('rejects bad email and empty recipient', () => {
    expect(createOrderSchema.safeParse({ ...base, customerEmail: 'nope' }).success).toBe(false)
    expect(createOrderSchema.safeParse({ ...base, recipientName: '' }).success).toBe(false)
  })

  it('accepts any non-empty wrapper type (validated against catalog server-side)', () => {
    expect(createOrderSchema.safeParse({ ...base, wrapperType: 'sealed_letter' }).success).toBe(true)
    expect(createOrderSchema.safeParse({ ...base, wrapperType: 'carrier_pigeon' }).success).toBe(true)
    expect(createOrderSchema.safeParse({ ...base, wrapperType: '' }).success).toBe(false)
    expect(createOrderSchema.safeParse({ ...base, templateId: 'not-a-uuid' }).success).toBe(false)
  })

  it('accepts an optional 6-digit designer code and date-only event dates', () => {
    expect(createOrderSchema.safeParse({ ...base, designerCode: '123456' }).success).toBe(true)
    expect(createOrderSchema.safeParse({ ...base, designerCode: '12ab' }).success).toBe(false)
    expect(createOrderSchema.safeParse({ ...base, eventDate: '2026-09-23' }).success).toBe(true)
    expect(createOrderSchema.safeParse({ ...base, eventDate: '2026-13-45' }).success).toBe(false)
  })
})

describe('messageEditSchema', () => {
  it('accepts headline, body, and null signature', () => {
    expect(messageEditSchema.safeParse({ headline: 'Hi', body: 'Some words', signature: null }).success).toBe(true)
  })

  it('caps body length and rejects non-strings', () => {
    expect(messageEditSchema.safeParse({ headline: 'Hi', body: 'x'.repeat(20001) }).success).toBe(false)
    expect(messageEditSchema.safeParse({ headline: 'Hi', body: 12 }).success).toBe(false)
  })
})

describe('designerLoginSchema', () => {
  it('accepts 6-digit code and passcode', () => {
    expect(designerLoginSchema.safeParse({ code: '123456', passcode: '654321' }).success).toBe(true)
  })
  it('rejects short passcode', () => {
    expect(designerLoginSchema.safeParse({ code: '123456', passcode: '12' }).success).toBe(false)
  })
})