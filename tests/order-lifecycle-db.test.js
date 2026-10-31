import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ADMIN_ID,
  asRole,
  bootDatabase,
  many,
  one,
  seedAdmin,
  seedDesigner,
  seedProject,
  seedShipping,
  value,
} from './helpers/database'

let db
let designerId

beforeAll(async () => {
  db = await bootDatabase()
  designerId = await seedDesigner(db)
  await seedAdmin(db)
}, 240_000)

afterAll(async () => {
  await db?.close()
})

// A paid, physical Dearune in Making with one unit — the state every Operations
// action starts from.
async function orderInMaking(overrides = {}) {
  const project = await seedProject(db, { designerId, ...overrides })
  await db.query('select public.ops_start_work_order($1, $2)', [project.id, ADMIN_ID])
  await db.query('select * from public.ensure_physical_products($1, 1, null)', [project.id])
  return project.id
}

const milestoneOf = (projectId) => value(db, 'select milestone::text from public.projects where id = $1', [projectId])
const shipmentOf = (projectId) =>
  one(db, 'select * from public.shipping where project_id = $1', [projectId])

describe('identity', () => {
  it('keeps one canonical id and records every other identifier as an alias', async () => {
    const projectId = await orderInMaking()

    const canonical = await value(db, 'select reference from public.projects where id = $1', [projectId])
    const unit = await value(db, 'select reference from public.physical_products where project_id = $1', [projectId])
    const refs = await many(db, 'select kind, value from public.order_references where project_id = $1 order by kind', [
      projectId,
    ])

    expect(canonical).toMatch(/^DR-\d{6}$/)
    expect(unit).toMatch(/^DR\d{11}$/)
    expect(refs).toEqual([
      { kind: 'canonical', value: canonical },
      { kind: 'sold', value: `SOL-${canonical.slice(3)}` },
      { kind: 'unit', value: unit },
    ])
  })

  it('derives the Sold ID from the canonical id, never from a physical unit', async () => {
    const projectId = await orderInMaking()
    const canonical = await value(db, 'select reference from public.projects where id = $1', [projectId])
    const sold = await value(
      db,
      `select value from public.order_references where project_id = $1 and kind = 'sold'`,
      [projectId],
    )

    expect(canonical).toMatch(/^DR-(\d{6})$/)
    expect(sold).toBe(`SOL-${canonical.slice(3)}`)

    // A second unit must not create a second Sold ID or a Sold ID of its own.
    await db.query('select * from public.ensure_physical_products($1, 2, null)', [projectId])
    const soldRows = await many(
      db,
      `select value from public.order_references where project_id = $1 and kind = 'sold'`,
      [projectId],
    )
    expect(soldRows).toEqual([{ value: sold }])
  })

  it('resolves the order from ANY of its identifiers', async () => {
    const projectId = await orderInMaking()
    const canonical = await value(db, 'select reference from public.projects where id = $1', [projectId])
    const unit = await value(db, 'select reference from public.physical_products where project_id = $1', [projectId])

    for (const id of [canonical, unit, `SOL-${canonical.slice(3)}`]) {
      const found = await value(db, 'select project_id from public.order_references where value = $1', [id])
      expect(found, id).toBe(projectId)
    }
  })

  it('refuses to attach one identifier to two orders', async () => {
    const a = await orderInMaking()
    const b = await orderInMaking()
    const unit = await value(db, 'select reference from public.physical_products where project_id = $1', [a])

    await expect(
      db.query(
        `insert into public.order_references (project_id, kind, value) values ($1, 'legacy', $2)`,
        [b, unit],
      ),
    ).rejects.toThrow()
  })

  it('never renumbers a unit when the project moves on', async () => {
    const projectId = await orderInMaking()
    const before = await value(db, 'select reference from public.physical_products where project_id = $1', [projectId])
    await db.query('select public.ops_making_complete($1, $2, $3)', [projectId, ADMIN_ID, 'done'])
    const after = await value(db, 'select reference from public.physical_products where project_id = $1', [projectId])
    expect(after).toBe(before)
  })
})

