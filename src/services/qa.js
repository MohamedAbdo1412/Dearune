import { supabase } from '@/lib/supabase'
import { OPERATIONS_STATUS_LABELS, PHYSICAL_ID_PATTERN, soldAsId } from './constants'
import { parseProjectPayload } from './projectPayload'

// The QA desk: turn a scanned Dearune QR into the whole record behind it.
//
// The QR on a printed paper is exactly what `qrContent()` builds:
//
//     https://<site>/message/<publicId>?token=<publicToken>
//
// `public_id` is the project's readable handle (24 hex chars) and
// `public_token` is the project's unguessable capability (32 hex chars).
// Both live on `projects`, so ONE scan identifies ONE Dearune — and, because
// every unit of a Dearune is printed with the same QR, the scan identifies
// the Dearune rather than a single bottle.
//
// Everything below is a READ through the admin's own session, so the existing
// row level security applies exactly as it does on every other admin screen:
// admins read, nobody else can, and no write happens anywhere in this file.
// The public token is used to VERIFY a scan and is never rendered.

export const PUBLIC_ID_PATTERN = /^[0-9a-f]{16,64}$/
export const PUBLIC_TOKEN_PATTERN = /^[0-9a-f]{16,128}$/

// The distinct ways a scan can fail. The page renders a different banner for
// each one, because "this is not a Dearune QR" and "the studio cannot be
// reached" are very different problems for whoever is holding the phone.
export const QA_ERROR_KINDS = {
  INVALID: 'invalid',
  NOT_FOUND: 'not-found',
  TOKEN_MISMATCH: 'token-mismatch',
  FORBIDDEN: 'forbidden',
  NETWORK: 'network',
  LOOKUP_FAILED: 'lookup-failed',
}

