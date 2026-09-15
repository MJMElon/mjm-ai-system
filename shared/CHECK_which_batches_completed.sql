-- =====================================================================
--  WHICH BATCHES COUNT AS COMPLETED, AND WHY
--  Paste into the Supabase SQL Editor and press Run. Read-only: it
--  changes nothing, so it is safe to run as often as you like.
--
--  A plot is finished when nothing is left standing in it:
--        3rd culled  -  drone map qty  =  0
--  and, when the cull is nought, the record must SAY so ("Remaining
--  Balance: 0") — otherwise a row that says nothing at all would count
--  as a finished plot.
--
--  AND somebody must have signed it off. A plot whose culling is keyed
--  but unchecked is not a finished plot: the 3rd Culling tab counts a
--  row as done only once it is verified, and this has to agree with it.
--  Either the row's own sign-off (a Row_Verification log against
--  'cull_3::<PLOT>|<dest>') or the whole stage verified for the batch,
--  which is one signature over every row on the tab.
-- =====================================================================
WITH expected AS (
  -- Every plot a batch was transplanted into (Premium Care is a holding
  -- tray and is never 3rd-culled), plus every plot transferred into.
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
actual AS (
  SELECT batch_name, UPPER(TRIM(plot_name)) AS plot,
         SUM(COALESCE(quantity_change, 0))                                     AS culled,
         SUM(COALESCE((SUBSTRING(remark FROM 'MapQty:\s*([0-9]+)'))::INT, 0))   AS map_qty,
         BOOL_OR(remark ~ 'Remaining Balance:\s*0(\D|$)')                       AS says_nil,
         COUNT(*)                                                              AS records
  FROM shared_inventory_logs
  WHERE transaction_type = '3rd_Culling'
  GROUP BY 1, 2
),
row_signed AS (
  -- plot_name on a row sign-off is 'cull_3::<PLOT>|<dest>'; only the plot
  -- is matched, because which dest type the tab merged the row under has
  -- nothing to do with whether somebody looked at the plot.
  SELECT DISTINCT batch_name,
         UPPER(TRIM(SPLIT_PART(SUBSTRING(plot_name FROM 'cull_3::(.*)$'), '|', 1))) AS plot
  FROM shared_inventory_logs
  WHERE transaction_type = 'Row_Verification'
    AND plot_name LIKE 'cull\_3::%'
),
stage_signed AS (
  SELECT DISTINCT batch_name
  FROM operation_batch_verifications
  WHERE stage = 'cull_3'
),
verdict AS (
  SELECT e.batch_name, e.plot,
         COALESCE(a.records, 0) AS records,
         COALESCE(a.culled, 0)  AS culled,
         COALESCE(a.map_qty, 0) AS map_qty,
         (rs.plot IS NOT NULL OR ss.batch_name IS NOT NULL) AS signed,
         (COALESCE(a.records, 0) > 0
          AND COALESCE(a.culled, 0) - COALESCE(a.map_qty, 0) = 0
          AND (COALESCE(a.culled, 0) > 0 OR COALESCE(a.says_nil, FALSE))
          AND (rs.plot IS NOT NULL OR ss.batch_name IS NOT NULL)) AS done
  FROM expected e
  LEFT JOIN actual a
    ON a.batch_name = e.batch_name AND a.plot = e.plot
  LEFT JOIN row_signed rs
    ON rs.batch_name = e.batch_name AND rs.plot = e.plot
  LEFT JOIN stage_signed ss
    ON ss.batch_name = e.batch_name
),
per_batch AS (
  SELECT batch_name,
         COUNT(*)                                  AS plots,
         COUNT(*) FILTER (WHERE done)              AS plots_done,
         COUNT(*) FILTER (WHERE NOT done)          AS plots_left,
         COUNT(*) FILTER (WHERE NOT signed)        AS plots_unsigned,
         STRING_AGG(plot, ', ') FILTER (WHERE NOT done) AS still_open
  FROM verdict GROUP BY 1
)
SELECT batch_name AS batch,
       CASE WHEN plots_left = 0 THEN 'COMPLETED' ELSE 'active' END AS verdict,
       plots, plots_done, plots_left, plots_unsigned,
       COALESCE(LEFT(still_open, 120), '') AS plots_still_open
FROM per_batch
ORDER BY (plots_left = 0) DESC, batch_name DESC;

-- WHAT A GOOD RESULT LOOKS LIKE
--   The COMPLETED rows at the top should be only the batches you consider
--   finished. If a batch you expect to be Active is listed as COMPLETED,
--   its plots_still_open is empty — look at that batch's plots in the
--   other check (CHECK_batch_not_completed.sql) to see the figures behind
--   each one.
--
--   plots_unsigned says how many of a batch's plots nobody has verified.
--   A batch whose plots_left equals its plots_unsigned is finished in the
--   field and waiting on a signature, not on more counting.
--
--   A batch with no transplant and no transfer rows does not appear here
--   at all, and is Active by default.
