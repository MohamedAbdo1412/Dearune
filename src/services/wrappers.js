import { supabase } from '@/lib/supabase'
import { WRAPPER_LABELS } from './constants'
import { designerMedia } from './media'

// ---------------------------------------------------------------------------
// The wrapper catalog — the single source of truth for "how a Dearune is
// sent": `wrapper_types` (what wrappers exist, their copy, photo, base
// price) and `template_wrapper_options` (which templates offer them, with
// an optional per-template price override).
//
// MONEY IS CALCULATED IN EXACTLY ONE PLACE, `resolveWrapperPrice` below.
// Every screen — the designer's arrival stage, the admin template pricing
// table, the sale confirmation dialog — resolves through this same order:
//
//   template option override  →  wrapper base price  →  (edge function
//   additionally falls back to the frozen legacy `template_pricing` row so
//   Dearunes from before the catalog keep their historical price).
// ---------------------------------------------------------------------------

// Pure: no network, no state. Returns the effective price/cost and where
// they came from (`source: 'template'` when the template overrides the
// wrapper's base, `'wrapper'` otherwise).
export function resolveWrapperPrice({ template = null, wrapper = null, templateWrapperOption = null } = {}) {
  // An option row belongs to one template; if the caller passes an option
  // that does not match the template it was asked about, ignore it rather
  // than charging the wrong paper's price.
  const belongsToTemplate =
    !template ||
    !templateWrapperOption ||
    !templateWrapperOption.template_id ||
    templateWrapperOption.template_id === template.id
  const option = belongsToTemplate ? templateWrapperOption : null

  const rawPrice = option?.price_override ?? wrapper?.base_price ?? 0
  const rawCost = option?.cost_override ?? wrapper?.production_cost ?? 0
  const price = Number(rawPrice)
  const cost = Number(rawCost)
  return {
    price: Number.isFinite(price) && price >= 0 ? price : 0,
    cost: Number.isFinite(cost) && cost >= 0 ? cost : 0,
    source: option?.price_override != null ? 'template' : 'wrapper',
  }
}

// Convenience for screens holding the whole catalog: resolve one wrapper's
// price for one template without manual lookups.
export function wrapperPriceFor({ template = null, wrapper = null, options = [] } = {}) {
  if (!wrapper) return { price: 0, cost: 0, source: 'wrapper' }
  const option = options.find(
    (row) => row.wrapper_id === wrapper.id && (!template || row.template_id === template.id),
  )
  return resolveWrapperPrice({ template, wrapper, templateWrapperOption: option ?? null })
}

export function findWrapper(wrappers = [], key) {
  return wrappers.find((wrapper) => wrapper?.key === key) ?? null
}

export function findOption(options = [], templateId, wrapperId) {
  return options.find((row) => row.template_id === templateId && row.wrapper_id === wrapperId) ?? null
}

export function optionsForTemplate(options = [], templateId) {
  return options.filter((row) => row.template_id === templateId)
}

export function wrapperLabel(wrapper, lang = 'en') {
  if (!wrapper) return ''
  if (lang === 'ar' && wrapper.name_ar) return wrapper.name_ar
  if (wrapper.name) return wrapper.name
  return WRAPPER_LABELS[wrapper.key] ?? wrapper.key ?? ''
}

export function wrapperDescription(wrapper, lang = 'en') {
  if (!wrapper) return ''
  if (lang === 'ar' && wrapper.description_ar) return wrapper.description_ar
  return wrapper.description ?? ''
}

// ---------------------------------------------------------------------------
// Catalog reads/writes (admin browser, RLS: admins only).
//
// Read order is `display_order ASC, created_at ASC` — the same stable
// sequence Create renders (`sortCatalogItems` in `services/catalog.js`
// re-applies it defensively on the client).
// ---------------------------------------------------------------------------

export async function fetchWrapperTypes({ activeOnly = false } = {}) {
  if (!supabase) throw new Error('Supabase is not configured')
  let query = supabase
    .from('wrapper_types')
    .select('*')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (activeOnly) query = query.eq('active', true)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function fetchTemplateWrapperOptions() {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase
    .from('template_wrapper_options')
    .select('*, wrapper:wrapper_types(*)')
    .order('display_order', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createWrapper(wrapper) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase
    .from('wrapper_types')
    .insert({
      key: wrapper.key,
      name: wrapper.name,
      name_ar: wrapper.name_ar ?? '',
      description: wrapper.description ?? '',
      description_ar: wrapper.description_ar ?? '',
      image_url: wrapper.image_url ?? '',
      active: wrapper.active ?? true,
      display_state: wrapper.display_state ?? 'normal',
      base_price: wrapper.base_price ?? 0,
      production_cost: wrapper.production_cost ?? 0,
      display_order: wrapper.display_order ?? 0,
      estimated_production_days: wrapper.estimated_production_days ?? 7,
      notes: wrapper.notes ?? null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateWrapper(wrapperId, patch) {
  if (!supabase) throw new Error('Supabase is not configured')
  const allowed = [
    'name', 'name_ar', 'description', 'description_ar', 'image_url', 'active',
    'display_state', 'base_price', 'production_cost', 'display_order',
    'estimated_production_days', 'sku', 'notes',
  ]
  const clean = {}
  for (const field of allowed) {
    if (patch[field] !== undefined) clean[field] = patch[field]
  }
  const { data, error } = await supabase.from('wrapper_types').update(clean).eq('id', wrapperId).select('*').single()
  if (error) throw error
  return data
}

// One upsert per (template, wrapper): creating the option row is what makes
// a wrapper OFFERED on a template; disabling keeps the row (so a Dearune
// already using it keeps its price) but stops it appearing in Create.
export async function saveTemplateWrapperOption({ templateId, wrapperId, enabled = true, priceOverride = null, costOverride = null }) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase
    .from('template_wrapper_options')
    .upsert(
      {
        template_id: templateId,
        wrapper_id: wrapperId,
        enabled,
        price_override: priceOverride,
        cost_override: costOverride,
      },
      { onConflict: 'template_id,wrapper_id' },
    )
    .select('*')
    .single()
  if (error) throw error
  return data
}

// ---------------------------------------------------------------------------
// Wrapper photos: stored in the private `designer-drafts` bucket under
// `wrappers/<key>/…` and addressed only through the `designer-media` edge
// function (admin uploads/removes; any studio session may resolve them).
// ---------------------------------------------------------------------------

export function isWrapperStoragePath(imageUrl) {
  return typeof imageUrl === 'string' && imageUrl.startsWith('wrappers/')
}

export async function uploadWrapperPhoto(wrapperKey, file, token) {
  const result = await designerMedia('POST', '', {
    token,
    query: { wrapper: wrapperKey, kind: 'photo', name: file.name || 'wrapper.jpg', fixed: 'photo' },
    body: file,
    contentType: file.type || 'image/jpeg',
  })
  return result.path
}

export async function removeWrapperPhoto(path, token) {
  await designerMedia('DELETE', '', { token, query: { path, storageProvider: 'supabase' } })
}

// Catalog rows store a storage path; this turns it into a signed URL for
// one session. Absolute URLs (http…) and empty values pass straight through.
export async function resolveWrapperPhotoUrl(imageUrl, token) {
  if (!imageUrl) return null
  if (!isWrapperStoragePath(imageUrl)) return imageUrl
  if (!token) return null
  try {
    const result = await designerMedia('GET', '', { token, query: { path: imageUrl } })
    return result.url ?? null
  } catch {
    return null
  }
}
