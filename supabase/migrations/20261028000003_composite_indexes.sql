-- ============================================================================
-- Composite indexes for query performance
-- ============================================================================
-- Added to support common query patterns in admin and worker dashboards.
-- ============================================================================

-- physical_products: common filters by project + status + archived
create index if not exists physical_products_project_status_idx
  on public.physical_products (project_id, status)
  where archived_at is null;

create index if not exists physical_products_project_milestone_idx
  on public.physical_products (project_id, manufacturing_completed_at, shipped_at, delivered_at, sold_at)
  where archived_at is null;

-- sold_orders: common filters by project + status + date range
create index if not exists sold_orders_project_status_idx
  on public.sold_orders (project_id, status, sold_at desc);

create index if not exists sold_orders_designer_status_idx
  on public.sold_orders (designer_id, status, sold_at desc)
  where status = 'completed';

-- projects: common filters by designer + status + payment + date range
create index if not exists projects_designer_status_idx
  on public.projects (designer_id, status, paid_at desc)
  where archived_at is null;

create index if not exists projects_template_status_idx
  on public.projects (template_slug, status, paid_at desc)
  where archived_at is null;

create index if not exists projects_payment_status_idx
  on public.projects (paid_at desc, status)
  where archived_at is null and paid_at is not null;

-- For worker queries: active projects with milestones
create index if not exists projects_worker_active_idx
  on public.projects (paid_at, manufactured_at, shipped_at, arrived_at)
  where archived_at is null and paid_at is not null;

-- physical_product_events: common query by product + time
create index if not exists physical_product_events_product_time_idx
  on public.physical_product_events (physical_product_id, created_at desc);

-- project_events: common query by project + time
create index if not exists project_events_project_time_idx
  on public.project_events (project_id, created_at desc);

-- admin_audit_log: common query by actor + time
create index if not exists admin_audit_log_actor_time_idx
  on public.admin_audit_log (actor_id, created_at desc);

-- worker_audit_logs: common query by worker + time
create index if not exists worker_audit_logs_worker_time_idx
  on public.worker_audit_logs (worker_id, created_at desc);