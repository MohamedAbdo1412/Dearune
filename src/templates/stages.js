// The stage contract — ONE vocabulary for the book's pages.
//
// Every book shares the same base chapters (enter · for whom · the papers),
// then a template contributes its own pages, and the shared sending pages
// (how the book arrives · the proof · the terms) close it. This module is
// deliberately pure (no React, no storage): the draft layer re-exports it,
// the template registry derives from it, and the pipeline reads it, so the
// sequence can never drift between the three.
//
// Ordering note: the shared pages are NOT a plain suffix — `wrapper` sits
// between writing the words and locking them, so the choice reads as part of
// the same act of sending. Each template therefore declares its FULL sequence
// here, weaving the shared stage keys in where they belong.

export const BASE_STAGES = ['access', 'receiver', 'templates']
export const UNWRITTEN_STAGE = 'unwritten'
export const WRAPPER_STAGE = 'wrapper'
export const REVIEW_STAGE = 'review'
export const POLICIES_STAGE = 'policies'
export const SUBMITTED_STAGE = 'submitted'
export const STATUS_STAGE = 'status'

// Pages every template inherits (its sequence must include all of these).
export const SHARED_TEMPLATE_STAGES = [WRAPPER_STAGE, REVIEW_STAGE, POLICIES_STAGE]

// Template slug → its full page sequence. The single source of truth: the
// draft layer's TEMPLATE_STAGES and the frontend template registry both
// derive from this map.
export const TEMPLATE_SEQUENCES = {
  'memorial-message': ['memorial.language', 'memorial.editor', WRAPPER_STAGE, 'memorial.password', REVIEW_STAGE, POLICIES_STAGE],
  // No lock: this paper publishes no letter, only a destination. The wrapper
  // and the close/terms pages are the same shared pages every paper inherits.
  'external-link': ['external.link', 'external.preview', WRAPPER_STAGE, REVIEW_STAGE, POLICIES_STAGE],
}

export function templateStagesFor(slug) {
  if (!slug) return []
  const sequence = TEMPLATE_SEQUENCES[slug]
  return sequence ? [...sequence] : [UNWRITTEN_STAGE]
}

// Where the next / previous leaf lands inside a sequence, or null at the ends.
export function nextStageIn(sequence, key) {
  const index = sequence.indexOf(key)
  return index >= 0 && index + 1 < sequence.length ? sequence[index + 1] : null
}

export function previousStageIn(sequence, key) {
  const index = sequence.indexOf(key)
  return index > 0 ? sequence[index - 1] : null
}

// Contract checks for a registered template: its declared stages must match
// the canonical sequence, and every component it claims must map to a stage
// it actually declares (or a shared one).
export function checkTemplateContract(template, slug) {
  const problems = []
  if (!template) return [`no template registered for “${slug}”`]
  const expected = TEMPLATE_SEQUENCES[slug]
  if (!expected) {
    problems.push(`no sequence declared for “${slug}”`)
  } else if (JSON.stringify(template.stages) !== JSON.stringify(expected)) {
    problems.push(`template.stages does not match the declared sequence for “${slug}”`)
  }
  for (const key of Object.keys(template.components ?? {})) {
    if (SHARED_TEMPLATE_STAGES.includes(key)) {
      problems.push(`components["${key}"] is a shared book page, not the template's to claim`)
    } else if (!expected?.includes(key)) {
      problems.push(`components["${key}"] is not a stage of “${slug}”`)
    }
  }
  for (const key of SHARED_TEMPLATE_STAGES) {
    if (expected && !expected.includes(key)) problems.push(`sequence for “${slug}” misses the shared stage “${key}”`)
  }
  return problems
}
