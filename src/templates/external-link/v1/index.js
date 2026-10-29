import ExternalLinkStage from './ExternalLinkStage'
import ExternalLinkPreviewStage from './ExternalLinkPreviewStage'
import { validateExternalLink } from './validate'
import { TEMPLATE_SEQUENCES } from '../../stages'

// The External Link To Dearune paper — one address, and the page the printed
// code opens. Its DB row already exists under the code `external-link`; the
// design lives here, never in the database.
//
// It shares the book's own pages (wrapper · close · terms) and contributes the
// two that belong to it: entering the destination and checking it. It has no
// words, prints, sound or lock, and `designer-projects` stores exactly the
// destination (`{ language, destinationUrl }`) for this slug.

export const EXTERNAL_LINK_TEMPLATE_V1 = {
  slug: 'external-link',
  version: 1,
  subject: 'External Link',
  phrase: 'one link · the page it opens',
  renderAspectRatio: 3 / 4,
  stages: [...(TEMPLATE_SEQUENCES['external-link'] ?? [])],
  components: {
    'external.link': ExternalLinkStage,
    'external.preview': ExternalLinkPreviewStage,
  },
  validate: validateExternalLink,
}

export const EXTERNAL_LINK_TEMPLATE = EXTERNAL_LINK_TEMPLATE_V1

export default EXTERNAL_LINK_TEMPLATE_V1
