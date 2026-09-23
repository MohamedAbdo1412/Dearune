import { supabase } from '@/lib/supabase'
import { shippingUpsertSchema } from './validation'

export async function upsertShipping(orderId, input) {
  if (!supabase) throw new Error('Supabase is not configured')
  const parsed = shippingUpsertSchema.safeParse(input)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Please check the shipping details')

  const { data: existing } = await supabase.from('shipping').select('id').eq('order_id', orderId).maybeSingle()
  if (existing) {
    await supabase.from('shipping')
      .update({
        recipient_name: parsed.data.recipientName ?? null,
        address_line1: parsed.data.addressLine1,
        address_line2: parsed.data.addressLine2 ?? null,
        city: parsed.data.city,
        state_province: parsed.data.stateProvince ?? null,
        postal_code: parsed.data.postalCode,
        country: parsed.data.country,
        phone: parsed.data.phone ?? null,
        special_instructions: parsed.data.specialInstructions ?? null,
      })
      .eq('id', existing.id)
  } else {
    await supabase.from('shipping').insert({
      order_id: orderId,
      recipient_name: parsed.data.recipientName ?? null,
      address_line1: parsed.data.addressLine1,
      address_line2: parsed.data.addressLine2 ?? null,
      city: parsed.data.city,
      state_province: parsed.data.stateProvince ?? null,
      postal_code: parsed.data.postalCode,
      country: parsed.data.country,
      phone: parsed.data.phone ?? null,
      special_instructions: parsed.data.specialInstructions ?? null,
    })
  }
}

export async function saveShippingLabel(orderId, driveFileId, info = {}) {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data: existing } = await supabase.from('shipping').select('label_media').eq('order_id', orderId).maybeSingle()
  const base = (existing?.label_media ?? {})
  const labelMedia = { ...base, driveFileId, at: new Date().toISOString(), ...info }
  if (existing) {
    await supabase.from('shipping').update({ label_media: labelMedia }).eq('order_id', orderId)
  } else {
    await supabase.from('shipping').insert({
      order_id: orderId,
      recipient_name: '',
      address_line1: '',
      city: '',
      postal_code: '',
      country: '',
      label_media: labelMedia,
    })
  }
}

function csvCell(value) {
  if (value === null || value === undefined) return ''
  let str = String(value)
  if (/[",\n]/.test(str)) str = `"${str.replace(/"/g, '""')}"`
  return str
}

export async function exportShippingCsv() {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, template_id, recipient_name, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error

  const [{ data: shippingRows }, { data: templateRows }] = await Promise.all([
    supabase.from('shipping').select('order_id, recipient_name, address_line1, address_line2, city, state_province, postal_code, country, phone'),
    supabase.from('templates').select('id, name'),
  ])
  const shippingMap = new Map((shippingRows ?? []).map((row) => [String(row.order_id), row]))
  const templateMap = new Map((templateRows ?? []).map((row) => [row.id, row]))

  const headers = ['Order ID', 'Recipient', 'Template', 'Line 1', 'Line 2', 'City', 'State/Province', 'Postal code', 'Country', 'Phone']
  let csv = headers.map(csvCell).join(',') + '\n'
  for (const order of orders ?? []) {
    const s = shippingMap.get(String(order.id)) ?? {}
    const t = templateMap.get(order.template_id) ?? {}
    csv += [
      order.id,
      order.recipient_name,
      t?.name ?? '',
      s?.address_line1 ?? '',
      s?.address_line2 ?? '',
      s?.city ?? '',
      s?.state_province ?? '',
      s?.postal_code ?? '',
      s?.country ?? '',
      s?.phone ?? '',
    ].map(csvCell).join(',') + '\n'
  }

  return new Blob([csv], { type: 'text/csv;charset=utf-8' })
}