-- The paper version a project was closed under. Evolving a template later must
-- never rewrite what an earlier submission snapshotted, so every row carries the
-- version it was drawn at. Existing submissions predate versioning: they were
-- all set on the first cut, so they take v1.
alter table public.projects
  add column if not exists template_version integer not null default 1;

-- Early builds persisted the closed draft through JSON.stringify, which
-- PostgREST stores inside the jsonb column as a JSON *string* scalar rather than
-- an object. A read of those rows came back as a string and the read-only view
-- discarded it, falling back to the paper's defaults — the "sample" look. Fold
-- each such string back into a real object (it is exactly what the designer
-- sealed), and leave the rare unparseable scalar alone for the frontend to
-- report honestly.
do $$
declare
  row_record record;
  parsed jsonb;
begin
  for row_record in
    select id, payload from public.projects where jsonb_typeof(payload) = 'string'
  loop
    begin
      parsed := (row_record.payload #>> '{}')::jsonb;
      if jsonb_typeof(parsed) = 'object' then
        update public.projects set payload = parsed where id = row_record.id;
      end if;
    exception when others then
      -- Not valid JSON: keep the scalar; the frontend will surface a real
      -- "could not be read" state instead of a fabricated design.
      null;
    end;
  end loop;
end
$$;