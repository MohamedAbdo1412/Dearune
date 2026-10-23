-- Forward-only: remove inert "delete" permissions.
--
-- The admin workspace has no delete capability for Operations units or
-- Designers: units are archived and designer access is revoked. Exposing a
-- delete switch to workers would therefore promise a capability that neither
-- dashboard implements. These rows were added in
-- 20261023000005_extend_worker_permissions.sql and were never enforced by any
-- RPC, so removing the grants and catalogue rows changes no working behaviour.
delete from public.worker_permissions
where permission_id in ('operations.delete', 'designers.delete');

delete from public.permissions
where id in ('operations.delete', 'designers.delete');
