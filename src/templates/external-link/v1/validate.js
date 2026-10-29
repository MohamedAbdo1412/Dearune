import { normalizeExternalUrl, externalUrlMessage } from '@/services/externalLink'

// The `external-link` paper's whole validation. Kept in a plain module (no
// React) so the stage, the review page, the terms page and CreateBook's submit
// path all ask the SAME question, and so it can be unit-tested directly.
export function validateExternalLink(draft, lang = 'en') {
  const check = normalizeExternalUrl(draft?.destinationUrl)
  if (check.ok) return []
  return [externalUrlMessage(check.reason, lang)]
}

export default validateExternalLink
