import { describe, expect, it } from 'vitest'
import { PHYSICAL_ID_PATTERN, soldIdFor } from '../src/services/constants'
import {
  OPERATIONS_SORTS,
  matchesOperationQuery,
  sortOperations,
  statusCounts,
  toOperation,
  validateOperationForPaper,
  viewOperations,
} from '../src/services/operations'
import { qrState } from '../src/services/qrState'

const ID = 'DR70700897645'

// A fully-printable unit, in the exact shape `toOperation` produces.
// `status` is a PROJECTION of the order's one milestone — never stored.
const operation = (overrides = {}) => {
  const base = {
    id: 'op-1',
    reference: ID,
    soldId: 'SOL-000001',
    hasValidId: true,
    unitIndex: 1,
    milestone: 'making',
    status: 'sold',
    notes: '',
    archivedAt: null,
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    projectId: 'project-1',
    projectReference: 'DR-000001',
    projectTitle: 'For my sister',
    publicId: 'abcdefabcdefabcdefabcdef',
    publicToken: 'token-1',
    wrapperType: 'sealed_letter',
    templateSlug: 'memorial-letter',
    paidAt: null,
    manufacturedAt: null,
    shippedAt: null,
    deliveredAt: null,
    messageActive: true,
    messageProtected: false,
    qr: { destination: true, activated: true, openable: true, blockedReason: null },
    designerId: 'designer-1',
    designerName: 'Nour Adel',
    designerCode: 'DR-100001',
    recipientName: 'Mona',
    customerPhone: '01000000001',
    trackingCode: '',
    provider: '',
    addressLine1: '12 Nile Street',
    addressLine2: '',
    city: 'Cairo',
    stateProvince: '',
    postalCode: '',
    country: 'Egypt',
    specialInstructions: '',
    ...overrides,
  }
  return {
    ...base,
    soldAt: base.paidAt,
    manufacturingCompletedAt: base.manufacturedAt,
  }
}

describe('the canonical physical id', () => {
  it('is DR plus exactly eleven digits — and nothing else', () => {
    expect(PHYSICAL_ID_PATTERN.test('DR70700897645')).toBe(true)
    expect(PHYSICAL_ID_PATTERN.test('DR70700000001')).toBe(true)
    expect(PHYSICAL_ID_PATTERN.test('DR00000000000')).toBe(true)

    // The legacy project reference must never be mistaken for a unit id.
    expect(PHYSICAL_ID_PATTERN.test('DR-000001')).toBe(false)
    expect(PHYSICAL_ID_PATTERN.test('DR7070089764')).toBe(false)
    expect(PHYSICAL_ID_PATTERN.test('DR707008976451')).toBe(false)
    expect(PHYSICAL_ID_PATTERN.test('dr70700897645')).toBe(false)
    expect(PHYSICAL_ID_PATTERN.test('DR7070089764A')).toBe(false)
    expect(PHYSICAL_ID_PATTERN.test('XX70700897645')).toBe(false)
    expect(PHYSICAL_ID_PATTERN.test('')).toBe(false)
    expect(PHYSICAL_ID_PATTERN.test(null)).toBe(false)
  })

  it('derives the Sold ID from the DEARUNE id, never from a unit id', () => {
    expect(soldIdFor('DR-000021')).toBe('SOL-000021')
    expect(soldIdFor('DR-123456')).toBe('SOL-123456')
    // A physical unit is not an order: it has no Sold ID of its own.
    expect(soldIdFor('DR70700897645')).toBe('')
    expect(soldIdFor('SOL-DR70700897645')).toBe('')
    expect(soldIdFor('')).toBe('')
    expect(soldIdFor(undefined)).toBe('')
  })
})

