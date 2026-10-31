import { describe, expect, it } from 'vitest'
import {
  DELIVERY_MILESTONES,
  EMPTY_FILTERS,
  MILESTONE_LABELS,
  ORDER_SECTIONS,
  ORDER_SORTS,
  activeFilters,
  applyOrderFilters,
  isDelivered,
  nextAction,
  orderSubtitle,
  orderTitle,
  refundState,
  rowStateClass,
  sanitizeSearch,
  sectionByKey,
  shipmentStateLabel,
  sortDefinition,
} from '../src/services/ops-orders'

// The read layer is where a section becomes a query. Every assertion below is
// about the QUERY the database receives, because filtering, sorting and
// paging in the browser is exactly the bug this screen was built to avoid.

function fakeQuery() {
  const calls = []
  const query = new Proxy(
    {},
    {
      get(_target, method) {
        return (...args) => {
          calls.push({ method: String(method), args })
          return query
        }
      },
    },
  )
  const find = (method) => calls.filter((call) => call.method === method)
  const only = (method) => {
    const found = find(method)
    expect(found, `${method} should be called once`).toHaveLength(1)
    return found[0].args
  }
  return { query, calls, find, only }
}

function build({ section = 'making', filters = {}, sortKey = 'newest' } = {}) {
  const fake = fakeQuery()
  applyOrderFilters(fake.query, { section, filters, sortKey })
  return fake
}

describe('sections', () => {
  it('has exactly five subsections of one record set', () => {
    expect(ORDER_SECTIONS.map((section) => section.key)).toEqual([
      'making',
      'shipping',
      'delivery',
      'after-sale',
      'unopened',
    ])
    expect(ORDER_SECTIONS.map((section) => section.path)).toEqual([
      '/admin/operations',
      '/admin/operations/shipping',
      '/admin/operations/delivery',
      '/admin/operations/after-sale',
      '/admin/operations/unopened',
    ])
  })

  it('falls back to Making for an unknown section rather than querying nothing', () => {
    expect(sectionByKey('nope')).toBe(ORDER_SECTIONS[0])
    expect(sectionByKey('shipping').milestones).toEqual(['shipping'])
  })

  it('keeps delivered inside Delivery', () => {
    expect(DELIVERY_MILESTONES).toEqual(['delivery', 'delivered'])
    // `delivered` is a real milestone but not a section of its own.
    expect(ORDER_SECTIONS.map((section) => section.key)).not.toContain('delivered')
  })

  it('scopes each section to its milestones of the one enum', () => {
    // Making is both 'sold' (no work started yet) and 'making'; nothing else is
    // duplicated, so every order appears in exactly one production section.
    // Unopened is a filter on message_active + recipient_opened_at, not a milestone window.
    expect(ORDER_SECTIONS.map((section) => [section.key, section.milestones])).toEqual([
      ['making', ['sold', 'making']],
      ['shipping', ['shipping']],
      ['delivery', ['delivery', 'delivered']],
      ['after-sale', ['after_sale']],
      ['unopened', ['sold', 'making', 'shipping', 'delivery', 'delivered', 'after_sale']],
    ])
  })

  it('labels every milestone the enum can hold', () => {
    expect(Object.keys(MILESTONE_LABELS)).toEqual([
      'configured',
      'sold',
      'making',
      'shipping',
      'delivery',
      'delivered',
      'after_sale',
    ])
  })
})

describe('sanitizeSearch', () => {
  it('removes the characters PostgREST reads as query syntax', () => {
    expect(sanitizeSearch('DR-000021,title')).toBe('DR-000021 title')
    expect(sanitizeSearch('(a)*b%c_d\\e')).toBe('a b c d e')
  })

  it('collapses whitespace and trims', () => {
    expect(sanitizeSearch('  Hana   Omar  ')).toBe('Hana Omar')
    expect(sanitizeSearch(null)).toBe('')
    expect(sanitizeSearch(undefined)).toBe('')
  })
})

