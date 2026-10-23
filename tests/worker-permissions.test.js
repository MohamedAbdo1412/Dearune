import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ADMIN_ID,
  OTHER_WORKER_ID,
  WORKER_ID,
  asRole,
  bootDatabase,
  many,
  one,
  seedAdmin,
  seedDesigner,
  seedProject,
  seedWorker,
} from './helpers/database'
import {
  ALL_PERMISSION_IDS,
  FINANCIAL_PERMISSION_IDS,
  PERMISSIONS,
  normalizePermissionSelection,
  permissionSummaryText,
  summarizePermissions,
  togglePermission,
  workerModuleAccess,
} from '../src/lib/permissions'

const OPERATIONS_WORKER = '55555555-5555-5555-5555-555555555555'
const VIEW_ONLY_WORKER = '66666666-6666-6666-6666-666666666666'
const PAYABLES_WORKER = '77777777-7777-7777-7777-777777777777'
const FINANCE_VIEW_WORKER = '88888888-8888-8888-8888-888888888888'
const REVOKED_WORKER = '99999999-9999-9999-9999-999999999999'
const MANAGER_WORKER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const SUSPENDED_WORKER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const PLAIN_USER = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

const ID = 'abcdefabcdefabcdefabcdef'
const TOKEN = '0123456789abcdef0123456789abcdef'

let db
let designerId
let project
let saleId
let otherSaleId
let manufacturedSaleId
let productId

/** Run a statement as an authenticated admin. */
const asAdmin = (fn) => asRole(db, 'authenticated', fn, { userId: ADMIN_ID })
/** Run a statement as one worker, with that worker's live permissions. */
const asWorker = (workerId, fn) => asRole(db, 'authenticated', fn, { userId: workerId })

async function rpc(workerId, sql, params = []) {
  return asWorker(workerId, () => one(db, sql, params))
}

async function adminRpc(sql, params = []) {
  return asAdmin(() => one(db, sql, params))
}

beforeAll(async () => {
  db = await bootDatabase()
  await seedAdmin(db)
  designerId = await seedDesigner(db)

  await seedWorker(db, {
    id: OPERATIONS_WORKER,
    displayName: 'Operations Worker',
    permissions: ['operations.view', 'operations.update_status'],
  })
  await seedWorker(db, {
    id: VIEW_ONLY_WORKER,
    displayName: 'View Only Worker',
    permissions: ['operations.view'],
  })
  await seedWorker(db, {
    id: PAYABLES_WORKER,
    displayName: 'Payables Worker',
    permissions: ['financial.view', 'financial.view_customer_payables'],
  })
  await seedWorker(db, {
    id: FINANCE_VIEW_WORKER,
    displayName: 'Finance View Worker',
    permissions: ['financial.view'],
  })
  await seedWorker(db, {
    id: REVOKED_WORKER,
    displayName: 'Revoked Worker',
    permissions: ['financial.view', 'financial.view_payments'],
  })
  await seedWorker(db, {
    id: MANAGER_WORKER,
    displayName: 'Finance Manager',
    permissions: ['financial.view', 'financial.manage', 'financial.export'],
  })
  await seedWorker(db, {
    id: SUSPENDED_WORKER,
    displayName: 'Suspended Worker',
    status: 'suspended',
    permissions: ['operations.view', 'financial.view', 'financial.view_revenue'],
  })
  await seedWorker(db, {
    id: WORKER_ID,
    displayName: 'Mariam Hassan',
    permissions: ['messages.view', 'messages.send', 'notifications.view'],
  })
  await seedWorker(db, {
    id: OTHER_WORKER_ID,
    displayName: 'Other Worker',
    permissions: ['messages.view', 'messages.send'],
  })

  // An authenticated user who is neither an admin nor a worker. Nothing may
  // elevate them, and no privileged RPC may accept them.
  await db.query('insert into auth.users (id, email) values ($1, $2)', [PLAIN_USER, 'plain@dearune.test'])

  project = await seedProject(db, { designerId, publicId: ID, publicToken: TOKEN })
  await db.query(
    `insert into public.shipping (project_id, recipient_name, address_line1, city, country, phone)
     values ($1, 'Mona', '12 Nile Street', 'Cairo', 'Egypt', '01000000001')`,
    [project.id],
  )
  productId = (
    await one(
      db,
      `insert into public.physical_products (project_id, unit_index, reference)
       values ($1, 1, 'DR70700099901') returning id`,
      [project.id],
    )
  ).id

  saleId = (
    await one(
      db,
      `insert into public.sales_log
         (project_id, designer_id, designer_name, title, selling_price, estimated_cost, currency)
       values ($1, $2, 'Nour Adel', 'For my sister', 3500, 1200, 'EGP') returning id`,
      [project.id, designerId],
    )
  ).id

  const other = await seedProject(db, { designerId, title: 'Second Dearune' })
  otherSaleId = (
    await one(
      db,
      `insert into public.sales_log
         (project_id, designer_id, designer_name, title, selling_price, estimated_cost, currency)
       values ($1, $2, 'Nour Adel', 'Second Dearune', 2000, 900, 'EGP') returning id`,
      [other.id, designerId],
    )
  ).id

  const manufactured = await seedProject(db, {
    designerId,
    title: 'Already made',
    stamps: { manufactured_at: new Date('2026-01-03T00:00:00Z') },
  })
  manufacturedSaleId = (
    await one(
      db,
      `insert into public.sales_log
         (project_id, designer_id, designer_name, title, selling_price, estimated_cost, currency)
       values ($1, $2, 'Nour Adel', 'Already made', 1000, 100, 'EGP') returning id`,
      [manufactured.id, designerId],
    )
  ).id
}, 180_000)