describe('shaping a list row', () => {
  it('turns a view row into the shape the screens and the paper read', () => {
    const row = toOperation({
      id: 'op-9',
      reference: ID,
      unit_index: 2,
      project_title: 'For Hana',
      designer_name: 'Nour',
      designer_code: 'DR-1',
      recipient_name: 'Hana',
      customer_phone: '0109',
      milestone: 'making',
      sold_id: 'SOL-000009',
      qr_destination: true,
      qr_activated: true,
      qr_openable: false,
      qr_blocked_reason: 'password_protected',
      message_active: true,
      archived_at: null,
      paid_at: null,
      manufactured_at: null,
      shipped_at: null,
      delivered_at: null,
    })
    expect(row.reference).toBe(ID)
    expect(row.soldId).toBe('SOL-000009')
    expect(row.hasValidId).toBe(true)
    expect(row.unitIndex).toBe(2)
    expect(row.milestone).toBe('making')
    expect(row.status).toBe('sold')
    expect(row.archived).toBe(false)
    expect(row.qr.openable).toBe(false)
    expect(row.qr.blockedReason).toBe('password_protected')
    expect(row.designerName).toBe('Nour')
    expect(row.recipientName).toBe('Hana')
    // Missing optional fields become empty strings, never undefined.
    expect(row.notes).toBe('')
    expect(row.specialInstructions).toBe('')
  })

  it('projects status from the order milestone, never from unit timestamps', () => {
    const at = (milestone) =>
      toOperation({
        id: 'op-9',
        reference: ID,
        milestone,
        qr_destination: true,
        qr_activated: true,
        qr_openable: true,
        qr_blocked_reason: null,
      }).status

    expect(at('configured')).toBe('pending')
    expect(at('sold')).toBe('sold')
    expect(at('making')).toBe('sold')
    expect(at('shipping')).toBe('manufactured')
    expect(at('delivery')).toBe('shipped')
    expect(at('delivered')).toBe('delivered')
    expect(at('after_sale')).toBe('delivered')
  })

  it('ignores stale unit stamps once the order has moved on', () => {
    // A unit that was never re-stamped must not hold the order back.
    const row = toOperation({
      id: 'op-9',
      reference: ID,
      milestone: 'delivery',
      manufactured_at: null,
      shipped_at: null,
      delivered_at: null,
      qr_destination: true,
      qr_activated: true,
      qr_openable: true,
      qr_blocked_reason: null,
    })
    expect(row.status).toBe('shipped')
  })

  it('marks a row whose id is not canonical, so it can never be printed', () => {
    const row = toOperation({ id: 'op-9', reference: 'DR-000001', milestone: 'making' })
    expect(row.hasValidId).toBe(false)
    expect(row.unitIndex).toBe(1)
  })

  it('marks an archived row as archived', () => {
    const row = toOperation({ id: 'op-9', reference: ID, milestone: 'making', archived_at: '2026-02-01T00:00:00Z' })
    expect(row.archived).toBe(true)
    expect(row.archivedAt).toBe('2026-02-01T00:00:00Z')
  })
})

