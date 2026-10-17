import { describe, expect, it } from 'vitest'
import { REVIEW_FIELDS, draftChanges, mergeDraft, reviewBatch } from '../src/services/operationsReview'
import { soldAsId } from '../src/services/constants'

const ID = 'DR70700897645'

// A complete, printable unit in the shape the Operations screen holds.
const operation = (overrides = {}) => ({
  id: 'op-1',
  reference: ID,
  soldAs: soldAsId(ID),
  hasValidId: true,
  unitIndex: 1,
  status: 'ready_to_print',
  notes: '',
  archived: false,
  archivedAt: null,
  projectId: 'project-1',
  projectTitle: 'For my sister',
  publicId: 'abcdefabcdefabcdefabcdef',
  publicToken: 'token-1',
  designerName: 'Nour Adel',
  designerCode: 'DR-100001',
  recipientName: 'Mona',
  customerPhone: '01000000001',
  messageActive: true,
  messageProtected: false,
  ...overrides,
})

describe('what the review step may correct', () => {
  it('lists only fields whose real owner lives somewhere else', () => {
    expect(REVIEW_FIELDS.map((f) => f.key)).toEqual(['customerPhone', 'designerName', 'designerCode'])
    expect(REVIEW_FIELDS.find((f) => f.key === 'customerPhone').owner).toBe('shipping')
    expect(REVIEW_FIELDS.filter((f) => f.key !== 'customerPhone').every((f) => f.owner === 'designer')).toBe(true)
  })
})

describe('merging a draft over a record', () => {
  it('overlays the edited fields and leaves the rest alone', () => {
    const source = operation()
    const merged = mergeDraft(source, { customerPhone: '01099999999' })
    expect(merged.customerPhone).toBe('01099999999')
    expect(merged.designerName).toBe('Nour Adel')
    expect(merged.reference).toBe(ID)
  })

  it('never mutates the record it was handed', () => {
    const source = operation()
    mergeDraft(source, { customerPhone: '01099999999', designerName: 'Someone' })
    expect(source.customerPhone).toBe('01000000001')
    expect(source.designerName).toBe('Nour Adel')
  })

  it('returns the record untouched when there is no draft', () => {
    const source = operation()
    expect(mergeDraft(source, null)).toBe(source)
    expect(mergeDraft(source)).toBe(source)
  })

  it('keeps the canonical id unchangeable through a draft', () => {
    // A draft overlays only the fields the review step owns, so even a
    // malformed one cannot rewrite the id — it is not a reviewable field.
    const merged = mergeDraft(operation(), { reference: 'DR00000000000', status: 'shipped' })
    expect(merged.reference).toBe(ID)
    expect(merged.status).toBe('ready_to_print')
    expect(draftChanges(operation(), { reference: 'DR00000000000' })).toEqual([])
  })
})

describe('spotting what a draft actually changed', () => {
  it('reports each field that differs, and nothing that does not', () => {
    const source = operation()
    expect(draftChanges(source, { customerPhone: '01099999999' })).toEqual(['customerPhone'])
    expect(draftChanges(source, { designerName: 'Hana' })).toEqual(['designerName'])
    expect(draftChanges(source, { designerCode: 'DR-2' })).toEqual(['designerCode'])
    expect(
      draftChanges(source, { customerPhone: '01099999999', designerName: 'Hana', designerCode: 'DR-2' }),
    ).toEqual(['customerPhone', 'designerName', 'designerCode'])
  })

  it('treats a draft that matches the record as no change at all', () => {
    const source = operation()
    expect(draftChanges(source, { customerPhone: source.customerPhone })).toEqual([])
    expect(draftChanges(source, {})).toEqual([])
    expect(draftChanges(source, null)).toEqual([])
  })

  it('ignores fields the review step does not own', () => {
    const source = operation()
    expect(draftChanges(source, { notes: 'scribble', status: 'shipped', reference: 'DR00000000000' })).toEqual([])
  })

  it('counts an empty phone as a change worth saving', () => {
    // Clearing a wrong number is a real correction, not a no-op.
    expect(draftChanges(operation({ customerPhone: '01000000001' }), { customerPhone: '' })).toEqual([
      'customerPhone',
    ])
  })
})

describe('judging the whole batch', () => {
  it('splits a clean batch into ready items with nothing blocked', () => {
    const review = reviewBatch([operation({ id: 'a' }), operation({ id: 'b', reference: 'DR70700000002' })])
    expect(review.items).toHaveLength(2)
    expect(review.blocked).toEqual([])
    expect(review.warned).toEqual([])
    expect(review.ready).toHaveLength(2)
  })

  it('blocks a unit that cannot be printed at all, and names it', () => {
    const review = reviewBatch([
      operation({ id: 'a' }),
      operation({ id: 'b', reference: 'DR-000001', hasValidId: false }),
    ])
    expect(review.blocked).toHaveLength(1)
    expect(review.blocked[0].operation.id).toBe('b')
    expect(review.ready).toHaveLength(1)
  })

  it('lets a caveat through as a warning, not a block', () => {
    const review = reviewBatch([operation({ id: 'a', customerPhone: '' })])
    expect(review.blocked).toEqual([])
    expect(review.warned).toHaveLength(1)
    expect(review.ready).toHaveLength(1)
  })

  it('judges the merged values, not the stale record', () => {
    // The record has no number; the draft supplies one, so the warning goes away.
    const review = reviewBatch([operation({ id: 'a', customerPhone: '' })], {
      a: { customerPhone: '01000000001' },
    })
    expect(review.warned).toEqual([])
    expect(review.items[0].edited).toBe(true)
    expect(review.items[0].merged.customerPhone).toBe('01000000001')
  })

  it('flags an edited item, and records which fields moved', () => {
    const review = reviewBatch([operation({ id: 'a' })], { a: { designerName: 'Hana', designerCode: 'DR-2' } })
    expect(review.items[0].edited).toBe(true)
    expect(review.items[0].changedFields).toEqual(['designerName', 'designerCode'])
  })

  it('leaves an untouched unit unedited in the same batch', () => {
    const review = reviewBatch([operation({ id: 'a' }), operation({ id: 'b', reference: 'DR70700000002' })], {
      a: { customerPhone: '01099999999' },
    })
    expect(review.items[0].edited).toBe(true)
    expect(review.items[1].edited).toBe(false)
    expect(review.items[1].merged.customerPhone).toBe('01000000001')
  })

  it('is empty, and harmless, for an empty selection', () => {
    const review = reviewBatch([])
    expect(review.items).toEqual([])
    expect(review.blocked).toEqual([])
    expect(review.ready).toEqual([])
  })

  it('keeps the batch in the order it was given, for page pairing', () => {
    const review = reviewBatch([
      operation({ id: 'z', reference: 'DR70700000009' }),
      operation({ id: 'a', reference: 'DR70700000001' }),
    ])
    expect(review.items.map((item) => item.operation.reference)).toEqual(['DR70700000009', 'DR70700000001'])
  })
})
