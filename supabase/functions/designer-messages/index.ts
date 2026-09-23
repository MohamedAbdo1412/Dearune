import { corsHeaders, errorResponse, handleOptions, jsonResponse } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
import { requireDesigner } from '../_shared/auth.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405)

  const designer = await requireDesigner(req)
  if (!designer) return errorResponse('Unauthorized', 401)

  const { data: orders, error } = await adminClient()
    .from('orders')
    .select(
      'id, wrapper_type, snapshot_price, currency, recipient_name, occasion, event_date, paid_at, manufactured_at, shipped_at, arrived_at, cancelled_at, deleted_at, created_at, designer_id, template:templates(id, name, slug)',
    )
    .eq('designer_id', designer.designerId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) return errorResponse('Failed to load orders', 500)

  const orderIds = (orders ?? []).map((o: { id: string }) => o.id)
  const { data: messages } = await adminClient()
    .from('messages')
    .select('order_id, public_id, published_at, locked_at, message_active')
    .in('order_id', orderIds.length ? orderIds : ['00000000-0000-0000-0000-000000000000'])

  const messageByOrder = new Map<string, Record<string, unknown>>()
  for (const m of messages ?? []) messageByOrder.set(String(m.order_id), m)

  const rows = (orders ?? []).map((order: Record<string, unknown>) => ({
    order: {
      id: order.id,
      wrapper_type: order.wrapper_type,
      snapshot_price: order.snapshot_price,
      currency: order.currency,
      recipient_name: order.recipient_name,
      occasion: order.occasion,
      event_date: order.event_date,
      paid_at: order.paid_at,
      manufactured_at: order.manufactured_at,
      shipped_at: order.shipped_at,
      arrived_at: order.arrived_at,
      cancelled_at: order.cancelled_at,
      deleted_at: order.deleted_at,
      created_at: order.created_at,
      template: order.template,
    },
    message: messageByOrder.get(String(order.id)) ?? null,
  }))

  return jsonResponse({ orders: rows })
})

export const cors = corsHeaders