describe('sorting', () => {
  const three = () => [
    operation({ id: 'c', reference: 'DR70700000003', createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z', milestone: 'delivery', status: 'shipped', recipientName: 'Zoe' }),
    operation({ id: 'a', reference: 'DR70700000001', createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', milestone: 'making', status: 'sold', recipientName: 'Ahmed' }),
    operation({ id: 'b', reference: 'DR70700000002', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z', milestone: 'delivered', status: 'delivered', recipientName: 'Mona' }),
  ]
  const ids = (rows) => rows.map((row) => row.reference)

  it('offers the requested sort orders', () => {
    expect(OPERATIONS_SORTS.map((sort) => sort.key)).toEqual(['newest', 'oldest', 'updated', 'status', 'id', 'customer'])
  })

  it('defaults to newest first', () => {
    expect(ids(sortOperations(three()))).toEqual(['DR70700000001', 'DR70700000003', 'DR70700000002'])
    expect(ids(sortOperations(three(), 'newest'))).toEqual(ids(sortOperations(three())))
  })

  it('sorts oldest, recently updated, by id and by customer', () => {
    expect(ids(sortOperations(three(), 'oldest'))).toEqual(['DR70700000002', 'DR70700000003', 'DR70700000001'])
    expect(ids(sortOperations(three(), 'updated'))).toEqual(['DR70700000002', 'DR70700000003', 'DR70700000001'])
    expect(ids(sortOperations(three(), 'id'))).toEqual(['DR70700000001', 'DR70700000002', 'DR70700000003'])
    expect(ids(sortOperations(three(), 'customer'))).toEqual(['DR70700000001', 'DR70700000002', 'DR70700000003'])
  })

  it('sorts by milestone stage, not alphabetically', () => {
    expect(ids(sortOperations(three(), 'status'))).toEqual(['DR70700000001', 'DR70700000003', 'DR70700000002'])
  })

  it('is a total order: ties always break on the canonical id', () => {
    const tied = [
      operation({ reference: 'DR70700000009', createdAt: '2026-01-01T00:00:00Z' }),
      operation({ reference: 'DR70700000004', createdAt: '2026-01-01T00:00:00Z' }),
      operation({ reference: 'DR70700000007', createdAt: '2026-01-01T00:00:00Z' }),
    ]
    expect(ids(sortOperations(tied, 'newest'))).toEqual(['DR70700000004', 'DR70700000007', 'DR70700000009'])
    expect(ids(sortOperations(tied, 'updated'))).toEqual(['DR70700000004', 'DR70700000007', 'DR70700000009'])
    expect(ids(sortOperations(tied, 'status'))).toEqual(['DR70700000004', 'DR70700000007', 'DR70700000009'])
  })

  it('never mutates the list it was handed', () => {
    const rows = three()
    const before = ids(rows)
    sortOperations(rows, 'id')
    expect(ids(rows)).toEqual(before)
  })
})

describe('searching', () => {
  const row = operation({
    reference: 'DR70700897645',
    soldId: 'SOL-000123',
    projectTitle: 'For my sister',
    designerName: 'Nour Adel',
    designerCode: 'DR-100001',
    recipientName: 'Mona Hassan',
    customerPhone: '01000000001',
    projectReference: 'DR-000123',
  })

  it('finds a unit by its unit id, its Dearune id and its Sold ID', () => {
    expect(matchesOperationQuery(row, 'DR70700897645')).toBe(true)
    expect(matchesOperationQuery(row, 'DR-000123')).toBe(true)
    expect(matchesOperationQuery(row, 'SOL-000123')).toBe(true)
    expect(matchesOperationQuery(row, 'SOL-000124')).toBe(false)
  })

  it('finds a unit by customer, designer or project title', () => {
    expect(matchesOperationQuery(row, 'Mona')).toBe(true)
    expect(matchesOperationQuery(row, 'mona hassan')).toBe(true)
    expect(matchesOperationQuery(row, 'nour')).toBe(true)
    expect(matchesOperationQuery(row, 'DR-100001')).toBe(true)
    expect(matchesOperationQuery(row, 'sister')).toBe(true)
    expect(matchesOperationQuery(row, '01000000001')).toBe(true)
    expect(matchesOperationQuery(row, 'nobody')).toBe(false)
  })

  it('ignores case and surrounding space, and treats an empty query as "everything"', () => {
    expect(matchesOperationQuery(row, '  MONA  ')).toBe(true)
    expect(matchesOperationQuery(row, '')).toBe(true)
    expect(matchesOperationQuery(row, '   ')).toBe(true)
  })

  it('requires every typed word to be present somewhere in the row', () => {
    expect(matchesOperationQuery(row, 'mona hassan')).toBe(true)
    expect(matchesOperationQuery(row, 'mona adel')).toBe(true)
    expect(matchesOperationQuery(row, 'mona zzz')).toBe(false)
  })
})

describe('the studio list', () => {
  const list = () => [
    operation({ id: 'x', reference: 'DR70700000001', status: 'delivered', archived: true, archivedAt: '2026-02-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z' }),
    operation({ id: 'y', reference: 'DR70700000002', status: 'delivered', createdAt: '2026-01-02T00:00:00Z' }),
    operation({ id: 'z', reference: 'DR70700000003', status: 'shipped', createdAt: '2026-02-02T00:00:00Z' }),
    operation({ id: 'w', reference: 'DR70700000004', status: 'pending', createdAt: '2026-03-02T00:00:00Z' }),
  ]
  const ids = (rows) => rows.map((row) => row.reference)

  it('shows active work by default and leaves the archive out', () => {
    expect(ids(viewOperations(list()))).toEqual(['DR70700000004', 'DR70700000003', 'DR70700000002'])
  })

  it('brings the archive back only when asked', () => {
    const shown = viewOperations(list(), { includeArchived: true })
    expect(shown).toHaveLength(4)
    expect(shown.some((row) => row.archived)).toBe(true)
  })

  it('filters by a single milestone status', () => {
    expect(ids(viewOperations(list(), { status: 'delivered' }))).toEqual(['DR70700000002'])
    expect(ids(viewOperations(list(), { status: 'shipped' }))).toEqual(['DR70700000003'])
  })

  it('combines a search with the archive switch and a sort', () => {
    const found = viewOperations(list(), { query: 'DR7070000000', includeArchived: true, sortKey: 'id' })
    expect(ids(found)).toEqual(['DR70700000001', 'DR70700000002', 'DR70700000003', 'DR70700000004'])
  })

  it('counts the board by milestone status', () => {
    const counts = statusCounts(list())
    expect(counts.pending).toBe(1)
    expect(counts.sold).toBe(0)
    expect(counts.manufactured).toBe(0)
    expect(counts.shipped).toBe(1)
    expect(counts.delivered).toBe(2)
    expect(Object.keys(counts).sort()).toEqual(['delivered', 'manufactured', 'pending', 'shipped', 'sold'].sort())
  })
})

describe('checking a unit is ready to print', () => {
  it('passes a complete, switched-on unit without complaint', () => {
    const result = validateOperationForPaper(operation())
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it('refuses to print a unit with no canonical id, and says why', () => {
    const result = validateOperationForPaper(operation({ reference: 'DR-000001' }))
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/canonical id/i)
  })

  it('refuses to print when the QR has nowhere to go', () => {
    const result = validateOperationForPaper(operation({ qr: qrState({ publicId: '', publicToken: '' }) }))
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/no public link/i)
  })

  it('refuses to print a letter that is switched off', () => {
    const result = validateOperationForPaper(operation({ qr: qrState({ publicId: 'a'.repeat(24), publicToken: 't', messageActive: false }) }))
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/switched off/i)
  })

  it('refuses to print a password-protected letter', () => {
    const result = validateOperationForPaper(operation({ qr: qrState({ publicId: 'a'.repeat(24), publicToken: 't', messageActive: true, passwordSet: true }) }))
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/password/i)
  })

  it('still warns about a missing customer number, but does not block', () => {
    const result = validateOperationForPaper(operation({ customerPhone: '' }))
    expect(result.ok).toBe(true)
    expect(result.warnings.join(' ')).toMatch(/customer number/i)
  })

  it('refuses to print an unsigned Designer', () => {
    expect(validateOperationForPaper(operation({ designerName: '' })).errors.join(' ')).toMatch(/designer name/i)
    expect(validateOperationForPaper(operation({ designerCode: '' })).errors.join(' ')).toMatch(/designer id/i)
  })
})
