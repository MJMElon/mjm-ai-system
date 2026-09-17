-- =====================================================================
--  WHOLE-TAB SIGN-OFFS NOBODY MEANS ANY MORE — EVERY BATCH AT ONCE
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  Safe to run twice: the second run finds nothing to remove and says so.
--
--  WHY THIS EXISTS
--  A report tab can be signed off two ways: row by row, or the whole tab
--  at once. The whole-tab signature covers every row on it — so a batch
--  whose 3rd Culling was verified as a whole stays Complete no matter
--  which single row's sign-off is taken back. The row reads unverified
--  and the batch list still calls it done.
--
--  The app no longer leaves it that way: taking back a row's sign-off
--  now takes the tab's with it. But whole-tab signatures written BEFORE
--  that change are still in the database, on every batch they were
--  pressed on, and this clears all of them in one go.
--
--  WHAT COUNTS AS STALE — and nothing else is touched:
--    the batch has a whole-tab 3rd Culling signature, AND
--    at least one plot on it HAS its own row sign-off  (so the tab is
--      being verified plot by plot, not in one press), AND
--    at least one plot on it has NO row sign-off       (so the whole-tab
--      signature is the only thing calling that plot checked).
--
--  A batch signed off in one press and never touched plot by plot keeps
--  its signature. A batch whose every plot is signed keeps it too —
--  there is no gap for it to paper over.
-- =====================================================================
WITH

/* Every plot a batch has to account for: transplanted into (Premium Care
   is a holding tray and is never 3rd-culled), plus transferred into. */
expected AS (
  SELECT batch_name, UPPER(TRIM(plot_name)) AS plot
  FROM shared_inventory_logs
  WHERE transaction_type IN ('Transplanted', 'Transplanted_DoubleTone')
    AND COALESCE(TRIM(plot_name), '') <> ''
  UNION
  SELECT batch_name, UPPER(TRIM(plot_name))
  FROM shared_inventory_logs
  WHERE transaction_type = 'Cull3_Transfer'
    AND COALESCE(TRIM(plot_name), '') <> ''
),

/* Row sign-offs. plot_name is 'cull_3::<PLOT>|<dest>'; only the plot is
   matched, because which dest type the tab merged the row under has
   nothing to do with whether somebody looked at the plot. */
row_signed AS (
  SELECT DISTINCT batch_name,
         UPPER(TRIM(SPLIT_PART(SUBSTRING(plot_name FROM 'cull_3::(.*)$'), '|', 1))) AS plot
  FROM shared_inventory_logs
  WHERE transaction_type = 'Row_Verification'
    AND plot_name LIKE 'cull\_3::%'
),

per_batch AS (
  SELECT e.batch_name,
         COUNT(*)                                        AS plots,
         COUNT(*) FILTER (WHERE r.plot IS NOT NULL)      AS plots_signed,
         COUNT(*) FILTER (WHERE r.plot IS NULL)          AS plots_unsigned
  FROM expected e
  LEFT JOIN row_signed r
    ON r.batch_name = e.batch_name AND r.plot = e.plot
  GROUP BY 1
),

stale AS (
  SELECT v.batch_name, b.plots, b.plots_signed, b.plots_unsigned
  FROM operation_batch_verifications v
  JOIN per_batch b ON b.batch_name = v.batch_name
  WHERE v.stage = 'cull_3'
    AND b.plots_signed   > 0     -- verified plot by plot
    AND b.plots_unsigned > 0     -- …with a gap the whole-tab signature covers
),

/* Counted before the delete below changes the world it is answering
   about, and the names kept so the result can list them. */
before AS (
  SELECT COUNT(*) AS n,
         LEFT(STRING_AGG(batch_name, ', ' ORDER BY batch_name), 200) AS names
  FROM stale
),

removed AS (
  DELETE FROM operation_batch_verifications v
  USING stale s
  WHERE v.batch_name = s.batch_name AND v.stage = 'cull_3'
  RETURNING v.batch_name
),

/* Whole-tab signatures left alone, so the result says what it did NOT
   do as well as what it did. */
kept AS (
  SELECT COUNT(*) AS n
  FROM operation_batch_verifications v
  WHERE v.stage = 'cull_3'
    AND v.batch_name NOT IN (SELECT batch_name FROM stale)
)

/* ONE result set — the SQL Editor only shows the last statement's. */
SELECT (SELECT n FROM before)                    AS batches_stale,
       (SELECT COUNT(*) FROM removed)            AS signatures_removed,
       (SELECT names FROM before)                AS batches,
       (SELECT n FROM kept)                      AS signatures_kept,
       CASE WHEN (SELECT n FROM before) = 0
            THEN 'Nothing to remove. No batch has a whole-tab 3rd Culling '
                 || 'signature papering over a plot that nobody signed. If a '
                 || 'batch is still in Completed when you think it should not '
                 || 'be, run CHECK_batch_not_completed.sql for it.'
            ELSE 'Removed. Those batches are back to Pending Verification on '
                 || '3rd Culling, and each plot now stands on its own '
                 || 'sign-off. Their row sign-offs were NOT touched.'
       END                                       AS result;

-- WHAT A GOOD RESULT LOOKS LIKE
--   One row. batches_stale equals signatures_removed, and batches names
--   the ones that changed.
--
--   signatures_kept is the whole-tab signatures deliberately left alone:
--   batches signed off in one press and never touched plot by plot, and
--   batches where every plot is signed anyway.
--
--   Run it a second time and batches_stale is 0 with the "Nothing to
--   remove" wording. That is the file being safe to run twice, not a
--   failure.
