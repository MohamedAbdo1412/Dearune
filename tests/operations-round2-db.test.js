import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
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

// The recipient-open signal is the ONLY thing that removes a Dearune from the
// Unopened Messages queue, so it gets the same real-Postgres treatment as the
// milestone guard: studio previews must never count, and the queue query must
// return a row until the recipient actually reads it.

let db
let designerId

beforeAll(async () => {
  db = await bootDatabase()
  await seedAdmin(db)
  designerId = await seedDesigner(db)
}, 240_000)

afterAll(async () => {
  await db?.close()
})

async function publishedDearune(publicId = 'msg-open-1', publicToken = 'tok-open-1') {
  const project = await seedProject(db, { designerId, publicId, publicToken, messageActive: true })
  return project
}

const openedAt = (projectId) =>
  value(db, 'select recipient_opened_at from public.projects where id = $1', [projectId])
const openCount = (projectId) =>
  value(db, 'select recipient_open_count from public.projects where id = $1', [projectId])

describe('recipient open tracking', () => {
  it('records the first recipient read and keeps it', async () => {
    const project = await publishedDearune('msg-open-a', 'tok-open-a')

    await db.query('select public.record_recipient_open($1, false)', [project.public_id])

    expect(await openedAt(project.id)).not.toBeNull()
    expect(await openCount(project.id)).toBe(1)

    await db.query('select public.record_recipient_open($1, false)', [project.public_id])
    expect(await openCount(project.id)).toBe(2)
    // The first-open timestamp is never overwritten by later reads.
    const first = await openedAt(project.id)
    await db.query('select public.record_recipient_open($1, false)', [project.public_id])
    expect(await openedAt(project.id)).toEqual(first)
  })

  it('never records a studio preview as an open', async () => {
    const project = await publishedDearune('msg-open-preview', 'tok-open-preview')

    await db.query('select public.record_recipient_open($1, true)', [project.public_id])

    expect(await openedAt(project.id)).toBeNull()
    expect(await openCount(project.id)).toBe(0)
  })

  it('writes one customer-timeline event per open', async () => {
    const project = await publishedDearune('msg-open-events', 'tok-open-events')

    await db.query('select public.record_recipient_open($1, false)', [project.public_id])
    await db.query('select public.record_recipient_open($1, false)', [project.public_id])

    const events = await many(
      db,
      `select actor_type, detail
         from public.project_events
        where project_id = $1 and action = 'message.opened'
        order by created_at`,
      [project.id],
    )
    expect(events).toHaveLength(2)
    expect(events.every((event) => event.actor_type === 'customer')).toBe(true)
    expect(events[0].detail.first).toBe(true)
    expect(events[1].detail.first).toBe(false)
  })

  it('does not let an anonymous client call the writer directly', async () => {
    const project = await publishedDearune('msg-open-anon', 'tok-open-anon')

    await expect(
      asRole(db, 'anon', () =>
        db.query('select public.record_recipient_open($1, false)', [project.public_id]),
      ),
    ).rejects.toThrow(/permission denied/i)
  })

  it('only counts an open when the reader actually returns the letter', async () => {
    const project = await publishedDearune('msg-open-locked', 'tok-open-locked')
    await db.query('update public.projects set message_active = false where id = $1', [project.id])

    const result = await value(db, "select public.get_public_project_message($1, $2, null)", [
      project.public_id,
      'tok-open-locked',
    ])

    expect(result.available).toBe(false)
    expect(await openedAt(project.id)).toBeNull()
  })

  it('does not count a signed-in reader as a recipient', async () => {
    const project = await publishedDearune('msg-open-studio', 'tok-open-studio')

    const read = () =>
      asRole(
        db,
        'authenticated',
        () =>
          value(db, "select public.get_public_project_message($1, $2, null)", [
            project.public_id,
            'tok-open-studio',
          ]),
        { userId: '11111111-1111-1111-1111-111111111111' },
      )

    const result = await read()
    expect(result.available).toBe(true)
    expect(await openedAt(project.id)).toBeNull()
  })

  it('removes the order from the unopened queue once opened', async () => {
    const project = await publishedDearune('msg-open-queue', 'tok-open-queue')
    await db.query('select public.ops_start_work_order($1)', [project.id])
    await seedShipping(db, project.id)

    const queue = () =>
      value(
        db,
        `select count(*)::int from public.ops_orders
          where recipient_opened_at is null and message_active = true and public_id = $1`,
        [project.public_id],
      )

    expect(await queue()).toBe(1)
    await db.query('select public.record_recipient_open($1, false)', [project.public_id])
    expect(await queue()).toBe(0)
  })
})

describe('full data projection', () => {
  it('keeps exactly one row per Dearune even with units and refunds', async () => {
    const project = await seedProject(db, { designerId, title: 'Full data one' })
    await db.query('select public.ops_start_work_order($1)', [project.id])
    await db.query('select * from public.ensure_physical_products($1, 3, null)', [project.id])
    await seedShipping(db, project.id)

    const rows = await many(db, 'select project_id from public.ops_full_data where project_id = $1', [
      project.id,
    ])
    expect(rows).toHaveLength(1)
  })

  it('never exposes the public token or the payload', async () => {
    const columns = await many(
      db,
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'ops_full_data'`,
    )
    const names = columns.map((column) => column.column_name)
    expect(names).not.toContain('public_token')
    expect(names).not.toContain('payload')
    expect(names).toContain('recipient_open_count')
  })

  it('reports the authoritative milestone and the message facts', async () => {
    const project = await seedProject(db, { designerId, title: 'Full data two' })
    await db.query('select public.ops_start_work_order($1)', [project.id])

    const row = await one(
      db,
      `select milestone, recipient_opened_at, recipient_open_count
         from public.ops_full_data where project_id = $1`,
      [project.id],
    )
    expect(row.milestone).toBe('making')
    expect(row.recipient_opened_at).toBeNull()
    expect(row.recipient_open_count).toBe(0)
  })
})

describe('manifest direction', () => {
  it('defaults an existing manifest to an import', async () => {
    const project = await seedProject(db, { designerId, title: 'Manifest direction' })
    const row = await one(
      db,
      `insert into public.shipment_manifests (carrier, filename, row_count, imported_by)
       values ('egypt_post', 'manifest.xlsx', 0, null)
       returning direction`,
    )
    expect(row.direction).toBe('import')
  })

  it('accepts an export and rejects an invented direction', async () => {
    await db.query(
      `insert into public.shipment_manifests (carrier, filename, row_count, direction)
       values ('bosta', 'export.xlsx', 0, 'export')`,
    )
    await expect(
      db.query(
        `insert into public.shipment_manifests (carrier, filename, row_count, direction)
         values ('bosta', 'bad.xlsx', 0, 'sideways')`,
      ),
    ).rejects.toThrow(/shipment_manifests_direction_ck/)
  })
})
