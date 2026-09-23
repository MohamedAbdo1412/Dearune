-- Enable RLS on admin_users.
-- The Dearest app never reads this table through the Data (REST) API as
-- anon/authenticated: admin checks happen inside Edge Functions with the
-- service-role client (adminClient), which bypasses RLS. Enabling RLS here
-- with no policies therefore blocks anon/authenticated REST access entirely
-- (e.g. reading admin e-mail addresses) without affecting the functions.
alter table public.admin_users enable row level security;