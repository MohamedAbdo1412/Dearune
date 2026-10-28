import { supabase } from '@/lib/supabase'
import { fetchWrapperTypes, fetchTemplateWrapperOptions } from './wrappers'

// The full admin catalog: papers, (frozen legacy) pricing rows, the wrapper
// catalog, and which templates offer which wrappers. Every admin screen
// shares this one shape, so a Dearune's wrapper select and price suggestion
// resolve through the same code the rest of the app uses
// (`resolveWrapperPrice` / `wrapperPriceFor` in `services/wrappers.js`).
//
// Order is `sort_order ASC, created_at ASC` — the same stable, admin-owned
// sequence Create renders, so what the studio arranges is what designers see.
export async function fetchTemplates() {
  if (!supabase) throw new Error('Supabase is not configured')
  const [{ data: templates, error: tErr }, { data: pricing, error: pErr }, wrappers, options] = await Promise.all([
    supabase
      .from('templates')
      .select('*')
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase.from('template_pricing').select('*'),
    fetchWrapperTypes(),
    fetchTemplateWrapperOptions(),
  ])
  if (tErr || pErr) throw tErr ?? pErr
  return { templates: templates ?? [], pricing: pricing ?? [], wrappers, options }
}

// Row-level merchandising edits from the Templates screen (RLS: admins
// only). Only the fields the admin owns are accepted — never a paper's id,
// slug or print configuration.
export async function updateTemplate(templateId, patch) {
  if (!supabase) throw new Error('Supabase is not configured')
  const allowed = ['name', 'description', 'image_url', 'enabled', 'sort_order', 'display_state', 'current_version']
  const clean = {}
  for (const field of allowed) {
    if (patch[field] !== undefined) clean[field] = patch[field]
  }
  const { data, error } = await supabase.from('templates').update(clean).eq('id', templateId).select('*').single()
  if (error) throw error
  return data
}

export async function updatePricingRow(pricingId, patch) {
  if (!supabase) throw new Error('Supabase is not configured')
  await supabase.from('template_pricing').update(patch).eq('id', pricingId)
}
