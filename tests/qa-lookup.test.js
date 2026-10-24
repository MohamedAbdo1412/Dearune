import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { bootDatabase, one, seedAdmin, seedDesigner, seedProject, seedShipping, ADMIN_ID } from './helpers/database.js'

// The QA desk is read-only, so its test is read-only too: the mock below
// turns the Supabase client's query builder into plain SQL and runs it
// against a REAL Postgres (compiled to WASM) with the studio's migrations
// applied. That means the exact SELECTs the QA screen issues are proven to
// work against the real schema — and against the real row level security.

const { bridge } = vi.hoisted(() => ({ bridge: { db: null, userId: null } }))

vi.mock('@/lib/supabase', () => {
  // Runs one statement as the `authenticated` role with the admin's JWT
  // subject set — exactly what PostgREST does for a signed-in admin.
  const run = async (sql, params) => {
    await bridge.db.exec('set role authenticated')
    await bridge.db.exec(`select set_config('request.jwt.claim.sub', '${bridge.userId}', false)`)
    try {
      const { rows } = await bridge.db.query(sql, params)
      return rows
    } finally {
      await bridge.db.exec('reset role')
    }
  }

  const from = (table) => {
    const state = { columns: '*', filters: [], limit: null, order: null }

    const builder = {
      select(columns) {
        state.columns = columns
        return builder
      },
      eq(column, value) {
        state.filters.push({ column, value })
        return builder
      },
      in(column, values) {
        state.filters.push({ column, values })
        return builder
      },
      limit(count) {
        state.limit = count
        return builder
      },
      order(column, options = {}) {
        state.order = { column, ascending: options.ascending !== false }
        return builder
      },
      async then(resolve) {
        const params = []
        const clauses = []
        for (const filter of state.filters) {
          if (filter.values !== undefined) {
            const placeholders = filter.values.map(() => `$${params.length + 1}`)
            filter.values.forEach((value) => params.push(value))
            clauses.push(`${filter.column} in (${placeholders.join(', ')})`)
          } else {
            params.push(filter.value)
            clauses.push(`${filter.column} = $${params.length}`)
          }
        }
        let sql = `select ${state.columns} from public.${table}`
        if (clauses.length) sql += ` where ${clauses.join(' and ')}`
        if (state.order) sql += ` order by ${state.order.column} ${state.order.ascending ? 'asc' : 'desc'}`
        if (state.limit !== null) sql += ` limit ${state.limit}`
        try {
          resolve({ data: await run(sql, params), error: null })
        } catch (err) {
          resolve({ data: null, error: { message: err.message, code: err.code } })
        }
      },
    }

    return builder
  }

  return { supabase: { from } }
})

const { QA_ERROR_KINDS, QaError, buildQaRecord, fetchQaRecord, parseQrValue, qaIdentifiers } = await import(
  '@/services/qa'
)

const PUBLIC_ID = 'a1b2c3d4e5f60718293a4b5c'
const PUBLIC_TOKEN = '0f1e2d3c4b5a69788796a5b4c3d2e1f0'

