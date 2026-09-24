-- Designer pipeline: policy acceptance, two-year lifetime, draft unlock secret.
--
-- 1. `designers.draft_secret` — a random per-designer secret. It is minted on
--    first successful login and returned ONLY to that authenticated designer.
--    The browser derives this designer's local-draft AES-GCM key from it and
--    keeps the key in memory; the secret is never written to the device.
--    Because only the matching account's secret can derive the key, one
--    designer can never decrypt another's local drafts on a shared machine.
--
-- 2. Policy acceptance on every submitted project (`policy_version` +
--    `policies_accepted_at`). A later policy change never rewrites what an
--    older submission actually agreed to.
--
-- 3. Two-year availability measured from FIRST ACTIVATION only. The clock
--    starts at `first_activated_at` (never submission/manufacture/shipping),
--    and `expires_at` is derived from it, never stored, so temporarily
--    deactivating and reactivating a message cannot reset the window.
--    `message_active` tracks whether the message is currently switched on
--    (an admin may deactivate before expiry); expiry is independent of it.

alter table public.designers
  add column if not exists draft_secret text;

alter table public.projects
  add column if not exists policy_version       text not null default '',
  add column if not exists policies_accepted_at timestamptz,
  add column if not exists first_activated_at   timestamptz,
  add column if not exists message_active       boolean not null default false;