export class QaError extends Error {
  constructor(kind, message, details = {}) {
    super(message)
    this.name = 'QaError'
    this.kind = kind
    this.details = details
  }
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Read a scanned value as a Dearune QR.
 *
 * Accepts, in order of trust:
 *   * the printed URL   — `https://site/message/<publicId>?token=<token>`
 *   * a bare path      — `/message/<publicId>?token=<token>`
 *   * a typed pair     — `<publicId>:<token>`
 *   * a bare public id — `<publicId>` (no token: the scan is resolved, but it
 *                        cannot be proven to be this studio's own paper)
 *
 * @returns {{ok: true, publicId: string, token: string, source: string}
 *          | {ok: false, reason: string}}
 */
export function parseQrValue(raw) {
  const value = String(raw ?? '').trim()
  if (!value) return { ok: false, reason: 'Nothing was scanned.' }

  // 1. A URL (absolute or a path). The path segment is authoritative; the
  //    host is ignored, because a paper may have been printed for a domain
  //    the studio has since moved off.
  if (value.includes('/')) {
    let pathname = value
    let search = ''
    try {
      const url = new URL(value, 'https://dearune.invalid')
      pathname = url.pathname
      search = url.search
    } catch {
      const questionMark = value.indexOf('?')
      if (questionMark >= 0) {
        pathname = value.slice(0, questionMark)
        search = value.slice(questionMark)
      }
    }

    const match = pathname.match(/\/message\/([^/?#]+)/i)
    if (!match) {
      return { ok: false, reason: 'That QR does not point at a Dearune message.' }
    }
    const publicId = match[1].trim().toLowerCase()
    if (!PUBLIC_ID_PATTERN.test(publicId)) {
      return { ok: false, reason: 'That QR does not carry a Dearune public id.' }
    }
    const token = new URLSearchParams(search).get('token')?.trim().toLowerCase() ?? ''
    if (token && !PUBLIC_TOKEN_PATTERN.test(token)) {
      return { ok: false, reason: 'That QR carries a token that is not a Dearune token.' }
    }
    return { ok: true, publicId, token, source: 'url' }
  }

  // 2. A typed `publicId:token` pair.
  const pair = value.match(/^([0-9a-fA-F]{16,64})\s*[:|]\s*([0-9a-fA-F]{16,128})$/)
  if (pair) {
    return { ok: true, publicId: pair[1].toLowerCase(), token: pair[2].toLowerCase(), source: 'pair' }
  }

  // 3. A bare public id.
  if (PUBLIC_ID_PATTERN.test(value.toLowerCase())) {
    return { ok: true, publicId: value.toLowerCase(), token: '', source: 'id' }
  }

  return { ok: false, reason: 'That QR is not a Dearune QR.' }
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

const PROJECT_COLUMNS = [
  'id',
  'reference',
  'designer_id',
  'template_slug',
  'template_version',
  'title',
  'status',
  'public_id',
  'public_token',
  'wrapper_type',
  'sale_price',
  'estimated_cost',
  'currency',
  'configured_at',
  'submitted_at',
  'created_at',
  'updated_at',
  'paid_at',
  'manufactured_at',
  'shipped_at',
  'arrived_at',
  'archived_at',
  'first_activated_at',
  'message_active',
  'policy_version',
  'policies_accepted_at',
  'payload',
].join(', ')

const UNIT_COLUMNS = [
  'id',
  'reference',
  'unit_index',
  'status',
  'notes',
  'on_hold_reason',
  'cancelled_reason',
  'archived_at',
  'created_at',
  'updated_at',
  'project_id',
  'public_id',
  'wrapper_type',
  'template_slug',
  'paid_at',
  'message_active',
  'message_protected',
  'designer_id',
  'designer_name',
  'designer_code',
  'recipient_name',
  'customer_phone',
  'tracking_code',
  'provider',
  'address_line1',
  'address_line2',
  'city',
  'state_province',
  'postal_code',
  'country',
  'special_instructions',
  'qr_target',
  'qr_ready',
].join(', ')

const DESIGNER_COLUMNS = 'id, name, code, revoked_at, last_login_at, created_at, updated_at'
const TEMPLATE_COLUMNS = 'id, name, slug, description, enabled, sort_order'
const SALE_COLUMNS =
  'id, sale_reference, project_id, designer_id, designer_name, template_id, template_name, wrapper_type, title, sold_at, selling_price, estimated_cost, estimated_profit, currency, status, voided_at, void_reason, snapshot_data, created_at'
const SHIPPING_COLUMNS = [
  'id',
  'project_id',
  'recipient_name',
  'address_line1',
  'address_line2',
  'city',
  'state_province',
  'postal_code',
  'country',
  'phone',
  'provider',
  'tracking_code',
  'tracking_url',
  'special_instructions',
  'created_at',
  'updated_at',
].join(', ')

// A failed read is one of four things, and the page says which.
function readFailure(error, what) {
  const code = error?.code ?? ''
  const status = error?.status ?? error?.statusCode ?? null
  const message = String(error?.message ?? '')

  if (code === '42501' || status === 401 || status === 403 || /permission denied|row-level security/i.test(message)) {
    return new QaError(
      QA_ERROR_KINDS.FORBIDDEN,
      'This session is not allowed to read the archive. Sign in as an admin and try again.',
      { what },
    )
  }
  if (/failed to fetch|networkerror|load failed|econnrefused|timeout/i.test(message)) {
    return new QaError(
      QA_ERROR_KINDS.NETWORK,
      'The Dearune archive could not be reached. Check the connection and try again.',
      { what },
    )
  }
  return new QaError(QA_ERROR_KINDS.LOOKUP_FAILED, `Could not read ${what}. ${message || 'Unknown error.'}`, { what })
}

async function read(builder, what) {
  const { data, error } = await builder
  if (error) throw readFailure(error, what)
  return data ?? []
}

/**
 * Resolve a scanned QR into the full record behind it.
 *
 * @param {string} raw the scanned text
 * @returns {Promise<object>} the resolved record
 * @throws {QaError} with `kind` describing exactly what went wrong
 */
export async function fetchQaRecord(raw) {
  if (!supabase) {
    throw new QaError(QA_ERROR_KINDS.LOOKUP_FAILED, 'Supabase is not configured, so the archive cannot be read.')
  }

  const parsed = parseQrValue(raw)
  if (!parsed.ok) {
    throw new QaError(QA_ERROR_KINDS.INVALID, parsed.reason)
  }

  // 1. The Dearune itself. `public_id` is unique, so this is the one row
  //    that decides which letter a scan belongs to.
  const projects = await read(
    supabase.from('projects').select(PROJECT_COLUMNS).eq('public_id', parsed.publicId).limit(1),
    'the Dearune',
  )
  const project = projects[0] ?? null
  if (!project) {
    throw new QaError(
      QA_ERROR_KINDS.NOT_FOUND,
      'No Dearune carries that public id. The paper may be from another studio, or the record was never created.',
      { publicId: parsed.publicId },
    )
  }

  // 2. The token is the capability that proves the paper belongs to this
  //    letter. A scan without a token is still resolved, but it is reported
  //    as unverified rather than silently trusted.
  const storedToken = String(project.public_token ?? '')
  const tokenVerified = parsed.token ? parsed.token === storedToken : null
  if (parsed.token && !tokenVerified) {
    throw new QaError(
      QA_ERROR_KINDS.TOKEN_MISMATCH,
      'That QR carries the wrong token for this Dearune — the paper and the letter do not belong together.',
      { publicId: parsed.publicId },
    )
  }

  // 3. Everything else hangs off the project, so it can be read in one go.
  const [unitRows, saleRows, designerRows, templateRows, shippingRows, projectEventRows] = await Promise.all([
    read(supabase.from('operations_units').select(UNIT_COLUMNS).eq('public_id', parsed.publicId), 'the physical units'),
    read(supabase.from('sales_log').select(SALE_COLUMNS).eq('project_id', project.id), 'the sale'),
    read(
      project.designer_id
        ? supabase.from('designers').select(DESIGNER_COLUMNS).eq('id', project.designer_id).limit(1)
        : Promise.resolve({ data: [], error: null }),
      'the designer',
    ),
    read(
      project.template_slug
        ? supabase.from('templates').select(TEMPLATE_COLUMNS).eq('slug', project.template_slug).limit(1)
        : Promise.resolve({ data: [], error: null }),
      'the paper',
    ),
    read(supabase.from('shipping').select(SHIPPING_COLUMNS).eq('project_id', project.id).limit(1), 'the delivery details'),
    read(
      supabase.from('project_events').select('id, action, actor_type, created_at, detail').eq('project_id', project.id).order('created_at', { ascending: true }),
      'the activity trail',
    ),
  ])

  // 4. The per-unit timeline, only when there are units to attach it to.
  const unitIds = unitRows.map((row) => row.id).filter(Boolean)
  const unitEventRows = unitIds.length
    ? await read(
        supabase
          .from('physical_product_events')
          .select('id, physical_product_id, actor_type, action, detail, created_at')
          .in('physical_product_id', unitIds)
          .order('created_at', { ascending: true }),
        'the unit history',
      )
    : []

  return buildQaRecord({ parsed, project, unitRows, saleRows, designerRows, templateRows, shippingRows, projectEventRows, unitEventRows })
}

// ---------------------------------------------------------------------------
// Shaping
// ---------------------------------------------------------------------------

const text = (value) => (value === null || value === undefined ? '' : String(value))

function toUnit(row, events) {
  const reference = text(row.reference)
  return {
    id: row.id,
    reference,
    soldAs: soldAsId(reference),
    hasValidId: PHYSICAL_ID_PATTERN.test(reference),
    unitIndex: Number(row.unit_index ?? 1),
    status: row.status,
    statusLabel: OPERATIONS_STATUS_LABELS[row.status] ?? row.status,
    notes: text(row.notes),
    onHoldReason: text(row.on_hold_reason),
    cancelledReason: text(row.cancelled_reason),
    archived: Boolean(row.archived_at),
    archivedAt: row.archived_at ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    qrTarget: Boolean(row.qr_target),
    qrReady: Boolean(row.qr_ready),
    messageActive: Boolean(row.message_active),
    messageProtected: Boolean(row.message_protected),
    paidAt: row.paid_at ?? null,
    events: events
      .filter((event) => event.physical_product_id === row.id)
      .map((event) => ({
        id: event.id,
        actorType: event.actor_type,
        action: event.action,
        detail: event.detail ?? {},
        createdAt: event.created_at,
      })),
  }
}

// The media that belongs to a letter lives in the private `designer-drafts`
// bucket and is only ever handed out as a short-lived signed URL. QA shows
// WHAT is attached — never the bytes, and never a raw JSON dump.
function toMedia(payload) {
  const photos = Array.isArray(payload?.photos)
    ? payload.photos
        .filter((photo) => photo && typeof photo === 'object' && photo.path)
        .map((photo) => ({
          path: text(photo.path),
          name: text(photo.originalName) || 'Photograph',
          type: text(photo.mimeType) || 'image',
        }))
    : []
  const audio =
    payload?.audio && typeof payload.audio === 'object' && payload.audio.path
      ? {
          path: text(payload.audio.path),
          name: text(payload.audio.originalName) || 'Voice note',
          type: text(payload.audio.mimeType) || 'audio',
        }
      : null
  return { photos, audio }
}

// Assemble the record the page renders. Everything here is read-only: no
// field can be written back from this screen.
export function buildQaRecord({
  parsed,
  project,
  unitRows = [],
  saleRows = [],
  designerRows = [],
  templateRows = [],
  shippingRows = [],
  projectEventRows = [],
  unitEventRows = [],
}) {
  const letter = parseProjectPayload(project.payload)
  const units = unitRows
    .map((row) => toUnit(row, unitEventRows))
    .sort((a, b) => a.unitIndex - b.unitIndex)

  const designer = designerRows[0] ?? null
  const template = templateRows[0] ?? null
  const shipping = shippingRows[0] ?? null
  const sale = saleRows.find((row) => row.status === 'completed') ?? saleRows[0] ?? null
  const voidedSales = saleRows.filter((row) => row.status === 'voided')

  // Things the studio should know are missing — said plainly, never dressed
  // up as data.
  const warnings = []
  if (!letter) warnings.push('The letter body is missing from this record.')
  if (units.length === 0) warnings.push('No physical unit has been created for this Dearune yet.')
  if (!designer) warnings.push('No designer is assigned to this Dearune.')
  if (shipping) {
    const missing = []
    if (!text(shipping.address_line1)) missing.push('address')
    if (!text(shipping.city)) missing.push('city')
    if (!text(shipping.postal_code)) missing.push('postal code')
    if (!text(shipping.country)) missing.push('country')
    if (missing.length) warnings.push(`Delivery details are incomplete — missing ${missing.join(', ')}.`)
  } else {
    warnings.push('No delivery details have been entered for this Dearune.')
  }
  if (!project.message_active) warnings.push('The letter is switched off — the printed QR will not open it.')
  if (letter?.passwordSet) warnings.push('The letter is password-protected — the public reader will not open it.')
  if (!sale) warnings.push('This Dearune has no sale recorded.')

  return {
    scanned: parsed.publicId,
    publicId: text(project.public_id),
    token: {
      present: Boolean(parsed.token),
      verified: parsed.token ? parsed.token === text(project.public_token) : null,
      source: parsed.source,
    },
    project: {
      id: project.id,
      reference: text(project.reference),
      title: text(project.title),
      status: text(project.status),
      templateSlug: text(project.template_slug),
      templateVersion: project.template_version ?? null,
      wrapperType: text(project.wrapper_type),
      salePrice: project.sale_price ?? null,
      estimatedCost: project.estimated_cost ?? null,
      currency: text(project.currency) || 'EGP',
      configuredAt: project.configured_at ?? null,
      submittedAt: project.submitted_at ?? null,
      createdAt: project.created_at ?? null,
      updatedAt: project.updated_at ?? null,
      paidAt: project.paid_at ?? null,
      manufacturedAt: project.manufactured_at ?? null,
      shippedAt: project.shipped_at ?? null,
      arrivedAt: project.arrived_at ?? null,
      archivedAt: project.archived_at ?? null,
      firstActivatedAt: project.first_activated_at ?? null,
      messageActive: Boolean(project.message_active),
      policyVersion: text(project.policy_version),
      policiesAcceptedAt: project.policies_accepted_at ?? null,
    },
    letter: letter
      ? {
          language: letter.language,
          greeting: letter.greeting,
          body: letter.body,
          closing: letter.closing,
          senderName: letter.senderName,
          passwordSet: letter.passwordSet,
        }
      : null,
    designer: designer
      ? {
          id: designer.id,
          name: text(designer.name),
          code: text(designer.code),
          revoked: Boolean(designer.revoked_at),
          revokedAt: designer.revoked_at ?? null,
          lastLoginAt: designer.last_login_at ?? null,
          createdAt: designer.created_at ?? null,
        }
      : null,
    template: template
      ? {
          id: template.id,
          name: text(template.name),
          slug: text(template.slug),
          description: text(template.description),
          enabled: template.enabled !== false,
        }
      : null,
    shipping: shipping
      ? {
          id: shipping.id,
          recipientName: text(shipping.recipient_name),
          addressLine1: text(shipping.address_line1),
          addressLine2: text(shipping.address_line2),
          city: text(shipping.city),
          stateProvince: text(shipping.state_province),
          postalCode: text(shipping.postal_code),
          country: text(shipping.country),
          phone: text(shipping.phone),
          provider: text(shipping.provider),
          trackingCode: text(shipping.tracking_code),
          trackingUrl: text(shipping.tracking_url),
          specialInstructions: text(shipping.special_instructions),
        }
      : null,
    sale: sale
      ? {
          id: sale.id,
          reference: text(sale.sale_reference),
          soldAt: sale.sold_at ?? null,
          sellingPrice: sale.selling_price ?? null,
          estimatedCost: sale.estimated_cost ?? null,
          estimatedProfit: sale.estimated_profit ?? null,
          currency: text(sale.currency) || 'EGP',
          status: text(sale.status),
          voidedAt: sale.voided_at ?? null,
          voidReason: text(sale.void_reason),
          templateName: text(sale.template_name),
          wrapperType: text(sale.wrapper_type),
          designerName: text(sale.designer_name),
        }
      : null,
    voidedSales: voidedSales.map((row) => ({
      id: row.id,
      reference: text(row.sale_reference),
      soldAt: row.sold_at ?? null,
      voidedAt: row.voided_at ?? null,
      voidReason: text(row.void_reason),
    })),
    units,
    projectEvents: projectEventRows.map((event) => ({
      id: event.id,
      action: event.action,
      actorType: event.actor_type,
      createdAt: event.created_at,
    })),
    media: toMedia(letter),
    warnings,
  }
}

// The three identifiers a workshop actually reads out loud, in one place.
export function qaIdentifiers(record) {
  if (!record) return []
  const identifiers = []
  for (const unit of record.units ?? []) {
    identifiers.push({
      key: `unit-${unit.id}`,
      label: unit.unitIndex > 1 ? `Production reference · unit ${unit.unitIndex}` : 'Production reference',
      value: unit.reference,
      hint: unit.hasValidId ? unit.soldAs : 'not a valid production reference',
      tone: 'primary',
    })
  }
  identifiers.push({
    key: 'designer',
    label: 'Designer ID',
    value: record.designer?.code ?? '',
    hint: record.designer?.name ?? 'no designer assigned',
    tone: 'secondary',
  })
  identifiers.push({
    key: 'public',
    label: 'Public ID',
    value: record.publicId ?? '',
    hint: 'the handle in the printed QR',
    tone: 'secondary',
  })
  return identifiers
}
