-- WHICH STOCK ADJUSTMENTS START COUNTING NOW THAT APPROVAL IS GONE
--
-- Every Stock Calibration used to wait for somebody to press Approve before
-- it moved a figure. It does not any more: an adjustment counts from the
-- moment it is saved. So any row that was keyed and never approved is now
-- in the reports, and the figures it touches have moved.
--
-- This names them. Nothing is changed by running it.
--
-- WHAT A GOOD RESULT LOOKS LIKE
--
-- The first line is the summary: how many rows were never approved and what
-- they come to between them. If it reads 0 rows and a net of 0, nothing has
-- moved anywhere and there is nothing to look at.
--
-- Every line after it is one of those rows, newest first: the batch, the
-- plot, the report it was raised on, how much it moves and the day it says
-- it happened. Read each one and satisfy yourself it is a correction
-- somebody meant to make. A row that was keyed by mistake and left unapproved
-- on purpose is the one to look for -- it is now in the figures, and the way
-- to take it back out is Delete on the Adjustments tab of that batch.
--
-- WHICH REPORTS EACH ONE MOVES
--
--   Seeds Received, Planting, Seed Audit   the batch total, every report
--   Transplanting                          Transplanting, 2nd and 3rd Culling
--   1st Culling                            1st Culling only
--   2nd Culling                            2nd Culling only
--   3rd Culling                            3rd Culling only
--   (no report named)                      the plot it names, on the Movement
--                                          Report, Life of Seedlings and the
--                                          piece-rate quantity. NOT the batch
--                                          report tabs, which read the report
--                                          to know which tab a figure is about.
--
-- Most of the rows in this ledger name no report. They are real corrections
-- and they count; shared/CHECK_what_wrote_these_adjustments.sql groups them
-- by the wording of their remark and counts the exact repeats.

WITH cal AS (
  SELECT id,
         coalesce(batch_name, '-')   AS batch,
         coalesce(plot_name, '-')    AS plot,
         coalesce(quantity_change, 0) AS qty,
         coalesce(transaction_date, created_at::date) AS happened,
         btrim(split_part(split_part(coalesce(remark, ''), 'Report: ', 2), '.', 1)) AS report,
         position('[APPROVED by' in coalesce(remark, '')) > 0 AS was_approved
  FROM   shared_inventory_logs
  WHERE  transaction_type = 'Stock_Calibration'
),
pending AS (
  SELECT * FROM cal WHERE NOT was_approved
)
SELECT 0 AS sort_key,
       'ALL OF THEM'                              AS batch,
       '-'                                        AS plot,
       '-'                                        AS report,
       (SELECT count(*) FROM pending)::text || ' rows now counting'   AS qty,
       '-'                                        AS happened,
       'net ' || coalesce((SELECT sum(qty) FROM pending), 0)::text
         || ' seedlings, out of '
         || (SELECT count(*) FROM cal)::text || ' adjustments in all'  AS note
UNION ALL
SELECT 1,
       batch,
       plot,
       CASE WHEN report = '' THEN '(no report named)' ELSE report END,
       CASE WHEN qty > 0 THEN '+' || qty::text ELSE qty::text END,
       happened::text,
       CASE
         WHEN lower(report) IN ('seeds received', 'planting', 'seed audit')
           THEN 'moves the batch total, so every report'
         WHEN lower(report) = 'transplanting'
           THEN 'moves Transplanting, 2nd Culling and 3rd Culling on this plot'
         WHEN lower(report) IN ('1st culling', '2nd culling', '3rd culling')
           THEN 'moves ' || report || ' on this plot, and nothing else'
         ELSE 'no report named on the row, so it moves nothing until it is edited'
       END
FROM   pending
ORDER  BY sort_key, happened DESC, batch, plot;
