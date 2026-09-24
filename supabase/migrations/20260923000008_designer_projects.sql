-- Designer projects: the handed-over Dearune books.
--
-- A project is the server-side record of a completed book a designer wrote
-- through the book pipeline. The project identity is distinct from the
-- designer identity: one designer may hold many projects, and a project's
-- letter (payload) is permanently read-only — the designer can never update
-- it after submission, and the client can never reach it through PostgREST.
--
-- Media inside `payload` are REFERENCES to the designer's own drafts in the
-- private bucket (paths are prefixed with the designer id by the
-- designer-media function); the bytes stay in one place and are resolved
-- through the same function when the project is read.

create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  designer_id   uuid not null references public.designers(id) on delete cascade,
  template_slug text not null,
  title         text not null default '',
  status        text not null default 'submitted' check (status in ('submitted', 'delivered', 'archived')),
  public_id     text not null unique default encode(gen_random_bytes(12), 'hex'),
  payload       jsonb not null default '{}'::jsonb,
  submitted_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.projects enable row level security;

-- Only the service-role client inside Edge Functions talks to this table.
-- Designers are not Postgres roles, so there is no role to grant; lock the
-- table down from the public API entirely.
revoke all on table public.projects from anon, authenticated;

create index projects_designer_created_idx on public.projects (designer_id, created_at desc);

create trigger projects_set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();