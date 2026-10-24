import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ADMIN_ID,
  OTHER_ID,
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

const ID_PATTERN = /^DR[0-9]{11}$/

let db
let designerId

beforeAll(async () => {
  db = await bootDatabase({ beforeOperations: seedLegacyDearunes })
  designerId = await seedDesigner(db)
  await seedAdmin(db)
  await seedAdmin(db, OTHER_ID, 'Second Admin')
}, 180_000)

afterAll(async () => {
  await db?.close()
})

// Projects that already existed when Operations shipped. The backfill must
// find every paid physical Dearune and give it exactly one unit in the status
// its legacy stamps imply.
const legacy = {}
async function seedLegacyDearunes(database) {
  const designer = await one(
    database,
    "insert into public.designers (name, code, passcode_hash) values ('Legacy Designer', 'DR-900001', 'x') returning id",
  )
  const make = (title, stamps = {}) =>
    one(
      database,
      `insert into public.projects (designer_id, template_slug, title, wrapper_type, paid_at, sale_price, payload, message_active${stamps.extraColumns ?? ''})
       values ($1, 'memorial-letter', $2, $3, now(), 3500, '{"greeting":"Hi","body":"Body","senderName":"Me"}'::jsonb, true${stamps.extraValues ?? ''})
       returning id`,
      [designer.id, title, stamps.wrapperType ?? 'sealed_letter'],
    )

  legacy.pending = (await make('Backfill pending')).id
  legacy.made = (await make('Backfill made', { extraColumns: ', manufactured_at', extraValues: ', now()' })).id
  legacy.shipped = (
    await make('Backfill shipped', {
      extraColumns: ', manufactured_at, shipped_at',
      extraValues: ', now(), now()',
    })
  ).id
  legacy.delivered = (
    await make('Backfill delivered', {
      extraColumns: ', manufactured_at, shipped_at, arrived_at',
      extraValues: ', now(), now(), now()',
    })
  ).id
  legacy.digital = (await make('Backfill digital', { wrapperType: 'digital' })).id
  legacy.unpaid = (
    await one(
      database,
      `insert into public.projects (designer_id, template_slug, title, wrapper_type, payload, message_active)
       values ($1, 'memorial-letter', 'Never sold', 'sealed_letter', '{}'::jsonb, true) returning id`,
      [designer.id],
    )
  ).id
}

const unitOf = (projectId) =>
  one(db, 'select * from public.physical_products where project_id = $1 order by unit_index', [projectId])

describe('Operations schema', () => {
  it('turns row level security ON for both new tables', async () => {
    const rows = await many(
      db,
      `select relname, relrowsecurity from pg_class
       where relname in ('physical_products', 'physical_product_events') order by relname`,
    )
    expect(rows).toHaveLength(2)
    for (const row of rows) expect(row.relrowsecurity, row.relname).toBe(true)
  })

  it('keeps its own timeline private, and the letter payload out of the list view', async () => {
    const columns = await many(
      db,
      `select column_name from information_schema.columns where table_name = 'operations_units' order by column_name`,
    )
    const names = columns.map((c) => c.column_name)
    expect(names).toContain('reference')
    expect(names).toContain('designer_name')
    expect(names).toContain('customer_phone')
    expect(names).toContain('qr_ready')
    // The private letter must never ride along to the browser.
    expect(names).not.toContain('payload')
    expect(names).not.toContain('body')
  })

  it('allocates ids from a sequence that starts at 70700000001', async () => {
    const start = await value(
      db,
      `select seqstart from pg_sequence where seqrelid = 'public.physical_product_ref_seq'::regclass`,
    )
    expect(Number(start)).toBe(70700000001)
  })

  it('refuses an id that is not DR + exactly 11 digits', async () => {
    const project = await seedProject(db, { designerId })
    for (const bad of ['DR123', 'DR7070000000', 'DR707000000012', 'XX70700000001', 'DR7070000000A', 'dr70700000001']) {
      await expect(
        db.query('insert into public.physical_products (project_id, unit_index, reference) values ($1, $2, $3)', [
          project.id,
          9001 + bad.length,
          bad,
        ]),
        bad,
      ).rejects.toThrow()
    }
  })

  it('enforces one reference per unit', async () => {
    const a = await seedProject(db, { designerId })
    const b = await seedProject(db, { designerId })
    await db.query('insert into public.physical_products (project_id, unit_index, reference) values ($1, 1, $2)', [
      a.id,
      'DR70700999001',
    ])
    await expect(
      db.query('insert into public.physical_products (project_id, unit_index, reference) values ($1, 1, $2)', [
        b.id,
        'DR70700999001',
      ]),
    ).rejects.toThrow()
  })
})

