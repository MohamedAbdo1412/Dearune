create extension if not exists "pgcrypto";

create table if not exists public.admin_users (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.designers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  passcode_hash text not null,
  created_by uuid references public.admin_users (id) on delete set null,
  last_login_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists designers_created_by_idx on public.designers (created_by);

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  image_url text,
  print_config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists templates_deleted_at_idx on public.templates (deleted_at);

create table if not exists public.template_pricing (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates (id) on delete cascade,
  wrapper_type text not null,
  price numeric(10, 2) not null check (price >= 0),
  cost numeric(10, 2) not null default 0 check (cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, wrapper_type)
);
create index if not exists template_pricing_template_id_idx on public.template_pricing (template_id);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates (id),
  designer_id uuid references public.designers (id) on delete set null,
  wrapper_type text not null,
  snapshot_price numeric(10, 2) not null check (snapshot_price >= 0),
  estimated_cost numeric(10, 2) not null default 0 check (estimated_cost >= 0),
  currency text not null default 'GBP',
  customer_first_name text,
  customer_last_name text,
  customer_email text,
  customer_phone text,
  recipient_name text not null,
  occasion text,
  event_date date,
  recipient_message text,
  notes text,
  paid_at timestamptz,
  manufactured_at timestamptz,
  shipped_at timestamptz,
  arrived_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (
    wrapper_type in ('digital', 'open_letter', 'sealed_letter', 'open_card')
  )
);
create index if not exists orders_template_id_idx on public.orders (template_id);
create index if not exists orders_designer_id_idx on public.orders (designer_id);
create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_paid_at_idx on public.orders (paid_at);
create index if not exists orders_deleted_at_idx on public.orders (deleted_at);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  public_id text not null unique,
  headline text,
  body text,
  signature text,
  font_family text,
  layout jsonb not null default '{}'::jsonb,
  editor_state jsonb not null default '{}'::jsonb,
  qr_token_hash text,
  preview_rendered_at timestamptz,
  published_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists messages_published_at_idx on public.messages (published_at);
create index if not exists messages_created_at_idx on public.messages (created_at desc);

create table if not exists public.message_media (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  kind text not null check (kind in ('image', 'file', 'audio')),
  bucket text not null default 'gift-files',
  r2_key text not null,
  content_type text,
  size_bytes bigint,
  original_name text,
  position integer not null default 0,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (message_id, position)
);
create index if not exists message_media_message_id_idx on public.message_media (message_id);

create table if not exists public.shipping (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  recipient_name text,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  state_province text,
  postal_code text not null,
  country text not null,
  phone text,
  provider text,
  tracking_code text,
  tracking_url text,
  label_media jsonb not null default '{}'::jsonb,
  special_instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shipping_country_idx on public.shipping (country);

create table if not exists public.app_settings (
  id integer primary key default 1 check (id = 1),
  maintenance_mode boolean not null default false,
  allow_new_orders boolean not null default true,
  business_name text not null default 'Dearune',
  currency text not null default 'GBP',
  updated_at timestamptz not null default now()
);

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  actor_type text not null check (actor_type in ('admin', 'designer', 'system', 'customer')),
  actor_id uuid,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists order_events_order_id_idx on public.order_events (order_id, created_at desc);
create index if not exists order_events_actor_id_idx on public.order_events (actor_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

alter table public.designers enable row level security;
alter table public.templates enable row level security;
alter table public.template_pricing enable row level security;
alter table public.orders enable row level security;
alter table public.messages enable row level security;
alter table public.message_media enable row level security;
alter table public.shipping enable row level security;
alter table public.app_settings enable row level security;
alter table public.order_events enable row level security;