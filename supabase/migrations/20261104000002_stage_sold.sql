-- ============================================================================
-- One milestone, step 2 of 2: `sold` separates the sale from production
-- ============================================================================
--
-- "Paid" and "in the workshop" were the same stage because there was no stage
-- between them. That made a sold-but-not-yet-produced Dearune look like it was
-- already being manufactured, and left the Designer screen and the Operations
-- screen with no shared word for it.
--
-- `sold` is that word. It is written by the same transition function as every
-- other stage, and a physical order enters Making from it — never from NULL.
--
-- Added in its own file for the same reason as `configured`: a new enum value
-- cannot be used in the transaction that adds it.
-- ============================================================================

alter type public.dearune_milestone add value if not exists 'sold' before 'making';