describe('creating units', () => {
  it('gives a paid physical Dearune exactly one unit, once', async () => {
    const project = await seedProject(db, { designerId })

    await db.query('select * from public.ensure_physical_products($1, 1, null)', [project.id])
    const first = await many(db, 'select * from public.physical_products where project_id = $1', [project.id])
    expect(first).toHaveLength(1)
    expect(first[0].reference).toMatch(ID_PATTERN)
    expect(first[0].unit_index).toBe(1)
    // Milestones start empty; the unit is "pending" until stamped forward.
    expect(first[0].sold_at).toBeNull()
    expect(first[0].manufacturing_completed_at).toBeNull()
    expect(first[0].shipped_at).toBeNull()
    expect(first[0].delivered_at).toBeNull()

    // Idempotent: a second call must not mint a second unit or a new id.
    await db.query('select * from public.ensure_physical_products($1, 1, null)', [project.id])
    const second = await many(db, 'select * from public.physical_products where project_id = $1', [project.id])
    expect(second).toHaveLength(1)
    expect(second[0].reference).toBe(first[0].reference)
    expect(second[0].id).toBe(first[0].id)
  })

  it('makes N units for a quantity, and never takes one away', async () => {
    const project = await seedProject(db, { designerId })
    await db.query('select * from public.ensure_physical_products($1, 3, null)', [project.id])
    const three = await many(
      db,
      'select reference, unit_index from public.physical_products where project_id = $1 order by unit_index',
      [project.id],
    )
    expect(three.map((u) => u.unit_index)).toEqual([1, 2, 3])
    expect(new Set(three.map((u) => u.reference)).size).toBe(3)
    for (const unit of three) expect(unit.reference).toMatch(ID_PATTERN)

    // Asking for fewer must never archive or delete the extras.
    await db.query('select * from public.ensure_physical_products($1, 1, null)', [project.id])
    const still = await many(db, 'select id from public.physical_products where project_id = $1', [project.id])
    expect(still).toHaveLength(3)
  })

  it('gives a digital Dearune nothing physical', async () => {
    const project = await seedProject(db, { designerId, wrapperType: 'digital' })
    await db.query('select * from public.ensure_physical_products($1, 2, null)', [project.id])
    expect(await many(db, 'select id from public.physical_products where project_id = $1', [project.id])).toHaveLength(0)
  })

  it('will not create units for a Dearune that does not exist', async () => {
    const ghost = '99999999-9999-9999-9999-999999999999'
    await db.query('select * from public.ensure_physical_products($1, 1, null)', [ghost])
    // No error, and — crucially — no orphan unit pointing at a missing Dearune.
    expect(await value(db, 'select count(*)::int from public.physical_products where project_id = $1', [ghost])).toBe(0)
  })

  it('never reuses an id, even one a failed write already spent', async () => {
    const project = await seedProject(db, { designerId })

    // A rolled-back transaction still consumes a sequence value. That value
    // must be gone forever — the next unit gets a fresh one.
    await db.exec('begin')
    const spent = await value(db, 'insert into public.physical_products (project_id) values ($1) returning reference', [
      project.id,
    ])
    await db.exec('rollback')

    await db.query('select * from public.ensure_physical_products($1, 1, null)', [project.id])
    const unit = await unitOf(project.id)
    expect(unit.reference).toMatch(ID_PATTERN)
    expect(unit.reference).not.toBe(spent)
    expect(unit.reference > spent).toBe(true)
  })

  it('hands out strictly increasing, never-before-seen ids', async () => {
    const before = await many(db, 'select reference from public.physical_products')
    const seen = new Set(before.map((row) => row.reference))
    expect(seen.size).toBe(before.length)

    const project = await seedProject(db, { designerId })
    await db.query('select * from public.ensure_physical_products($1, 5, null)', [project.id])
    const created = await many(
      db,
      'select reference from public.physical_products where project_id = $1 order by unit_index',
      [project.id],
    )
    for (const row of created) {
      expect(row.reference).toMatch(ID_PATTERN)
      expect(seen.has(row.reference)).toBe(false)
      seen.add(row.reference)
    }
    const sorted = [...created].map((r) => r.reference)
    expect([...sorted].sort()).toEqual(sorted)
  })
})

