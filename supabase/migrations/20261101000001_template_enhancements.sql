-- Add public path, preview image, and template metadata fields to templates table
-- This migration enhances template management in the admin dashboard

-- 1. Add new columns to templates table
ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS public_path text,
  ADD COLUMN IF NOT EXISTS preview_image_url text,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS thumbnail_url text;

-- 2. Create unique index on public_path (nullable, but unique when present)
CREATE UNIQUE INDEX IF NOT EXISTS templates_public_path_unique 
  ON public.templates (public_path) 
  WHERE public_path IS NOT NULL;

-- 3. Add check constraint for public_path format
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'templates_public_path_format' 
    AND conrelid = 'public.templates'::regclass
  ) THEN
    ALTER TABLE public.templates
      ADD CONSTRAINT templates_public_path_format
      CHECK (public_path IS NULL OR public_path ~ '^[a-z][a-z0-9_-]{0,63}$');
  END IF;
END $$;

-- 4. Add display_name column - defaults to name if not set
UPDATE public.templates 
SET display_name = name 
WHERE display_name IS NULL;

ALTER TABLE public.templates
  ALTER COLUMN display_name SET DEFAULT '';

-- 5. Add updated_at trigger for new columns (already exists via set_updated_at trigger)

-- 6. Create RLS policy for admins to manage template images
-- The existing "admins_read_templates" and "admins_write_templates" policies
-- on the templates table already cover the new columns since they use SELECT/ALL

-- 7. Add comment for documentation
COMMENT ON COLUMN public.templates.public_path IS 'Public URL path for the template (e.g., memorial-message)';
COMMENT ON COLUMN public.templates.preview_image_url IS 'Storage path or URL for template preview image';
COMMENT ON COLUMN public.templates.display_name IS 'Display name shown in admin UI (separate from internal name)';
COMMENT ON COLUMN public.templates.thumbnail_url IS 'Thumbnail URL for template previews';

-- 8. Update the template_pricing table to support future template-specific pricing
-- (already exists as legacy, kept for backward compatibility)

-- Note: We do NOT add a DELETE policy or deletion mechanism as per requirements.
-- Templates should only be soft-deleted via deleted_at if needed.