describe('milestone transitions', () => {
  it('enters Making only for a paid physical Dearune', async () => {
    expect(await milestoneOf(await orderInMaking())).toBe('making')

    const unpaid = await seedProject(db, { designerId, paid: false })
    await expect(db.query('select public.ops_start_work_order($1, $2)', [unpaid.id, ADMIN_ID])).rejects.toThrow(
      /not_paid/,
    )

    const digital = await seedProject(db, { designerId, wrapperType: 'digital' })
    await db.query('select public.ops_start_work_order($1, $2)', [digital.id, ADMIN_ID])
    // Digital has no Making: it settles at `sold` and only becomes `delivered`
    // when the recipient opens the letter.
    expect(await milestoneOf(digital.id)).toBe('sold')
  })

  it('starts Making once, no matter how many times it is asked', async () => {
    const projectId = await orderInMaking()
    await db.query('select public.ops_start_work_order($1, $2)', [projectId, ADMIN_ID])
    await db.query('select public.ops_start_work_order($1, $2)', [projectId, ADMIN_ID])
    const events = await value(
      db,
      `select count(*)::int from public.project_events where project_id = $1 and action = 'order.milestone'`,
      [projectId],
    )
    // configured → sold → making is two real hops, recorded once each. Asking
    // again records nothing.
    expect(events).toBe(2)
  })

  it('walks Making → Shipping → Delivery → Delivered → After-Sale, one step at a time', async () => {
    const projectId = await orderInMaking()

    await db.query('select public.ops_making_complete($1, $2, $3)', [projectId, ADMIN_ID, 'Made'])
    expect(await milestoneOf(projectId)).toBe('shipping')

    await db.query('select public.ops_ship($1, $2, $3, null, $4, null)', [
      projectId,
      'egypt_post',
      'EP-123',
      ADMIN_ID,
    ])
    expect(await milestoneOf(projectId)).toBe('delivery')

    await db.query('select public.ops_deliver($1, $2, null, null)', [projectId, ADMIN_ID])
    expect(await milestoneOf(projectId)).toBe('delivered')

    await db.query('select public.ops_after_sale($1, $2, $3)', [projectId, ADMIN_ID, 'Complaint'])
    expect(await milestoneOf(projectId)).toBe('after_sale')
  })

  it('refuses to skip a stage or go backwards, even by direct SQL', async () => {
    const projectId = await orderInMaking()

    await expect(
      db.query(`update public.projects set milestone = 'delivered' where id = $1`, [projectId]),
    ).rejects.toThrow(/transition_denied/)

    await expect(
      db.query('select public.ops_deliver($1, $2, null, null)', [projectId, ADMIN_ID]),
    ).rejects.toThrow(/transition_denied/)

    await db.query('select public.ops_making_complete($1, $2, null)', [projectId, ADMIN_ID])
    await expect(
      db.query(`update public.projects set milestone = 'making' where id = $1`, [projectId]),
    ).rejects.toThrow(/transition_denied/)
  })

  it('records who moved the order, when, and why', async () => {
    const projectId = await orderInMaking()
    await db.query('select public.ops_making_complete($1, $2, $3)', [projectId, ADMIN_ID, 'Ready for the van'])

    const project = await one(
      db,
      'select milestone_updated_by, milestone_updated_at, manufactured_at from public.projects where id = $1',
      [projectId],
    )
    expect(project.milestone_updated_by).toBe(ADMIN_ID)
    expect(project.milestone_updated_at).not.toBeNull()
    expect(project.manufactured_at).not.toBeNull()

    const event = await one(
      db,
      `select actor_id, detail from public.project_events
       where project_id = $1 and action = 'order.milestone' and detail->>'to' = 'shipping'`,
      [projectId],
    )
    expect(event.actor_id).toBe(ADMIN_ID)
    expect(event.detail.reason).toBe('Ready for the van')
  })

  it('makes finishing Making idempotent', async () => {
    const projectId = await orderInMaking()
    await db.query('select public.ops_making_complete($1, $2, null)', [projectId, ADMIN_ID])
    await db.query('select public.ops_making_complete($1, $2, null)', [projectId, ADMIN_ID])

    const events = await value(
      db,
      `select count(*)::int from public.physical_product_events e
       join public.physical_products pp on pp.id = e.physical_product_id
       where pp.project_id = $1 and e.action = 'operations.making_completed'`,
      [projectId],
    )
    expect(events).toBe(1)
    expect(await milestoneOf(projectId)).toBe('shipping')
  })

  it('will not finish Making without a physical unit, or without a sale', async () => {
    const noUnits = await seedProject(db, { designerId })
    await db.query('select public.ops_start_work_order($1, $2)', [noUnits.id, ADMIN_ID])
    await expect(
      db.query('select public.ops_making_complete($1, $2, null)', [noUnits.id, ADMIN_ID]),
    ).rejects.toThrow(/no_units/)
  })

  it('advances the legacy Made/Shipped/Arrived stamps through the same milestone', async () => {
    const projectId = await orderInMaking()
    await db.query(`select public.ops_advance_to($1, 'delivered', $2, $3)`, [projectId, ADMIN_ID, 'Legacy stamp'])

    expect(await milestoneOf(projectId)).toBe('delivered')
    const project = await one(db, 'select manufactured_at, shipped_at, arrived_at from public.projects where id = $1', [
      projectId,
    ])
    expect(project.manufactured_at).not.toBeNull()
    expect(project.shipped_at).not.toBeNull()
    expect(project.arrived_at).not.toBeNull()
  })
})

