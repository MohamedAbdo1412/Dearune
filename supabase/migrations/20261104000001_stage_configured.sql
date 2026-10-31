-- ============================================================================
-- One milestone, step 1 of 2: `configured` becomes the first stage
-- ============================================================================
--
-- A Dearune exists before anything is sold. Until now `projects.milestone` was
-- NULL in that state, which forced every screen to invent its own "configured"
-- answer. NULL is not a stage: it is the absence of an answer.
--
-- PostgreSQL refuses to USE a new enum value in the transaction that adds it,
-- so the two new values are added in their own migration files, one
-- transaction each, before the migration that relies on them.
--
--   configured → sold → making → shipping → delivery → delivered → after_sale
--
-- `BEFORE 'making'` is what keeps the enum's own sort order equal to the
-- lifecycle order, so `milestone >= 'sold'` is a valid, index-friendly filter.
-- ============================================================================

alter type public.dearune_milestone add value if not exists 'configured' before 'making';
