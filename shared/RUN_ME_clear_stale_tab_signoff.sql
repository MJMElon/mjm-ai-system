-- =====================================================================
--  A TAB SIGNED OFF AS A WHOLE, WHICH NOBODY MEANS ANY MORE
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  Safe to run twice: the second run finds nothing to remove and says so.
--
--  WHY THIS EXISTS
--  A report tab can be signed off in two ways: row by row, or the whole
--  tab at once. The whole-tab signature covers every row on it — so a
--  batch whose 3rd Culling was verified as a whole stays Complete no
--  matter which single row's sign-off is taken back. The row reads
--  unverified and the batch list still calls it done.
--
--  The app no longer leaves it that way: taking back a row's sign-off
--  now takes the tab's with it. But a whole-tab signature written BEFORE
--  that change is still sitting in the database, and this is what clears
--  it.
--
--  Change the batch number and the tab on the next two lines if needed.
--  Tabs: seeds_in, planting, transplanting, cull_1, cull_2, cull_3
-- =====================================================================
WITH params AS (
  SELECT '230'::TEXT  AS batch,
         'cull_3'::TEXT AS tab
),

/* What is there before anything is touched. Counted now, because the
   delete below is in the same statement and would otherwise answer
   about the world it has already changed. */
before AS (
  SELECT COUNT(*) AS n
  FROM operation_batch_verifications v, params p
  WHERE v.batch_name = p.batch AND v.stage = p.tab
),

/* The row sign-offs on that tab, which are NOT touched. Only the
   whole-tab signature is being withdrawn; who signed which plot stays
   exactly as it is. */
rows_signed AS (
  SELECT COUNT(*) AS n
  FROM shared_inventory_logs l, params p
  WHERE l.batch_name = p.batch
    AND l.transaction_type = 'Row_Verification'
    AND l.plot_name LIKE p.tab || '::%'
),

removed AS (
  DELETE FROM operation_batch_verifications v
  USING params p
  WHERE v.batch_name = p.batch AND v.stage = p.tab
  RETURNING v.batch_name
)

/* ONE result set — the SQL Editor only shows the last statement's. */
SELECT (SELECT batch FROM params)                       AS batch,
       (SELECT tab   FROM params)                       AS tab,
       (SELECT n FROM before)                           AS whole_tab_signature_before,
       (SELECT COUNT(*) FROM removed)                   AS removed,
       (SELECT n FROM rows_signed)                      AS row_signoffs_kept,
       CASE WHEN (SELECT n FROM before) = 0
            THEN 'Nothing to remove — this tab was not signed off as a whole. '
                 || 'If the batch is still in Completed, the reason is something '
                 || 'else: run CHECK_batch_not_completed.sql for this batch.'
            ELSE 'Removed. The tab is back to Pending Verification and each plot '
                 || 'now stands on its own sign-off. Re-open the batch to see it.'
       END                                              AS result;

-- WHAT A GOOD RESULT LOOKS LIKE
--   One row. whole_tab_signature_before is 1 and removed is 1, and the
--   result column says "Removed."
--
--   row_signoffs_kept is how many plots keep their own signature — this
--   file does not touch those. Every plot still needs one before the
--   batch counts as Completed again.
--
--   Run it a second time and whole_tab_signature_before is 0, removed is
--   0, and it says there was nothing to remove. That is the file being
--   safe to run twice, not a failure.
