import { corsHeaders, errorResponse, handleOptions, jsonResponse } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
import { requireDesigner } from '../_shared/auth.ts'

// Templates are admin-read-only through the REST API (see RLS in the
// migrations), so customer-facing stage 2 reads them here, behind a
// designer JWT, with the service-role client.
//
// Each template carries the wrappers it offers (from the wrapper catalog:
// `template_wrapper_options` joined to `wrapper_types`). An option row that
// is disabled or whose wrapper is inactive is not offered, and a template
// with no option rows simply has an empty `wrappers` array. Prices are
// returned raw (base + override) and resolved in ONE place on the client:
// `resolveWrapperPrice` in `src/services/wrappers.js`.

type WrapperRow = {
  id: string
  key: string
  name: string
  name_ar: string
  description: string
  description_ar: string
  image_url: string
  active: boolean
  base_price: number
  production_cost: number
  display_order: number
  estimated_production_days: number
}

type OptionRow = {
  template_id: string
  price_override: number | null
  cost_override: number | null
  display_order: number
  wrapper: WrapperRow | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405)

  const designer = await requireDesigner(req)
  if (!designer) return errorResponse('This book is closed to you', 401)

  const sb = adminClient()
  const [{ data, error }, { data: optionRows, error: optionError }] = await Promise.all([
    sb
      .from('templates')
      .select('id, slug, name, description, image_url, print_config, sort_order')
      .eq('enabled', true)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true }),
    sb
      .from('template_wrapper_options')
      .select('template_id, price_override, cost_override, display_order, wrapper:wrapper_types(id, key, name, name_ar, description, description_ar, image_url, active, base_price, production_cost, display_order, estimated_production_days)')
      .eq('enabled', true),
  ])

  if (error || optionError) return errorResponse('Failed to gather the templates', 500)

  const wrappersByTemplate = new Map<string, Array<Record<string, unknown>>>()
  for (const row of (optionRows ?? []) as OptionRow[]) {
    const wrapper = row.wrapper
    if (!wrapper || !wrapper.active) continue
    const list = wrappersByTemplate.get(row.template_id) ?? []
    list.push({
      id: wrapper.id,
      key: wrapper.key,
      name: wrapper.name,
      name_ar: wrapper.name_ar,
      description: wrapper.description,
      description_ar: wrapper.description_ar,
      image_url: wrapper.image_url,
      base_price: wrapper.base_price,
      production_cost: wrapper.production_cost,
      estimated_production_days: wrapper.estimated_production_days,
      display_order: row.display_order ?? wrapper.display_order,
      option: {
        price_override: row.price_override,
        cost_override: row.cost_override,
        display_order: row.display_order,
      },
    })
    wrappersByTemplate.set(row.template_id, list)
  }

  const templates = (data ?? []).map((template) => ({
    ...template,
    wrappers: (wrappersByTemplate.get(template.id) ?? []).sort(
      (a, b) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0),
    ),
  }))

  return jsonResponse({ templates })
})

export const cors = corsHeaders