describe('the backfill', () => {
  it('gives every already-sold physical Dearune one unit with milestones stamped from its project', async () => {
    const pending = await unitOf(legacy.pending)
    expect(pending.sold_at).not.toBeNull()
    expect(pending.manufacturing_completed_at).toBeNull()
    expect(pending.shipped_at).toBeNull()
    expect(pending.delivered_at).toBeNull()

    const made = await unitOf(legacy.made)
    expect(made.sold_at).not.toBeNull()
    expect(made.manufacturing_completed_at).not.toBeNull()
    expect(made.shipped_at).toBeNull()
    expect(made.delivered_at).toBeNull()

    const shipped = await unitOf(legacy.shipped)
    expect(shipped.shipped_at).not.toBeNull()
    expect(shipped.delivered_at).toBeNull()

    const delivered = await unitOf(legacy.delivered)
    expect(delivered.delivered_at).not.toBeNull()
  })

  it('skips digital Dearunes and anything never sold', async () => {
    expect(await value(db, 'select count(*)::int from public.physical_products where project_id = $1', [legacy.digital])).toBe(0)
    expect(await value(db, 'select count(*)::int from public.physical_products where project_id = $1', [legacy.unpaid])).toBe(0)
  })

  it('records an event for each backfilled unit, once', async () => {
    const events = await many(
      db,
      `select e.action, count(*)::int as n from public.physical_product_events e
       join public.physical_products p on p.id = e.physical_product_id
       where p.project_id = $1 and e.action = 'operations.backfilled' group by e.action`,
      [legacy.shipped],
    )
    expect(events).toHaveLength(1)
    expect(events[0].action).toBe('operations.backfilled')
    expect(events[0].n).toBe(1)
  })

  it('does not re-issue an id to a Dearune it already owns', async () => {
    const held = (await unitOf(legacy.delivered)).reference
    await db.query('select * from public.ensure_physical_products($1, 1, null)', [legacy.delivered])
    expect((await unitOf(legacy.delivered)).reference).toBe(held)
  })
})

