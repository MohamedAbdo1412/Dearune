import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ADMIN_ID,
  asRole,
  bootDatabase,
  many,
  one,
  readMigration,
  seedAdmin,
  seedDesigner,
  seedProject,
  seedShipping,
  seedWorker,
  value,
} from './helpers/database'
import { MILESTONE_ORDER, soldIdFor } from '../src/services/constants'
import { qrState } from '../src/services/qrState'

// The ONE order model, exercised against a real Postgres.
//
// These are the regression tests that stop the codebase drifting back into
// parallel systems: one lifecycle guard, one QR answer that the browser mirrors,
// one backwards-correction path, and one stage that the admin and the worker
// dashboards both read.

const WORKER_ID = '99999999-9999-9999-9999-999999999999'
const WORKER_PERMISSIONS = [
  'operations.view',
  'operations.mark_manufactured',
  'operations.mark_shipped',
  'operations.mark_delivered',
]

let db
let designerId

beforeAll(async () => {
  db = await bootDatabase()
  await seedAdmin(db)
  designerId = await seedDesigner(db)
  await seedWorker(db, { id: WORKER_ID, permissions: WORKER_PERMISSIONS })
}, 240_000)

afterAll(async () => {
  await db?.close()
})

const milestoneOf = (projectId) => value(db, 'select milestone::text from public.projects where id = $1', [projectId])
const asWorker = (fn) => asRole(db, 'authenticated', fn, { userId: WORKER_ID })

// A paid physical Dearune in Making with one unit and a complete address.
async function orderInMaking() {
  const project = await seedProject(db, { designerId })
  await db.query('select public.ops_start_work_order($1)', [project.id])
  await db.query('select * from public.ensure_physical_products($1, 1, null)', [project.id])
  await seedShipping(db, project.id, { recipientName: 'Mona', city: 'Cairo' })
  return project.id
}

// The optimistic one-step move a screen would attempt, straight at the column.
function move(projectId, to) {
  return db.query('update public.projects set milestone = $2 where id = $1', [projectId, to])
}

describe('one lifecycle guard', () => {
  it('holds the seven-stage order the whole app reads', () => {
    expect(MILESTONE_ORDER).toEqual([
      'configured',
      'sold',
      'making',
      'shipping',
      'delivery',
      'delivered',
      'after_sale',
    ])
  })

  it('walks the physical order forward, one stage at a time', async () => {
    const projectId = await orderInMaking()

    for (const stage of ['shipping', 'delivery', 'delivered', 'after_sale']) {
      await move(projectId, stage)
      expect(await milestoneOf(projectId)).toBe(stage)
    }
  })

  it('refuses to skip a stage, go backwards, or invent a stage', async () => {
    const projectId = await orderInMaking()

    await expect(move(projectId, 'delivered')).rejects.toThrow(/transition_denied/)

    await move(projectId, 'shipping')
    await expect(move(projectId, 'making')).rejects.toThrow(/transition_denied/)
    // A value outside the enum never reaches the column at all.
    await expect(move(projectId, 'shipped')).rejects.toThrow()
  })

  it('treats a repeated same-value write as a no-op', async () => {
    const projectId = await orderInMaking()
    const before = await one(
      db,
      'select milestone, milestone_updated_at from public.projects where id = $1',
      [projectId],
    )
    const events = await value(
      db,
      `select count(*)::int from public.project_events where project_id = $1 and action = 'order.milestone'`,
      [projectId],
    )

    await move(projectId, 'making')

    const after = await one(
      db,
      'select milestone, milestone_updated_at from public.projects where id = $1',
      [projectId],
    )
    expect(after).toEqual(before)
    expect(
      await value(
        db,
        `select count(*)::int from public.project_events where project_id = $1 and action = 'order.milestone'`,
        [projectId],
      ),
    ).toBe(events)
  })

  it('lets a digital Dearune jump sold → delivered, and never enter production', async () => {
    const project = await seedProject(db, { designerId, wrapperType: 'digital' })
    await db.query('select public.ops_start_work_order($1)', [project.id])
    expect(await milestoneOf(project.id)).toBe('sold')

    // No Making, Shipping or Delivery for a letter with no parcel.
    for (const stage of ['making', 'shipping', 'delivery']) {
      await expect(move(project.id, stage)).rejects.toThrow(/digital_production/)
    }

    await move(project.id, 'delivered')
    expect(await milestoneOf(project.id)).toBe('delivered')

    // It can still move on to After-Sale, and back forward-only.
    await move(project.id, 'after_sale')
    await expect(move(project.id, 'delivered')).rejects.toThrow(/transition_denied/)
  })
})