describe('applyOrderFilters', () => {
  it('scopes Making to sold and making, so a just-sold order is visible', () => {
    const { only, find } = build({ section: 'making' })
    expect(only('in')).toEqual(['milestone', ['sold', 'making']])
    expect(find('eq')).toHaveLength(0)
  })

  it('scopes Shipping to shipping and After-Sale to after_sale', () => {
    expect(build({ section: 'shipping' }).only('in')).toEqual(['milestone', ['shipping']])
    expect(build({ section: 'after-sale' }).only('in')).toEqual(['milestone', ['after_sale']])
  })

  it('scopes Delivery to both delivery and delivered, so a delivered parcel stays visible', () => {
    const { only } = build({ section: 'delivery' })
    expect(only('in')).toEqual(['milestone', DELIVERY_MILESTONES])
  })

  it('searches every identifier and contact column, including the order title', () => {
    const { only } = build({ filters: { ...EMPTY_FILTERS, query: 'DR-000021' } })
    const expression = only('or')[0]
    expect(expression).toContain('canonical_id.ilike.%DR-000021%')
    expect(expression).toContain('search_references.ilike.%DR-000021%')
    expect(expression).toContain('unit_reference.ilike.%DR-000021%')
    expect(expression).toContain('title.ilike.%DR-000021%')
    expect(expression).toContain('recipient_name.ilike.%DR-000021%')
    expect(expression).toContain('customer_phone.ilike.%DR-000021%')
    expect(expression).toContain('tracking_code.ilike.%DR-000021%')
    expect(expression).toContain('carrier_reference.ilike.%DR-000021%')
    expect(expression).not.toContain('project_title')
  })

  it('does not search on an empty query', () => {
    expect(build({ filters: { ...EMPTY_FILTERS, query: '   ' } }).find('or')).toHaveLength(0)
  })

  it('uses the sanitised search term', () => {
    const { only } = build({ filters: { ...EMPTY_FILTERS, query: 'DR,000021' } })
    expect(only('or')[0]).toContain('%DR 000021%')
  })

  it('applies carrier, designer and wrapper as exact matches', () => {
    const { find } = build({
      filters: { ...EMPTY_FILTERS, carrier: 'egypt_post', designerId: 'd-1', wrapperType: 'sealed_letter' },
    })
    expect(find('eq').map((call) => call.args)).toEqual([
      ['carrier', 'egypt_post'],
      ['designer_id', 'd-1'],
      ['wrapper_type', 'sealed_letter'],
    ])
  })

  it('matches governorate loosely and city as a contains', () => {
    const { find } = build({ filters: { ...EMPTY_FILTERS, governorate: 'CAIRO', city: 'Nasr' } })
    const ilikes = find('ilike').map((call) => call.args)
    expect(ilikes).toContainEqual(['governorate', 'CAIRO'])
    expect(ilikes).toContainEqual(['city', '%Nasr%'])
  })

  it('maps shipment, QR and archive filters onto persisted columns', () => {
    expect(build({ filters: { ...EMPTY_FILTERS, shipment: 'shipped' } }).find('eq')).toEqual([
      { method: 'eq', args: ['shipment_state', 'shipped'] },
    ])
    // QR readiness is ONE column computed in the database, never two flags.
    expect(build({ filters: { ...EMPTY_FILTERS, qr: 'ready' } }).only('eq')).toEqual(['qr_openable', true])
    expect(build({ filters: { ...EMPTY_FILTERS, qr: 'blocked' } }).only('eq')).toEqual(['qr_openable', false])
    expect(build({ filters: { ...EMPTY_FILTERS, archived: 'hide' } }).only('is')).toEqual(['archived_at', null])
    expect(build({ filters: { ...EMPTY_FILTERS, archived: 'only' } }).only('not')).toEqual([
      'archived_at',
      'is',
      null,
    ])
  })

  it('maps refund states onto the persisted totals', () => {
    expect(build({ filters: { ...EMPTY_FILTERS, refund: 'any' } }).only('gt')).toEqual(['refund_count', 0])
    expect(build({ filters: { ...EMPTY_FILTERS, refund: 'refunded' } }).only('gt')).toEqual(['refunded_amount', 0])
    expect(build({ filters: { ...EMPTY_FILTERS, refund: 'none' } }).only('eq')).toEqual(['refund_count', 0])
  })

  it('turns a paid date range into whole-day timestamps', () => {
    const { find } = build({ filters: { ...EMPTY_FILTERS, paidFrom: '2026-10-01', paidTo: '2026-10-31' } })
    const [gte] = find('gte').map((call) => call.args)
    const [lte] = find('lte').map((call) => call.args)
    expect(gte[0]).toBe('paid_at')
    expect(new Date(gte[1]).getTime()).toBe(new Date('2026-10-01T00:00:00').getTime())
    expect(lte[0]).toBe('paid_at')
    expect(new Date(lte[1]).getTime()).toBe(new Date('2026-10-31T23:59:59.999').getTime())
  })

  it('turns a moved date range into milestone timestamps', () => {
    const { find } = build({ filters: { ...EMPTY_FILTERS, movedFrom: '2026-09-15' } })
    expect(find('gte')[0].args[0]).toBe('milestone_updated_at')
    expect(find('lte')).toHaveLength(0)
  })

  it('ignores an unparseable date instead of sending Invalid Date', () => {
    const { find } = build({ filters: { ...EMPTY_FILTERS, paidFrom: 'not-a-date' } })
    expect(find('gte')).toHaveLength(0)
  })

  it('combines several filters at once', () => {
    const { find } = build({
      section: 'delivery',
      filters: {
        ...EMPTY_FILTERS,
        query: 'DR-000021',
        carrier: 'bosta',
        city: 'Giza',
        refund: 'refunded',
        shipment: 'delivered',
      },
      sortKey: 'customer',
    })
    expect(find('in')[0].args).toEqual(['milestone', DELIVERY_MILESTONES])
    expect(find('or')).toHaveLength(1)
    expect(find('eq').map((call) => call.args)).toEqual([
      ['carrier', 'bosta'],
      ['shipment_state', 'delivered'],
    ])
    expect(find('ilike')[0].args).toEqual(['city', '%Giza%'])
    expect(find('gt')[0].args).toEqual(['refunded_amount', 0])
  })

  it('sorts by the allowlisted column and always breaks ties on project_id', () => {
    const { find } = build({ sortKey: 'customer' })
    expect(find('order').map((call) => call.args)).toEqual([
      ['recipient_name', { ascending: true, nullsFirst: false }],
      ['project_id', { ascending: true }],
    ])
  })

  it('sorts newest first with a deterministic secondary key', () => {
    const { find } = build({ sortKey: 'newest' })
    expect(find('order').map((call) => call.args)).toEqual([
      ['created_at', { ascending: false, nullsFirst: false }],
      ['project_id', { ascending: true }],
    ])
  })

  it('refuses an unknown sort column', () => {
    const { find } = build({ sortKey: 'drop table projects' })
    expect(find('order')[0].args[0]).toBe('created_at')
  })
})

