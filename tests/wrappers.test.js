import { describe, expect, it } from 'vitest'
import {
  findOption,
  findWrapper,
  optionsForTemplate,
  resolveWrapperPrice,
  wrapperDescription,
  wrapperLabel,
  wrapperPriceFor,
} from '../src/services/wrappers'

const template = { id: 't1', slug: 'classic-letter', name: 'The Classic Letter' }
const otherTemplate = { id: 't2', slug: 'word-and-wax', name: 'Word & Wax' }

const sealed = {
  id: 'w-sealed',
  key: 'sealed_letter',
  name: 'Sealed letter',
  name_ar: 'رسالة مختومة',
  description: 'Kept sealed until the right hands.',
  description_ar: 'تبقى مختومة حتى تصل إلى أصحابها.',
  base_price: 22,
  production_cost: 5.5,
}

const openLetter = {
  id: 'w-open',
  key: 'open_letter',
  name: 'Open letter',
  name_ar: 'رسالة مفتوحة',
  base_price: 14,
  production_cost: 3,
}

const overrideForSealed = {
  id: 'opt-1',
  template_id: 't1',
  wrapper_id: 'w-sealed',
  price_override: 18,
  cost_override: 4.2,
}

describe('resolveWrapperPrice', () => {
  it('prefers the template override over the wrapper base price', () => {
    const resolved = resolveWrapperPrice({ template, wrapper: sealed, templateWrapperOption: overrideForSealed })
    expect(resolved.price).toBe(18)
    expect(resolved.cost).toBe(4.2)
    expect(resolved.source).toBe('template')
  })

  it('falls back to the wrapper base price when there is no override', () => {
    const resolved = resolveWrapperPrice({
      template,
      wrapper: openLetter,
      templateWrapperOption: { template_id: 't1', wrapper_id: 'w-open', price_override: null, cost_override: null },
    })
    expect(resolved.price).toBe(14)
    expect(resolved.cost).toBe(3)
    expect(resolved.source).toBe('wrapper')
  })

  it('falls back to the wrapper base price when there is no option row at all', () => {
    const resolved = resolveWrapperPrice({ template, wrapper: sealed, templateWrapperOption: null })
    expect(resolved.price).toBe(22)
    expect(resolved.source).toBe('wrapper')
  })

  it('ignores an option row that belongs to a different template', () => {
    const resolved = resolveWrapperPrice({ template: otherTemplate, wrapper: sealed, templateWrapperOption: overrideForSealed })
    expect(resolved.price).toBe(22)
    expect(resolved.source).toBe('wrapper')
  })

  it('keeps a zero override (a free paper still counts as overridden)', () => {
    const resolved = resolveWrapperPrice({
      template,
      wrapper: sealed,
      templateWrapperOption: { template_id: 't1', wrapper_id: 'w-sealed', price_override: 0, cost_override: 0 },
    })
    expect(resolved.price).toBe(0)
    expect(resolved.cost).toBe(0)
    expect(resolved.source).toBe('template')
  })

  it('treats a negative or unreadable price as zero rather than selling below cost by accident', () => {
    const resolved = resolveWrapperPrice({
      template,
      wrapper: { ...sealed, base_price: 'not-a-price' },
      templateWrapperOption: { template_id: 't1', wrapper_id: 'w-sealed', price_override: -5, cost_override: null },
    })
    expect(resolved.price).toBe(0)
    expect(resolved.cost).toBe(5.5)
  })

  it('never throws on a completely empty call', () => {
    expect(resolveWrapperPrice()).toEqual({ price: 0, cost: 0, source: 'wrapper' })
  })
})

describe('wrapperPriceFor', () => {
  const options = [overrideForSealed, { template_id: 't2', wrapper_id: 'w-sealed', price_override: 26, cost_override: 7.5 }]

  it('resolves the right row for a template + wrapper pair', () => {
    expect(wrapperPriceFor({ template, wrapper: sealed, options }).price).toBe(18)
    expect(wrapperPriceFor({ template: otherTemplate, wrapper: sealed, options }).price).toBe(26)
    expect(wrapperPriceFor({ template, wrapper: openLetter, options }).price).toBe(14)
  })

  it('handles a missing wrapper without throwing', () => {
    expect(wrapperPriceFor({ template, wrapper: null, options })).toEqual({ price: 0, cost: 0, source: 'wrapper' })
  })
})

describe('catalog lookups', () => {
  const options = [
    overrideForSealed,
    { template_id: 't1', wrapper_id: 'w-open', price_override: null, cost_override: null },
  ]

  it('finds wrappers and options by key / ids', () => {
    expect(findWrapper([openLetter, sealed], 'sealed_letter')).toBe(sealed)
    expect(findWrapper([openLetter, sealed], 'nope')).toBeNull()
    expect(findOption(options, 't1', 'w-sealed')).toBe(overrideForSealed)
    expect(findOption(options, 't2', 'w-sealed')).toBeNull()
  })

  it('scopes options to one template', () => {
    expect(optionsForTemplate(options, 't1')).toHaveLength(2)
    expect(optionsForTemplate(options, 't2')).toHaveLength(0)
  })
})

describe('localization', () => {
  it('uses the Arabic copy for Arabic, English otherwise', () => {
    expect(wrapperLabel(sealed, 'ar')).toBe('رسالة مختومة')
    expect(wrapperLabel(sealed, 'en')).toBe('Sealed letter')
    expect(wrapperDescription(sealed, 'ar')).toBe('تبقى مختومة حتى تصل إلى أصحابها.')
    expect(wrapperDescription(sealed, 'en')).toBe('Kept sealed until the right hands.')
  })

  it('falls back to the shared label table, then the raw key', () => {
    expect(wrapperLabel({ key: 'digital' }, 'en')).toBe('Digital only')
    expect(wrapperLabel({ key: 'mystery_wrapper' }, 'en')).toBe('mystery_wrapper')
    expect(wrapperLabel(null)).toBe('')
  })
})
