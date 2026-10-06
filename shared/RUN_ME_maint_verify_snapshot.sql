-- Work Maintenance's "Verify & lock" used to only stop edits made ON the
-- payroll screen itself (calibration, Sync). The figures it showed were
-- always read live off Worker Record's own records and ticks, with nothing
-- checking the lock at all — so a claim marked "Verified" could still move
-- under the signature if somebody ticked a different worker afterward.
--
-- This adds the column the app now writes a snapshot into at the moment of
-- verifying (everyone's capacity and money, the whole-job totals, the rate
-- in force) and reads back from while the sheet stays locked, instead of
-- recomputing those figures from Worker Record every time the page loads.
-- Unlocking a sheet deletes its verification row as it always has, which
-- takes the snapshot with it and goes back to reading live.

ALTER TABLE public.mjmnpayroll_verifications
  ADD COLUMN IF NOT EXISTS snapshot JSONB;

NOTIFY pgrst, 'reload schema';

-- Check: every current verification, and whether it carries a snapshot yet.
-- A row verified before this ran has none (snapshot is null) and keeps
-- reading Worker Record live until it is unlocked and re-verified — that is
-- expected, not a fault. Only a NEW "Verify & lock" writes one.
SELECT month, sheet, scope, verified_by, verified_at,
       (snapshot IS NOT NULL) AS has_snapshot
FROM public.mjmnpayroll_verifications
ORDER BY month DESC, sheet, scope;