afterAll(async () => {
  await db?.close()
})

// ---------------------------------------------------------------------------
// The browser-side catalogue is only convenience; it must still agree with SQL
// ---------------------------------------------------------------------------
describe('permission catalogue', () => {
  it('has exactly the permissions and modules seeded in the database', async () => {
    const rows = await many(db, 'select id, module, label from public.permissions order by id')
    expect(rows.map((row) => row.id)).toEqual([...ALL_PERMISSION_IDS].sort())

    for (const row of rows) {
      const mirror = PERMISSIONS.find((permission) => permission.id === row.id)
      expect(mirror, row.id).toBeTruthy()
      expect(mirror.module).toBe(row.module)
      expect(mirror.label).toBe(row.label)
    }
  })

  it('marks every financial capability sensitive and keeps them independent', () => {
    const financial = PERMISSIONS.filter((permission) => permission.module === 'financial')
    expect(financial.map((permission) => permission.id)).toEqual(FINANCIAL_PERMISSION_IDS)
    expect(financial.every((permission) => permission.sensitive)).toBe(true)
  })

  it('never auto-grants revenue, cost or profit when customer payables are chosen', () => {
    const granted = togglePermission([], 'financial.view_customer_payables', true)
    expect(granted).toEqual(['financial.view', 'financial.view_customer_payables'])
    expect(granted).not.toContain('financial.view_revenue')
    expect(granted).not.toContain('financial.view_costs')
    expect(granted).not.toContain('financial.view_profit')
    expect(granted).not.toContain('financial.manage')
  })

  it('repairs a dependent permission without inventing a sensitive category', () => {
    const repaired = normalizePermissionSelection(['operations.update_status', 'financial.view_payments', 'bogus.permission'])
    expect(repaired).toContain('operations.view')
    expect(repaired).toContain('financial.view')
    expect(repaired).toContain('financial.view_payments')
    expect(repaired).not.toContain('financial.view_revenue')
    expect(repaired).not.toContain('financial.view_profit')
    expect(repaired).not.toContain('bogus.permission')
  })

  it('removes dependent permissions when a module view gate is unchecked', () => {
    const granted = togglePermission(
      ['operations.view', 'operations.edit', 'operations.update_status', 'notifications.view'],
      'operations.view',
      false,
    )
    expect(granted).toEqual(['notifications.view'])
  })

  it('keeps unread notifications separate from message content', () => {
    const granted = togglePermission([], 'notifications.view', true)
    expect(granted).toEqual(['notifications.view'])
    const access = workerModuleAccess(granted)
    expect(access.notifications).toBe(true)
    expect(access.messages).toBe(false)
  })

  it('summarises granted access without showing an empty module', () => {
    const groups = summarizePermissions(['operations.view', 'qa.view', 'financial.view'])
    expect(groups.map((group) => group.id)).toEqual(['operations', 'qa', 'financial'])
    expect(permissionSummaryText(['operations.view'])).toBe('Operations: View')
    expect(permissionSummaryText([])).toBe('No access granted')
  })
})

