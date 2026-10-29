import { ClassicLetterMini, WaxWordMini, SilentCardMini } from './memorial-message/v1/MemorialCardMini'
import { getTemplate, getCurrentTemplateVersion, resolveTemplateVersion, templateRegistry as newTemplateRegistry, TEMPLATE_SEQUENCES, getTemplateVersions, getTemplateManifest, isVersionRegistered, listTemplates, setCurrentTemplateVersion } from './registry'

// Templates the pipeline can build page-by-page. Registry is keyed by the
// template `code` used in the database; anything not listed here falls opens
// as an ?unwritten? form until the studio finishes it.

export const TEMPLATE_REGISTRY = {
  'memorial-message': getTemplate('memorial-message'),
  'external-link': getTemplate('external-link'),
}

// Drawn thumbnails for templates that exist in the database + studio but do
// not yet have a drawn pipeline.
//
// NOT THE CARD PREVIEW ANY MORE. The paper chooser (and the admin Templates
// shelf) paint the image the admin uploaded — `preview_image_url` /
// `thumbnail_url` via `templatePreviewSource` in `src/services/templates.js`.
// These minis stay as optional decoration; nothing renders them on a selection
// card, so an upload is what a customer sees.
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

// Optional decoration only — selection cards use the admin's uploaded preview
// (`templatePreviewSource`), never this mini.
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
