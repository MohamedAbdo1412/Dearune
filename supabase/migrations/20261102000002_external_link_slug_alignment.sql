-- ---------------------------------------------------------------------------
-- Align the External Link To Dearune paper with the book that draws it
-- ---------------------------------------------------------------------------
-- Create turns a paper's pages by the CODE the archive stores in
-- `templates.slug` (TEMPLATE_SEQUENCES in `src/templates/stages.js`): the
-- paper `external-link` opens `external.link` → `external.preview` → wrapper →
-- close → terms. A row stored under any other spelling has no book to open, so
-- the chooser stamps the card "being bound" and the pen lands on the
-- placeholder page - which is exactly the symptom this migration removes.
--
-- The Admin Templates editor deliberately does not expose `slug` (it is the
-- paper's code, not its merchandising; the customer-visible `public_path` is
-- what the admin edits), and the Create form derives a slug from the name, so a
-- row created as "External Link To Dearune" can be stored as
-- `external-link-to-dearune`. The alignment therefore belongs here, once.
--
-- Idempotent and conservative:
--   * only the row whose name / display name / public path / normalised slug
--     identifies it as this paper is touched, and only when its code is not
--     already `external-link`;
--   * nothing happens if an `external-link` row already exists (live or
--     soft-deleted) - the UNIQUE index on `slug` would refuse the rename, and
--     two candidate rows are a human decision, not a migration's;
--   * `public_path` is deliberately left alone: preview images live under
--     `templates/<public_path>/` and renaming a storage folder is not this
--     migration's business;
--   * projects started under the old spelling follow the paper so an
--     in-progress draft keeps its page instead of falling back to "choose the
--     paper". Their payload is untouched - only the code column moves.
-- ---------------------------------------------------------------------------

do $$
declare
  paper_id uuid;
  old_slug text;
begin
  if exists (select 1 from public.templates where slug = 'external-link') then
    raise notice 'templates.slug = ''external-link'' already exists; nothing to align';
    return;
  end if;

  -- The paper, whatever spelling the archive happens to carry. Deterministic:
  -- the oldest matching row wins, so re-running can never flip-flop.
  select t.id, t.slug
    into paper_id, old_slug
  from public.templates t
  where t.deleted_at is null
    and (
      -- the name the admin typed (spacing/case forgiven)
      btrim(regexp_replace(lower(coalesce(t.name, '')), '\s+', ' ', 'g')) = 'external link to dearune'
      or btrim(regexp_replace(lower(coalesce(t.display_name, '')), '\s+', ' ', 'g')) = 'external link to dearune'
      -- the public path an admin can edit, in either spelling
      or t.public_path in ('external-link', 'external-link-to-dearune')
      -- any punctuation spelling of the code: external_link, External Link, …
      or regexp_replace(lower(t.slug), '[^a-z0-9]+', '-', 'g') in (
        'external-link',
        'external-link-to-dearune'
      )
    )
  order by t.created_at asc
  limit 1;

  if paper_id is null then
    raise notice 'no External Link To Dearune paper to align';
    return;
  end if;

  update public.templates
     set slug = 'external-link',
         updated_at = now()
   where id = paper_id;

  update public.projects
     set template_slug = 'external-link'
   where template_slug = old_slug;

  raise notice 'aligned template % from slug % to external-link', paper_id, old_slug;
end
$$;
