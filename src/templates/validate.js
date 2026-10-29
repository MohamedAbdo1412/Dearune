import { validateMemorial } from './memorial-message/v1/MemorialEditorStage'
import { validateExternalLink } from './external-link/v1/validate'

// One question, asked by every page that can hold the pen back: is this paper's
// draft ready to move on (and, at the seal, ready to hand over)?
//
// The memorial letter needs words and a signature; the external-link paper
// needs one printable destination. Shared pages (review · terms) and the submit
// path call this instead of assuming a letter.
export function validateTemplateDraft(slug, draft, lang = 'en') {
  if (slug === 'external-link') return validateExternalLink(draft, lang)
  return validateMemorial(draft, lang)
}

export default validateTemplateDraft