describe('milestones', () => {
  const now = () => new Date('2026-01-05T00:00:00Z')

  it('lets a unit be stamped through its milestones and keeps the same id', async () => {
    const project = await seedProject(db, { designerId })
    await db.query('select * from public.ensure_physical_products($1, 1, null)', [project.id])
    const unit = await unitOf(project.id)

    const setMilestone = (field, value) =>
      db.query(`update public.physical_products set ${field} = $2 where id = $1`, [unit.id, value])

    await setMilestone('sold_at', now())
    await setMilestone('manufacturing_completed_at', now())
    await setMilestone('shipped_at', now())
    await setMilestone('delivered_at', now())

    const row = await one(db, 'select sold_at, manufacturing_completed_at, shipped_at, delivered_at from public.physical_products where id = $1', [unit.id])
    expect(row.sold_at).not.toBeNull()
    expect(row.manufacturing_completed_at).not.toBeNull()
    expect(row.shipped_at).not.toBeNull()
    expect(row.delivered_at).not.toBeNull()

    // The same id is kept through every milestone — units are never renumbered.
    expect((await unitOf(project.id)).reference).toBe(unit.reference)
  })

  it('stamps updated_at on every change', async () => {
    const project = await seedProject(db, { designerId })
    await db.query('select * from public.ensure_physical_products($1, 1, null)', [project.id])
    const before = await unitOf(project.id)
    await new Promise((resolve) => setTimeout(resolve, 10))
    await db.query('update public.physical_products set sold_at = $1 where id = $2', [now(), before.id])
    const after = await one(db, 'select updated_at from public.physical_products where id = $1', [before.id])
    expect(new Date(after.updated_at).getTime()).toBeGreaterThan(new Date(before.updated_at).getTime())
  })
})

describe('the list view', () => {
  it('joins the unit, its Dearune, its designer and its delivery contact', async () => {
    const project = await seedProject(db, { designerId, title: 'For Hana' })
    await seedShipping(db, project.id, { phone: '01099998888', recipientName: 'Hana' })
    await db.query('select * from public.ensure_physical_products($1, 1, null)', [project.id])

    const row = await one(db, 'select * from public.operations_units where project_id = $1', [project.id])
    expect(row.reference).toMatch(ID_PATTERN)
    expect(row.project_title).toBe('For Hana')
    expect(row.designer_name).toBe('Nour Adel')
    expect(row.designer_code).toBe('DR-100001')
    expect(row.customer_phone).toBe('01099998888')
    expect(row.recipient_name).toBe('Hana')
    expect(row.unit_index).toBe(1)
  })

  it('tells the studio whether a paper QR will actually open the letter', async () => {
    const open = await seedProject(db, { designerId, messageActive: true, publicToken: 'token-open' })
    const closed = await seedProject(db, { designerId, messageActive: false, publicToken: 'token-closed' })
    const locked = await seedProject(db, {
      designerId,
      messageActive: true,
      publicToken: 'token-locked',
      payload: { body: 'Secret', passwordSet: true },
    })
    for (const id of [open.id, closed.id, locked.id]) {
      await db.query('select * from public.ensure_physical_products($1, 1, null)', [id])
    }

    expect((await one(db, 'select qr_ready, qr_target from public.operations_units where project_id = $1', [open.id])).qr_ready).toBe(true)
    expect((await one(db, 'select qr_ready from public.operations_units where project_id = $1', [closed.id])).qr_ready).toBe(false)
    expect((await one(db, 'select qr_ready from public.operations_units where project_id = $1', [locked.id])).qr_ready).toBe(false)
  })
})

describe('row level security', () => {
  it('never lets the public API near the units', async () => {
    await expect(asRole(db, 'anon', () => db.query('select count(*) from public.operations_units'))).rejects.toThrow()
  })

  it('shows an admin the units and hides them from everyone else', async () => {
    const asAdmin = await asRole(db, 'authenticated', () => value(db, 'select count(*)::int from public.operations_units'), {
      userId: ADMIN_ID,
    })
    expect(asAdmin).toBeGreaterThan(0)

    const asStranger = await asRole(
      db,
      'authenticated',
      () => value(db, 'select count(*)::int from public.operations_units'),
      { userId: '33333333-3333-3333-3333-333333333333' },
    )
    expect(asStranger).toBe(0)
  })

  it('refuses client writes altogether', async () => {
    const project = await seedProject(db, { designerId })
    await expect(
      asRole(
        db,
        'authenticated',
        () =>
          db.query('insert into public.physical_products (project_id) values ($1)', [project.id]),
        { userId: ADMIN_ID },
      ),
    ).rejects.toThrow()

    await expect(
      asRole(db, 'authenticated', () => db.query('update public.physical_products set notes = $1', ['hacked']), {
        userId: ADMIN_ID,
      }),
    ).rejects.toThrow()

    await expect(
      asRole(db, 'authenticated', () => db.query('delete from public.physical_products'), { userId: ADMIN_ID }),
    ).rejects.toThrow()
  })

  it('keeps unit creation a backend-only function', async () => {
    const project = await seedProject(db, { designerId })
    await expect(
      asRole(
        db,
        'authenticated',
        () => db.query('select * from public.ensure_physical_products($1, 1, null)', [project.id]),
        { userId: ADMIN_ID },
      ),
    ).rejects.toThrow()
  })
})

