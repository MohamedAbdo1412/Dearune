import { corsHeaders, errorResponse, handleOptions, jsonResponse, readJson } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
import { requireAdmin } from '../_shared/auth.ts'

// One Dearune = one project. Every operational action the admin can take on
// that record lives here, so the rules that decide whether something may
// happen are written once, server-side, for every caller:
//
//   mark-paid     Paid = Sold. Writes ONE immutable row into `sales_log`
//                 (price + cost snapshotted at this moment) and stamps the
//                 project paid. Idempotent: a second attempt reports the
//                 sale that already exists instead of creating another.
//   reverse-paid  Maintenance-only correction. VOIDs the sale (never deletes
//                 it) with a reason, then un-stamps paid.
//   stamp         Made → Shipped → Arrived, in order, physical Dearunes only,
//                 and never before the sale. Shipped needs delivery details.
//   unstamp       Maintenance-only correction, in reverse order, with a
//                 reason.
//   set-wrapper   What this Dearune physically is. Locked once it is sold —
//                 changing it means correcting the sale first.
//   set-active    Opens the message. First activation starts the two-year
//                 reading window (`first_activated_at`), re-activation never
//                 resets it. A message can only be opened after it is sold.
//   save-shipping Delivery details for a physical Dearune.
//   archive       Removes a Dearune from the active list. The sale, if any,
//                 stays in the ledger untouched.
//
// Maintenance mode pauses the forward actions; corrections are only allowed
// while it is ON (the studio is paused precisely when mistakes get fixed).

// Dearunes recorded before the wrapper catalog existed carry one of these
// four keys; they stay valid forever. Anything else must exist (and be
// active) in `wrapper_types` — checked in one place so `mark-paid` and
// `set-wrapper` can never disagree about what a Dearune may be.
const LEGACY_WRAPPERS = ['digital', 'open_letter', 'sealed_letter', 'open_card']

async function knownWrapperKeys(sb: ReturnType<typeof adminClient>) {
  const { data } = await sb.from('wrapper_types').select('key').eq('active', true)
  return new Set<string>([...LEGACY_WRAPPERS, ...(data ?? []).map((row) => String(row.key))])
}
const FORWARD_FIELDS = ['manufactured_at', 'shipped_at', 'arrived_at'] as const
type ForwardField = (typeof FORWARD_FIELDS)[number]

const AVAILABILITY_YEARS = 2
const METADATA_COLUMNS =
  'id, reference, designer_id, template_slug, template_version, title, status, public_id, submitted_at, created_at, updated_at, configured_at, wrapper_type, sale_price, estimated_cost, currency, paid_at, manufactured_at, shipped_at, arrived_at, archived_at, first_activated_at, message_active, policy_version, policies_accepted_at'

type Row = Record<string, unknown>

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

function money(value: number): number {
  return Math.round(value * 100) / 100
}

function plusYears(fromIso: string): string {
  const date = new Date(fromIso)
  date.setUTCFullYear(date.getUTCFullYear() + AVAILABILITY_YEARS)
  return date.toISOString()
}

async function studioSettings(sb: ReturnType<typeof adminClient>) {
  const { data } = await sb.from('app_settings').select('maintenance_mode, allow_new_orders, currency').eq('id', 1).maybeSingle()
  return {
    maintenance: Boolean(data?.maintenance_mode),
    salesOpen: data?.allow_new_orders !== false,
    currency: asText(data?.currency, 8) || 'EGP',
  }
}

async function loadProject(sb: ReturnType<typeof adminClient>, projectId: string) {
  // Metadata only: the letter itself (`payload`) never has to travel for a
  // state change, and keeping it off this path keeps the heavy JSON out of
  // every action.
  const { data } = await sb.from('projects').select(METADATA_COLUMNS).eq('id', projectId).maybeSingle()
  return (data ?? null) as Row | null
}

async function activeSale(sb: ReturnType<typeof adminClient>, projectId: string) {
  const { data } = await sb
    .from('sales_log')
    .select('*')
    .eq('project_id', projectId)
    .eq('status', 'completed')
    .maybeSingle()
  return (data ?? null) as Row | null
}