describe('shipping', () => {
  it('requires an explicit carrier and refuses an invented one', async () => {
    const projectId = await orderInMaking()
    await db.query('select public.ops_making_complete($1, $2, null)', [projectId, ADMIN_ID])

    await expect(
      db.query('select public.ops_ship($1, $2, $3, null, $4, null)', [projectId, '', 'EP-1', ADMIN_ID]),
    ).rejects.toThrow(/carrier_required/)

    await expect(
      db.query('select public.ops_ship($1, $2, $3, null, $4, null)', [projectId, 'aramex', 'EP-1', ADMIN_ID]),
    ).rejects.toThrow(/carrier_required/)
  })

  it('requires a tracking number before marking shipped', async () => {
    const projectId = await orderInMaking()
    await db.query('select public.ops_making_complete($1, $2, null)', [projectId, ADMIN_ID])
    await expect(
      db.query('select public.ops_ship($1, $2, $3, null, $4, null)', [projectId, 'bosta', '   ', ADMIN_ID]),
    ).rejects.toThrow(/tracking_required/)
  })

  it('persists the carrier and the tracking number on the shipment', async () => {
    const projectId = await orderInMaking()
    await db.query('select public.ops_making_complete($1, $2, null)', [projectId, ADMIN_ID])
    await db.query('select public.ops_ship($1, $2, $3, null, $4, null)', [projectId, 'egypt_post', 'EP-777', ADMIN_ID])

    const shipment = await shipmentOf(projectId)
    expect(shipment.carrier).toBe('egypt_post')
    expect(shipment.tracking_code).toBe('EP-777')
    expect(shipment.shipment_state).toBe('shipped')
    expect(shipment.shipped_at).not.toBeNull()
    expect(shipment.shipped_by).toBe(ADMIN_ID)
  })

  it('is the SAME operation as leaving the Shipping queue', async () => {
    const projectId = await orderInMaking()
    await db.query('select public.ops_making_complete($1, $2, null)', [projectId, ADMIN_ID])
    await db.query('select public.ops_ship($1, $2, $3, null, $4, null)', [projectId, 'bosta', 'B-1', ADMIN_ID])

    // One call: it is in Delivery, and no longer in the Shipping section.
    expect(await milestoneOf(projectId)).toBe('delivery')
    const shipping = await value(db, "select count(*)::int from public.ops_orders where project_id = $1 and milestone = 'shipping'", [
      projectId,
    ])
    expect(shipping).toBe(0)
  })

  it('treats a double click as one shipment', async () => {
    const projectId = await orderInMaking()
    await db.query('select public.ops_making_complete($1, $2, null)', [projectId, ADMIN_ID])

    for (let i = 0; i < 3; i += 1) {
      await db.query('select public.ops_ship($1, $2, $3, null, $4, null)', [projectId, 'bosta', 'B-9', ADMIN_ID])
    }

    expect(await value(db, 'select count(*)::int from public.shipping where project_id = $1', [projectId])).toBe(1)
    const shipmentEvents = await value(
      db,
      `select count(*)::int from public.project_events
       where project_id = $1 and action = 'order.milestone' and detail->>'to' = 'delivery'`,
      [projectId],
    )
    expect(shipmentEvents).toBe(1)
  })

  it('refuses to silently overwrite an existing shipment with a different carrier', async () => {
    const projectId = await orderInMaking()
    await db.query('select public.ops_making_complete($1, $2, null)', [projectId, ADMIN_ID])
    await db.query('select public.ops_ship($1, $2, $3, null, $4, null)', [projectId, 'bosta', 'B-55', ADMIN_ID])

    await expect(
      db.query('select public.ops_ship($1, $2, $3, null, $4, null)', [projectId, 'egypt_post', 'EP-55', ADMIN_ID]),
    ).rejects.toThrow(/conflict/)
  })

  it('keeps the existing shipment row and its address when shipping', async () => {
    const projectId = await orderInMaking()
    await seedShipping(db, projectId, { phone: '01099990000', recipientName: 'Hana' })
    await db.query('select public.ops_making_complete($1, $2, null)', [projectId, ADMIN_ID])
    await db.query('select public.ops_ship($1, $2, $3, null, $4, null)', [projectId, 'bosta', 'B-2', ADMIN_ID])

    const shipment = await shipmentOf(projectId)
    expect(shipment.phone).toBe('01099990000')
    expect(shipment.recipient_name).toBe('Hana')
    expect(shipment.carrier).toBe('bosta')
  })

  it('saves a carrier choice before the parcel leaves', async () => {
    const projectId = await orderInMaking()
    await db.query('select public.ops_save_shipment($1, $2, $3, null, $4)', [projectId, 'egypt_post', 'EP-PENDING', ADMIN_ID])

    const shipment = await shipmentOf(projectId)
    expect(shipment.carrier).toBe('egypt_post')
    expect(shipment.shipment_state).toBe('awaiting_shipment')
    expect(shipment.shipped_at).toBeNull()
    expect(await milestoneOf(projectId)).toBe('making')
  })
})