describe('one QR answer', () => {
  const cases = [
    { label: 'nothing recorded', args: {} },
    { label: 'no token', args: { publicId: 'a'.repeat(24) } },
    { label: 'no id', args: { publicToken: 'token-1' } },
    { label: 'destination only', args: { publicId: 'a'.repeat(24), publicToken: 'token-1' } },
    {
      label: 'switched off',
      args: { publicId: 'a'.repeat(24), publicToken: 'token-1', messageActive: false },
    },
    {
      label: 'open',
      args: { publicId: 'a'.repeat(24), publicToken: 'token-1', messageActive: true },
    },
    {
      label: 'password protected',
      args: { publicId: 'a'.repeat(24), publicToken: 'token-1', messageActive: true, passwordSet: true },
    },
  ]

  it('answers destination / activated / openable / blocked_reason in SQL', async () => {
    const answer = (args) =>
      one(db, 'select * from public.order_qr_state($1, $2, $3, $4)', [
        args.publicId ?? null,
        args.publicToken ?? null,
        args.messageActive ?? null,
        args.passwordSet ?? null,
      ])

    expect(await answer(cases[0].args)).toEqual({
      destination: false,
      activated: false,
      openable: false,
      blocked_reason: 'missing_destination',
    })
    expect(await answer(cases[3].args)).toEqual({
      destination: true,
      activated: false,
      openable: false,
      blocked_reason: 'not_activated',
    })
    expect(await answer(cases[5].args)).toEqual({
      destination: true,
      activated: true,
      openable: true,
      blocked_reason: null,
    })
    expect(await answer(cases[6].args)).toEqual({
      destination: true,
      activated: true,
      openable: false,
      blocked_reason: 'password_protected',
    })
  })

  it('gives the browser mirror the identical answer for every case', async () => {
    for (const { label, args } of cases) {
      const fromDb = await one(db, 'select * from public.order_qr_state($1, $2, $3, $4)', [
        args.publicId ?? null,
        args.publicToken ?? null,
        args.messageActive ?? null,
        args.passwordSet ?? null,
      ])
      expect(fromDb.blocked_reason, label).toBe(qrState(args).blockedReason)
      expect({ ...fromDb, blocked_reason: undefined }, label).toMatchObject({
        destination: qrState(args).destination,
        activated: qrState(args).activated,
        openable: qrState(args).openable,
      })
    }
  })

  it('is the same answer on the order view, the unit view and the worker reads', async () => {
    const project = await seedProject(db, { designerId, publicId: 'b'.repeat(24), publicToken: 'tok' })
    const projectId = project.id
    await db.query('select public.ops_start_work_order($1)', [projectId])
    await db.query('select * from public.ensure_physical_products($1, 1, null)', [projectId])
    // The letter is switched on, but password-protected: the QR cannot open it.
    await db.query(`update public.projects set payload = payload || '{"passwordSet": true}'::jsonb where id = $1`, [
      projectId,
    ])

    const order = await one(db, 'select qr_destination, qr_activated, qr_openable, qr_blocked_reason from public.ops_orders where project_id = $1', [
      projectId,
    ])
    const unit = await one(
      db,
      'select qr_destination, qr_activated, qr_openable, qr_blocked_reason from public.operations_units where project_id = $1',
      [projectId],
    )
    const worker = await asWorker(() => one(db, 'select public.worker_operations_units(false) as rows'))
    const workerRow = worker.rows.find((row) => row.project_id === projectId)

    for (const row of [order, unit]) {
      expect(row).toEqual({
        qr_destination: true,
        qr_activated: true,
        qr_openable: false,
        qr_blocked_reason: 'password_protected',
      })
    }
    expect(workerRow.qr_openable).toBe(false)
    expect(workerRow.qr_blocked_reason).toBe('password_protected')
  })
})

