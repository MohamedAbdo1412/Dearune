-- ============================================================================
-- Worker permissions: add milestone permissions, replace status update
-- ============================================================================

-- Insert new permissions
insert into public.permissions (id, module, label, summary, description, sort_order, sensitive)
values
  ('operations.mark_sold', 'operations', 'Mark as sold', 'Sold', 'Mark a Dearune/unit as sold (milestone).', 25, false),
  ('operations.mark_manufactured', 'operations', 'Mark manufactured/completed', 'Manufactured', 'Record manufacturing completion milestone.', 26, false),
  ('operations.mark_shipped', 'operations', 'Mark shipped', 'Shipped', 'Record shipment milestone.', 27, false),
  ('operations.mark_delivered', 'operations', 'Mark delivered', 'Delivered', 'Record delivery milestone.', 28, false)
on conflict (id) do update set
  module = excluded.module,
  label = excluded.label,
  summary = excluded.summary,
  description = excluded.description,
  sort_order = excluded.sort_order;

-- Remove old generic status update permission from assignments (if exists)
delete from public.worker_permissions where permission_id = 'operations.update_status';
delete from public.permissions where id = 'operations.update_status';

-- Update descriptions
update public.permissions 
set description = 'View the production line and milestone details. Never exposes prices or costs.'
where id = 'operations.view';
update public.permissions 
set description = 'Edit notes, contact details and permitted milestones.'
where id = 'operations.edit';
update public.permissions 
set description = 'View full unit details and history.'
where id = 'operations.view_details';
update public.permissions 
set description = 'Export operational lists (safe columns only).'
where id = 'operations.export';
update public.permissions 
set description = 'Print QR/paper packets.'
where id = 'operations.print';
update public.permissions 
set description = 'Archive or restore units.'
where id = 'operations.archive';
update public.permissions 
set description = 'Create or expand physical units for sold Dearunes.'
where id = 'operations.create_units';