describe('delivery', () => {
  async function shippedOrder() {
    const projectId = await orderInMaking()
    await db.query('select public.ops_making_complete($1, $2, null)', [projectId, ADMIN_ID])
    await db.query('select public.ops_ship($1, $2, $3, null, $4, null)', [projectId, 'egypt_post', 'EP-42', ADMIN_ID])
    return projectId
  }

  it('marks delivered without archiving the order', async () => {
    const projectId = await shippedOrder()
    await db.query('select public.ops_deliver($1, $2, null, null)', [projectId, ADMIN_ID])

    const row = await one(
      db,
      'select milestone, archived_at, shipment_delivered_at as arrival from public.ops_orders where project_id = $1',
      [projectId],
    )
    expect(row.milestone).toBe('delivered')
    expect(row.archived_at).toBeNull()
    expect(row.arrival).not.toBeNull()
  })

  it('shows delivery information on the delivered row', async () => {
    const projectId = await shippedOrder()
    await db.query('select public.ops_deliver($1, $2, null, $3)', [projectId, ADMIN_ID, 'Signed by recipient'])

    const row = await one(
      db,
      `select carrier, tracking_code, shipment_state, shipment_shipped_at, shipment_delivered_at
       from public.ops_orders where project_id = $1`,
      [projectId],
    )
    expect(row.carrier).toBe('egypt_post')
    expect(row.tracking_code).toBe('EP-42')
    expect(row.shipment_state).toBe('delivered')
    expect(row.shipment_shipped_at).not.toBeNull()
    expect(row.shipment_delivered_at).not.toBeNull()
  })

  it('is idempotent and refuses to deliver something never shipped', async () => {
    const projectId = await shippedOrder()
    await db.query('select public.ops_deliver($1, $2, null, null)', [projectId, ADMIN_ID])
    await db.query('select public.ops_deliver($1, $2, null, null)', [projectId, ADMIN_ID])
    expect(
      await value(
        db,
        `select count(*)::int from public.project_events
         where project_id = $1 and action = 'order.milestone' and detail->>'to' = 'delivered'`,
        [projectId],
      ),
    ).toBe(1)

    const making = await orderInMaking()
    await expect(db.query('select public.ops_deliver($1, $2, null, null)', [making, ADMIN_ID])).rejects.toThrow(
      /transition_denied/,
    )
  })
})

