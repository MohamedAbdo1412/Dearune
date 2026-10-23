import fs from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'

// A real Postgres (compiled to WASM) with the studio's migrations applied, so
// the schema — sequences, constraints, triggers, RLS — can be *run* rather
// than read. Supabase's own CLI/Docker are not available in this environment.
//
// A bare Postgres is missing everything Supabase provides around it. The
// bootstrap below stubs exactly that surface and nothing else, so the
// migrations themselves run unmodified.
export const MIGRATIONS_DIR = path.resolve(process.cwd(), 'supabase/migrations')
export const OPERATIONS_MIGRATION = '20261017000001_operations.sql'

const BOOTSTRAP = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create or replace function gen_random_bytes(n integer) returns bytea language sql volatile as $$
  select decode(substr(repeat(md5(random()::text || clock_timestamp()::text), (n / 16) + 1), 1, n * 2), 'hex')
$$;

-- Supabase grants every object created by the postgres role to the API roles,
-- which is why a migration can create "designers" and an admin can still read
-- it over PostgREST. Reproducing it keeps RLS faithful to production.
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant usage on types to postgres, anon, authenticated, service_role;
`

export function migrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort()
}

export function readMigration(file) {
  // Supabase ships pgcrypto; the WASM build has no extensions to install, and
  // the migrations only use it for gen_random_bytes (already stubbed).
  return fs
    .readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
    .replace(/create extension if not exists "pgcrypto";/gi, '')
}

/**
 * Boot Postgres and apply every migration in order.
 *
 * @param {{ beforeOperations?: (db: PGlite) => Promise<void> }} [options]
 *   `beforeOperations` runs after every migration EXCEPT the Operations one,
 *   which is how a test seeds rows that the Operations backfill should find.
 */
export async function bootDatabase(options = {}) {
  const db = new PGlite()
  await db.exec(BOOTSTRAP)

  for (const file of migrationFiles()) {
    if (options.beforeOperations && file === OPERATIONS_MIGRATION) {
      await options.beforeOperations(db)
    }
    await db.exec(readMigration(file))
  }

  return db
}

/** One row, or null. */
export async function one(db, sql, params) {
  const { rows } = await db.query(sql, params)
  return rows[0] ?? null
}

/** One column of one row. */
export async function value(db, sql, params) {
  const row = await one(db, sql, params)
  if (!row) return null
  return Object.values(row)[0]
}

/** Every row. */
export async function many(db, sql, params) {
  const { rows } = await db.query(sql, params)
  return rows
}

export const ADMIN_ID = '11111111-1111-1111-1111-111111111111'
export const OTHER_ID = '22222222-2222-2222-2222-222222222222'
export const WORKER_ID = '33333333-3333-3333-3333-333333333333'
export const OTHER_WORKER_ID = '44444444-4444-4444-4444-444444444444'

/** Give a worker a set of permissions, exactly as an admin grant would. */
export async function grantWorkerPermissions(db, workerId, permissions = [], grantedBy = ADMIN_ID) {
  for (const permissionId of permissions) {
    await db.query(
      `insert into public.worker_permissions (worker_id, permission_id, granted_by)
       values ($1, $2, $3) on conflict (worker_id, permission_id) do nothing`,
      [workerId, permissionId, grantedBy],
    )
  }
}

/**
 * Create a worker: the Supabase Auth user and the `public.workers` row that
 * together are the Worker Dashboard identity. Permissions are always explicit;
 * nothing is implied by the module a permission belongs to.
 */
export async function seedWorker(
  db,
  {
    id = WORKER_ID,
    email = `${id}@dearune.test`,
    displayName = 'Mariam Hassan',
    status = 'active',
    permissions = [],
    createdBy = ADMIN_ID,
  } = {},
) {
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email])
  await db.query(
    `insert into public.workers (id, email, display_name, status, created_by)
     values ($1, $2, $3, $4, $5)`,
    [id, email, displayName, status, createdBy],
  )
  await grantWorkerPermissions(db, id, permissions)
  return id
}

/** Create an admin (and their auth user) so `is_dearune_admin()` is true. */
export async function seedAdmin(db, id = ADMIN_ID, name = 'Studio Admin') {
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, `${id}@dearune.test`])
  await db.query('insert into public.admin_users (id, display_name) values ($1, $2)', [id, name])
}

export async function seedDesigner(db, { name = 'Nour Adel', code = 'DR-100001' } = {}) {
  const row = await one(
    db,
    'insert into public.designers (name, code, passcode_hash) values ($1, $2, $3) returning id',
    [name, code, 'not-a-real-hash'],
  )
  return row.id
}

/**
 * Create a Dearune. `paid` decides whether the Operations backfill should pick
 * it up; `stamps` sets the legacy manufacturing timeline the backfill reads.
 */
export async function seedProject(
  db,
  {
    designerId,
    title = 'For my sister',
    wrapperType = 'sealed_letter',
    templateSlug = 'memorial-letter',
    paid = true,
    stamps = {},
    messageActive = true,
    payload = { greeting: 'To my sister', body: 'Some words are meant to last.', senderName: 'With love' },
    publicId = null,
    publicToken = null,
  } = {},
) {
  const columns = ['designer_id', 'template_slug', 'title', 'wrapper_type', 'payload', 'message_active']
  const values = [designerId, templateSlug, title, wrapperType, JSON.stringify(payload), messageActive]

  if (paid) {
    columns.push('paid_at', 'sale_price')
    values.push(new Date('2026-01-02T03:04:05Z'), 3500)
  }
  for (const [column, stamp] of Object.entries(stamps)) {
    columns.push(column)
    values.push(stamp)
  }
  if (publicId) {
    columns.push('public_id')
    values.push(publicId)
  }
  if (publicToken) {
    columns.push('public_token')
    values.push(publicToken)
  }

  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ')
  const row = await one(
    db,
    `insert into public.projects (${columns.join(', ')}) values (${placeholders}) returning id, public_id, public_token`,
    values,
  )
  return row
}

export async function seedShipping(db, projectId, { phone = '01000000001', city = 'Cairo', recipientName = 'Mona' } = {}) {
  await db.query(
    `insert into public.shipping (project_id, recipient_name, address_line1, city, country, phone)
     values ($1, $2, $3, $4, $5, $6)`,
    [projectId, recipientName, '12 Nile Street', city, 'Egypt', phone],
  )
}

/** Run a callback as a given API role, then always step back out. */
export async function asRole(db, role, callback, { userId = null } = {}) {
  await db.exec(`set role ${role}`)
  try {
    await db.exec(`select set_config('request.jwt.claim.sub', ${userId ? `'${userId}'` : "''"}, false)`)
    return await callback()
  } finally {
    await db.exec('reset role')
  }
}
