import { describe, expect, it } from 'vitest'
import { orderStage, STAGE_LABELS, publicMessageUrl, isCacheable, WRAPPER_LABELS } from '../src/services/constants'

const base = {
  wrapper_type: 'open_letter',
  paid_at: null,
  manufactured_at: null,
  shipped_at: null,
  arrived_at: null,
  cancelled_at: null,
  deleted_at: null,
}

describe('orderStage', () => {
  it('is pending when nothing has happened', () => {
    expect(orderStage(base)).toBe('pending')
  })

  it('is cancelled when cancelled, even if paid', () => {
    expect(orderStage({ ...base, paid_at: '2026-01-01', cancelled_at: '2026-01-02' })).toBe('cancelled')
  })

  it('is deleted when soft-deleted', () => {
    expect(orderStage({ ...base, paid_at: '2026-01-01', cancelled_at: '2026-01-02', deleted_at: '2026-01-03' })).toBe('deleted')
  })

  it('walks the physical pipeline in order', () => {
    expect(orderStage({ ...base, paid_at: 'now' })).toBe('in-production')
    expect(orderStage({ ...base, manufactured_at: 'now' })).toBe('manufactured')
    expect(orderStage({ ...base, shipped_at: 'now' })).toBe('shipped')
    expect(orderStage({ ...base, arrived_at: 'now' })).toBe('delivered')
  })

  it('does not regress once an earlier stage is reached', () => {
    const order = { ...base, paid_at: 'now', manufactured_at: 'now', shipped_at: 'now' }
    expect(orderStage(order)).toBe('shipped')
  })

  it('delivers digital messages only once published', () => {
    const digital = { ...base, wrapper_type: 'digital' }
    expect(orderStage(digital)).toBe('pending')
    expect(orderStage(digital, null)).toBe('pending')
    expect(orderStage({ ...digital, paid_at: 'now' })).toBe('in-production')
    expect(orderStage({ ...digital, paid_at: 'now' }, '2026-01-01T10:00:00Z')).toBe('delivered')
  })

  it('has a label for every stage', () => {
    for (const stage of ['pending', 'in-production', 'manufactured', 'shipped', 'delivered', 'cancelled', 'deleted']) {
      expect(STAGE_LABELS[stage]).toBeTruthy()
    }
  })
})

describe('Public message URL & identifier hygiene', () => {
  it('builds a token-protected public message URL', () => {
    expect(publicMessageUrl({ publicId: 'DLABC', token: 'tok1' })).toBe('/message/DLABC?token=tok1')
  })

  it('isCacheable rejects ambiguous characters', () => {
    expect(isCacheable('ABCDEFGHJKMNPQRSTUVWXYZ23456789')).toBe(true)
    expect(isCacheable('OIL10')).toBe(false)
  })

  it('labels all wrapper types', () => {
    for (const type of ['digital', 'open_letter', 'sealed_letter', 'open_card']) {
      expect(WRAPPER_LABELS[type]).toBeTruthy()
    }
  })
})