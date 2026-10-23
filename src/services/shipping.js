import { supabase } from '@/lib/supabase'
import { fetchDearunes } from './dearunes'
import { fetchTemplates } from './templates'
import { findWrapper, wrapperLabel } from './wrappers'
import { projectStage, PROJECT_STAGE_LABELS } from './constants'

// The shipping manifest: one row per Dearune whose delivery details have
// been entered. The reader that produced this file used to query the
// legacy `orders` table; `shipping` now hangs off `project_id` (see
// 20260925000001_designer_operations.sql), so the manifest is built from
// `projects` joined to `shipping`. Reads go straight to PostgREST under the
// admin's select-only `admins_read_shipping` policy — nothing here writes.

export const SHIPPING_CSV_HEADERS = [
  'Reference',
  'Stage',
  'Recipient',
  'Title',
  'Template',
  'Wrapper',
  'Address line 1',
  'Address line 2',
  'Governorate',
  'District',
  'City',
  'State/Province',
  'Postal code',
  'Country',
  'Phone',
  'Special instructions',
  'Tracking code',
  'Shipped at',
]

function csvCell(value) {
  if (value === null || value === undefined) return ''
  let str = String(value)
  if (/[",\n\r]/.test(str)) str = `"${str.replace(/"/g, '""')}"`
  return str
}

// Pure, so the exact bytes can be asserted in tests: Arabic titles and
// quoted addresses must survive the round trip.
export function shipmentCsv(shipments) {
  const lines = [SHIPPING_CSV_HEADERS.map(csvCell).join(',')]
  for (const s of shipments ?? []) {
    lines.push(
      [
        s.reference,
        PROJECT_STAGE_LABELS[s.stage] ?? s.stage,
        s.recipientName,
        s.title,
        s.template,
        s.wrapper,
        s.addressLine1,
        s.addressLine2,
        s.governorate,
        s.district,
        s.city,
        s.stateProvince,
        s.postalCode,
        s.country,
        s.phone,
        s.specialInstructions,
        s.trackingCode,
        s.shippedAt,
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return lines.join('\r\n')
}

export function shipmentCsvBlob(shipments) {
  // UTF-8 BOM: without it, spreadsheet apps read Arabic titles as mojibake.
  return new Blob(['\uFEFF' + shipmentCsv(shipments)], { type: 'text/csv;charset=utf-8' })
}

export function downloadShippingCsv(shipments, filename = 'dearune-shipping.csv') {
  const blob = shipmentCsvBlob(shipments)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

// Every project that has delivery details on file, newest first, with the
// template and wrapper resolved to the names the studio actually reads.
export async function fetchShipments() {
  if (!supabase) throw new Error('Supabase is not configured')

  const [projects, catalog] = await Promise.all([
    fetchDearunes(),
    fetchTemplates().catch(() => null),
  ])

  const { data: shippingRows, error } = await supabase
    .from('shipping')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error

  const byProject = new Map(
    (shippingRows ?? []).filter((row) => row.project_id).map((row) => [row.project_id, row]),
  )

  const templateName = (slug) => catalog?.templates?.find((t) => t.slug === slug)?.name ?? slug ?? ''
  const wrapperName = (key) =>
    key ? wrapperLabel(findWrapper(catalog?.wrappers ?? [], key) ?? { key }) : ''

  const shipments = []
  for (const project of projects) {
    const ship = byProject.get(project.id)
    if (!ship) continue
    shipments.push({
      reference: project.reference ?? project.id,
      stage: projectStage(project),
      recipientName: ship.recipient_name ?? project.title ?? '',
      title: project.title ?? '',
      template: templateName(project.template_slug),
      wrapper: wrapperName(project.wrapper_type),
      addressLine1: ship.address_line1 ?? '',
      addressLine2: ship.address_line2 ?? '',
      governorate: ship.governorate ?? '',
      district: ship.district ?? '',
      city: ship.city ?? '',
      stateProvince: ship.state_province ?? '',
      postalCode: ship.postal_code ?? '',
      country: ship.country ?? '',
      phone: ship.phone ?? '',
      specialInstructions: ship.special_instructions ?? '',
      trackingCode: ship.tracking_code ?? '',
      shippedAt: project.shipped_at ?? '',
    })
  }
  return shipments
}
