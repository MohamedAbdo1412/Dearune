import { invokeFunction } from '@/lib/supabase'

// A designer's handed-over books. The server owns these records; the client
// only ever reads them back and, once, creates one at submission.

export function fetchProjects(token) {
  return invokeFunction('designer-projects', { token })
}

export function fetchProject(token, projectId) {
  return invokeFunction(`designer-projects/${projectId}`, { token })
}

export function createProject(token, { templateSlug, receiverName, draft }) {
  return invokeFunction('designer-projects', {
    method: 'POST',
    token,
    body: { templateSlug, receiverName, draft },
  })
}