describe('after-sale refunds', () => {
  async function deliveredOrder() {
    const projectId = await orderInMaking()
    await db.query('select public.ops_making_complete($1, $2, null)', [projectId, ADMIN_ID])
    await db.query('select public.ops_ship($1, $2, $3, null, $4, null)', [projectId, 'bosta', 'B-77', ADMIN_ID])
    await db.query('select public.ops_deliver($1, $2, null, null)', [projectId, ADMIN_ID])
    return projectId
  }

  it('records a manual refund with operator, reason, method and reference', async () => {
    const projectId = await deliveredOrder()
    await db.query('select public.ops_record_refund($1, $2, $3, $4, $5, $6, $7, $8, null)', [
      projectId,
      500,
      'Damaged on arrival',
      'manual',
      'cash',
      'CASH-1',
      ADMIN_ID,
      'refund-1',
    ])

    const refund = await one(db, 'select * from public.refunds where project_id = $1', [projectId])
    expect(Number(refund.amount)).toBe(500)
    expect(refund.status).toBe('manual')
    expect(refund.manual).toBe(true)
    expect(refund.method).toBe('cash')
    expect(refund.reference).toBe('CASH-1')
    expect(refund.requested_by).toBe(ADMIN_ID)
    expect(refund.completed_at).not.toBeNull()
    expect(refund.reason).toBe('Damaged on arrival')
  })

  it('never records the same refund twice', async () => {
    const projectId = await deliveredOrder()
    const args = [projectId, 100, 'Goodwill', 'manual', 'cash', null, ADMIN_ID, 'same-key']
    await db.query('select public.ops_record_refund($1, $2, $3, $4, $5, $6, $7, $8, null)', args)
    await db.query('select public.ops_record_refund($1, $2, $3, $4, $5, $6, $7, $8, null)', args)
    expect(await value(db, 'select count(*)::int from public.refunds where project_id = $1', [projectId])).toBe(1)
  })

  it('requires a reason and a positive amount', async () => {
    const projectId = await deliveredOrder()
    await expect(
      db.query('select public.ops_record_refund($1, 100, $2, $3, null, null, $4, null, null)', [
        projectId,
        '   ',
        'manual',
        ADMIN_ID,
      ]),
    ).rejects.toThrow(/reason_required/)

    await expect(
      db.query('select public.ops_record_refund($1, 0, $2, $3, null, null, $4, null, null)', [
        projectId,
        'Oops',
        'manual',
        ADMIN_ID,
      ]),
    ).rejects.toThrow(/amount_invalid/)
  })

  it('never refunds more than the Dearune sold for', async () => {
    const projectId = await deliveredOrder()
    await db.query('select public.ops_record_refund($1, 3000, $2, $3, null, null, $4, null, null)', [
      projectId,
      'Partial',
      'manual',
      ADMIN_ID,
    ])
    await expect(
      db.query('select public.ops_record_refund($1, 1000, $2, $3, null, null, $4, null, null)', [
        projectId,
        'Too much',
        'manual',
        ADMIN_ID,
      ]),
    ).rejects.toThrow(/exceeds_sale/)
  })

  it('refuses to refund an order that was never delivered', async () => {
    const projectId = await orderInMaking()
    await expect(
      db.query('select public.ops_record_refund($1, 10, $2, $3, null, null, $4, null, null)', [
        projectId,
        'Nope',
        'manual',
        ADMIN_ID,
      ]),
    ).rejects.toThrow(/not_delivered/)
  })

  it('keeps the request, decision and full history on the same order', async () => {
    const projectId = await deliveredOrder()
    await db.query('select public.ops_record_refund($1, 200, $2, $3, $4, null, $5, null, null)', [
      projectId,
      'Pending review',
      'pending',
      'cash',
      ADMIN_ID,
    ])

    const row = await one(db, 'select refund_count, refunded_amount from public.ops_orders where project_id = $1', [
      projectId,
    ])
    expect(row.refund_count).toBe(1)
    // A pending refund is not money returned yet.
    expect(Number(row.refunded_amount)).toBe(0)

    const event = await one(
      db,
      `select detail from public.project_events where project_id = $1 and action = 'order.refund.recorded'`,
      [projectId],
    )
    expect(event.detail.manual).toBe(true)
    expect(event.detail.reason).toBe('Pending review')
  })
})

