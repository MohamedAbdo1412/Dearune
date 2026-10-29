import { describe, expect, it } from 'vitest'
import {
  BASE_STAGES,
  REVIEW_STAGE,
  POLICIES_STAGE,
  SHARED_TEMPLATE_STAGES,
  TEMPLATE_SEQUENCES,
  checkTemplateContract,
  nextStageIn,
  previousStageIn,
  templateStagesFor,
} from '@/templates/stages'
import { MEMORIAL_TEMPLATE } from '@/templates/memorial-message/v1'
import { TEMPLATE_REGISTRY, templateRegistry } from '@/templates'

describe('template contract', () => {
  it('keeps the base book and the canonical memorial sequence', () => {
    expect(BASE_STAGES).toEqual(['access', 'receiver', 'templates'])
    expect(TEMPLATE_SEQUENCES['memorial-message']).toEqual([
      'memorial.language',
      'memorial.editor',
      'wrapper',
      'memorial.password',
      REVIEW_STAGE,
      POLICIES_STAGE,
    ])
    // the draft layer's view is the same sequence, not a parallel copy
    expect(templateStagesFor('memorial-message')).toEqual(TEMPLATE_SEQUENCES['memorial-message'])
    expect(templateStagesFor('unknown-paper')).toEqual(['unwritten'])
    expect(templateStagesFor('')).toEqual([])
    expect(templateStagesFor(null)).toEqual([])
  })

  it('places the shared sending pages where every template inherits them', () => {
    const sequence = templateStagesFor('memorial-message')
    for (const shared of SHARED_TEMPLATE_STAGES) expect(sequence).toContain(shared)
    expect(sequence.indexOf('wrapper')).toBeGreaterThan(sequence.indexOf('memorial.editor'))
    expect(sequence.indexOf('wrapper')).toBeLessThan(sequence.indexOf('memorial.password'))
  })

  it('derives each registered template from the contract', () => {
    for (const [slug, template] of Object.entries(TEMPLATE_REGISTRY)) {
      expect(checkTemplateContract(template, slug)).toEqual([])
    }
    expect(templateRegistry('memorial-message')).toBe(MEMORIAL_TEMPLATE)
    expect(templateRegistry('no-such-paper')).toBeNull()
  })

  it('only claims components that are stages of its own sequence', () => {
    const componentKeys = Object.keys(MEMORIAL_TEMPLATE.components)
    expect(componentKeys).toEqual(['memorial.language', 'memorial.editor', 'memorial.password'])
    for (const key of componentKeys) expect(MEMORIAL_TEMPLATE.stages).toContain(key)
    // Book-owned pages are NOT the template's to claim
    for (const shared of SHARED_TEMPLATE_STAGES) expect(componentKeys).not.toContain(shared)
  })

  it('walks the sequence in both directions', () => {
    const sequence = templateStagesFor('memorial-message')
    expect(nextStageIn(sequence, 'memorial.editor')).toBe('wrapper')
    expect(previousStageIn(sequence, 'wrapper')).toBe('memorial.editor')
    expect(nextStageIn(sequence, POLICIES_STAGE)).toBeNull()
    expect(previousStageIn(sequence, 'memorial.language')).toBeNull()
    expect(nextStageIn(sequence, 'nope')).toBeNull()
  })

  it('reports a broken contract instead of rendering a wrong book', () => {
    expect(checkTemplateContract(null, 'ghost-paper')).toEqual(['no template registered for “ghost-paper”'])
    expect(
      checkTemplateContract({ ...MEMORIAL_TEMPLATE, stages: ['memorial.language'] }, 'memorial-message')
    ).toContain('template.stages does not match the declared sequence for “memorial-message”')
    const rogue = { ...MEMORIAL_TEMPLATE, components: { ...MEMORIAL_TEMPLATE.components, policies: () => null } }
    expect(checkTemplateContract(rogue, 'memorial-message')).toContain(
      'components["policies"] is a shared book page, not the template\'s to claim'
    )
    const stranger = { ...MEMORIAL_TEMPLATE, components: { ...MEMORIAL_TEMPLATE.components, 'memorial.foo': () => null } }
    expect(checkTemplateContract(stranger, 'memorial-message')).toContain('components["memorial.foo"] is not a stage of “memorial-message”')
  })
})
