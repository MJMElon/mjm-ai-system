-- =====================================================================
--  WHICH CALIBRATIONS CORRECT THE SEED COUNT, AND WHAT THEY MOVE
--  Paste into the Supabase SQL Editor and press Run. Read-only: it
--  changes nothing, so it is safe to run as often as you like.
--
--  Life of Seedlings Balance is what is STANDING IN THE FIELD:
--
--    transplant qty - 3rd culling - total sales
--      + approved stock calibration
--
--  and that last term is the PLOT-side calibrations only.
--
--  A calibration reported against Seeds Received, Planting or a Seed
--  Audit corrects the SEED count: the batch total, what went into the
--  tray. Those seedlings never reached a field plot, so taking them
--  off what is standing in one subtracts a loss from a figure that
--  never contained it. Batch 230 is the one this was raised on: minus
--  1,000 against Planting, "Sold out 1,000 Pre nursery seedlings",
--  on a batch that balanced to nought on its own three terms and
--  read MINUS 1,000.
--
--  Everything else is the plot side and still counts in the Balance.
--  An unapproved calibration counts for nothing either way.
--
--  The side is the REPORT, never the plot the row names and never the
--  Side written in the remark: rows written while the form still
--  asked carry one, and a row filed on the wrong side has to correct
--  itself. That is ADJUST_SIDE_OF on the batch detail page.
--
--  WHAT A GOOD RESULT LOOKS LIKE
--    The ALL row first with the totals, then one row per batch that
--    has an approved calibration.
--
--    seed_side      the part that corrects the seed count. OUT of the
--                   Balance from now on.
--    plot_side      the part that corrects what is standing. Still in.
--    waiting        keyed but nobody has approved it. In neither.
--    balance_moves  how much that batch Balance changes, which is
--                   minus the seed-side amount. A batch reading 0 here
--                   is unaffected.
--
--    The ALL row counts the batches that move. If a report wording
--    turns up that is none of the three seed-side names and none of
--    the cullings or transplanting either, it lands on the plot side
--    by default and is counted under other_reports, which is worth a
--    look before trusting the total.
-- =====================================================================
WITH cal AS (
  SELECT btrim(l.batch_name) AS batch_name,
         COALESCE(l.quantity_change, 0) AS qty,
         COALESCE(l.remark, '') LIKE '%[APPROVED by %' AS approved,
         lower(btrim(split_part(split_part(COALESCE(l.remark, ''), 'Report:', 2), '.', 1)))
           AS report
  FROM shared_inventory_logs l
  WHERE l.transaction_type = 'Stock_Calibration'
    AND COALESCE(btrim(l.batch_name), '') <> ''
),
sided AS (
  SELECT batch_name, qty, approved, report,
         report IN ('seeds received', 'planting', 'seed audit') AS seed_side,
         report IN ('transplanting', '1st culling', '2nd culling', '3rd culling')
           AS known_plot_side
  FROM cal
),
per_batch AS (
  SELECT batch_name,
         sum(qty) FILTER (WHERE approved AND seed_side)                AS seed_side,
         sum(qty) FILTER (WHERE approved AND NOT seed_side)            AS plot_side,
         sum(qty) FILTER (WHERE NOT approved)                          AS waiting,
         count(*) FILTER (WHERE approved AND NOT seed_side
                            AND NOT known_plot_side)                   AS other_reports
  FROM sided
  GROUP BY batch_name
)
SELECT batch, seed_side, plot_side, waiting, balance_moves, other_reports
FROM (
  SELECT 0 AS sort_first,
         0 AS sort_size,
         'ALL — ' || count(*) || ' batches with a calibration, '
           || count(*) FILTER (WHERE COALESCE(seed_side, 0) <> 0)
           || ' whose Balance moves, '
           || sum(other_reports) || ' row'
           || CASE WHEN sum(other_reports) = 1 THEN '' ELSE 's' END
           || ' under a report name nobody listed'                     AS batch,
         COALESCE(sum(seed_side), 0)      AS seed_side,
         COALESCE(sum(plot_side), 0)      AS plot_side,
         COALESCE(sum(waiting), 0)        AS waiting,
         COALESCE(-sum(seed_side), 0)     AS balance_moves,
         COALESCE(sum(other_reports), 0)  AS other_reports
  FROM per_batch
  UNION ALL
  SELECT 1, abs(COALESCE(seed_side, 0)),
         batch_name,
         COALESCE(seed_side, 0), COALESCE(plot_side, 0), COALESCE(waiting, 0),
         -COALESCE(seed_side, 0), other_reports
  FROM per_batch
) q
ORDER BY sort_first, sort_size DESC, batch;
