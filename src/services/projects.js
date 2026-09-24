import { invokeFunction } from '@/lib/supabase'

// A designer's handed-over books. The server owns these records; the client
// only ever reads them back and, once, creates one at submission. The list and
// single reads carry the lifecycle fields (first_activated_at, message_active,
// derived expires_at, policy_version, policies_accepted_at) used to draw each
// book's availability on the shelf.

export function fetchProjects(token) {
  return invokeFunction('designer-projects', { token })
}

export function fetchProject(token, projectId) {
  return invokeFunction(`designer-projects/${projectId}`, { token })
}

// Session resume: a reloaded page has a token but the AES-GCM draft key was
// memory-only. This returns the authenticated designer's own unlock secret so
// its own drafts can be decrypted again. Only the matching account's secret
// can read those drafts, so resuming as someone else still cannot decrypt them.
export function fetchDraftUnlock(token) {
  return invokeFunction('designer-projects/unlock', { token })
}

export function createProject(token, { projectId, templateSlug, receiverName, draft, policyVersion, policiesAcceptedAt }) {
  return invokeFunction('designer-projects', {
    method: 'POST',
    token,
    body: { projectId, templateSlug, receiverName, draft, policyVersion, policiesAcceptedAt },
  })
}