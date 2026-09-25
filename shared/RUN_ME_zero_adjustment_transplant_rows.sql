-- =====================================================================
--  A TRANSPLANTING ROW WRITTEN BY AN ADJUSTMENT HOLDS NOUGHT
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  Safe to run twice: the second run finds nothing left and says so.
--  No regular expressions and no backslashes, so it survives a paste.
--
--  WHAT THIS IS ABOUT
--  When an adjustment is raised on a plot that has no transplanting
--  record at all, approving it writes that record. B8 is the example:
--  +140 raised against Transplanting, and no transplant row to hang it
--  on.
--
--  The row it writes must carry a quantity of NOUGHT. Nobody keyed a
--  transplant into that plot -- that is exactly why it had no record.
--  What put the seedlings there is the adjustment, so the adjustment is
--  where the figure belongs:
--
--      Qty 0   Adjustment +140   Final 140
--
--  The first rows written carried the quantity instead, so the plot read
--
--      Qty 140   Adjustment +140   Final 280
--
--  -- the same 140 counted twice, and Total Transplanted too high by it.
--  The app writes 0 now. This corrects the ones already saved.
--
--  WHAT IT TOUCHES
--  ONLY rows this system wrote from an adjustment: transaction_type
--  'Transplanted' whose remark carries "FromAdjustment:", which nothing
--  else writes. A transplanting row somebody keyed by hand has no such
--  marker and is never touched, whatever its quantity.
--
--  Every batch, not just the one that was noticed.
-- =====================================================================

-- What is there before, so the change can be read against it.
DROP TABLE IF EXISTS _mjm_adjrow_before;
CREATE TABLE _mjm_adjrow_before AS
SELECT id, batch_name, plot_name, quantity_change
FROM shared_inventory_logs
WHERE transaction_type = 'Transplanted'
  AND position('FromAdjustment:' in COALESCE(remark, '')) > 0
  AND COALESCE(quantity_change, 0) <> 0;

UPDATE shared_inventory_logs
   SET quantity_change = 0
 WHERE transaction_type = 'Transplanted'
   AND position('FromAdjustment:' in COALESCE(remark, '')) > 0
   AND COALESCE(quantity_change, 0) <> 0;

-- ONE result set -- the SQL Editor only shows the last statement's.
SELECT 0                                                       AS sort,
       'ROWS WRITTEN BY AN ADJUSTMENT'::text                    AS place,
       (SELECT count(*) FROM _mjm_adjrow_before)::int           AS rows_corrected,
       (SELECT COALESCE(sum(quantity_change), 0) FROM _mjm_adjrow_before)::int AS qty_taken_out,
       CASE
         WHEN (SELECT count(*) FROM _mjm_adjrow_before) = 0
           THEN 'Nothing to correct -- every transplanting row written by an '
                || 'adjustment already holds nought. This is the right answer on '
                || 'a second run.'
         ELSE 'Done. Open each batch below: the plot now reads Qty 0, Adjustment '
              || 'the same figure as before, Final unchanged -- and Total '
              || 'Transplanted has come down by qty_taken_out, which it was over '
              || 'by.'
       END                                                      AS result
UNION ALL
SELECT 1,
       'Batch ' || COALESCE(batch_name, '?') || ' - plot ' || COALESCE(plot_name, '?'),
       1,
       quantity_change,
       'was ' || quantity_change || ', now 0 -- its Adjustment column is unchanged'
FROM _mjm_adjrow_before
ORDER BY sort, place;

-- WHAT A GOOD RESULT LOOKS LIKE
--   A first row saying "Done.", rows_corrected being how many were wrong
--   and qty_taken_out the total that was being counted twice.
--
--   Under it one line per row, naming its batch and plot and what it
--   held. Open one: the plot reads Qty 0, the Adjustment column reads
--   what it always did, Final is the same as before, and Total
--   Transplanted has dropped by exactly qty_taken_out.
--
--   FINAL MUST NOT CHANGE. If a plot's Final figure moves, stop and send
--   the batch back -- that would mean the adjustment beside it is not
--   the one that wrote the row.
--
--   A SECOND run says "Nothing to correct". So does a first run if the
--   app already wrote them all as nought.
--
--   Afterwards, DROP TABLE _mjm_adjrow_before; tidies up.
