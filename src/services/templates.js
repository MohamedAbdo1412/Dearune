import { supabase } from '@/lib/supabase'

export async function fetchTemplates() {
  if (!supabase) throw new Error('Supabase is not configured')
  const [{ data: templates, error: tErr }, { data: pricing, error: pErr }] = await Promise.all([
    supabase.from('templates').select('*').is('deleted_at', null).order('sort_order', { ascending: true }),
    supabase.from('template_pricing').select('*'),
  ])
  if (tErr || pErr) throw tErr ?? pErr
  return { templates: templates ?? [], pricing: pricing ?? [] }
}

export async function updatePricingRow(pricingId, patch) {
  if (!supabase) throw new Error('Supabase is not configured')
  await supabase.from('template_pricing').update(patch).eq('id', pricingId)
}