// ---------------------------------------------------------------------------
// Identity and live status
// ---------------------------------------------------------------------------
describe('worker identity and status', () => {
  it('resolves the worker and permission from the session, never from an argument', async () => {
    const row = await asWorker(OPERATIONS_WORKER, () =>
      one(
        db,
        `select public.current_worker_id() as worker_id,
                public.is_active_worker() as active,
                public.worker_has_permission('operations.view') as can_view,
                public.worker_has_permission('financial.view') as can_finance`,
      ),
    )
    expect(row.worker_id).toBe(OPERATIONS_WORKER)
    expect(row.active).toBe(true)
    expect(row.can_view).toBe(true)
    expect(row.can_finance).toBe(false)
  })

  it('reports a suspended worker as inactive even though permission rows remain', async () => {
    const row = await asWorker(SUSPENDED_WORKER, () =>
      one(
        db,
        `select public.current_worker_id() as worker_id,
                public.is_active_worker() as active,
                public.worker_has_permission('operations.view') as can_view`,
      ),
    )
    expect(row.worker_id).toBeNull()
    expect(row.active).toBe(false)
    expect(row.can_view).toBe(false)
  })

  it('fails closed on every protected RPC for a suspended worker', async () => {
    await expect(rpc(SUSPENDED_WORKER, 'select public.worker_operations_units(false)')).rejects.toThrow(
      /worker\.inactive_or_unknown/,
    )
    await expect(rpc(SUSPENDED_WORKER, 'select public.worker_financial_overview()')).rejects.toThrow(
      /worker\.inactive_or_unknown/,
    )
  })

  it('lets a worker read only their own worker row; the admin can read all', async () => {
    const own = await asWorker(WORKER_ID, () => many(db, 'select id from public.workers order by id'))
    expect(own.map((row) => row.id)).toEqual([WORKER_ID])

    const all = await asAdmin(() => many(db, 'select id from public.workers order by id'))
    expect(all.length).toBeGreaterThan(1)
  })
})