describe('sort definitions', () => {
  it('offers only real columns and unique keys', () => {
    const keys = ORDER_SORTS.map((sort) => sort.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const sort of ORDER_SORTS) expect(sort.column).toMatch(/^[a-z_]+$/)
  })

  it('falls back to newest for an unknown key', () => {
    expect(sortDefinition('nope')).toMatchObject({ key: 'newest', column: 'created_at' })
  })
})

describe('activeFilters', () => {
  it('lists only the filters that carry a value', () => {
    expect(activeFilters({ ...EMPTY_FILTERS, carrier: 'bosta', city: '  Giza ', query: '' })).toEqual([
      ['carrier', 'bosta'],
      ['city', '  Giza '],
    ])
    expect(activeFilters(EMPTY_FILTERS)).toEqual([])
    expect(activeFilters(null)).toEqual([])
  })
})

describe('presentation helpers', () => {
  it('reads delivered from the one milestone, never from a shipment copy', () => {
    expect(isDelivered({ milestone: 'delivered' })).toBe(true)
    expect(isDelivered({ milestone: 'after_sale' })).toBe(true)
    // The shipment row is production detail; a stale copy cannot overrule the
    // order's milestone.
    expect(isDelivered({ milestone: 'delivery', shipment_state: 'delivered' })).toBe(false)
    expect(isDelivered({ milestone: 'delivery', shipment_state: 'shipped' })).toBe(false)
    expect(isDelivered({ milestone: 'making' })).toBe(false)
    expect(isDelivered(null)).toBe(false)
  })

  it('tints a row from saved state, not from a click', () => {
    expect(rowStateClass({ milestone: 'delivered' })).toBe('bg-emerald-500/[0.07]')
    expect(rowStateClass({ milestone: 'after_sale' })).toBe('bg-emerald-500/[0.07]')
    expect(rowStateClass({ milestone: 'delivery', shipment_state: 'shipped' })).toBe('bg-sky-500/[0.06]')
    expect(rowStateClass({ milestone: 'making', refund_count: 1 })).toBe('bg-amber-500/[0.06]')
    expect(rowStateClass({ milestone: 'making', archived_at: '2026-10-01' })).toBe('opacity-60')
    expect(rowStateClass({ milestone: 'making' })).toBeUndefined()
  })

  it('names shipment states in the studio\u2019s words', () => {
    expect(shipmentStateLabel({ shipment_state: 'awaiting_shipment' })).toBe('Awaiting hand-off')
    expect(shipmentStateLabel({ shipment_state: 'shipped' })).toBe('With the carrier')
    expect(shipmentStateLabel({ shipment_state: 'delivered' })).toBe('Delivered')
    expect(shipmentStateLabel({})).toBe('Not shipped')
  })

  it('separates a zero-value refund from money actually returned', () => {
    expect(refundState({})).toEqual({ key: 'none', label: 'No refunds' })
    expect(refundState({ refund_count: 1, refunded_amount: 0 })).toEqual({
      key: 'recorded',
      label: '1 refund recorded',
    })
    expect(refundState({ refund_count: 2, refunded_amount: 150 })).toEqual({
      key: 'refunded',
      label: 'Refunded',
    })
  })

  it('offers one next action per state', () => {
    expect(nextAction({ milestone: 'configured' })).toBeNull()
    expect(nextAction({ milestone: 'sold', is_digital: false })).toEqual({ key: 'making-complete', label: 'Finish Making' })
    expect(nextAction({ milestone: 'sold', is_digital: true })).toBeNull()
    expect(nextAction({ milestone: 'making' })).toEqual({ key: 'making-complete', label: 'Finish Making' })
    expect(nextAction({ milestone: 'shipping' })).toEqual({ key: 'ship', label: 'Mark shipped' })
    expect(nextAction({ milestone: 'delivery' })).toEqual({ key: 'deliver', label: 'Mark delivered' })
    expect(nextAction({ milestone: 'delivered' })).toEqual({ key: 'after-sale', label: 'Move to After-Sale' })
    expect(nextAction({ milestone: 'after_sale' })).toBeNull()
  })

  it('subtitles an order from its identifiers', () => {
    expect(orderTitle({ title: 'Leather journal', canonical_id: 'DR-000021' })).toBe('Leather journal')
    expect(orderTitle({ canonical_id: 'DR-000021' })).toBe('DR-000021')
    expect(orderTitle(null)).toBe('Dearune')
    expect(orderSubtitle({ canonical_id: 'DR-000021', unit_reference: 'DR70700000011' })).toBe(
      'DR-000021 · unit DR70700000011',
    )
    expect(orderSubtitle(null)).toBe('')
  })
})