describe('parseQrValue', () => {
  it('reads the printed link exactly as the studio prints it', () => {
    const parsed = parseQrValue(`https://dearune.ink/message/${PUBLIC_ID}?token=${PUBLIC_TOKEN}`)
    expect(parsed).toEqual({ ok: true, publicId: PUBLIC_ID, token: PUBLIC_TOKEN, source: 'url' })
  })

  it('reads a bare path', () => {
    const parsed = parseQrValue(`/message/${PUBLIC_ID}?token=${PUBLIC_TOKEN}`)
    expect(parsed.ok).toBe(true)
    expect(parsed.publicId).toBe(PUBLIC_ID)
    expect(parsed.token).toBe(PUBLIC_TOKEN)
  })

  it('reads a typed public id and token pair', () => {
    const parsed = parseQrValue(`${PUBLIC_ID}:${PUBLIC_TOKEN}`)
    expect(parsed).toEqual({ ok: true, publicId: PUBLIC_ID, token: PUBLIC_TOKEN, source: 'pair' })
  })

  it('reads a bare public id, with no token to prove anything', () => {
    const parsed = parseQrValue(PUBLIC_ID)
    expect(parsed).toEqual({ ok: true, publicId: PUBLIC_ID, token: '', source: 'id' })
  })

  it('lowercases what it reads', () => {
    const parsed = parseQrValue(PUBLIC_ID.toUpperCase())
    expect(parsed.ok).toBe(true)
    expect(parsed.publicId).toBe(PUBLIC_ID)
  })

  it('refuses a link that is not a Dearune message', () => {
    expect(parseQrValue('https://example.com/pricing').ok).toBe(false)
  })

  it('refuses a link whose id is not a Dearune id', () => {
    expect(parseQrValue('https://dearune.ink/message/NOT-HEX').ok).toBe(false)
  })

  it('refuses nonsense', () => {
    expect(parseQrValue('').ok).toBe(false)
    expect(parseQrValue('hello').ok).toBe(false)
  })
})

describe('fetchQaRecord', () => {
  let db = null
  let projectId = null
  let designerId = null
  let unitId = null

  beforeAll(async () => {
    db = await bootDatabase()
    bridge.db = db
    bridge.userId = ADMIN_ID

    await seedAdmin(db, ADMIN_ID, 'Studio Admin')
    designerId = await seedDesigner(db, { name: 'Nour Adel', code: 'DR-100001' })

    const project = await seedProject(db, {
      designerId,
      title: 'For my sister',
      wrapperType: 'sealed_letter',
      templateSlug: 'memorial-letter',
      publicId: PUBLIC_ID,
      publicToken: PUBLIC_TOKEN,
      payload: {
        language: 'en',
        greeting: 'To my sister',
        body: 'Some words are meant to last.',
        closing: 'Always yours',
        senderName: 'Nour',
        photos: [{ path: 'a/b/photo-1.jpg', originalName: 'photo-1.jpg', mimeType: 'image/jpeg' }, null, null],
        audio: { path: 'a/b/note.m4a', originalName: 'note.m4a', mimeType: 'audio/mp4' },
      },
    })
    projectId = project.id

    await seedShipping(db, projectId, { recipientName: 'Mona', city: 'Cairo', phone: '01000000001' })

    await db.query(
      `insert into public.sales_log (project_id, designer_id, designer_name, template_name, wrapper_type, title, selling_price, estimated_cost)
       values ($1, $2, 'Nour Adel', 'Memorial Letter', 'sealed_letter', 'For my sister', 3500, 1200)`,
      [projectId, designerId],
    )
    await db.query(
      `insert into public.project_events (project_id, actor_type, action, detail)
       values ($1, 'admin', 'project.created', '{"note": "seeded"}'::jsonb)`,
      [projectId],
    )

    await db.query('select public.ensure_physical_products($1, 1, null)', [projectId])
    const unit = await one(
      db,
      'select id, reference from public.physical_products where project_id = $1 order by unit_index limit 1',
      [projectId],
    )
    unitId = unit.id
    await db.query(
      `insert into public.physical_product_events (physical_product_id, actor_type, action, detail)
       values ($1, 'admin', 'unit.opened', '{"reason": "checked at the desk"}'::jsonb)`,
      [unitId],
    )
  }, 180000)

  afterAll(async () => {
    bridge.db = null
    if (db) await db.close()
  })

  it('resolves the printed link into the whole record', async () => {
    const record = await fetchQaRecord(`https://dearune.ink/message/${PUBLIC_ID}?token=${PUBLIC_TOKEN}`)

    expect(record.publicId).toBe(PUBLIC_ID)
    expect(record.token).toEqual({ present: true, verified: true, source: 'url' })
    expect(record.letter.body).toBe('Some words are meant to last.')
    expect(record.letter.greeting).toBe('To my sister')
    expect(record.designer.code).toBe('DR-100001')
    expect(record.designer.name).toBe('Nour Adel')
    expect(record.shipping.recipientName).toBe('Mona')
    expect(record.sale.status).toBe('completed')
    expect(record.units).toHaveLength(1)
    expect(record.units[0].reference).toMatch(/^DR\d{11}$/)
    expect(record.units[0].soldAs).toBe(`SOL-${record.units[0].reference}`)
    expect(record.units[0].events[0].action).toBe('unit.opened')
    expect(record.projectEvents.map((event) => event.action)).toContain('project.created')
    expect(record.media.photos).toHaveLength(1)
    expect(record.media.photos[0].name).toBe('photo-1.jpg')
    expect(record.media.audio.name).toBe('note.m4a')
  })

  it('never renders the token, but says whether it matched', async () => {
    const record = await fetchQaRecord(`https://dearune.ink/message/${PUBLIC_ID}?token=${PUBLIC_TOKEN}`)
    expect(JSON.stringify(record)).not.toContain(PUBLIC_TOKEN)
  })

  it('lists the identifiers the workshop reads out loud', async () => {
    const record = await fetchQaRecord(`https://dearune.ink/message/${PUBLIC_ID}?token=${PUBLIC_TOKEN}`)
    const identifiers = qaIdentifiers(record)
    const production = identifiers.find((item) => item.tone === 'primary')
    expect(production.value).toMatch(/^DR\d{11}$/)
    expect(identifiers.map((item) => item.label)).toEqual([
      'Production reference',
      'Designer ID',
      'Public ID',
    ])
  })

  it('rejects a paper whose token belongs to another letter', async () => {
    const other = 'fedcba98765432100123456789abcdef'
    await expect(fetchQaRecord(`https://dearune.ink/message/${PUBLIC_ID}?token=${other}`)).rejects.toMatchObject({
      kind: QA_ERROR_KINDS.TOKEN_MISMATCH,
    })
  })

  it('says so when no Dearune carries the id', async () => {
    await expect(fetchQaRecord('0123456789abcdef01234567')).rejects.toMatchObject({
      kind: QA_ERROR_KINDS.NOT_FOUND,
    })
  })

  it('says so when the code is not a Dearune QR at all', async () => {
    await expect(fetchQaRecord('https://example.com/pricing')).rejects.toMatchObject({
      kind: QA_ERROR_KINDS.INVALID,
    })
  })

  it('throws a QaError, so the page can tell the kinds apart', async () => {
    await expect(fetchQaRecord('nonsense')).rejects.toBeInstanceOf(QaError)
  })
})

