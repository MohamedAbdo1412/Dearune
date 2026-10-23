-- Forward-only: extend permissions for finer Operations/Designers control
insert into public.permissions (id, module, label, description, sensitive, sort_order) values
  ('operations.view_details', 'operations', 'View full details',
   'View the full detail panel, timeline events and related delivery/designer information for a unit.', false, 12),
  ('operations.assign', 'operations', 'Assign designer',
   'Change the designer attached to a unit/Dearune.', false, 45),
  ('operations.print', 'operations', 'Print production labels',
   'Access printing and production label generation for units.', false, 55),
  ('operations.export', 'operations', 'Export operations data',
   'Export operations lists and related data where available.', false, 58),
  ('operations.delete', 'operations', 'Delete operations records',
   'Remove or delete operations records when allowed by business rules.', false, 60),

  ('designers.view_details', 'designers', 'View designer details',
   'View full designer details, history and related Dearunes.', false, 112),
  ('designers.assign', 'designers', 'Assign designers',
   'Assign or reassign designers to Dearunes/units.', false, 135),
  ('designers.delete', 'designers', 'Delete designers',
   'Delete designer records when allowed by business rules.', false, 145),
  ('designers.export', 'designers', 'Export designers data',
   'Export designer lists and related data where available.', false, 148)
on conflict (id) do update set
  module = excluded.module,
  label = excluded.label,
  description = excluded.description,
  sensitive = excluded.sensitive,
  sort_order = excluded.sort_order;
