-- Designer media storage (Phase C).
--
-- Designers pin photographs and a voice onto their drafts before any order
-- exists. Those bytes need a private home that never hands the service-role
-- key to the browser. This migration:
--   1. adds a storage-provider switch to app_settings,
--   2. materialises the private 'designer-drafts' bucket — deliberately left
--      with NO storage policies so the platform default-deny for
--      anon/authenticated is exactly what protects it. Every object touches
--      the storage layer through the designer-media edge function, which
--      writes with the service-role client and derives the object name from
--      the designer JWT.
--   3. registers the Memorial Message paper so the pipeline can publish it.

-- 1) Storage-provider switch ------------------------------------------------
alter table public.app_settings
  add column if not exists storage_provider text not null default 'supabase'
    check (storage_provider in ('supabase', 'google_drive'));

-- 2) Private designer drafts bucket ------------------------------------------
-- 64 MB cap covers the 20 MB photo / 60 MB audio limits and then some.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'designer-drafts',
  'designer-drafts',
  false,
  64 * 1024 * 1024,
  array['image/*', 'audio/*']::text[]
)
on conflict (id) do nothing;

-- 3) The Memorial Message paper ----------------------------------------------
insert into public.templates (id, name, slug, description, image_url, print_config, enabled, sort_order)
values (
  '10000000-0000-0000-0000-000000000004',
  'The Memorial Message',
  'memorial-message',
  'A single handwritten page for someone kept close: three pinned prints and a voice, sealed by a word only they will say.',
  'templates/memorial-message.png',
  '{"page":{"width":595.28,"height":841.89},"margin":56,"qr":{"x":0.78,"y":0.9,"size":0.12},"heading":{"fontSize":28},"body":{"fontSize":13.5,"lineHeight":1.65},"signature":{"fontSize":15},"seal":{"enabled":false},"watermark":{"enabled":true,"text":"Dearune"}}'::jsonb,
  true,
  4
)
on conflict (id) do nothing;

insert into public.template_pricing (template_id, wrapper_type, price, cost)
values
  ('10000000-0000-0000-0000-000000000004', 'digital', 12.00, 0.00),
  ('10000000-0000-0000-0000-000000000004', 'open_letter', 18.00, 4.00),
  ('10000000-0000-0000-0000-000000000004', 'sealed_letter', 26.00, 7.50),
  ('10000000-0000-0000-0000-000000000004', 'open_card', 16.00, 3.60)
on conflict (template_id, wrapper_type) do nothing;