import { corsHeaders, errorResponse, handleOptions, jsonResponse, readJson } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
import { requireAdmin } from '../_shared/auth.ts'

// Operations — the production line for physical Dearunes.
//
// One physical unit is one row in `physical_products`, and that row owns the
// one canonical identifier the whole system uses: `DR` + exactly 11 digits.
// The id is MINTED BY THE DATABASE (a sequence default) so no caller can
// invent, guess or collide with one, and the unique index is the final
// authority. This function never rewrites an id: it only ever reads it.
//
// This file owns every WRITE to Operations. Reads go straight to PostgREST
// under the admin's select-only RLS policy, exactly like every other admin
// screen. The transition rules are enforced twice on purpose:
//
//   * `physical_products_guard` (a BEFORE UPDATE trigger) is the authority —
//     it refuses an illegal move no matter who asks, including a future
//     caller that bypasses this function;
//   * this file refuses the same moves earlier so the studio gets a sentence
//     instead of a raised exception.
//
// Actions
//   ensure        Make sure a Dearune's physical units exist (idempotent).
//   update        Correct a unit's own notes. Never touches the id.
//   archive       Hide units from the default Operations view.
//   restore       Bring them back, unchanged.
//   update-contact  Correct the delivery phone against its real owner.
//   update-designer Correct the Designer name / ID against its real owner.

type Row = Record<string, unknown>

const MAX_UNITS = 50

const STEPS: readonly string[] = []
const EXITS: readonly string[] = []

type Step = string
type Exit = string

const NEXT: Record<string, string | null> = {}

