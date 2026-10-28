-- Add thumbnail support for wrapper images (backward compatible)
alter table public.wrapper_types
  add column if not exists thumbnail_url text not null default '';

comment on column public.wrapper_types.thumbnail_url is 'Storage path or URL for optimized thumbnail; empty means use image_url';
