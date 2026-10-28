# Adding a Database Change

This guide explains how to safely add database schema changes to Dearune using Supabase migrations.

## Migration Principles

1. **Forward-only**: Never edit applied migrations
2. **Idempotent**: Use `IF NOT EXISTS`, `DROP IF EXISTS`
3. **Backfill in same migration**: Data + schema together
4. **Test locally**: `supabase db reset` before push
5. **Order matters**: Dependencies must exist first

---

## Creating a Migration

### 1. Create Migration File

```bash
supabase migration new descriptive_name
# Creates: supabase/migrations/YYYYMMDDHHMMSS_descriptive_name.sql
```

### 2. Migration Template

```sql
-- ============================================================================
-- Description: Brief description of what this migration does
-- ============================================================================

-- 1. Schema changes (idempotent)
ALTER TABLE public.table_name
  ADD COLUMN IF NOT EXISTS new_column text;

-- 2. Constraints/Indexes
CREATE INDEX IF NOT EXISTS idx_table_column
  ON public.table (column);

-- 3. Data migration (in same migration)
UPDATE public.table
SET new_column = 'default'
WHERE new_column IS NULL;

-- 4. RLS policies (if needed)
ALTER TABLE public.table ENABLE ROW LEVEL SECURITY;
CREATE POLICY policy_name ON public.table
  FOR SELECT TO authenticated
  USING (condition);

-- 5. Grants
GRANT SELECT ON public.table TO authenticated;
```

### 3. Test Locally

```bash
# Reset local DB and apply all migrations
supabase db reset

# Verify migration works
supabase db diff
```

### 4. Push to Production

```bash
supabase db push
```

---

## Migration Patterns

### Adding a Column

```sql
-- Safe: Add nullable column
ALTER TABLE public.table_name
  ADD COLUMN IF NOT EXISTS new_column text;

-- With default (requires UPDATE for existing rows)
ALTER TABLE public.table_name
  ADD COLUMN IF NOT EXISTS new_column text DEFAULT 'default_value';
```

### Adding an Index

```sql
-- Simple index
CREATE INDEX IF NOT EXISTS idx_table_column
  ON public.table (column);

-- Composite index
CREATE INDEX IF NOT EXISTS idx_table_col1_col2
  ON public.table (col1, col2);

-- Partial index (for filtered queries)
CREATE INDEX IF NOT EXISTS idx_table_active
  ON public.table (created_at DESC)
  WHERE archived_at IS NULL;
```

### Adding a Constraint

```sql
-- Check constraint
ALTER TABLE public.table
  ADD CONSTRAINT check_name CHECK (column IN ('value1', 'value2'));

-- Foreign key
ALTER TABLE public.table
  ADD CONSTRAINT fk_name
  FOREIGN KEY (ref_id) REFERENCES other_table(id)
  ON DELETE SET NULL;

-- Unique constraint
ALTER TABLE public.table
  ADD CONSTRAINT unique_name UNIQUE (column);
```

### Adding a Table

