-- ============================================================================
-- Add current_version to templates table
-- ============================================================================
-- Persist the active template version in the database instead of only localStorage.
-- ============================================================================

alter table public.templates
  add column if not exists current_version integer not null default 1;

comment on column public.templates.current_version is
  'The currently active version number for this template. Defaults to 1.';

-- Backfill existing templates
update public.templates set current_version = 1 where current_version is null;