import { corsHeaders, errorResponse, handleOptions, jsonResponse, readJson } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
import { requireAdmin } from '../_shared/auth.ts'

// Operations — the production line for physical Dearunes.
//
// ONE order, ONE milestone. A Dearune is a `projects` row; its canonical id is
// `projects.reference` (`DR-000021`); its lifecycle is `projects.milestone`
// (`making → shipping → delivery → delivered → after_sale`). Operations does
// not own a second copy of either: Making, Shipping, Delivery and After-Sale
// are four filters over the same record.
//
// This function owns every WRITE to that lifecycle. Each one calls a single
// transactional `ops_*` function, which locks the order, refuses an illegal
// move, stamps the matching production timestamp and appends the audit event.
// The database has the final word, so a future caller cannot skip the rules.
//
// Actions
//   ensure               Make sure a Dearune's physical units exist (idempotent).
//   making-complete      Making → Shipping.
//   shipment-save        Persist the carrier choice before hand-off.
//   ship                 Shipping → Delivery. Hand-off AND leaving the queue.
//   deliver              Delivery → Delivered. A state, not an archive.
//   after-sale           Delivered → After-Sale.
//   record-refund        Record money returned (manual ledger, no provider call).
//   manifest-preview     Match a carrier manifest against orders. Read-only.
//   manifest-commit      Store the manifest snapshot and ship the resolved rows.
//   manifest-export      Generate a carrier export workbook (Egypt Post / Bosta).
//   bulk-transition      Run a transition (making-complete, ship, deliver, after-sale) over many orders.
//   data-reset           Irreversibly delete selected data (password protected, admin users never deleted).
//   update               Correct a unit's own notes. Never touches an id.
//   archive / restore    Hide units from the workshop views. Never deletes.
//   update-contact       Correct the delivery phone against its real owner.
//   update-designer      Correct the Designer name / ID against its real owner.

type Row = Record<string, unknown>

const MAX_UNITS = 50
const MAX_MANIFEST_ROWS = 1000
const CARRIERS = ['bosta', 'egypt_post']

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

