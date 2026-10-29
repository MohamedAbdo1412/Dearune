import { supabase } from '@/lib/supabase'
import { fetchWrapperTypes, fetchTemplateWrapperOptions } from './wrappers'
import { designerMedia } from './media'

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

// ---------------------------------------------------------------------------
// Template preview images: stored in the private `designer-drafts` bucket
// under `templates/<slug>/…` and addressed only through the `designer-media`
// edge function (admin uploads/removes; any studio session may resolve them).
// The row stores the object PATH, so every render must resolve it to a
// short-lived signed URL — a bare path is not an image.
// ---------------------------------------------------------------------------

export const TEMPLATE_SLUG_RE = /^[a-z][a-z0-9_-]{0,63}$/

// The shape the edge function will sign: `templates/<slug>/<file>`. The
// legacy seed wrote `templates/<slug>.png` (an object that never existed), so
// a bare prefix check would try to sign nonsense — match the real shape.
const TEMPLATE_ASSET_PATH_RE = /^templates\/[a-z][a-z0-9_-]{0,63}\/[A-Za-z0-9_][A-Za-z0-9._-]*$/

export function isTemplateStoragePath(imageUrl) {
  return typeof imageUrl === 'string' && TEMPLATE_ASSET_PATH_RE.test(imageUrl)
}

// Which stored value a selection card paints, in one place so the admin shelf
// and Create can never disagree: the generated thumbnail (a 400px rendition of
// the same composition) first, then the full uploaded preview, then the legacy
// `image_url` column for rows that predate the uploader. Values that are
// neither signable storage paths nor real URLs (e.g. the seed's
// `templates/classic-letter.png`) are ignored rather than rendered broken.
export function templatePreviewSource(template) {
  if (!template) return ''
  const candidates = [template.thumbnail_url, template.preview_image_url, template.image_url]
  return candidates.find(isDisplayableImageRef) ?? ''
}

function isDisplayableImageRef(value) {
  if (typeof value !== 'string') return false
  const ref = value.trim()
  if (!ref) return false
  if (isTemplateStoragePath(ref)) return true
  return /^(https?:\/\/|\/\/|\/|data:image\/)/i.test(ref)
}

// Upload one template preview (or its thumbnail) under the template's slug.
// `fixed` keeps the object name stable so a re-upload replaces the previous
// image instead of piling up orphans.
export async function uploadTemplateAsset(templateSlug, file, token, { fixed } = {}) {
  if (!TEMPLATE_SLUG_RE.test(String(templateSlug ?? ''))) {
    throw new Error('Set the template slug before uploading a preview')
  }
  if (!token) throw new Error('Not signed in')
  const result = await designerMedia('POST', '', {
    token,
    query: { template: templateSlug, kind: 'photo', name: file?.name || 'template.webp', fixed: fixed || undefined },
    body: file,
    contentType: file?.type || 'image/webp',
  })
  return result.path
}

// Catalog rows store a storage path; this turns it into a signed URL for one
// session. Absolute URLs (http…) and empty values pass straight through.
export async function resolveTemplateImageUrl(imageUrl, token) {
  if (!imageUrl) return null
  if (!isTemplateStoragePath(imageUrl)) return imageUrl
  if (!token) return null
  try {
    const result = await designerMedia('GET', '', { token, query: { path: imageUrl } })
    return result.url ?? null
  } catch {
    return null
  }
}