describe('the public reader', () => {
  const read = async (publicId, token) =>
    one(db, 'select public.get_public_project_message($1, $2) as payload', [publicId, token]).then((r) => r.payload)

  it('says not-found for a Dearune that does not exist', async () => {
    const result = await read('ffffffffffffffffffffffff', 'anything')
    expect(result.found).toBe(false)
    expect(result.body).toBeUndefined()
  })

  it('opens the letter for the token the paper carries', async () => {
    const project = await seedProject(db, {
      designerId,
      messageActive: true,
      publicToken: 'paper-token',
      title: 'For Layla',
      payload: {
        greeting: 'To Layla',
        body: 'Some words are meant to last.',
        senderName: 'From Mother',
        photos: [{ path: `${designerId}/memorial-message/a.jpg`, mimeType: 'image/jpeg', originalName: 'a.jpg' }],
      },
    })
    const result = await read(project.public_id, 'paper-token')
    expect(result.found).toBe(true)
    expect(result.available).toBe(true)
    expect(result.headline).toBe('To Layla')
    expect(result.body).toBe('Some words are meant to last.')
    expect(result.signature).toBe('From Mother')
    expect(result.order.recipient_name).toBe('For Layla')
    expect(result.media).toHaveLength(1)
    expect(result.media[0].path).toBe(`${designerId}/memorial-message/a.jpg`)
    expect(result.media[0].media_type).toBe('image')
  })

  it('will not open it for a wrong or missing token', async () => {
    const project = await seedProject(db, { designerId, messageActive: true, publicToken: 'real-token' })
    for (const token of ['wrong-token', '']) {
      const result = await read(project.public_id, token)
      expect(result.found).toBe(true)
      expect(result.available).toBe(false)
      // Nothing from the letter rides along on a refusal.
      expect(result.body).toBeUndefined()
      expect(result.signature).toBeUndefined()
      expect(result.media).toBeUndefined()
    }
  })

  it('leaves a switched-off letter closed to its own token', async () => {
    const project = await seedProject(db, { designerId, messageActive: false, publicToken: 'off-token' })
    const result = await read(project.public_id, 'off-token')
    expect(result.available).toBe(false)
    expect(result.body).toBeUndefined()
  })

  it('never publishes a password-protected letter', async () => {
    const project = await seedProject(db, {
      designerId,
      messageActive: true,
      publicToken: 'locked-token',
      payload: { greeting: 'Hi', body: 'Protected words', senderName: 'Me', passwordSet: true },
    })
    const result = await read(project.public_id, 'locked-token')
    expect(result.found).toBe(true)
    expect(result.available).toBe(false)
    expect(result.body).toBeUndefined()
  })

  it('gives every Dearune its own unguessable token', async () => {
    // The schema's default is 16 random bytes as hex.
    const fresh = await seedProject(db, { designerId })
    expect(fresh.public_token).toMatch(/^[0-9a-f]{32}$/)

    const rows = await many(db, 'select public_token from public.projects')
    expect(rows.length).toBeGreaterThan(1)
    for (const row of rows) expect(row.public_token).toBeTruthy()
    // No two Dearunes can share a token, or one QR would open another letter.
    expect(new Set(rows.map((r) => r.public_token)).size).toBe(rows.length)
  })
})
