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
  const allowed = [
    'name', 'description', 'image_url', 'enabled', 'sort_order', 
    'display_state', 'current_version', 'display_name', 'public_path', 
    'preview_image_url', 'thumbnail_url'
  ]
  const clean = {}
  for (const field of allowed) {
    if (patch[field] !== undefined) clean[field] = patch[field]
  }
  const { data, error } = await supabase.from('templates').update(clean).eq('id', templateId).select('*').single()
  if (error) throw error
  return data
}

// Create a new template
export async function createTemplate(template) {
  if (!supabase) throw new Error('Supabase is not configured')
  const allowed = [
    'name', 'slug', 'description', 'image_url', 'print_config', 
    'enabled', 'sort_order', 'display_state', 'current_version',
    'display_name', 'public_path', 'preview_image_url', 'thumbnail_url'
  ]
  const clean = {}
  for (const field of allowed) {
    if (template[field] !== undefined) clean[field] = template[field]
  }
  // Set defaults
  clean.enabled = clean.enabled ?? true
  clean.sort_order = clean.sort_order ?? 0
  clean.display_state = clean.display_state ?? 'normal'
  clean.current_version = clean.current_version ?? 1
  clean.display_name = clean.display_name ?? clean.name
  
  const { data, error } = await supabase.from('templates').insert(clean).select('*').single()
  if (error) throw error
  return data
}

// Update template display name and public path
export async function updateTemplateIdentity(templateId, { display_name, public_path }) {
  if (!supabase) throw new Error('Supabase is not configured')
  const clean = {}
  if (display_name !== undefined) clean.display_name = display_name
  if (public_path !== undefined) clean.public_path = public_path
  if (Object.keys(clean).length === 0) throw new Error('No fields to update')
  
  const { data, error } = await supabase
    .from('templates')
    .update(clean)
    .eq('id', templateId)
    .select('*')
    .single()
  if (error) throw error
  return data
}

// Update template preview image
export async function updateTemplatePreview(templateId, preview_image_url, thumbnail_url) {
  if (!supabase) throw new Error('Supabase is not configured')
  const clean = {}
  if (preview_image_url !== undefined) clean.preview_image_url = preview_image_url
  if (thumbnail_url !== undefined) clean.thumbnail_url = thumbnail_url
  if (Object.keys(clean).length === 0) throw new Error('No image fields to update')
  
  const { data, error } = await supabase
    .from('templates')
    .update(clean)
    .eq('id', templateId)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updatePricingRow(pricingId, patch) {
  if (!supabase) throw new Error('Supabase is not configured')
  await supabase.from('template_pricing').update(patch).eq('id', pricingId)
}
