import { MEMORIAL_TEMPLATE } from './memorial-message'
import { ClassicLetterMini, WaxWordMini, SilentCardMini } from './memorial-message/MemorialCardMini'

// Templates the pipeline can build page-by-page. Registry is keyed by the
// template `code` used in the database; anything not listed here falls opens
// as an ?unwritten? form until the studio finishes it.

export const TEMPLATE_REGISTRY = {
  'memorial-message': MEMORIAL_TEMPLATE,
}

// Visual thumbnails for templates that exist in the database + studio but do
// not yet have a drawn pipeline. Enough to keep the choosing of papers honest.
export const NAMED_TEMPLATE_MINIS = {
  'classic-letter': ClassicLetterMini,
  'word-and-wax': WaxWordMini,
  'silent-card': SilentCardMini,
}

export function templateRegistry(slug) {
  return TEMPLATE_REGISTRY[slug] ?? null
}

export function templateMiniFor(slug) {
  if (TEMPLATE_REGISTRY[slug]?.CardMini) return TEMPLATE_REGISTRY[slug].CardMini
  return NAMED_TEMPLATE_MINIS[slug] ?? null
}