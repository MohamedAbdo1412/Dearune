import { ClassicLetterMini, WaxWordMini, SilentCardMini } from './memorial-message/v1/MemorialCardMini'
import { getTemplate, getCurrentTemplateVersion, resolveTemplateVersion, templateRegistry as newTemplateRegistry, TEMPLATE_SEQUENCES, getTemplateVersions, getTemplateManifest, isVersionRegistered, listTemplates, setCurrentTemplateVersion } from './registry'

// Templates the pipeline can build page-by-page. Registry is keyed by the
// template `code` used in the database; anything not listed here falls opens
// as an ?unwritten? form until the studio finishes it.

export const TEMPLATE_REGISTRY = {
  'memorial-message': getTemplate('memorial-message'),
}

// Visual thumbnails for templates that exist in the database + studio but do
// not yet have a drawn pipeline. Enough to keep the choosing of papers honest.
export const NAMED_TEMPLATE_MINIS = {
  'classic-letter': ClassicLetterMini,
  'word-and-wax': WaxWordMini,
  'silent-card': SilentCardMini,
}

export function templateRegistry(slug, version) {
  // Support both old and new calling conventions
  const template = getTemplate(slug, version)
  if (template) return template
  // Fallback for backward compat
  return newTemplateRegistry(slug, version) ?? null
}

export function templateMiniFor(slug) {
  if (TEMPLATE_REGISTRY[slug]?.CardMini) return TEMPLATE_REGISTRY[slug].CardMini
  // Also try to resolve from current version
  const t = getTemplate(slug)
  if (t?.CardMini) return t.CardMini
  return NAMED_TEMPLATE_MINIS[slug] ?? null
}

// Version management exports
export {
  getTemplate,
  getCurrentTemplateVersion,
  resolveTemplateVersion,
  getTemplateVersions,
  getTemplateManifest,
  isVersionRegistered,
  listTemplates,
  setCurrentTemplateVersion,
  TEMPLATE_SEQUENCES,
}