function asTimestamp(value: unknown): string | null {
  const text = asText(value, 40)
  if (!text) return null
  const parsed = Date.parse(text)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

async function isDigitalWrapper(sb: ReturnType<typeof adminClient>, wrapperKey: string): Promise<boolean> {
  if (!wrapperKey) return false
  const { data } = await sb.from('wrapper_types').select('kind').eq('key', wrapperKey).maybeSingle()
  return data ? data.kind === 'digital' : wrapperKey === 'digital'
}

const PRODUCT_COLUMNS =
  'id, project_id, unit_index, reference, sold_at, manufacturing_completed_at, shipped_at, delivered_at, notes, archived_at, created_at, updated_at'

const PROJECT_METADATA =
  'id, reference, title, public_id, public_token, wrapper_type, designer_id, template_slug, milestone, paid_at, manufactured_at, shipped_at, arrived_at, archived_at, message_active'

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

async function logProjectEvent(
  sb: ReturnType<typeof adminClient>,
  projectId: string,
  adminId: string,
  action: string,
  detail: Record<string, unknown> = {},
) {
  await sb.from('project_events').insert({
    project_id: projectId,
    actor_type: 'admin',
    actor_id: adminId,
    action,
    detail,
  })
}

// A database refusal is a sentence in the studio's words, not a stack trace.
const ERROR_COPY: Array<[RegExp, string]> = [
  [/order\.not_found/, 'That Dearune no longer exists'],
  [/order\.not_paid/, 'Record the sale (Paid) before moving this Dearune'],
  [/order\.no_units/, 'This Dearune has no physical unit yet — open its Operations record first'],
  [/order\.not_in_production/, 'This Dearune has not entered Making yet'],
  [/order\.transition_denied/, 'That is not the next step for this order'],
  [/order\.unknown_milestone/, 'Unknown milestone'],
  [/shipping\.carrier_required/, 'Choose Bosta or Egypt Post before shipping'],
  [/shipping\.tracking_required/, 'A tracking number or carrier reference is required'],
  [/shipping\.already_shipped/, 'This order was already handed to a carrier'],
  [/shipping\.conflict/, 'This order is already shipped with a different carrier or tracking number'],
  [/refund\.not_delivered/, 'Only a delivered order can be refunded'],
  [/refund\.amount_invalid/, 'A refund must be more than zero'],
  [/refund\.reason_required/, 'A reason is required for a refund'],
  [/refund\.exceeds_sale/, 'That refund would exceed the amount the Dearune sold for'],
  [/refund\.status_invalid/, 'Unknown refund status'],
  [/manifest\.carrier_required/, 'Choose a carrier for this manifest'],
]

function copyFor(message: string): string {
  for (const [pattern, copy] of ERROR_COPY) if (pattern.test(message)) return copy
  return ''
}

/** Run an `ops_*` RPC and turn a raised exception into a readable refusal. */
async function callRpc(
  sb: ReturnType<typeof adminClient>,
  name: string,
  args: Record<string, unknown>,
): Promise<{ data: Row | null; error: string | null; conflict: boolean; code: string | null }> {
  const { data, error } = await sb.rpc(name, args)
  if (!error) return { data: (data ?? null) as Row | null, error: null, conflict: false, code: null }

  const message = String(error.message ?? '')
  const details = `${message} ${String(error.details ?? '')} ${String(error.hint ?? '')}`
  return {
    data: null,
    error: copyFor(details) || message || 'The database refused that change',
    conflict: /conflict|already_shipped|transition_denied/.test(details),
    code: error.code ?? null,
  }
}

// ---------------------------------------------------------------------------
// Manifest matching (shared by preview and commit)
// ---------------------------------------------------------------------------
type ManifestInput = {
  line: number
  reference: string
  tracking: string
  recipientName: string
  phone: string
  street: string
  city: string
  governorate: string
  notes: string
  raw: Record<string, unknown>
}

const REFERENCE_KINDS = ['canonical', 'unit', 'sold', 'sale', 'legacy']

function normalizeReference(value: unknown): string {
  const text = asText(value, 80).replace(/\s+/g, '').toUpperCase()
  if (!text) return ''
  return text.startsWith('SOL-') ? `SOL-${text.slice(4).replace(/-/g, '')}` : text
}

function normalizeRow(value: unknown, index: number): ManifestInput {
  const row = (value ?? {}) as Row
  return {
    line: Math.floor(asNumber(row.line, index + 2) as number),
    reference: normalizeReference(row.reference),
    tracking: asText(row.tracking, 80).replace(/\s+/g, ' ').toUpperCase(),
    recipientName: asText(row.recipientName ?? row.customerName, 200),
    phone: asText(row.phone ?? row.mobile, 30).replace(/[\s-]/g, ''),
    street: asText(row.street ?? row.address, 300),
    city: asText(row.city, 120),
    governorate: asText(row.governorate, 120),
    notes: asText(row.notes, 500),
    raw: row,
  }
}

type Resolved = {
  line: number
  reference: string
  tracking: string
  recipientName: string
  phone: string
  street: string
  city: string
  projectId: string | null
  canonicalId: string | null
  milestone: string | null
  matchedBy: string | null
  status: string
  message: string
  duplicateOf: number | null
  issues: string[]
}

// The order a row belongs to is decided by IDENTIFIERS ONLY: the canonical id,
// the unit id, the Sold As form, the sale ledger reference, or a tracking
// number already on file. A customer name is never a key — two customers can
// share a name, and a manifest can misspell one.
async function resolveManifest(sb: ReturnType<typeof adminClient>, rows: ManifestInput[]): Promise<Resolved[]> {
  const references = [...new Set(rows.map((row) => row.reference).filter(Boolean))]
  const trackings = [...new Set(rows.map((row) => row.tracking).filter(Boolean))]

  const [byReference, byTracking] = await Promise.all([
    references.length
      ? sb
          .from('order_references')
          .select('value, kind, project_id, physical_product_id')
          .in('value', references)
          .in('kind', REFERENCE_KINDS)
      : Promise.resolve({ data: [], error: null }),
    trackings.length
      ? sb
          .from('shipping')
          .select('project_id, tracking_code, carrier_reference, carrier, shipped_at')
          .or(`tracking_code.in.(${trackings.map((t) => `"${t}"`).join(',')}),carrier_reference.in.(${trackings.map((t) => `"${t}"`).join(',')})`)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (byReference.error) throw new Error(`Could not resolve manifest identifiers: ${byReference.error.message}`)
  if (byTracking.error) throw new Error(`Could not resolve tracking numbers: ${byTracking.error.message}`)

  const referenceIndex = new Map<string, Set<string>>()
  for (const row of (byReference.data ?? []) as Row[]) {
    const value = String(row.value ?? '').toUpperCase()
    const projectId = String(row.project_id ?? '')
    if (!value || !projectId) continue
    if (!referenceIndex.has(value)) referenceIndex.set(value, new Set())
    referenceIndex.get(value)!.add(projectId)
  }

  const trackingIndex = new Map<string, Row>()
  for (const row of (byTracking.data ?? []) as Row[]) {
    for (const key of [row.tracking_code, row.carrier_reference]) {
      const value = asText(key, 80).replace(/\s+/g, ' ').toUpperCase()
      if (value) trackingIndex.set(value, row)
    }
  }

  const projectIds = new Set<string>()
  for (const set of referenceIndex.values()) for (const id of set) projectIds.add(id)
  for (const row of trackingIndex.values()) if (row.project_id) projectIds.add(String(row.project_id))

  const projects = new Map<string, Row>()
  if (projectIds.size) {
    const { data, error } = await sb
      .from('projects')
      .select('id, reference, title, milestone, wrapper_type')
      .in('id', [...projectIds])
    if (error) throw new Error(`Could not read the matched orders: ${error.message}`)
    for (const row of (data ?? []) as Row[]) projects.set(String(row.id), row)
  }

  const shipments = new Map<string, Row>()
  if (trackingIndex.size) {
    const { data, error } = await sb
      .from('shipping')
      .select('project_id, tracking_code, carrier_reference, carrier, shipped_at')
      .in(
        'project_id',
        [...new Set([...trackingIndex.values()].map((row) => String(row.project_id ?? '')).filter(Boolean))],
      )
    if (!error) for (const row of (data ?? []) as Row[]) shipments.set(String(row.project_id), row)
  }

  const seen = new Map<string, number>()
  const resolved: Resolved[] = []

  for (const row of rows) {
    const issues: string[] = []
    if (!row.phone) issues.push('Mobile_No is missing')
    if (!row.street) issues.push('Street is missing')
    if (!row.city) issues.push('City is missing')
    if (!row.tracking) issues.push('Post_Id (tracking) is missing')
    if (!row.reference) issues.push('Package_Ref. Number (Dearune id) is missing')

    const duplicateKey = row.reference || (row.tracking ? `track:${row.tracking}` : '')
    const duplicateOf = duplicateKey ? seen.get(duplicateKey) ?? null : null
    if (duplicateKey && duplicateOf === null) seen.set(duplicateKey, row.line)

    const referenceMatches = row.reference ? referenceIndex.get(row.reference) : undefined
    const trackingMatch = row.tracking ? trackingIndex.get(row.tracking) : undefined

    const referenceId =
      referenceMatches && referenceMatches.size === 1 ? [...referenceMatches][0] : null
    const trackingId = trackingMatch ? String(trackingMatch.project_id ?? '') || null : null

    const base = {
      line: row.line,
      reference: row.reference,
      tracking: row.tracking,
      recipientName: row.recipientName,
      phone: row.phone,
      street: row.street,
      city: row.city,
      issues,
      duplicateOf,
    }

    if (duplicateOf !== null) {
      resolved.push({
        ...base,
        projectId: referenceId ?? trackingId,
        canonicalId: null,
        milestone: null,
        matchedBy: null,
        status: 'duplicate',
        message: `The same identifier already appears on line ${duplicateOf}`,
      })
      continue
    }

    if (!row.reference && !row.tracking) {
      resolved.push({
        ...base,
        projectId: null,
        canonicalId: null,
        milestone: null,
        matchedBy: null,
        status: 'invalid',
        message: 'No Dearune id and no tracking number — this row cannot be matched',
      })
      continue
    }

    if (referenceMatches && referenceMatches.size > 1) {
      resolved.push({
        ...base,
        projectId: null,
        canonicalId: null,
        milestone: null,
        matchedBy: null,
        status: 'ambiguous',
        message: `${row.reference} points at more than one order — choose the right one`,
      })
      continue
    }

    const projectId = referenceId ?? trackingId
    if (!projectId) {
      resolved.push({
        ...base,
        projectId: null,
        canonicalId: null,
        milestone: null,
        matchedBy: null,
        status: 'unmatched',
        message: row.reference
          ? `${row.reference} is not a known Dearune or Sold As id`
          : `${row.tracking} is not a tracking number on file — choose the order`,
      })
      continue
    }

    const project = projects.get(projectId)
    if (!project) {
      resolved.push({
        ...base,
        projectId,
        canonicalId: null,
        milestone: null,
        matchedBy: referenceId ? 'reference' : 'tracking',
        status: 'unmatched',
        message: 'The order this row points at could not be read',
      })
      continue
    }

    const shipment = shipments.get(projectId)
    const shippedTracking = asText(shipment?.tracking_code, 80).replace(/\s+/g, ' ').toUpperCase()
    const milestone = String(project.milestone ?? '')

    // A tracking number that belongs to one order but arrives with another
    // order's id is a document error. Never overwrite: report it.
    if (trackingId && referenceId && trackingId !== referenceId) {
      resolved.push({
        ...base,
        projectId: referenceId,
        canonicalId: String(project.reference ?? ''),
        milestone,
        matchedBy: 'reference',
        status: 'conflict',
        message: `${row.tracking} belongs to a different order than ${row.reference}`,
      })
      continue
    }

    if (shipment?.shipped_at) {
      if (row.tracking && shippedTracking && shippedTracking !== row.tracking) {
        resolved.push({
          ...base,
          projectId,
          canonicalId: String(project.reference ?? ''),
          milestone,
          matchedBy: referenceId ? 'reference' : 'tracking',
          status: 'conflict',
          message: `Already shipped as ${shippedTracking}, but this manifest says ${row.tracking}`,
        })
        continue
      }
      resolved.push({
        ...base,
        projectId,
        canonicalId: String(project.reference ?? ''),
        milestone,
        matchedBy: referenceId ? 'reference' : 'tracking',
        status: 'already_shipped',
        message: `Already handed to ${asText(shipment.carrier, 40) || 'a carrier'}`,
      })
      continue
    }

    if (milestone === 'sold' || milestone === 'making' || milestone === 'configured') {
      resolved.push({
        ...base,
        projectId,
        canonicalId: String(project.reference ?? ''),
        milestone,
        matchedBy: referenceId ? 'reference' : 'tracking',
        status: 'blocked',
        message:
          milestone === 'making'
            ? 'Still in Making — finish Making before shipping'
            : 'Not in Making yet — start production before shipping',
      })
      continue
    }

    if (!['shipping', 'delivery', 'delivered', 'after_sale'].includes(milestone)) {
      resolved.push({
        ...base,
        projectId,
        canonicalId: String(project.reference ?? ''),
        milestone,
        matchedBy: referenceId ? 'reference' : 'tracking',
        status: 'blocked',
        message: 'This order has not entered the workshop',
      })
      continue
    }

    resolved.push({
      ...base,
      projectId,
      canonicalId: String(project.reference ?? ''),
      milestone,
      matchedBy: referenceId ? 'reference' : 'tracking',
      status: 'matched',
      message: referenceId
        ? `Matched on ${row.reference}`
        : `Matched on tracking ${row.tracking} (no Dearune id in the row)`,
    })
  }

  return resolved
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

    // Opening the Operations record is what puts a paid physical Dearune into
    // Making. It is idempotent and refuses an unpaid order.
    const started = await callRpc(sb, 'ops_start_work_order', { p_project_id: projectId, p_actor: admin.id })
    if (started.error && !/not_paid/.test(started.error)) {
      return errorResponse(started.error, started.conflict ? 409 : 400)
    }

    const { data, error } = await sb.rpc('ensure_physical_products', {
      p_project_id: projectId,
      p_units: Math.floor(units),
      p_actor: admin.id,
    })
    if (error) return errorResponse('Could not open the Operations record', 500)

    const rows = (data ?? []) as Row[]
    return jsonResponse({ ok: true, units: rows, milestone: started.data?.milestone ?? project.milestone ?? null }, 201)
  }

  // -- making ---------------------------------------------------------------
  if (action === 'making-complete') {
    const projectId = asText(body.projectId, 64)
    if (!projectId) return errorResponse('Missing Dearune id', 400)

    const result = await callRpc(sb, 'ops_making_complete', {
      p_project_id: projectId,
      p_actor: admin.id,
      p_reason: asText(body.reason, 300) || null,
    })
    if (result.error) return errorResponse(result.error, result.conflict ? 409 : 400)
    return jsonResponse({ ok: true, project: result.data })
  }

  // -- shipping -------------------------------------------------------------
  if (action === 'shipment-save') {
    const projectId = asText(body.projectId, 64)
    const carrier = asText(body.carrier, 30)
    if (!projectId) return errorResponse('Missing Dearune id', 400)
    if (!CARRIERS.includes(carrier)) return errorResponse('Choose Bosta or Egypt Post', 400)

    const result = await callRpc(sb, 'ops_save_shipment', {
      p_project_id: projectId,
      p_carrier: carrier,
      p_tracking: asText(body.tracking, 80) || null,
      p_manifest_id: asText(body.manifestId, 64) || null,
      p_actor: admin.id,
    })
    if (result.error) return errorResponse(result.error, result.conflict ? 409 : 400)
    return jsonResponse({ ok: true, shipment: result.data })
  }

  if (action === 'ship') {
    const projectId = asText(body.projectId, 64)
    const carrier = asText(body.carrier, 30)
    const tracking = asText(body.tracking, 80)
    if (!projectId) return errorResponse('Missing Dearune id', 400)
    if (!CARRIERS.includes(carrier)) return errorResponse('Choose Bosta or Egypt Post before shipping', 400)
    if (!tracking) return errorResponse('A tracking number or carrier reference is required', 400)

    const result = await callRpc(sb, 'ops_ship', {
      p_project_id: projectId,
      p_carrier: carrier,
      p_tracking: tracking,
      p_manifest_id: asText(body.manifestId, 64) || null,
      p_actor: admin.id,
      p_at: asTimestamp(body.at),
    })
    if (result.error) return errorResponse(result.error, result.conflict ? 409 : 400)
    return jsonResponse({ ok: true, project: result.data })
  }

  // -- delivery -------------------------------------------------------------
  if (action === 'deliver') {
    const projectId = asText(body.projectId, 64)
    if (!projectId) return errorResponse('Missing Dearune id', 400)

    const result = await callRpc(sb, 'ops_deliver', {
      p_project_id: projectId,
      p_actor: admin.id,
      p_at: asTimestamp(body.at),
      p_reason: asText(body.reason, 300) || null,
    })
    if (result.error) return errorResponse(result.error, result.conflict ? 409 : 400)
    return jsonResponse({ ok: true, project: result.data })
  }

  if (action === 'after-sale') {
    const projectId = asText(body.projectId, 64)
    if (!projectId) return errorResponse('Missing Dearune id', 400)

    const result = await callRpc(sb, 'ops_after_sale', {
      p_project_id: projectId,
      p_actor: admin.id,
      p_reason: asText(body.reason, 300) || null,
    })
    if (result.error) return errorResponse(result.error, result.conflict ? 409 : 400)
    return jsonResponse({ ok: true, project: result.data })
  }

  // -- bulk transitions -------------------------------------------------------
  // Runs a transition over many orders, returning per-order results.
  // This reuses the same ops_* RPCs the individual actions use, so the
  // validation, idempotency and audit trail are identical.
  if (action === 'bulk-transition') {
    const projectIds = Array.isArray(body.projectIds) ? body.projectIds.map((id) => asText(id, 64)).filter(Boolean) : []
    const transition = asText(body.transition, 30)
    if (!projectIds.length) return errorResponse('Select at least one order', 400)
    if (!['making-complete', 'ship', 'deliver', 'after-sale'].includes(transition)) {
      return errorResponse('Unknown transition', 400)
    }

    const results = []
    for (const projectId of projectIds) {
      let result
      if (transition === 'making-complete') {
        // For making-complete, ensure physical products exist first (idempotent)
        const project = await loadProject(sb, projectId)
        if (project && !(await isDigitalWrapper(sb, asText(project.wrapper_type, 30)))) {
          await callRpc(sb, 'ops_start_work_order', { p_project_id: projectId, p_actor: admin.id })
          await sb.rpc('ensure_physical_products', { p_project_id: projectId, p_units: 1, p_actor: admin.id })
        }
        result = await callRpc(sb, 'ops_making_complete', {
          p_project_id: projectId,
          p_actor: admin.id,
          p_reason: asText(body.reason, 300) || 'Bulk making complete',
        })
      } else if (transition === 'ship') {
        const carrier = asText(body.carrier, 30)
        const tracking = asText(body.tracking, 80)
        if (!CARRIERS.includes(carrier)) {
          results.push({ projectId, ok: false, error: 'Invalid carrier' })
          continue
        }
        if (!tracking) {
          results.push({ projectId, ok: false, error: 'Missing tracking number' })
          continue
        }
        result = await callRpc(sb, 'ops_ship', {
          p_project_id: projectId,
          p_carrier: carrier,
          p_tracking: tracking,
          p_manifest_id: asText(body.manifestId, 64) || null,
          p_actor: admin.id,
          p_at: asTimestamp(body.at),
        })
      } else if (transition === 'deliver') {
        result = await callRpc(sb, 'ops_deliver', {
          p_project_id: projectId,
          p_actor: admin.id,
          p_at: asTimestamp(body.at),
          p_reason: asText(body.reason, 300) || 'Bulk delivered',
        })
      } else if (transition === 'after-sale') {
        result = await callRpc(sb, 'ops_after_sale', {
          p_project_id: projectId,
          p_actor: admin.id,
          p_reason: asText(body.reason, 300) || 'Bulk moved to After-Sale',
        })
      }
      results.push({
        projectId,
        ok: !result.error,
        error: result.error ?? null,
        milestone: result.data?.milestone ?? null,
      })
    }
    return jsonResponse({ ok: true, results })
  }

  // -- manifest export --------------------------------------------------------
  // Generates a carrier export workbook (Egypt Post or Bosta) for the selected
  // orders. The workbook is recorded in shipment_manifests with direction='export'
  // so there is an audit trail, but no order is marked as shipped.
  if (action === 'manifest-export') {
    const projectIds = Array.isArray(body.projectIds) ? body.projectIds.map((id) => asText(id, 64)).filter(Boolean) : []
    const carrier = asText(body.carrier, 30)
    if (!projectIds.length) return errorResponse('Select at least one order', 400)
    if (!CARRIERS.includes(carrier)) return errorResponse('Choose Bosta or Egypt Post', 400)

    // Fetch the orders with their shipping details
    const { data: orders, error } = await sb
      .from('ops_orders')
      .select(
        'project_id, canonical_id, recipient_name, customer_phone, address_line1, address_line2, city, state_province, governorate, district, postal_code, country, special_instructions, carrier, carrier_reference, tracking_code, milestone, sold_id, unit_reference, unit_count, is_digital, title, public_id, public_token, wrapper_type, template_slug, sale_price, currency, paid_at, shipped_at, arrived_at, milestone_updated_at, message_active, recipient_opened_at, recipient_open_count'
      )
      .in('project_id', projectIds)
    if (error) return errorResponse('Could not fetch orders', 500)

    // Build the workbook using the carrier adapters
    const ExcelJS = (await import('exceljs')).default
    let workbook
    let filename

    if (carrier === 'egypt_post') {
      // Load the Egypt Post template
      const templateUrl = new URL('../assets/productionDocuments/Egypt Post Manifest.xlsx', import.meta.url).href
      const templateResponse = await fetch(templateUrl)
      if (!templateResponse.ok) return errorResponse('Could not load Egypt Post template', 500)
      const templateBytes = await templateResponse.arrayBuffer()
      workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(templateBytes)

      const sheet = workbook.getWorksheet('Sheet1')
      if (!sheet) return errorResponse('Egypt Post template missing Sheet1', 500)

      // Write orders starting at row 2 (row 1 is headers)
      let rowNum = 2
      for (const order of orders ?? []) {
        if (order.is_digital) continue // Digital orders don't ship
        if (!order.tracking_code && !order.carrier_reference) continue // No tracking = can't export

        sheet.getCell(rowNum, 1).value = rowNum - 1 // Package_Serial
        sheet.getCell(rowNum, 2).value = order.title ?? 'Dearune letter' // Description
        sheet.getCell(rowNum, 3).value = 0.1 // Total_Weight (placeholder)
        sheet.getCell(rowNum, 4).value = 'Small' // Package_volume
        sheet.getCell(rowNum, 5).value = Number(order.sale_price ?? 0) // COD_Value
        sheet.getCell(rowNum, 6).value = order.special_instructions ?? '' // Item_Special_Notes
        sheet.getCell(rowNum, 7).value = order.recipient_name ?? '' // Customer_Name
        sheet.getCell(rowNum, 8).value = order.customer_phone ?? '' // Mobile_No
        sheet.getCell(rowNum, 9).value = order.address_line1 ?? '' // Street
        sheet.getCell(rowNum, 10).value = order.city ?? '' // City
        sheet.getCell(rowNum, 11).value = order.canonical_id // Package_Ref. Number
        sheet.getCell(rowNum, 12).value = 'Dearune Studio' // Merchant_Name
        sheet.getCell(rowNum, 13).value = 'Main Warehouse' // Warehouse_Name
        sheet.getCell(rowNum, 14).value = 'yes' // HasPOD
        sheet.getCell(rowNum, 15).value = 'Dearune Studio' // SellerName
        sheet.getCell(rowNum, 16).value = order.tracking_code ?? order.carrier_reference ?? '' // Post_Id

        rowNum++
      }

      filename = `Egypt-Post-Manifest-Export-${new Date().toISOString().slice(0, 10)}.xlsx`
    } else if (carrier === 'bosta') {
      // Load the Bosta template
      const templateUrl = new URL('../assets/productionDocuments/Bosta Upload Template AR V3.5.xlsx', import.meta.url).href
      const templateResponse = await fetch(templateUrl)
      if (!templateResponse.ok) return errorResponse('Could not load Bosta template', 500)
      const templateBytes = await templateResponse.arrayBuffer()
      workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(templateBytes)

      const sheet = workbook.getWorksheet('Add orders here')
      if (!sheet) return errorResponse('Bosta template missing "Add orders here" sheet', 500)

      // Write orders starting at row 3 (row 2 is headers)
      let rowNum = 3
      for (const order of orders ?? []) {
        if (order.is_digital) continue // Digital orders don't ship
        if (!order.tracking_code && !order.carrier_reference) continue

        sheet.getCell(rowNum, 1).value = order.recipient_name ?? '' // * اسم العميل
        sheet.getCell(rowNum, 2).value = order.customer_phone ?? '' // * تليفون
        sheet.getCell(rowNum, 4).value = order.city ?? '' // * المدينة
        sheet.getCell(rowNum, 6).value = [order.address_line1, order.address_line2].filter(Boolean).join(', ') // * العنوان
        sheet.getCell(rowNum, 10).value = order.special_instructions ?? '' // ملاحظات
        sheet.getCell(rowNum, 12).value = Number(order.sale_price ?? 0) // قيمة التحصيل النقدي
        sheet.getCell(rowNum, 13).value = 1 // عدد القطع
        sheet.getCell(rowNum, 14).value = `Dearune letter - ${order.canonical_id}` // وصف الشحنة
        sheet.getCell(rowNum, 15).value = order.canonical_id // مرجع الطلب
        sheet.getCell(rowNum, 16).value = Number(order.sale_price ?? 0) // قيمة الشحنة
        sheet.getCell(rowNum, 26).value = 'normal' // نوع الشحنة

        rowNum++
      }

      filename = `Bosta-Upload-Export-${new Date().toISOString().slice(0, 10)}.xlsx`
    }

    // Save the manifest record with direction='export'
    const buffer = await workbook.xlsx.writeBuffer()
    const { data: manifest, error: manifestError } = await sb
      .from('shipment_manifests')
      .insert({
        carrier,
        filename,
        row_count: (orders ?? []).filter((o) => !o.is_digital && (o.tracking_code || o.carrier_reference)).length,
        file_bytes: Array.from(new Uint8Array(buffer)),
        direction: 'export',
        imported_by: admin.id,
      })
      .select('id')
      .single()
    if (manifestError) return errorResponse('Could not save manifest record', 500)

    // Return the workbook as base64 for the frontend to download
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))
    return jsonResponse({ ok: true, manifestId: manifest.id, filename, base64, carrier, rowCount: rowNum - (carrier === 'egypt_post' ? 2 : 3) })
  }

  // -- refunds --------------------------------------------------------------
  if (action === 'record-refund') {
    const projectId = asText(body.projectId, 64)
    const amount = asNumber(body.amount, null)
    const reason = asText(body.reason, 500)
    if (!projectId) return errorResponse('Missing Dearune id', 400)
    if (amount === null) return errorResponse('Enter the amount returned', 400)
    if (!reason) return errorResponse('A reason is required', 400)

    const result = await callRpc(sb, 'ops_record_refund', {
      p_project_id: projectId,
      p_amount: amount,
      p_reason: reason,
      p_status: asText(body.status, 20) || 'manual',
      p_method: asText(body.method, 30) || null,
      p_reference: asText(body.reference, 120) || null,
      p_actor: admin.id,
      p_idempotency_key: asText(body.idempotencyKey, 120) || null,
      p_product_id: null,
    })
    if (result.error) return errorResponse(result.error, result.conflict ? 409 : 400)
    return jsonResponse({ ok: true, refund: result.data, manual: true })
  }

  // -- manifests ------------------------------------------------------------
  if (action === 'manifest-preview') {
    const carrier = asText(body.carrier, 30)
    if (!CARRIERS.includes(carrier)) return errorResponse('Choose a carrier for this manifest', 400)
    if (carrier === 'bosta') {
      return errorResponse(
        'Bosta manifests are not supported yet — Bosta reports delivery in its own dashboard. Only the Egypt Post manifest can be imported.',
        400,
      )
    }

    const input = Array.isArray(body.rows) ? body.rows.slice(0, MAX_MANIFEST_ROWS) : []
    if (input.length === 0) return errorResponse('This manifest has no rows', 400)

    const rows = await resolveManifest(sb, input.map((row, index) => normalizeRow(row, index)))
    return jsonResponse({
      ok: true,
      carrier,
      filename: asText(body.filename, 200) || null,
      sheet: asText(body.sheet, 80) || null,
      rows,
      summary: summarize(rows),
    })
  }

  if (action === 'manifest-commit') {
    const carrier = asText(body.carrier, 30)
    if (!CARRIERS.includes(carrier)) return errorResponse('Choose a carrier for this manifest', 400)
    if (carrier === 'bosta') return errorResponse('Bosta manifests are not supported yet', 400)

    const input = Array.isArray(body.rows) ? body.rows.slice(0, MAX_MANIFEST_ROWS) : []
    if (input.length === 0) return errorResponse('This manifest has no rows', 400)

    const normalized = input.map((row, index) => normalizeRow(row, index))
    const resolved = await resolveManifest(sb, normalized)

    // Manual decisions override only the rows the server could not settle, and
    // only with an order that really is in the shipping pipeline.
    const decisions = (body.decisions ?? {}) as Record<string, unknown>
    const overrides = new Map<number, string>()
    for (const [line, projectId] of Object.entries(decisions)) {
      const id = asText(projectId, 64)
      if (id) overrides.set(Number(line), id)
    }

    if (overrides.size) {
      const { data, error } = await sb
        .from('projects')
        .select('id, reference, milestone')
        .in('id', [...new Set(overrides.values())])
      if (error) return errorResponse('Could not verify the chosen orders', 500)
      const allowed = new Map<string, Row>()
      for (const row of (data ?? []) as Row[]) {
        if (['shipping', 'delivery', 'delivered', 'after_sale'].includes(String(row.milestone ?? ''))) {
          allowed.set(String(row.id), row)
        }
      }
      for (const [line, projectId] of overrides) {
        const row = resolved.find((entry) => entry.line === line)
        if (!row) continue
        const project = allowed.get(projectId)
        if (!project) {
          row.status = 'blocked'
          row.message = 'The chosen order is not in the shipping pipeline'
          continue
        }
        row.projectId = projectId
        row.canonicalId = String(project.reference ?? '')
        row.milestone = String(project.milestone ?? '')
        row.matchedBy = 'manual'
        row.status = 'matched'
        row.message = 'Chosen by hand'
      }
    }

    // The snapshot is written FIRST so every association below points at the
    // document that caused it, even if a later row fails.
    const manifest = await callRpc(sb, 'ops_create_manifest', {
      p_carrier: carrier,
      p_filename: asText(body.filename, 200) || null,
      p_sheet: asText(body.sheet, 80) || null,
      p_rows: normalized.map((row) => ({ ...row.raw, line: row.line })),
      p_actor: admin.id,
    })
    if (manifest.error || !manifest.data) {
      return errorResponse(manifest.error || 'Could not store the manifest', 500)
    }
    const manifestId = String(manifest.data.id)

    const results: Array<Row> = []
    for (const row of resolved) {
      if (!row.projectId) {
        results.push({ line: row.line, status: row.status, ok: false, message: row.message })
        continue
      }
      if (row.status === 'already_shipped') {
        results.push({ line: row.line, status: 'already_shipped', ok: true, message: row.message, projectId: row.projectId })
        continue
      }
      if (row.status !== 'matched') {
        results.push({ line: row.line, status: row.status, ok: false, message: row.message, projectId: row.projectId })
        continue
      }
      if (!row.tracking) {
        results.push({
          line: row.line,
          status: 'invalid',
          ok: false,
          message: 'A tracking number (Post_Id) is required to mark this order shipped',
          projectId: row.projectId,
        })
        continue
      }

      const shipped = await callRpc(sb, 'ops_ship', {
        p_project_id: row.projectId,
        p_carrier: carrier,
        p_tracking: row.tracking,
        p_manifest_id: manifestId,
        p_actor: admin.id,
        p_at: null,
      })
      results.push({
        line: row.line,
        status: shipped.error ? 'failed' : 'shipped',
        ok: !shipped.error,
        message: shipped.error ?? `Shipped as ${row.tracking}`,
        projectId: row.projectId,
        canonicalId: row.canonicalId,
      })
    }

    const shippedCount = results.filter((row) => row.ok && row.status === 'shipped').length
    const alreadyCount = results.filter((row) => row.status === 'already_shipped').length
    const failed = results.filter((row) => !row.ok)

    return jsonResponse({
      ok: failed.length === 0,
      manifestId,
      results,
      summary: {
        rows: results.length,
        shipped: shippedCount,
        alreadyShipped: alreadyCount,
        failed: failed.length,
      },
    })
  }

  // -- unit corrections -----------------------------------------------------
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
    const { data: existing } = await sb.from('shipping').select('id, phone').eq('project_id', projectId).maybeSingle()

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

    await logProjectEvent(sb, projectId, admin.id, 'order.contact.updated', {
      from: (existing as Row | null)?.phone ?? null,
      to: phone,
    })
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

    const { data: before } = await sb.from('designers').select('name, code').eq('id', designerId).maybeSingle()
    const { error } = await sb.from('designers').update({ name, code }).eq('id', designerId)
    if (error) {
      if (error.code === '23505') return errorResponse('That designer ID is already in use', 409)
      return errorResponse('Could not save the designer', 500)
    }

    await logProjectEvent(sb, projectId, admin.id, 'order.designer.updated', {
      before: before ?? null,
      after: { name, code },
    })
    return jsonResponse({ ok: true, designer: { id: designerId, name, code } })
  }

  // -- data reset (danger zone) ----------------------------------------------
  // Irreversibly deletes selected data types. Protected by a hardcoded master
  // password. Admin users are NEVER deleted. Each target is handled in its own
  // transaction so partial failures don't leave the DB in an unknown state.
  if (action === 'data-reset') {
    const password = asText(body.password, 200)
    const targets = body.targets ?? {}
    const MASTER_PASSWORD = '@Trap8TrapMohamed01029260231'

    if (password !== MASTER_PASSWORD) {
      return errorResponse('Invalid master password', 403)
    }

    const selectedTargets = Object.entries(targets).filter(([, v]) => v === true).map(([k]) => k)
    if (selectedTargets.length === 0) {
      return errorResponse('No data types selected for reset', 400)
    }

    const results: Record<string, { ok: boolean; message: string; count?: number }> = {}

    for (const target of selectedTargets) {
      try {
        switch (target) {
          case 'designers': {
            // Delete all designers (CASCADE will handle projects, etc. but we want to be explicit)
            const { count } = await sb.from('designers').delete().neq('id', '00000000-0000-0000-0000-000000000000')
            results.designers = { ok: true, message: `Deleted ${count ?? 0} designers`, count: count ?? 0 }
            break
          }
          case 'projects': {
            // Delete all projects (Dearunes) — this cascades to physical_products, shipping, refunds, events, etc.
            const { count } = await sb.from('projects').delete().neq('id', '00000000-0000-0000-0000-000000000000')
            results.projects = { ok: true, message: `Deleted ${count ?? 0} projects`, count: count ?? 0 }
            break
          }
          case 'orders': {
            // Reset milestone data for all orders — set back to configured, clear timestamps
            const { count } = await sb
              .from('projects')
              .update({
                milestone: 'configured',
                milestone_updated_at: null,
                milestone_updated_by: null,
                paid_at: null,
                manufactured_at: null,
                shipped_at: null,
                arrived_at: null,
                archived_at: null,
                message_active: false,
                first_activated_at: null,
                recipient_opened_at: null,
                recipient_open_count: 0,
              })
              .neq('id', '00000000-0000-0000-0000-000000000000')
            results.orders = { ok: true, message: `Reset ${count ?? 0} orders to configured`, count: count ?? 0 }
            break
          }
          case 'soldLogs': {
            // Delete sale records and order_references of kind 'sale' and 'sold'
            const { count: saleCount } = await sb.from('sale_records').delete().neq('id', '00000000-0000-0000-0000-000000000000')
            const { count: refCount } = await sb
              .from('order_references')
              .delete()
              .in('kind', ['sale', 'sold'])
              .neq('id', '00000000-0000-0000-0000-000000000000')
            results.soldLogs = { ok: true, message: `Deleted ${saleCount ?? 0} sales and ${refCount ?? 0} references`, count: (saleCount ?? 0) + (refCount ?? 0) }
            break
          }
          case 'messages': {
            // Delete project_events (timeline) and reset message_active
            const { count: eventCount } = await sb.from('project_events').delete().neq('id', '00000000-0000-0000-0000-000000000000')
            const { count: projectCount } = await sb
              .from('projects')
              .update({ message_active: false, first_activated_at: null, recipient_opened_at: null, recipient_open_count: 0 })
              .neq('id', '00000000-0000-0000-0000-000000000000')
            results.messages = { ok: true, message: `Deleted ${eventCount ?? 0} events, reset ${projectCount ?? 0} projects`, count: (eventCount ?? 0) + (projectCount ?? 0) }
            break
          }
          case 'templates': {
            // Delete templates and wrapper options (templates cascade to template_wrapper_options)
            const { count: wrapperOptCount } = await sb.from('template_wrapper_options').delete().neq('id', '00000000-0000-0000-0000-000000000000')
            const { count: templateCount } = await sb.from('templates').delete().neq('id', '00000000-0000-0000-0000-000000000000')
            results.templates = { ok: true, message: `Deleted ${templateCount ?? 0} templates and ${wrapperOptCount ?? 0} wrapper options`, count: (templateCount ?? 0) + (wrapperOptCount ?? 0) }
            break
          }
          case 'wrappers': {
            // Delete wrapper_types
            const { count } = await sb.from('wrapper_types').delete().neq('id', '00000000-0000-0000-0000-000000000000')
            results.wrappers = { ok: true, message: `Deleted ${count ?? 0} wrapper types`, count: count ?? 0 }
            break
          }
          case 'mediaStorage': {
            // Delete all files in designer-drafts bucket
            const { data: files } = await sb.storage.from('designer-drafts').list('', { limit: 10000 })
            if (files && files.length > 0) {
              const paths = files.map((f) => f.name)
              await sb.storage.from('designer-drafts').remove(paths)
              results.mediaStorage = { ok: true, message: `Deleted ${paths.length} draft files`, count: paths.length }
            } else {
              results.mediaStorage = { ok: true, message: 'No draft files to delete', count: 0 }
            }
            break
          }
          case 'fullStorage': {
            // Delete all files in ALL buckets (except system buckets)
            const { data: buckets } = await sb.storage.listBuckets()
            let totalDeleted = 0
            for (const bucket of buckets ?? []) {
              if (['designer-drafts', 'project-media', 'drive-uploads', 'public-assets'].includes(bucket.name)) {
                const { data: files } = await sb.storage.from(bucket.name).list('', { limit: 10000 })
                if (files && files.length > 0) {
                  const paths = files.map((f) => f.name)
                  await sb.storage.from(bucket.name).remove(paths)
                  totalDeleted += paths.length
                }
              }
            }
            results.fullStorage = { ok: true, message: `Deleted ${totalDeleted} files from all media buckets`, count: totalDeleted }
            break
          }
          default:
            results[target] = { ok: false, message: `Unknown target: ${target}` }
        }
      } catch (err) {
        results[target] = { ok: false, message: err instanceof Error ? err.message : 'Unknown error' }
      }
    }

    const summary = Object.entries(results)
      .map(([key, r]) => `${key}: ${r.ok ? '✓' : '✗'} ${r.message}`)
      .join('; ')

    return jsonResponse({ ok: true, results, summary })
  }

  return errorResponse('Unknown action', 400)
})

function summarize(rows: Resolved[]) {
  const summary = {
    total: rows.length,
    matched: 0,
    already_shipped: 0,
    unmatched: 0,
    ambiguous: 0,
    duplicate: 0,
    conflict: 0,
    blocked: 0,
    invalid: 0,
    committable: 0,
  }
  for (const row of rows) {
    if (row.status in summary) summary[row.status] += 1
    if (row.status === 'matched' || row.status === 'already_shipped') summary.committable += 1
  }
  return summary
}

export const cors = corsHeaders