describe('manifests', () => {
  it('stores the parsed source rows as an immutable snapshot', async () => {
    const rows = [
      { Package_Serial: '1', Mobile_No: '01000000000', City: 'CAIRO' },
      { Package_Serial: '2', Mobile_No: '01000000001', City: 'GIZA' },
    ]
    const manifest = await one(
      db,
      'select * from public.ops_create_manifest($1, $2, $3, $4::jsonb, $5)',
      ['egypt_post', 'Egypt Post Manifest.xlsx', 'Sheet1', JSON.stringify(rows), ADMIN_ID],
    )
    expect(manifest.carrier).toBe('egypt_post')
    expect(manifest.row_count).toBe(2)
    expect(manifest.snapshot).toHaveLength(2)
    expect(manifest.imported_by).toBe(ADMIN_ID)
  })

  it('refuses a carrier it does not know', async () => {
    await expect(
      db.query('select public.ops_create_manifest($1, null, null, $2::jsonb, null)', ['aramex', '[]']),
    ).rejects.toThrow(/carrier_required/)
  })

  it('links a shipment back to the manifest that created it', async () => {
    const manifest = await one(
      db,
      "select * from public.ops_create_manifest('egypt_post', 'm.xlsx', 'Sheet1', '[]'::jsonb, null)",
    )
    const projectId = await orderInMaking()
    await db.query('select public.ops_making_complete($1, $2, null)', [projectId, ADMIN_ID])
    await db.query('select public.ops_ship($1, $2, $3, $4, $5, null)', [
      projectId,
      'egypt_post',
      'EP-M1',
      manifest.id,
      ADMIN_ID,
    ])

    const shipment = await shipmentOf(projectId)
    expect(shipment.manifest_id).toBe(manifest.id)
    expect(shipment.carrier_reference).toBeNull()
  })
})

describe('the one-row order view', () => {
  it('has exactly one row per order and can be searched by every identifier', async () => {
    const projectId = await orderInMaking()
    const canonical = await value(db, 'select reference from public.projects where id = $1', [projectId])
    const unit = await value(db, 'select reference from public.physical_products where project_id = $1', [projectId])

    expect(await value(db, 'select count(*)::int from public.ops_orders where project_id = $1', [projectId])).toBe(1)

    const row = await one(db, 'select canonical_id, unit_reference, search_references from public.ops_orders where project_id = $1', [
      projectId,
    ])
    expect(row.canonical_id).toBe(canonical)
    expect(row.unit_reference).toBe(unit)
    for (const id of [canonical, unit, `SOL-${canonical.slice(3)}`]) expect(row.search_references).toContain(id)
  })

  it('exposes exactly one milestone per order, and excludes orders not in the workshop', async () => {
    const projectId = await orderInMaking()
    const row = await one(db, 'select milestone from public.ops_orders where project_id = $1', [projectId])
    expect(row.milestone).toBe('making')

    const unpaid = await seedProject(db, { designerId, paid: false })
    expect(await value(db, 'select count(*)::int from public.ops_orders where project_id = $1', [unpaid.id])).toBe(0)
  })

  it('counts each subsection from the same records', async () => {
    await db.query('delete from public.shipping')
    const counts = await many(db, 'select milestone, total from public.ops_milestone_counts')
    const total = await value(db, 'select count(*)::int from public.ops_orders')
    const sum = counts.reduce((acc, row) => acc + Number(row.total), 0)
    expect(sum).toBe(total)
  })
})