describe('one backwards-correction path', () => {
  it('reverts a stage and clears the stamps the stage implied', async () => {
    const projectId = await orderInMaking()
    await db.query('select public.ops_making_complete($1, $2, null)', [projectId, ADMIN_ID])
    expect(await milestoneOf(projectId)).toBe('shipping')
    expect(await value(db, 'select manufactured_at from public.projects where id = $1', [projectId])).not.toBeNull()

    await db.query('select public.ops_revert_milestone($1, $2, $3, $4, $5)', [
      projectId,
      'making',
      ADMIN_ID,
      'Recorded too early',
      'admin',
    ])

    expect(await milestoneOf(projectId)).toBe('making')
    expect(await value(db, 'select manufactured_at from public.projects where id = $1', [projectId])).toBeNull()
    expect(
      await value(db, 'select manufacturing_completed_at from public.physical_products where project_id = $1', [
        projectId,
      ]),
    ).toBeNull()

    const event = await one(
      db,
      `select actor_type, detail from public.project_events
       where project_id = $1 and action = 'order.milestone.reverted'`,
      [projectId],
    )
    expect(event.actor_type).toBe('admin')
    expect(event.detail.from).toBe('shipping')
    expect(event.detail.to).toBe('making')
    expect(event.detail.reason).toBe('Recorded too early')
  })

  it('is a no-op for the current stage and refuses to move forwards', async () => {
    const projectId = await orderInMaking()
    const before = await value(
      db,
      `select count(*)::int from public.project_events where project_id = $1 and action = 'order.milestone.reverted'`,
      [projectId],
    )

    await db.query('select public.ops_revert_milestone($1, $2, $3, null, $4)', [projectId, 'making', ADMIN_ID, 'admin'])
    expect(
      await value(
        db,
        `select count(*)::int from public.project_events where project_id = $1 and action = 'order.milestone.reverted'`,
        [projectId],
      ),
    ).toBe(before)

    await expect(
      db.query('select public.ops_revert_milestone($1, $2, $3, null, $4)', [projectId, 'shipping', ADMIN_ID, 'admin']),
    ).rejects.toThrow(/revert_denied/)
  })

  it('will not un-sell an order that still has a recorded sale', async () => {
    const projectId = await orderInMaking()
    await expect(
      db.query('select public.ops_revert_milestone($1, $2, $3, null, $4)', [
        projectId,
        'configured',
        ADMIN_ID,
        'admin',
      ]),
    ).rejects.toThrow(/reverse the sale/i)
  })
})

describe('one stage for admin and worker', () => {
  it('records the same milestone no matter which dashboard acted', async () => {
    const projectId = await orderInMaking()

    await asWorker(() => db.query('select public.worker_mark_dearune_manufactured($1)', [projectId]))
    await asWorker(() =>
      db.query('select public.worker_mark_dearune_shipped($1, $2, $3)', [projectId, 'W-777', 'bosta']),
    )

    // The worker's act and the admin's read are the same column.
    expect(await milestoneOf(projectId)).toBe('delivery')
    expect(await value(db, 'select milestone from public.ops_orders where project_id = $1', [projectId])).toBe('delivery')
    const unitRows = await asWorker(() => one(db, 'select public.worker_operations_units(false) as rows'))
    expect(unitRows.rows.find((row) => row.project_id === projectId).milestone).toBe('delivery')

    // A worker is the actor; the admin-only "last moved by" column stays empty.
    const events = await many(
      db,
      `select actor_type, actor_id, detail from public.project_events
       where project_id = $1 and action = 'order.milestone' order by created_at`,
      [projectId],
    )
    const shipped = events.find((event) => event.detail.to === 'delivery')
    expect(shipped.actor_type).toBe('worker')
    expect(shipped.actor_id).toBe(WORKER_ID)
    expect(await value(db, 'select milestone_updated_by from public.projects where id = $1', [projectId])).toBeNull()
  })

  it('shows one Sold ID derived from the canonical id on every surface', async () => {
    const projectId = await orderInMaking()
    const canonical = await value(db, 'select reference from public.projects where id = $1', [projectId])
    const expected = soldIdFor(canonical)

    expect(expected).toMatch(/^SOL-\d{6}$/)
    expect(await value(db, `select value from public.order_references where project_id = $1 and kind = 'sold'`, [
      projectId,
    ])).toBe(expected)
    expect(await value(db, 'select sold_id from public.ops_orders where project_id = $1', [projectId])).toBe(expected)
    expect(await value(db, 'select sold_id from public.operations_units where project_id = $1', [projectId])).toBe(
      expected,
    )

    const worker = await asWorker(() => one(db, 'select public.worker_operations_units(false) as rows'))
    expect(worker.rows.find((row) => row.project_id === projectId).sold_id).toBe(expected)
  })
})

describe('the migration itself', () => {
  it('is idempotent: applying it again changes no identifier and no stage', async () => {
    const sql = readMigration('20261104000003_unified_order_model.sql')

    // Every existing order must already have a stage before we can assert that
    // re-applying the migration is a no-op.
    expect(await value(db, 'select count(*)::int from public.projects where milestone is null')).toBe(0)

    await db.exec(sql)

    const snapshot = async () => ({
      projects: await many(db, 'select id, reference, milestone::text from public.projects order by reference'),
      references: await many(
        db,
        'select project_id, kind, value from public.order_references order by value',
      ),
    })

    const before = await snapshot()
    await db.exec(sql)
    expect(await snapshot()).toEqual(before)
  }, 240_000)
})