// ---------------------------------------------------------------------------
// Direct database access is not an alternative route
// ---------------------------------------------------------------------------
describe('direct table access', () => {
  it('returns no projects, units or sale rows to a worker', async () => {
    const rows = await asWorker(OPERATIONS_WORKER, async () => ({
      projects: await many(db, 'select id from public.projects'),
      units: await many(db, 'select id from public.physical_products'),
      sales: await many(db, 'select id from public.sales_log'),
    }))
    expect(rows.projects).toEqual([])
    expect(rows.units).toEqual([])
    expect(rows.sales).toEqual([])
  })

  it('refuses direct message INSERT/UPDATE from a worker', async () => {
    await expect(
      asWorker(WORKER_ID, () =>
        db.query(
          `insert into public.worker_messages (worker_id, sender_type, sender_id, title, body)
           values ($1, 'admin', $1, 'Spoofed', 'not allowed')`,
          [WORKER_ID],
        ),
      ),
    ).rejects.toThrow(/permission denied/i)

    await expect(
      asWorker(WORKER_ID, () => db.query('update public.worker_messages set body = $1', ['tampered'])),
    ).rejects.toThrow(/permission denied/i)
  })

  it('keeps the audit log invisible and immutable to workers', async () => {
    const visible = await asWorker(WORKER_ID, () => many(db, 'select id from public.admin_audit_log'))
    expect(visible).toEqual([])

    await expect(
      asWorker(WORKER_ID, () => db.query('update public.admin_audit_log set action = $1', ['forged'])),
    ).rejects.toThrow(/permission denied/i)
    await expect(
      asWorker(WORKER_ID, () => db.query('delete from public.admin_audit_log')),
    ).rejects.toThrow(/permission denied/i)
  })

  it('does not let a worker read the permissions of another worker', async () => {
    const own = await asWorker(WORKER_ID, () => many(db, 'select worker_id from public.worker_permissions'))
    expect(own.every((row) => row.worker_id === WORKER_ID)).toBe(true)
    expect(own.length).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------
describe('operations permissions', () => {
  it('lists safe operational fields and no money fields', async () => {
    const result = await rpc(OPERATIONS_WORKER, 'select public.worker_operations_units(false) as result')
    const units = result.result
    const unit = units.find((row) => row.reference === 'DR70700099901')
    expect(unit).toBeTruthy()
    expect(unit.project_title).toBe('For my sister')
    expect(unit.customer_phone).toBe('01000000001')
    expect(JSON.stringify(units)).not.toMatch(/selling_price|estimated_cost|estimated_profit|sale_price/)
  })

  it('requires the view gate before any write', async () => {
    await expect(
      rpc(VIEW_ONLY_WORKER, 'select public.worker_set_operation_status($1, $2, null)', [
        productId,
        'information_verified',
      ]),
    ).rejects.toThrow(/worker\.forbidden/)
  })

  it('requires operations.view before reading the list', async () => {
    await expect(rpc(PAYABLES_WORKER, 'select public.worker_operations_units(false)')).rejects.toThrow(
      /worker\.forbidden/,
    )
  })

  it('lets an authorised worker advance a unit and records the worker actor', async () => {
    await rpc(OPERATIONS_WORKER, 'select public.worker_set_operation_status($1, $2, null)', [
      productId,
      'information_verified',
    ])
    const row = await one(db, 'select status from public.physical_products where id = $1', [productId])
    expect(row.status).toBe('information_verified')

    const event = await one(
      db,
      `select actor_type, actor_id from public.physical_product_events
       where physical_product_id = $1 order by created_at desc limit 1`,
      [productId],
    )
    expect(event.actor_type).toBe('worker')
    expect(event.actor_id).toBe(OPERATIONS_WORKER)
  })

  it('takes effect immediately when a permission is revoked', async () => {
    await db.query("delete from public.worker_permissions where worker_id = $1 and permission_id = 'operations.update_status'", [
      OPERATIONS_WORKER,
    ])
    await expect(
      rpc(OPERATIONS_WORKER, 'select public.worker_set_operation_status($1, $2, null)', [
        productId,
        'ready_to_print',
      ]),
    ).rejects.toThrow(/worker\.forbidden/)

    // Reading is still allowed: revoking a write does not revoke the module.
    const result = await rpc(OPERATIONS_WORKER, 'select public.worker_operations_units(false) as result')
    expect(Array.isArray(result.result)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Operations / Designers parity reads
// ---------------------------------------------------------------------------
describe('operations and designers parity', () => {
  it('keeps timeline, print, export and designer detail gated independently', async () => {
    await expect(
      rpc(VIEW_ONLY_WORKER, 'select public.worker_operation_events($1)', [productId]),
    ).rejects.toThrow(/worker\.forbidden/)
    await expect(
      rpc(VIEW_ONLY_WORKER, 'select public.worker_operations_print(null)'),
    ).rejects.toThrow(/worker\.forbidden/)
    await expect(
      rpc(VIEW_ONLY_WORKER, 'select public.worker_export_operations(true)'),
    ).rejects.toThrow(/worker\.forbidden/)
    await expect(
      rpc(VIEW_ONLY_WORKER, 'select public.worker_designer_detail($1)', [designerId]),
    ).rejects.toThrow(/worker\.forbidden/)
    await expect(
      rpc(VIEW_ONLY_WORKER, 'select public.worker_export_shipments()'),
    ).rejects.toThrow(/worker\.forbidden/)
  })

  it('returns a unit timeline only with view_details', async () => {
    await db.query(
      `insert into public.worker_permissions (worker_id, permission_id, granted_by)
       values ($1, 'operations.view_details', $2)`,
      [OPERATIONS_WORKER, ADMIN_ID],
    )
    const result = await rpc(OPERATIONS_WORKER, 'select public.worker_operation_events($1) as result', [productId])
    expect(result.result.length).toBeGreaterThan(0)
    expect(result.result[0]).toHaveProperty('action')
    expect(JSON.stringify(result.result)).not.toMatch(/selling_price|estimated_cost|payload/)
  })

  it('returns a print payload with the QR token only when print is granted', async () => {
    await db.query(
      `insert into public.worker_permissions (worker_id, permission_id, granted_by)
       values ($1, 'operations.print', $2)`,
      [OPERATIONS_WORKER, ADMIN_ID],
    )
    const result = await rpc(OPERATIONS_WORKER, 'select public.worker_operations_print(array[$1]::uuid[]) as result', [
      productId,
    ])
    const row = result.result.find((unit) => unit.reference === 'DR70700099901')
    expect(row).toBeTruthy()
    expect(row.public_token).toBe(TOKEN)
    expect(JSON.stringify(result.result)).not.toMatch(/selling_price|estimated_cost|estimated_profit|"payload"/)
  })

  it('exports only safe operational columns and no token', async () => {
    await db.query(
      `insert into public.worker_permissions (worker_id, permission_id, granted_by)
       values ($1, 'operations.export', $2)`,
      [OPERATIONS_WORKER, ADMIN_ID],
    )
    const result = await rpc(OPERATIONS_WORKER, 'select public.worker_export_operations(true) as result')
    const row = result.result.find((unit) => unit.reference === 'DR70700099901')
    expect(row).toBeTruthy()
    expect(row.public_token).toBeUndefined()
    expect(row.customer_phone).toBe('01000000001')
    expect(JSON.stringify(result.result)).not.toMatch(/selling_price|estimated_cost|public_token|"payload"/)
  })

  it('returns designer detail without money, the private letter, or another designer\'s Dearunes', async () => {
    await db.query(
      `insert into public.worker_permissions (worker_id, permission_id, granted_by)
       values ($1, 'designers.view', $2), ($1, 'designers.view_details', $2)`,
      [OPERATIONS_WORKER, ADMIN_ID],
    )
    const otherDesignerId = await seedDesigner(db, { name: 'Other Designer', code: 'DR-909090' })
    const otherProject = await seedProject(db, {
      designerId: otherDesignerId,
      title: 'Not on this page',
      publicId: 'PUB-OTHER-PAGE',
    })

    const result = await rpc(OPERATIONS_WORKER, 'select public.worker_designer_detail($1) as result', [designerId])
    expect(result.result.designer.id).toBe(designerId)
    expect(result.result.projects.some((entry) => entry.id === project.id)).toBe(true)
    expect(result.result.projects.some((entry) => entry.id === otherProject.id)).toBe(false)
    expect(JSON.stringify(result.result)).not.toMatch(/selling_price|estimated_cost|estimated_profit|"payload"/)

    await db.query(
      `insert into public.worker_permissions (worker_id, permission_id, granted_by)
       values ($1, 'designers.export', $2)`,
      [OPERATIONS_WORKER, ADMIN_ID],
    )
    const exported = await rpc(OPERATIONS_WORKER, 'select public.worker_export_shipments() as result')
    const shipment = exported.result.find((row) => row.title === 'For my sister')
    expect(shipment).toBeTruthy()
    expect(shipment.phone).toBe('01000000001')
    expect(JSON.stringify(exported.result)).not.toMatch(
      /selling_price|estimated_cost|estimated_profit|public_token|"payload"/,
    )
  })

  it('allows designer assignment only with operations.edit or operations.assign', async () => {
    await expect(
      rpc(VIEW_ONLY_WORKER, 'select public.worker_update_operation_designer($1, $2)', [project.id, designerId]),
    ).rejects.toThrow(/worker\.forbidden/)
    await expect(
      rpc(VIEW_ONLY_WORKER, 'select public.worker_assignable_designers()'),
    ).rejects.toThrow(/worker\.forbidden/)

    await db.query(
      `insert into public.worker_permissions (worker_id, permission_id, granted_by)
       values ($1, 'operations.assign', $2)`,
      [VIEW_ONLY_WORKER, ADMIN_ID],
    )

    // The Operations picker is available through the assignment capability,
    // independently of the designers.view directory permission (this worker
    // still has no designers.* permission at all).
    const pickable = await rpc(VIEW_ONLY_WORKER, 'select public.worker_assignable_designers() as result')
    expect(pickable.result.some((entry) => entry.id === designerId)).toBe(true)
    expect(JSON.stringify(pickable.result)).not.toMatch(/passcode|selling_price|estimated_cost|"payload"/)

    const result = await rpc(
      VIEW_ONLY_WORKER,
      'select public.worker_update_operation_designer($1, $2) as result',
      [project.id, designerId],
    )
    expect(result.result.designerId).toBe(designerId)
  })
})

// ---------------------------------------------------------------------------
// Financial separation
// ---------------------------------------------------------------------------
describe('financial permissions', () => {
  it('opens the section without revealing a single figure', async () => {
    const result = await rpc(FINANCE_VIEW_WORKER, 'select public.worker_financial_overview() as result')
    const overview = result.result
    expect(overview.currency).toBeTruthy()
    expect(overview.revenue).toBeUndefined()
    expect(overview.costs).toBeUndefined()
    expect(overview.profit).toBeUndefined()
    expect(overview.customerPayables).toBeUndefined()
    expect(overview.payments).toBeUndefined()
    expect(overview.canExport).toBe(false)
    expect(overview.canManage).toBe(false)
  })

  it('returns customer payables alone when that is all that was granted', async () => {
    const result = await rpc(PAYABLES_WORKER, 'select public.worker_financial_overview() as result')
    const overview = result.result
    expect(overview.customerPayables.length).toBeGreaterThanOrEqual(2)
    expect(overview.customerPayables.map((row) => row.title)).toEqual(
      expect.arrayContaining(['For my sister', 'Second Dearune']),
    )
    expect(overview.customerPayables.every((row) => row.amount !== null)).toBe(true)
    expect(overview.revenue).toBeUndefined()
    expect(overview.costs).toBeUndefined()
    expect(overview.profit).toBeUndefined()
    expect(overview.payments).toBeUndefined()
  })

  it('returns the payment ledger without any profit or cost figures', async () => {
    const result = await rpc(REVOKED_WORKER, 'select public.worker_financial_overview() as result')
    const overview = result.result
    expect(overview.payments.length).toBeGreaterThan(0)
    expect(overview.payments.some((row) => row.saleId === saleId)).toBe(true)
    expect(overview.revenue).toBeUndefined()
    expect(overview.costs).toBeUndefined()
    expect(overview.profit).toBeUndefined()
    expect(overview.customerPayables).toBeUndefined()
  })

  it('refuses the overview once the section permission is revoked', async () => {
    await db.query("delete from public.worker_permissions where worker_id = $1 and permission_id = 'financial.view'", [
      REVOKED_WORKER,
    ])
    await expect(rpc(REVOKED_WORKER, 'select public.worker_financial_overview()')).rejects.toThrow(
      /worker\.forbidden/,
    )
  })

  it('exposes export as a flag and never as extra data', async () => {
    const result = await rpc(MANAGER_WORKER, 'select public.worker_financial_overview() as result')
    expect(result.result.canExport).toBe(true)
    expect(result.result.canManage).toBe(true)
    expect(result.result.revenue).toBeUndefined()
  })

  it('does not let any worker select the financial tables directly', async () => {
    for (const worker of [PAYABLES_WORKER, MANAGER_WORKER]) {
      const rows = await asWorker(worker, async () => ({
        sales: await many(db, 'select id from public.sales_log'),
        projects: await many(db, 'select id from public.projects'),
        settings: await many(db, 'select * from public.app_settings'),
      }))
      expect(rows.sales).toEqual([])
      expect(rows.projects).toEqual([])
      expect(rows.settings).toEqual([])
    }
  })

  it('refuses a void when the worker can only read financial data', async () => {
    await expect(
      rpc(PAYABLES_WORKER, 'select public.worker_void_sale($1, $2)', [otherSaleId, 'test correction']),
    ).rejects.toThrow(/worker\.forbidden/)
  })

  it('requires maintenance mode and a reason before a correction', async () => {
    await expect(
      rpc(MANAGER_WORKER, 'select public.worker_void_sale($1, $2)', [otherSaleId, 'test correction']),
    ).rejects.toThrow(/financial\.maintenance_required/)
    await db.query('update public.app_settings set maintenance_mode = true where id = 1')
    await expect(
      rpc(MANAGER_WORKER, 'select public.worker_void_sale($1, $2)', [otherSaleId, 'x']),
    ).rejects.toThrow(/financial\.reason_required/)
  })

  it('voids a sale without deleting or rewriting it, and audits the worker', async () => {
    const result = await rpc(MANAGER_WORKER, 'select public.worker_void_sale($1, $2) as result', [
      otherSaleId,
      'Customer cancelled before production',
    ])
    expect(result.result.status).toBe('voided')

    const sale = await one(db, 'select * from public.sales_log where id = $1', [otherSaleId])
    expect(sale.status).toBe('voided')
    expect(Number(sale.selling_price)).toBe(2000)
    expect(sale.voided_by_worker).toBe(MANAGER_WORKER)
    expect(sale.void_reason).toBe('Customer cancelled before production')

    const audit = await one(
      db,
      `select actor_id, actor_type, action, metadata from public.admin_audit_log
       where action = 'worker.sale.voided' order by created_at desc limit 1`,
    )
    expect(audit.actor_id).toBe(MANAGER_WORKER)
    expect(audit.actor_type).toBe('worker')
    expect(audit.metadata.reason).toBe('Customer cancelled before production')

    await expect(
      rpc(MANAGER_WORKER, 'select public.worker_void_sale($1, $2)', [otherSaleId, 'again']),
    ).rejects.toThrow(/financial\.sale_already_voided/)
  })

  it('refuses to void a sale whose production already started', async () => {
    await expect(
      rpc(MANAGER_WORKER, 'select public.worker_void_sale($1, $2)', [
        manufacturedSaleId,
        'Too late to correct',
      ]),
    ).rejects.toThrow(/financial\.production_started/)
    await db.query('update public.app_settings set maintenance_mode = false where id = 1')
  })
})

// ---------------------------------------------------------------------------
// QA
// ---------------------------------------------------------------------------
describe('QA permissions', () => {
  it('requires qa.view and returns no price, cost or letter body', async () => {
    await expect(rpc(OPERATIONS_WORKER, 'select public.worker_qa_lookup($1, $2)', [ID, TOKEN])).rejects.toThrow(
      /worker\.forbidden/,
    )

    await db.query(
      `insert into public.worker_permissions (worker_id, permission_id, granted_by)
       values ($1, 'qa.view', $2)`,
      [OPERATIONS_WORKER, ADMIN_ID],
    )
    const result = await rpc(OPERATIONS_WORKER, 'select public.worker_qa_lookup($1, $2) as result', [ID, TOKEN])
    expect(result.result.tokenVerified).toBe(true)
    expect(result.result.project.title).toBe('For my sister')
    expect(JSON.stringify(result.result)).not.toMatch(/selling_price|estimated_cost|estimated_profit|sale_price|"payload"/)
  })

  it('rejects a token that does not belong to the scanned Dearune', async () => {
    await expect(
      rpc(OPERATIONS_WORKER, 'select public.worker_qa_lookup($1, $2)', [ID, 'ffffffffffffffffffffffffffffffff']),
    ).rejects.toThrow(/qa\.token_mismatch/)
  })
})

// ---------------------------------------------------------------------------
// Messaging and notifications
// ---------------------------------------------------------------------------
describe('worker messaging', () => {
  it('refuses admin RPCs to a worker and to a plain authenticated user', async () => {
    await expect(
      rpc(WORKER_ID, 'select public.admin_send_worker_message($1, $2, $3, false)', [
        OTHER_WORKER_ID,
        'Hi',
        'from a worker',
      ]),
    ).rejects.toThrow(/admin\.unauthorized/)
    await expect(
      rpc(PLAIN_USER, 'select public.admin_worker_inbox()'),
    ).rejects.toThrow(/admin\.unauthorized/)
    await expect(
      rpc(PLAIN_USER, 'select public.worker_financial_overview()'),
    ).rejects.toThrow(/worker\.inactive_or_unknown/)
  })

  it('stamps the sender from the session instead of the request', async () => {
    const sent = await rpc(WORKER_ID, 'select public.worker_send_message($1, $2) as result', [
      'Question',
      'Can you check this order?',
    ])
    expect(sent.result.title).toBe('Question')

    const row = await one(db, 'select * from public.worker_messages where id = $1', [sent.result.id])
    expect(row.sender_type).toBe('worker')
    expect(row.sender_id).toBe(WORKER_ID)
    expect(row.priority).toBe(false)
  })

  it('keeps each worker thread private', async () => {
    const sent = await adminRpc('select public.admin_send_worker_message($1, $2, $3, true) as result', [
      OTHER_WORKER_ID,
      'Private note',
      'For the other worker only',
    ])
    expect(sent.result.priority).toBe(true)

    const own = await asWorker(WORKER_ID, () => many(db, 'select * from public.worker_messages'))
    expect(own.every((row) => row.worker_id === WORKER_ID)).toBe(true)

    const forged = await asWorker(WORKER_ID, () =>
      many(db, 'select * from public.worker_messages where worker_id = $1', [OTHER_WORKER_ID]),
    )
    expect(forged).toEqual([])
  })

  it('counts unread admin messages, then clears only those on read', async () => {
    const before = await rpc(WORKER_ID, 'select public.worker_unread_count() as count')
    expect(before.count).toBe(0)

    await adminRpc('select public.admin_send_worker_message($1, $2, $3, false)', [
      WORKER_ID,
      'Shift change',
      'Please start at 9 tomorrow.',
    ])
    await adminRpc('select public.admin_send_worker_message($1, $2, $3, true)', [
      WORKER_ID,
      'Urgent',
      'Call the studio.',
    ])
    const unread = await rpc(WORKER_ID, 'select public.worker_unread_count() as count')
    expect(unread.count).toBe(2)

    const marked = await rpc(WORKER_ID, 'select public.worker_mark_messages_read() as count')
    expect(marked.count).toBe(2)
    const after = await rpc(WORKER_ID, 'select public.worker_unread_count() as count')
    expect(after.count).toBe(0)

    // The worker's own message is still unread *for the admin*.
    const ownUnread = await one(
      db,
      `select count(*)::integer as count from public.worker_messages
       where worker_id = $1 and sender_type = 'worker' and read_at is null`,
      [WORKER_ID],
    )
    expect(ownUnread.count).toBe(1)
  })

  it('shows the admin a truthful inbox and clears worker replies on read', async () => {
    const inbox = await adminRpc('select public.admin_worker_inbox() as result')
    const row = inbox.result.find((entry) => entry.workerId === WORKER_ID)
    expect(row.unreadFromWorker).toBe(1)
    expect(row.unreadForWorker).toBe(0)
    expect(row.lastMessageFrom).toBe('admin')
    expect(row.lastMessagePreview).toBe('Call the studio.')

    const read = await adminRpc('select public.admin_mark_worker_messages_read($1) as count', [WORKER_ID])
    expect(read.count).toBe(1)
    const after = await adminRpc('select public.admin_worker_inbox() as result')
    expect(after.result.find((entry) => entry.workerId === WORKER_ID).unreadFromWorker).toBe(0)
  })

  it('requires messages.view to read the thread', async () => {
    await db.query("delete from public.worker_permissions where worker_id = $1 and permission_id = 'messages.view'", [
      WORKER_ID,
    ])
    const rows = await asWorker(WORKER_ID, () => many(db, 'select * from public.worker_messages'))
    expect(rows).toEqual([])
    await expect(
      rpc(WORKER_ID, 'select public.worker_send_message($1, $2)', ['No', 'longer allowed']),
    ).rejects.toThrow(/worker\.forbidden/)

    await db.query(
      `insert into public.worker_permissions (worker_id, permission_id, granted_by)
       values ($1, 'messages.view', $2)`,
      [WORKER_ID, ADMIN_ID],
    )
  })

  it('never writes a message body into the audit log', async () => {
    const audits = await asAdmin(() =>
      many(
        db,
        `select metadata from public.admin_audit_log
         where action = 'worker.message.sent' order by created_at desc`,
      ),
    )
    expect(audits.length).toBeGreaterThan(0)
    expect(JSON.stringify(audits)).not.toContain('Can you check this order?')
    expect(JSON.stringify(audits)).not.toContain('Call the studio.')
  })
})

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------
describe('audit trail', () => {
  it('is readable by an admin and includes worker-created events', async () => {
    const rows = await asAdmin(() =>
      many(db, 'select actor_type, action from public.admin_audit_log order by created_at'),
    )
    expect(rows.some((row) => row.actor_type === 'worker')).toBe(true)
    expect(rows.some((row) => row.action === 'worker.sale.voided')).toBe(true)
  })

  it('does not expose credentials or financial detail that is not already audited', async () => {
    const rows = await asAdmin(() => many(db, 'select metadata from public.admin_audit_log'))
    const serialized = JSON.stringify(rows).toLowerCase()
    expect(serialized).not.toContain('password')
    expect(serialized).not.toContain('service_role')
    expect(serialized).not.toContain('bearer ')
    expect(serialized).not.toContain('temp_password')
  })
})
