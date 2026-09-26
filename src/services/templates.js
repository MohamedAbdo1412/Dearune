import { supabase } from '@/lib/supabase'
import { fetchWrapperTypes, fetchTemplateWrapperOptions } from './wrappers'

// The full admin catalog: papers, (frozen legacy) pricing rows, the wrapper
// catalog, and which templates offer which wrappers. Every admin screen
// shares this one shape, so a Dearune's wrapper select and price suggestion
// resolve through the same code the rest of the app uses
// (`resolveWrapperPrice` / `wrapperPriceFor` in `services/wrappers.js`).
export async function fetchTemplates() {
  if (!supabase) throw new Error('Supabase is not configured')
  const [{ data: templates, error: tErr }, { data: pricing, error: pErr }, wrappers, options] = await Promise.all([
    supabase.from('templates').select('*').is('deleted_at', null).order('sort_order', { ascending: true }),
    supabase.from('template_pricing').select('*'),
    fetchWrapperTypes(),
    fetchTemplateWrapperOptions(),
  ])
  if (tErr || pErr) throw tErr ?? pErr
  return { templates: templates ?? [], pricing: pricing ?? [], wrappers, options }
}

export async function updatePricingRow(pricingId, patch) {
  if (!supabase) throw new Error('Supabase is not configured')
  await supabase.from('template_pricing').update(patch).eq('id', pricingId)
}