async function logEvent(
  sb: ReturnType<typeof adminClient>,
  projectId: string,
  adminId: string,
  action: string,
  detail: Record<string, unknown>,
) {
  await sb.from('project_events').insert({
    project_id: projectId,
    actor_type: 'admin',
    actor_id: adminId,
    action,
    detail,
  })
}

async function loadShipping(sb: ReturnType<typeof adminClient>, projectId: string) {
  const { data } = await sb.from('shipping').select('*').eq('project_id', projectId).maybeSingle()
  return (data ?? null) as Row | null
}

// The price a Dearune should sell for. Resolved in the same order the
// whole app uses (see `resolveWrapperPrice` in `src/services/wrappers.js`):
//
//   template option override  →  wrapper base price  →  legacy pricing row
//
// The legacy `template_pricing` fallback keeps Dearunes from before the
// catalog selling at exactly the price they always sold at. The admin can
// override the result in the confirm dialog; what they confirm is what
// gets snapshotted.
async function pricingFor(sb: ReturnType<typeof adminClient>, templateSlug: string, wrapperType: string) {
  const { data: template } = await sb.from('templates').select('id, name').eq('slug', templateSlug).maybeSingle()
  if (!template) {
    return { templateId: null as string | null, templateName: null as string | null, price: null as number | null, cost: null as number | null }
  }

  const { data: wrapper } = await sb
    .from('wrapper_types')
    .select('id, base_price, production_cost')
    .eq('key', wrapperType)
    .maybeSingle()
  if (wrapper) {
    const { data: option } = await sb
      .from('template_wrapper_options')
      .select('price_override, cost_override')
      .eq('template_id', template.id)
      .eq('wrapper_id', wrapper.id)
      .maybeSingle()
    // No option row for this pair means the template does not offer it to
    // new books — but an existing Dearune still deserves its legacy price,
    // which is what the fall-through below returns.
    if (option) {
      return {
        templateId: template.id as string,
        templateName: template.name as string,
        price: asNumber(option.price_override ?? wrapper.base_price),
        cost: asNumber(option.cost_override ?? wrapper.production_cost, 0),
      }
    }
  }

  const { data: row } = await sb
    .from('template_pricing')
    .select('price, cost')
    .eq('template_id', template.id)
    .eq('wrapper_type', wrapperType)
    .maybeSingle()
  return {
    templateId: template.id as string,
    templateName: template.name as string,
    price: asNumber(row?.price),
    cost: asNumber(row?.cost, 0),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const admin = await requireAdmin(req)
  if (!admin) return errorResponse('Unauthorized', 401)

  const body = await readJson(req)
  const action = asText(body.action, 40)
  const projectId = asText(body.projectId, 64)
  if (!projectId) return errorResponse('Missing Dearune id', 400)
  if (!action) return errorResponse('Missing action', 400)

  const sb = adminClient()
  const settings = await studioSettings(sb)
  const project = await loadProject(sb, projectId)
  if (!project) return errorResponse('Dearune not found', 404)

  const archived = Boolean(project.archived_at)
  const stampDone = (field: ForwardField) => Boolean(project[field])

  // -- Paid = Sold ----------------------------------------------------------
  if (action === 'mark-paid') {
    if (archived) return errorResponse('This Dearune is archived — restore it first', 400)
    if (settings.maintenance) return errorResponse('Maintenance mode is on — new sales are paused', 409)
    if (!settings.salesOpen) return errorResponse('New sales are turned off in Settings', 409)
    if (project.paid_at) {
      return jsonResponse({ ok: true, alreadyPaid: true, sale: await activeSale(sb, projectId) })
    }

    const chosenWrapper = asText(body.wrapperType, 30) || asText(project.wrapper_type, 30)
    if (!chosenWrapper || !(await knownWrapperKeys(sb)).has(chosenWrapper)) {
      return errorResponse('Choose what this Dearune is (digital or a physical wrapper) before recording the sale', 400)
    }

    const pricing = await pricingFor(sb, asText(project.template_slug, 80), chosenWrapper)
    const sellingPrice = asNumber(body.sellingPrice, pricing.price)
    const estimatedCost = asNumber(body.estimatedCost, pricing.cost)
    if (sellingPrice === null || sellingPrice < 0) return errorResponse('A selling price is required', 400)
    if (estimatedCost === null || estimatedCost < 0) return errorResponse('Cost cannot be negative', 400)

    const price = money(sellingPrice)
    const cost = money(estimatedCost)
    const now = new Date().toISOString()

    // Names are copied onto the ledger so the sale still reads correctly if
    // the designer or paper is ever removed from the studio.
    let designerName: string | null = null
    if (project.designer_id) {
      const { data: designerRow } = await sb.from('designers').select('name').eq('id', project.designer_id as string).maybeSingle()
      designerName = designerRow?.name ?? null
    }

    // 1. Claim the paid stamp first (guarded: only one caller can win).
    const { data: claimed, error: claimError } = await sb
      .from('projects')
      .update({
        paid_at: now,
        sale_price: price,
        estimated_cost: cost,
        wrapper_type: chosenWrapper,
        currency: settings.currency,
      })
      .eq('id', projectId)
      .is('paid_at', null)
      .select('id')
      .maybeSingle()

    if (claimError) return errorResponse('Could not record the sale', 500)
    if (!claimed) {
      const fresh = await loadProject(sb, projectId)
      if (fresh?.paid_at) return jsonResponse({ ok: true, alreadyPaid: true, sale: await activeSale(sb, projectId) })
      return errorResponse('This Dearune could not be marked sold', 409)
    }

    // 2. Write the ledger row. The partial unique index means at most one
    //    active sale can ever exist for this project.
    const { data: sale, error: saleError } = await sb
      .from('sales_log')
      .insert({
        project_id: projectId,
        designer_id: project.designer_id ?? null,
        designer_name: designerName,
        template_id: pricing.templateId,
        template_name: pricing.templateName,
        wrapper_type: chosenWrapper,
        title: asText(project.title, 200) || null,
        sold_at: now,
        selling_price: price,
        estimated_cost: cost,
        currency: settings.currency,
        confirmed_by: admin.id,
        snapshot_data: {
          template_slug: project.template_slug ?? null,
          template_version: project.template_version ?? null,
          policy_version: project.policy_version ?? null,
          reference: project.reference ?? null,
        },
      })
      .select('*')
      .single()

    if (saleError || !sale) {
      // Undo the claim so the Dearune never shows sold without a ledger row.
      await sb
        .from('projects')
        .update({ paid_at: null, sale_price: null, estimated_cost: null })
        .eq('id', projectId)
        .eq('paid_at', now)
      if (saleError?.code === '23505') return errorResponse('This Dearune already has an active sale', 409)
      return errorResponse('The sale could not be written to the ledger', 500)
    }

    const saleRow = sale as Row
    await logEvent(sb, projectId, admin.id, 'project.sold', {
      sale_reference: saleRow.sale_reference,
      selling_price: price,
      estimated_cost: cost,
      estimated_profit: money(price - cost),
      currency: settings.currency,
      wrapper_type: chosenWrapper,
    })

    return jsonResponse({ ok: true, sale: saleRow }, 201)
  }

  // -- Reverse a sale (maintenance only) ------------------------------------
  if (action === 'reverse-paid') {
    if (!settings.maintenance) return errorResponse('Maintenance mode must be on to correct a sale', 409)
    if (!project.paid_at) return errorResponse('This Dearune has no sale to correct', 400)
    if (stampDone('manufactured_at') || stampDone('shipped_at') || stampDone('arrived_at')) {
      return errorResponse('Unset the making and shipping steps first, then correct the sale', 400)
    }
    const reason = asText(body.reason, 300)
    if (!reason) return errorResponse('A reason is required', 400)

    const { data: voided, error: voidError } = await sb
      .from('sales_log')
      .update({
        status: 'voided',
        voided_at: new Date().toISOString(),
        void_reason: reason,
        voided_by: admin.id,
      })
      .eq('project_id', projectId)
      .eq('status', 'completed')
      .select('id, sale_reference')
      .maybeSingle()

    if (voidError) return errorResponse('The sale could not be corrected', 500)
    if (!voided) return errorResponse('No active sale was found for this Dearune', 409)

    await sb
      .from('projects')
      .update({ paid_at: null, sale_price: null, estimated_cost: null })
      .eq('id', projectId)
      .eq('paid_at', project.paid_at as string)

    await logEvent(sb, projectId, admin.id, 'project.sale.voided', {
      sale_reference: voided.sale_reference,
      reason,
    })

    return jsonResponse({ ok: true, voided: voided.sale_reference })
  }

  // -- Making / shipping (physical Dearunes only) ---------------------------
  if (action === 'stamp' || action === 'unstamp') {
    const field = asText(body.field, 30) as ForwardField
    if (!FORWARD_FIELDS.includes(field)) return errorResponse('Unknown production step', 400)
    const reversing = action === 'unstamp'
    const label = field.replace('_at', '').replace(/^./, (c) => c.toUpperCase())

    if (reversing) {
      if (!settings.maintenance) return errorResponse('Maintenance mode must be on to correct a step', 409)
      if (!stampDone(field)) return errorResponse(`This Dearune was never marked ${label.toLowerCase()}`, 400)
      const reason = asText(body.reason, 300)
      if (!reason) return errorResponse('A reason is required', 400)

      const later = FORWARD_FIELDS.slice(FORWARD_FIELDS.indexOf(field) + 1)
      const stillSet = later.find((next) => stampDone(next))
      if (stillSet) {
        return errorResponse(`Unset ${stillSet.replace('_at', '').replace(/^./, (c) => c.toUpperCase())} first`, 400)
      }

      const { error } = await sb.from('projects').update({ [field]: null }).eq('id', projectId).not(field, 'is', null)
      if (error) return errorResponse(`Could not correct ${label.toLowerCase()}`, 500)

      await logEvent(sb, projectId, admin.id, `project.${field.replace('_at', '')}.reversed`, { reason })
      return jsonResponse({ ok: true })
    }

    if (settings.maintenance) return errorResponse('Maintenance mode is on — production is paused', 409)
    if (archived) return errorResponse('This Dearune is archived', 400)
    if (!project.paid_at) return errorResponse('Record the sale first — an unsold Dearune is not made or shipped', 400)
    if (project.wrapper_type === 'digital') return errorResponse('A digital Dearune has no making or shipping steps', 400)
    if (stampDone(field)) return jsonResponse({ ok: true, already: true })
    if (field === 'shipped_at') {
      if (!stampDone('manufactured_at')) return errorResponse('Mark this Dearune made before marking it shipped', 400)
      const shipping = await loadShipping(sb, projectId)
      const needs = ['recipient_name', 'phone', 'address_line1', 'city'].filter(
        (key) => !asText(shipping?.[key], 200),
      )
      if (needs.length) {
        return errorResponse('Add the delivery details (name, phone, address, city) before marking this shipped', 400)
      }
    }
    if (field === 'arrived_at' && !stampDone('shipped_at')) {
      return errorResponse('Mark this Dearune shipped before marking it arrived', 400)
    }

    const now = new Date().toISOString()
    const { data: updated, error } = await sb
      .from('projects')
      .update({ [field]: now })
      .eq('id', projectId)
      .is(field, null)
      .select('id')
      .maybeSingle()

    if (error) return errorResponse(`Could not mark ${label.toLowerCase()}`, 500)
    if (!updated) return jsonResponse({ ok: true, already: true })

    await logEvent(sb, projectId, admin.id, `project.${field.replace('_at', '')}`, {})
    return jsonResponse({ ok: true })
  }

  // -- Wrapper --------------------------------------------------------------
  if (action === 'set-wrapper') {
    if (settings.maintenance) return errorResponse('Maintenance mode is on — the studio is paused', 409)
    if (archived) return errorResponse('This Dearune is archived', 400)
    const wrapperType = asText(body.wrapperType, 30)
    if (!wrapperType || !(await knownWrapperKeys(sb)).has(wrapperType)) return errorResponse('Unknown wrapper', 400)
    if (project.paid_at) return errorResponse('It is already sold — correct the sale to change what it is', 400)
    if (project.wrapper_type === wrapperType) return jsonResponse({ ok: true, unchanged: true })

    const { error } = await sb.from('projects').update({ wrapper_type: wrapperType }).eq('id', projectId).is('paid_at', null)
    if (error) return errorResponse('Could not save what this Dearune is', 500)

    await logEvent(sb, projectId, admin.id, 'project.wrapper', { wrapper_type: wrapperType })
    return jsonResponse({ ok: true })
  }

  // -- Message activation ---------------------------------------------------
  if (action === 'set-active') {
    const active = body.active === true
    if (archived) return errorResponse('This Dearune is archived', 400)

    if (active) {
      if (settings.maintenance) return errorResponse('Maintenance mode is on — messages cannot be opened', 409)
      if (!project.paid_at) return errorResponse('Record the sale before opening this message', 400)
      if (project.message_active === true) {
        const first = asText(project.first_activated_at, 40)
        return jsonResponse({ ok: true, alreadyActive: true, expires_at: first ? plusYears(first) : null })
      }
      const first = asText(project.first_activated_at, 40) || new Date().toISOString()
      const { error } = await sb
        .from('projects')
        .update({ message_active: true, first_activated_at: first })
        .eq('id', projectId)
        .eq('message_active', false)
      if (error) return errorResponse('Could not open this message', 500)
      const expiresAt = plusYears(first)
      await logEvent(sb, projectId, admin.id, 'project.activated', {
        first_activated_at: first,
        expires_at: expiresAt,
      })
      return jsonResponse({ ok: true, first_activated_at: first, expires_at: expiresAt })
    }

    if (project.message_active !== true) return jsonResponse({ ok: true, alreadyInactive: true })
    const { error } = await sb.from('projects').update({ message_active: false }).eq('id', projectId)
    if (error) return errorResponse('Could not close this message', 500)
    await logEvent(sb, projectId, admin.id, 'project.deactivated', {})
    return jsonResponse({ ok: true })
  }

  // -- Delivery details -----------------------------------------------------
  if (action === 'save-shipping') {
    if (archived) return errorResponse('This Dearune is archived', 400)
    const row = {
      recipient_name: asText(body.recipientName, 120) || null,
      address_line1: asText(body.addressLine1, 200),
      address_line2: asText(body.addressLine2, 200) || null,
      city: asText(body.city, 120),
      state_province: asText(body.stateProvince, 120) || null,
      postal_code: asText(body.postalCode, 30),
      country: asText(body.country, 80),
      phone: asText(body.phone, 30) || null,
      special_instructions: asText(body.specialInstructions, 1000) || null,
      provider: asText(body.provider, 80) || null,
      tracking_code: asText(body.trackingCode, 80) || null,
      tracking_url: asText(body.trackingUrl, 300) || null,
    }

    const existing = await loadShipping(sb, projectId)
    if (existing) {
      const { error } = await sb.from('shipping').update(row).eq('id', existing.id as string)
      if (error) return errorResponse('Could not save the delivery details', 500)
    } else {
      const { error } = await sb.from('shipping').insert({ project_id: projectId, ...row })
      if (error) return errorResponse('Could not save the delivery details', 500)
    }

    await logEvent(sb, projectId, admin.id, 'project.shipping', { city: row.city || null })
    return jsonResponse({ ok: true })
  }

  // -- Archive / restore ----------------------------------------------------
  if (action === 'archive' || action === 'restore') {
    const wantArchive = action === 'archive'
    if (wantArchive && settings.maintenance) return errorResponse('Maintenance mode is on — the studio is paused', 409)
    if (wantArchive === archived) {
      return jsonResponse({ ok: true, unchanged: true })
    }

    const { error } = await sb
      .from('projects')
      .update(
        wantArchive
          ? { archived_at: new Date().toISOString(), status: 'archived' }
          : { archived_at: null, status: 'submitted' },
      )
      .eq('id', projectId)
    if (error) return errorResponse(wantArchive ? 'Could not archive this Dearune' : 'Could not restore this Dearune', 500)

    await logEvent(sb, projectId, admin.id, wantArchive ? 'project.archived' : 'project.restored', {})
    return jsonResponse({ ok: true })
  }

  return errorResponse('Unknown action', 400)
})

export const cors = corsHeaders
