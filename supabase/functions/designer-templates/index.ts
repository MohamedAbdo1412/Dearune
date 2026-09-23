import { corsHeaders, errorResponse, handleOptions, jsonResponse } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
import { requireDesigner } from '../_shared/auth.ts'

// Templates are admin-read-only through the REST API (see RLS in the
// migrations), so customer-facing stage 2 reads them here, behind a
// designer JWT, with the service-role client.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405)

  const designer = await requireDesigner(req)
  if (!designer) return errorResponse('This book is closed to you', 401)

  const { data, error } = await adminClient()
    .from('templates')
    .select('id, slug, name, description, image_url, print_config, sort_order')
    .eq('enabled', true)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })

  if (error) return errorResponse('Failed to gather the templates', 500)

  return jsonResponse({ templates: data ?? [] })
})

export const cors = corsHeaders