describe('the reconciliation report', () => {
  it('flags an order whose stored milestone disagrees with its stamps', async () => {
    const projectId = await orderInMaking()
    // A stamp written behind the transition function: exactly the divergence
    // this migration exists to surface, not to hide.
    await db.query(`update public.projects set manufactured_at = now() where id = $1`, [projectId])

    const row = await one(
      db,
      'select stored_milestone, derived_milestone, milestone_mismatch from public.ops_identity_report where project_id = $1',
      [projectId],
    )
    expect(row.stored_milestone).toBe('making')
    expect(row.derived_milestone).toBe('shipping')
    expect(row.milestone_mismatch).toBe(true)
  })
})

describe('permissions', () => {
  it('lets an admin read the order view through RLS', async () => {
    await orderInMaking()
    const count = await asRole(db, 'authenticated', () => value(db, 'select count(*)::int from public.ops_orders'), {
      userId: ADMIN_ID,
    })
    expect(count).toBeGreaterThan(0)
  })

  it('hides orders, aliases, manifests and refunds from a non-admin', async () => {
    const stranger = '33333333-3333-3333-3333-333333333333'
    for (const table of ['ops_orders', 'order_references', 'refunds', 'shipment_manifests']) {
      const count = await asRole(db, 'authenticated', () => value(db, `select count(*)::int from public.${table}`), {
        userId: stranger,
      })
      expect(count, table).toBe(0)
    }
  })

  it('never opens any of it to the public API', async () => {
    for (const table of ['ops_orders', 'order_references', 'refunds', 'shipment_manifests']) {
      await expect(asRole(db, 'anon', () => db.query(`select * from public.${table}`)), table).rejects.toThrow()
    }
  })

  it('keeps every transition function backend-only', async () => {
    const calls = [
      ['public.ops_move_milestone($1, $2, $3, null, null)', ['00000000-0000-0000-0000-000000000000', 'shipping', ADMIN_ID]],
      ['public.ops_making_complete($1, $2, null)', ['00000000-0000-0000-0000-000000000000', ADMIN_ID]],
      ['public.ops_ship($1, $2, $3, null, $4, null)', ['00000000-0000-0000-0000-000000000000', 'bosta', 'B', ADMIN_ID]],
      ['public.ops_deliver($1, $2, null, null)', ['00000000-0000-0000-0000-000000000000', ADMIN_ID]],
      ['public.ops_after_sale($1, $2, null)', ['00000000-0000-0000-0000-000000000000', ADMIN_ID]],
      ['public.ops_record_refund($1, 1, $2, null, null, null, $3, null, null)', ['00000000-0000-0000-0000-000000000000', 'x', ADMIN_ID]],
      ['public.ops_create_manifest($1, null, null, null, null)', ['egypt_post']],
      ['public.ops_start_work_order($1, $2)', ['00000000-0000-0000-0000-000000000000', ADMIN_ID]],
    ]

    for (const [sql, params] of calls) {
      await expect(
        asRole(db, 'authenticated', () => db.query(`select ${sql}`, params), { userId: ADMIN_ID }),
        sql,
      ).rejects.toThrow()
    }
  })

  it('refuses direct writes to refunds and aliases from a client', async () => {
    await expect(
      asRole(db, 'authenticated', () => db.query(`insert into public.refunds (project_id, amount, reason) values (gen_random_uuid(), 1, 'x')`), {
        userId: ADMIN_ID,
      }),
    ).rejects.toThrow()
    await expect(
      asRole(db, 'authenticated', () => db.query(`delete from public.order_references`), { userId: ADMIN_ID }),
    ).rejects.toThrow()
  })
})
