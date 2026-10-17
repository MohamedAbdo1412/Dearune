import { validateOperationForPaper } from './operations'

// ---- the review step -------------------------------------------------------
// Between "these units are selected" and "these papers exist" sits a deliberate
// checkpoint: a field can be corrected, each correction is remembered for the
// unit it belongs to while the studio moves around the batch, and nothing at all
// is written until it is confirmed.
//
// Those rules live here rather than inside the screen so they can be read, and
// tested, on their own — the screen is only a view of this.

// The fields the review step is allowed to correct, and the entity that really
// owns each one. The phone belongs to the Dearune's delivery row; the Designer
// name and ID belong to the designer. Nothing here writes to the unit itself.
export const REVIEW_FIELDS = [
  { key: 'customerPhone', owner: 'shipping' },
  { key: 'designerName', owner: 'designer' },
  { key: 'designerCode', owner: 'designer' },
]

// A draft is only ever an overlay, and only of the fields this step owns. The
// record is never mutated, and nothing outside REVIEW_FIELDS — least of all the
// canonical id — can be changed by a draft, even a malformed one.
export function mergeDraft(operation, draft) {
  if (!draft) return operation
  const merged = { ...operation }
  for (const { key } of REVIEW_FIELDS) {
    if (draft[key] !== undefined) merged[key] = draft[key]
  }
  return merged
}

// What a draft actually changes, as field names. An empty list means the draft
// is a no-op and there is nothing to save for this unit.
export function draftChanges(operation, draft) {
  if (!draft) return []
  return REVIEW_FIELDS.filter(
    ({ key }) => draft[key] !== undefined && draft[key] !== operation[key],
  ).map(({ key }) => key)
}

// The whole batch, judged exactly as the screen judges it: every item with its
// merged values and its verdict, then the batch split into what can be produced,
// what can be produced with a caveat, and what cannot be produced at all.
export function reviewBatch(operations, drafts = {}) {
  const items = (operations ?? []).map((operation) => {
    const draft = drafts[operation.id] ?? null
    const merged = mergeDraft(operation, draft)
    const changedFields = draftChanges(operation, draft)
    return {
      operation,
      draft,
      merged,
      check: validateOperationForPaper(merged),
      edited: changedFields.length > 0,
      changedFields,
    }
  })

  return {
    items,
    // Blocked items are shown but never printed: the confirm button stays off
    // until they are fixed or removed from the batch.
    blocked: items.filter((item) => !item.check.ok),
    warned: items.filter((item) => item.check.ok && item.check.warnings.length > 0),
    ready: items.filter((item) => item.check.ok),
  }
}