describe('buildQaRecord', () => {
  it('says what is missing instead of pretending it is there', () => {
    const record = buildQaRecord({
      parsed: { publicId: PUBLIC_ID, token: '', source: 'id' },
      project: { public_id: PUBLIC_ID, public_token: PUBLIC_TOKEN, message_active: false },
      unitRows: [],
    })

    expect(record.token).toEqual({ present: false, verified: null, source: 'id' })
    expect(record.letter).toBeNull()
    expect(record.designer).toBeNull()
    expect(record.shipping).toBeNull()
    expect(record.sale).toBeNull()
    expect(record.units).toEqual([])
    expect(record.warnings).toContain('The letter body is missing from this record.')
    expect(record.warnings).toContain('No physical unit has been created for this Dearune yet.')
    expect(record.warnings).toContain('No designer is assigned to this Dearune.')
    expect(record.warnings).toContain('The letter is switched off — the printed QR will not open it.')
  })

  it('lists the delivery details it is missing', () => {
    const record = buildQaRecord({
      parsed: { publicId: PUBLIC_ID, token: '', source: 'id' },
      project: { public_id: PUBLIC_ID, message_active: true },
      shippingRows: [{ id: 's', address_line1: '', city: '', postal_code: '', country: '' }],
    })

    expect(record.warnings.join(' ')).toContain('missing address, city, postal code, country')
  })
})