function asText(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function asNumber(value: unknown, fallback: number | null = null): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function isStep(value: string): value is Step {
  return (STEPS as readonly string[]).includes(value)
}

function isStatus(value: string): value is Step | Exit {
  return isStep(value) || (EXITS as readonly string[]).includes(value)
}

export function transitionAllowed(from: string, to: string): boolean {
  return false
}

function projectStampFor(status: string): 'manufactured_at' | 'shipped_at' | 'arrived_at' | null {
  return null
}

async function isDigitalWrapper(sb: ReturnType<typeof adminClient>, wrapperKey: string): Promise<boolean> {
  if (!wrapperKey) return false
  const { data } = await sb.from('wrapper_types').select('kind').eq('key', wrapperKey).maybeSingle()
  return data ? data.kind === 'digital' : wrapperKey === 'digital'
}

const PRODUCT_COLUMNS =
  'id, project_id, unit_index, reference, sold_at, manufacturing_completed_at, shipped_at, delivered_at, notes, archived_at, created_at, updated_at'

const PROJECT_METADATA =
  'id, reference, title, public_id, public_token, wrapper_type, designer_id, template_slug, paid_at, manufactured_at, shipped_at, arrived_at, archived_at, message_active, status'

async function loadProduct(sb: ReturnType<typeof adminClient>, productId: string) {
  const { data } = await sb.from('physical_products').select(PRODUCT_COLUMNS).eq('id', productId).maybeSingle()
  return (data ?? null) as Row | null
}

async function loadProject(sb: ReturnType<typeof adminClient>, projectId: string) {
  const { data } = await sb.from('projects').select(PROJECT_METADATA).eq('id', projectId).maybeSingle()
  return (data ?? null) as Row | null
}

async function logEvent(
  sb: ReturnType<typeof adminClient>,
  productId: string,
  adminId: string,
  action: string,
  detail: Record<string, unknown> = {},
) {
  await sb.from('physical_product_events').insert({
    physical_product_id: productId,
    actor_type: 'admin',
    actor_id: adminId,
    action,
    detail,
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const admin = await requireAdmin(req)
  if (!admin) return errorResponse('Unauthorized', 401)

  const body = await readJson(req)
  const action = asText(body.action, 40)
  if (!action) return errorResponse('Missing action', 400)

  const sb = adminClient()

  // -- ensure ---------------------------------------------------------------
  // Idempotent by construction: `ensure_physical_products` only ever ADDS
  // units, and the unique (project_id, unit_index) index decides who wins a
  // race. Running it twice, or from two tabs at once, changes nothing.
  if (action === 'ensure') {
    const projectId = asText(body.projectId, 64)
    if (!projectId) return errorResponse('Missing Dearune id', 400)

    const project = await loadProject(sb, projectId)
    if (!project) return errorResponse('Dearune not found', 404)
    if (await isDigitalWrapper(sb, asText(project.wrapper_type, 30))) {
      return errorResponse('A digital Dearune has no physical units to manufacture', 400)
    }

    const units = asNumber(body.units, 1)
    if (units === null || units < 1 || units > MAX_UNITS) {
      return errorResponse(`Units must be a whole number between 1 and ${MAX_UNITS}`, 400)
    }

    const { data, error } = await sb.rpc('ensure_physical_products', {
      p_project_id: projectId,
      p_units: Math.floor(units),
      p_actor: admin.id,
    })
    if (error) return errorResponse('Could not open the Operations record', 500)

    const rows = (data ?? []) as Row[]
    for (const row of rows) {
      // The generic `status` column is gone — units carry milestones instead.
      // Log the open event only for units this call actually created.
      if (Number(row.unit_index) > before) {
        await logEvent(sb, String(row.id), admin.id, 'operations.opened', { unit_index: row.unit_index })
      }
    }
    return jsonResponse({ ok: true, units: rows }, 201)
  }

  // -- set-status -----------------------------------------------------------
  if (action === 'set-status') {
    return errorResponse('Operations status has been replaced by milestones', 400)
  }

  // -- update ---------------------------------------------------------------
  if (action === 'update') {
    const productId = asText(body.productId, 64)
    if (!productId) return errorResponse('Missing Operations id', 400)

    const product = await loadProduct(sb, productId)
    if (!product) return errorResponse('Operations record not found', 404)

    const patch: Row = { notes: asText(body.notes, 2000) || null }

    const { data: updated, error } = await sb
      .from('physical_products')
      .update(patch)
      .eq('id', productId)
      .select(PRODUCT_COLUMNS)
      .maybeSingle()
    if (error) return errorResponse('Could not save the Operations record', 500)

    await logEvent(sb, productId, admin.id, 'operations.updated', { fields: Object.keys(patch) })
    return jsonResponse({ ok: true, unit: updated })
  }

  // -- archive / restore ----------------------------------------------------
  // Archiving is a VISIBILITY flag. It never deletes, never renumbers and
  // never happens on export — only when the studio explicitly asks.
  if (action === 'archive' || action === 'restore') {
    const wantArchive = action === 'archive'
    const ids = Array.isArray(body.productIds)
      ? body.productIds.map((value) => asText(value, 64)).filter(Boolean)
      : [asText(body.productId, 64)].filter(Boolean)
    if (ids.length === 0) return errorResponse('Select at least one Operations record', 400)

    const stamp = wantArchive ? new Date().toISOString() : null
    const { data, error } = await sb
      .from('physical_products')
      .update({ archived_at: stamp })
      .in('id', ids)
      .select('id')
    if (error) return errorResponse(wantArchive ? 'Could not archive those records' : 'Could not restore those records', 500)

    const touched = (data ?? []).map((row) => String((row as Row).id))
    for (const id of touched) {
      await logEvent(sb, id, admin.id, wantArchive ? 'operations.archived' : 'operations.restored')
    }
    return jsonResponse({ ok: true, count: touched.length, ids: touched })
  }

  // -- update-contact -------------------------------------------------------
  // The phone the paper prints lives on the Dearune's own `shipping` row, not
  // on the Operations record. Correcting it here corrects the real owner, so
  // the manifest, the label and the paper can never disagree.
  if (action === 'update-contact') {
    const projectId = asText(body.projectId, 64)
    if (!projectId) return errorResponse('Missing Dearune id', 400)

    const project = await loadProject(sb, projectId)
    if (!project) return errorResponse('Dearune not found', 404)

    const phone = asText(body.phone, 30) || null
    const { data: existing } = await sb.from('shipping').select('id').eq('project_id', projectId).maybeSingle()

    if (existing) {
      const { error } = await sb
        .from('shipping')
        .update({ phone })
        .eq('id', String((existing as Row).id))
      if (error) return errorResponse('Could not save the customer number', 500)
    } else {
      const { error } = await sb.from('shipping').insert({ project_id: projectId, phone })
      if (error) return errorResponse('Could not save the customer number', 500)
    }

    return jsonResponse({ ok: true, phone })
  }

  // -- update-designer ------------------------------------------------------
  // The Designer name and ID a paper prints belong to the designer, not to the
  // unit. Correcting them here corrects the real owner, so every paper that
  // designer has signed agrees with the database.
  if (action === 'update-designer') {
    const projectId = asText(body.projectId, 64)
    if (!projectId) return errorResponse('Missing Dearune id', 400)

    const project = await loadProject(sb, projectId)
    if (!project) return errorResponse('Dearune not found', 404)

    const designerId = asText(project.designer_id, 64)
    if (!designerId) return errorResponse('This Dearune has no designer on file', 400)

    const name = asText(body.designerName, 120)
    const code = asText(body.designerCode, 40)
    if (!name) return errorResponse('A designer name is required', 400)
    if (!code) return errorResponse('A designer ID is required', 400)

    const { error } = await sb.from('designers').update({ name, code }).eq('id', designerId)
    if (error) {
      if (error.code === '23505') return errorResponse('That designer ID is already in use', 409)
      return errorResponse('Could not save the designer', 500)
    }

    return jsonResponse({ ok: true, designer: { id: designerId, name, code } })
  }

  return errorResponse('Unknown action', 400)
})

export const cors = corsHeaders