```sql
CREATE TABLE IF NOT EXISTS public.new_table (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_new_table_created ON public.new_table (created_at DESC);

-- RLS
ALTER TABLE public.new_table ENABLE ROW LEVEL SECURITY;
CREATE POLICY policy_name ON public.new_table
  FOR SELECT TO authenticated
  USING (condition);

-- Trigger for updated_at
CREATE TRIGGER new_table_updated_at
  BEFORE UPDATE ON public.new_table
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

### Adding a Function/RPC

```sql
CREATE OR REPLACE FUNCTION public.my_function(
  p_param text,
  p_count int DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Function logic
  SELECT jsonb_build_object('result', 'ok') INTO v_result;
  RETURN v_result;
END;
$$;

-- Grants
REVOKE EXECUTE ON FUNCTION public.my_function(text, int) FROM PUBLIC, ANON, AUTHENTICATED;
GRANT EXECUTE ON FUNCTION public.my_function(text, int) TO AUTHENTICATED;
```

---

## Migration Best Practices

### Do's ✅

- Use `IF NOT EXISTS` / `IF EXISTS`
- Backfill data in same migration
- Test with `supabase db reset` locally
- Keep migrations small and focused
- Use descriptive names: `add_user_notes_column.sql`

### Don'ts ❌

- Edit already-applied migrations
- Drop columns without deprecation period
- Mix schema + unrelated data changes
- Reference tables/columns that don't exist yet
- Forget to test `supabase db reset` locally

---

## Migration Order

Migrations run in timestamp order (filename prefix):

```
20260923000001_initial_schema.sql
20260923000002_functions_policies.sql
...
20261028000003_composite_indexes.sql
20261028000004_decommission_legacy.sql
20261028000005_fix_worker_ensure_operations.sql
...
```

**New migrations** get timestamp at creation time (`supabase migration new`).

---

## Testing Migrations Locally

```bash
# 1. Reset local DB (applies all migrations)
supabase db reset

# 2. Check for errors
supabase db diff

# 3. Verify schema
supabase db dump --schema-only

# 4. Test with data
supabase db dump --data-only -f test_data.sql
```

---

## Common Patterns

### Adding a Column with Backfill

```sql
-- 1. Add column (nullable first)
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS current_version integer;

-- 2. Backfill existing rows
UPDATE public.projects
SET current_version = 1
WHERE current_version IS NULL;

-- 3. Make non-null (if needed)
ALTER TABLE public.projects
  ALTER COLUMN current_version SET NOT NULL;
```

### Adding a Partial Unique Index

```sql
-- One active sale per project
CREATE UNIQUE INDEX IF NOT EXISTS sales_log_active_project_key
  ON public.sales_log (project_id)
  WHERE project_id IS NOT NULL AND status = 'completed';
```

### Adding a Trigger

```sql
-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS table_updated_at ON public.my_table;
CREATE TRIGGER table_updated_at
  BEFORE UPDATE ON public.my_table
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

### Adding RLS Policy

```sql
-- Enable RLS
ALTER TABLE public.my_table ENABLE ROW LEVEL SECURITY;

-- Policy: users see own rows
CREATE POLICY my_table_user_access ON public.my_table
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Policy: admins see all
CREATE POLICY my_table_admin_access ON public.my_table
  FOR ALL TO authenticated
  USING (public.is_dearune_admin());
```

---

## Testing Checklist

Before pushing migration:

- [ ] `supabase db reset` passes locally
- [ ] `supabase db diff` shows expected changes
- [ ] No syntax errors in SQL
- [ ] All `IF NOT EXISTS` / `IF EXISTS` used
- [ ] Backfill handles NULLs correctly
- [ ] Indexes have `IF NOT EXISTS`
- [ ] RLS policies don't conflict
- [ ] Grants are appropriate

---

## Pushing to Production

```bash
# 1. Ensure local tests pass
npm run lint && npm run test && npm run build

# 2. Push migrations
supabase db push

# 3. Deploy edge functions if needed
supabase functions deploy --project-ref xwgegarncnxswiswsufx

# 3. Verify in Supabase Dashboard
# Dashboard → Database → Migrations
```

---

## Troubleshooting

### Migration Fails with "Relation Already Exists"

```sql
-- Use IF NOT EXISTS
CREATE TABLE IF NOT EXISTS ...
CREATE INDEX IF NOT EXISTS ...
CREATE FUNCTION IF NOT EXISTS ...
```

### Migration Fails with "Column Does Not Exist"

- Check migration order (dependencies first)
- Ensure column added in earlier migration
- Check spelling/case sensitivity

### Migration Fails with "Policy Already Exists"

```sql
DROP POLICY IF EXISTS policy_name ON table;
CREATE POLICY policy_name ON table ...;
```

### Rollback (Manual)

```bash
# Create reversal migration
supabase migration new revert_xxx

# Edit SQL to reverse changes
# e.g., DROP COLUMN, DROP INDEX, DROP FUNCTION

supabase db push
```

---

## Migration Checklist

Before committing:

- [ ] `supabase db reset` passes locally
- [ ] `supabase db diff` shows expected changes
- [ ] SQL is idempotent (`IF NOT EXISTS`)
- [ ] Backfill handles NULLs
- [ ] Indexes have `IF NOT EXISTS`
- [ ] RLS policies don't conflict
- [ ] Grants are appropriate
- [ ] Migration name is descriptive
- [ ] Timestamp is correct (current time)

---

> **Rule**: Never edit applied migrations. Always create new ones.