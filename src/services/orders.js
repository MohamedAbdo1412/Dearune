import { supabase, currentAccessToken, invokeFunction, supabaseUrl } from '@/lib/supabase'
import { createOrderSchema } from './validation'

function normalizeEntity(entities, key) {
  const map = new Map()
  for (const entity of entities ?? []) {
    const id = String(entity[key])
    if (!map.has(id)) map.set(id, entity)
  }
  return map
}

export async function adminCreateOrder(adminToken, payload) {
  const parsed = createOrderSchema.safeParse(payload)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Please check the order details')

  const result = await invokeFunction('create-sale', {
    method: 'POST',
    adminToken,
    body: {
      customerFirstName: parsed.data.customerFirstName ?? null,
      customerLastName: parsed.data.customerLastName ?? null,
      customerEmail: parsed.data.customerEmail ?? null,
      customerPhone: parsed.data.customerPhone ?? null,
      recipientName: parsed.data.recipientName,
      occasion: parsed.data.occasion ?? null,
      eventDate: parsed.data.eventDate ?? null,
      recipientMessage: parsed.data.recipientMessage ?? null,
      templateId: parsed.data.templateId,
      wrapperType: parsed.data.wrapperType,
      designerCode: parsed.data.designerCode ?? null,
    },
  })
  return result
}

export async function fetchAdminOrders() {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data: orders, error } = await supabase
    .from('orders')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error

  const ids = (orders ?? []).map((order) => order.id)
  const [{ data: templates }, { data: designers }, { data: messages }] = await Promise.all([
    supabase.from('templates').select('id, name, slug'),
    supabase.from('designers').select('id, name, code'),
    supabase.from('messages').select('order_id, public_id, locked_at, published_at, message_active').in('order_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']),
  ])

  const templateMap = normalizeEntity(templates, 'id')
  const designerMap = normalizeEntity(designers, 'id')
  const messageMap = normalizeEntity(messages, 'order_id')

  return (orders ?? []).map((order) => ({
    ...order,
    template: templateMap.get(order.template_id) ?? null,
    designer: order.designer_id ? designerMap.get(order.designer_id) ?? null : null,
    message: messageMap.get(order.id) ?? null,
  }))
}

export async function fetchAdminOrderDetail(orderId) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data: order, error } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle()
  if (error || !order) throw error ?? new Error('Order not found')

  const { data: messageRow } = await supabase.from('messages').select('id').eq('order_id', orderId).maybeSingle()
  const messageId = messageRow?.id ?? '00000000-0000-0000-0000-000000000000'

  const [templates, pricing, designers, messages, media, shipping, events, settings] = await Promise.all([
    supabase.from('templates').select('*').eq('id', order.template_id).maybeSingle(),
    supabase.from('template_pricing').select('*').eq('template_id', order.template_id).eq('wrapper_type', order.wrapper_type).maybeSingle(),
    order.designer_id ? supabase.from('designers').select('*').eq('id', order.designer_id).maybeSingle() : Promise.resolve(null),
    supabase.from('messages').select('*').eq('order_id', orderId).maybeSingle(),
    supabase.from('message_media').select('*').eq('message_id', messageId).is('disabled_at', null).order('sort_order', { ascending: true }),
    supabase.from('shipping').select('*').eq('order_id', orderId).maybeSingle(),
    supabase.from('order_events').select('*').eq('order_id', orderId).order('created_at', { ascending: true }),
    supabase.from('app_settings').select('*').eq('id', 1).maybeSingle(),
  ])

  return {
    order,
    template: templates.data ?? null,
    pricing: pricing.data ?? null,
    designer: designers?.data ?? null,
    message: messages.data ?? null,
    media: media.data ?? [],
    shipping: shipping.data ?? null,
    events: events.data ?? [],
    settings: settings.data ?? null,
  }
}

export async function assignDesigner(orderId, designerId) {
  if (!supabase) throw new Error('Supabase is not configured')
  await supabase.from('orders').update({ designer_id: designerId }).eq('id', orderId)
  await supabase.from('order_events').insert({
    order_id: orderId,
    actor_type: 'admin',
    actor_id: null,
    action: designerId ? 'designer.assigned' : 'designer.unassigned',
    detail: {},
  })
}

export async function setOrderTimestamp(orderId, field, detail = {}) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data: current } = await supabase.from('orders').select('*').eq('id', orderId).single()
  if (!current || current[field]) return false
  const now = new Date().toISOString()
  await supabase.from('orders').update({ [field]: now }).eq('id', orderId)
  await supabase.from('order_events').insert({
    order_id: orderId,
    actor_type: 'admin',
    actor_id: null,
    action: `order.${field.replace('_at', '')}`,
    detail,
  })
  return true
}

export async function reverseOrderTimestamp(orderId, field, detail = {}) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data: current } = await supabase.from('orders').select(field).eq('id', orderId).single()
  if (!current || !current[field]) return false
  await supabase.from('orders').update({ [field]: null }).eq('id', orderId)
  await supabase.from('order_events').insert({
    order_id: orderId,
    actor_type: 'admin',
    actor_id: null,
    action: `order.${field.replace('_at', '')}.reversed`,
    detail,
  })
  return true
}

export async function toggleMessageActive(orderId, active) {
  if (!supabase) throw new Error('Supabase is not configured')
  await supabase.from('messages').update({ message_active: active }).eq('order_id', orderId)
  await supabase.from('order_events').insert({
    order_id: orderId,
    actor_type: 'admin',
    actor_id: null,
    action: active ? 'message.activated' : 'message.deactivated',
    detail: {},
  })
}

export async function softDeleteOrder(orderId, reason) {
  if (!supabase) throw new Error('Supabase is not configured')
  await supabase.from('orders').update({ deleted_at: new Date().toISOString() }).eq('id', orderId)
  await supabase.from('order_events').insert({ order_id: orderId, actor_type: 'admin', actor_id: null, action: 'order.deleted', detail: { reason } })
}

export async function fetchAdminOrderTimeline(orderId) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data } = await supabase.from('order_events').select('*').eq('order_id', orderId).order('created_at', { ascending: true })
  return data ?? []
}

export async function fetchLabelAssetBlob(driveFileId) {
  const token = await currentAccessToken()
  if (!token) throw new Error('Not signed in')
  const url = `${supabaseUrl}/functions/v1/drive-media?${new URLSearchParams({ file: driveFileId })}`
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Could not load shipping label (${res.status})`)
  return res.blob()
}