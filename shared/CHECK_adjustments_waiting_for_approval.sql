-- WHICH ADJUSTMENTS ARE KEYED AND STILL WAITING TO BE APPROVED
--
-- A Stock Calibration moves no figure anywhere until somebody presses
-- Approve on the Adjustments tab. This names the ones that have been keyed
-- and not approved, so the office can see what is sitting there and what each
-- one would move once it is.
--
-- Nothing is changed by running it.
--
-- WHAT A GOOD RESULT LOOKS LIKE
--
-- The first line is the summary: how many are waiting and what they come to
-- between them. If it reads 0 rows and a net of 0, everything keyed has been
-- ruled on.
--
-- Every line after it is one of those rows, newest first: the batch, the
-- plot, the report it was raised on, how much it would move and the day it
-- says it happened. A row that was keyed by mistake is deleted on the
-- Adjustments tab of that batch; a row that is right is approved there.
--
-- WHICH REPORTS EACH ONE WOULD MOVE, ONCE APPROVED
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
       (SELECT count(*) FROM pending)::text || ' waiting to be approved'   AS qty,
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
           THEN 'would move the batch total, so every report'
         WHEN lower(report) = 'transplanting'
           THEN 'would move Transplanting, 2nd and 3rd Culling on this plot'
         WHEN lower(report) IN ('1st culling', '2nd culling', '3rd culling')
           THEN 'would move ' || report || ' on this plot, and nothing else'
         ELSE 'names no report, so no batch tab claims it; the plot still moves'
       END
FROM   pending
ORDER  BY sort_key, happened DESC, batch, plot;
