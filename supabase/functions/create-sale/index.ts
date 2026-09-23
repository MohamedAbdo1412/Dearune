import { corsHeaders, errorResponse, handleOptions, jsonResponse, readJson } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
import { requireAdmin } from '../_shared/auth.ts'

const WRAPPER_TYPES = ['digital', 'open_letter', 'sealed_letter', 'open_card']
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(body: Record<string, unknown>): string | null {
  const recipientName = typeof body.recipientName === 'string' ? body.recipientName.trim() : ''
  if (!recipientName || recipientName.length > 120) return 'Recipient name is required'
  if (typeof body.templateId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.templateId)) return 'Template is required'
  if (typeof body.wrapperType !== 'string' || !WRAPPER_TYPES.includes(body.wrapperType)) return 'Pick a valid wrapper'
  if (body.eventDate != null && body.eventDate !== '' && !DATE_ONLY.test(String(body.eventDate))) return 'Enter a valid date'
  if (body.customerEmail != null && body.customerEmail !== '' && !EMAIL.test(String(body.customerEmail))) return 'Enter a valid email'
  if (body.designerCode != null && body.designerCode !== '' && !/^\d{6}$/.test(String(body.designerCode))) return 'Designer code must be 6 digits'
  for (const key of ['customerFirstName', 'customerLastName', 'customerPhone', 'occasion', 'recipientMessage']) {
    const value = body[key]
    if (value != null && typeof value !== 'string') return 'Check the order details'
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const admin = await requireAdmin(req)
  if (!admin) return errorResponse('Unauthorized', 401)

  const body = await readJson(req)
  const invalid = validate(body)
  if (invalid) return errorResponse('Please check the order details', 400)

  const sb = adminClient()

  const { data: settings } = await sb.from('app_settings').select('maintenance_mode, allow_new_orders, currency').eq('id', 1).maybeSingle()
  if (settings?.maintenance_mode) return errorResponse('Maintenance mode is on — new orders are disabled', 409)
  if (settings && !settings.allow_new_orders) return errorResponse('New orders are currently disabled', 409)

  const { data: template } = await sb.from('templates').select('id, name, enabled, deleted_at').eq('id', String(body.templateId)).is('deleted_at', null).maybeSingle()
  if (!template || !template.enabled) return errorResponse('Template is not available', 400)

  const { data: pricing } = await sb.from('template_pricing').select('price, cost').eq('template_id', template.id).eq('wrapper_type', String(body.wrapperType)).maybeSingle()
  if (!pricing) return errorResponse('This wrapper option is not available for the template', 400)

  let designerId: string | null = null
  let designerName: string | null = null
  if (typeof body.designerCode === 'string' && body.designerCode.trim() !== '') {
    const { data: designer } = await sb.from('designers').select('id, name, revoked_at').eq('code', body.designerCode).maybeSingle()
    if (!designer || designer.revoked_at) return errorResponse('Designer code is invalid', 400)
    designerId = designer.id
    designerName = designer.name
  }

  const { data: publicId, error: allocateError } = await sb.rpc('allocate_message_public_id')
  if (allocateError || !publicId) return errorResponse('Could not create order, please retry', 500)

  const now = new Date().toISOString()
  const { data: order, error: orderError } = await sb
    .from('orders')
    .insert({
      template_id: template.id,
      designer_id: designerId,
      wrapper_type: String(body.wrapperType),
      snapshot_price: pricing.price,
      estimated_cost: pricing.cost,
      currency: settings?.currency ?? 'GBP',
      customer_first_name: body.customerFirstName ? String(body.customerFirstName).trim() || null : null,
      customer_last_name: body.customerLastName ? String(body.customerLastName).trim() || null : null,
      customer_email: body.customerEmail && String(body.customerEmail).trim() !== '' ? String(body.customerEmail).trim() : null,
      customer_phone: body.customerPhone ? String(body.customerPhone).trim() || null : null,
      recipient_name: String(body.recipientName).trim(),
      occasion: body.occasion ? String(body.occasion).trim() || null : null,
      event_date: body.eventDate && String(body.eventDate) !== '' ? String(body.eventDate) : null,
      recipient_message: body.recipientMessage ? String(body.recipientMessage).trim() || null : null,
      created_at: now,
      updated_at: now,
    })
    .select('id, snapshot_price, estimated_cost, currency, recipient_name, created_at')
    .single()

  if (orderError || !order) return errorResponse('Failed to create the order', 500)

  const { error: messageError } = await sb.from('messages').insert({ order_id: order.id, public_id: publicId })

  if (messageError) {
    await sb.from('orders').delete().eq('id', order.id)
    return errorResponse('Failed to create the order', 500)
  }

  const events: Array<Record<string, unknown>> = [
    { order_id: order.id, actor_type: 'admin', actor_id: admin.id, action: 'order.created', detail: { template: template.name, wrapper_type: body.wrapperType } },
  ]
  if (designerId) {
    events.push({ order_id: order.id, actor_type: 'admin', actor_id: admin.id, action: 'designer.assigned', detail: { designer: designerName } })
  }
  await sb.from('order_events').insert(events)

  return jsonResponse({ order, orderId: order.id, orderPublicId: publicId, publicId }, 201)
})

export const cors = corsHeaders