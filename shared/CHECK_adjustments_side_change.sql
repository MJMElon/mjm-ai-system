-- =====================================================================
--  EVERY STOCK ADJUSTMENT, AND HOW THE NEW RULE READS IT
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  Read-only. One statement, no regular expressions and no backslashes,
--  so it survives being copied and pasted.
--
--  "Which count was wrong" is no longer asked on the form — the REPORT
--  answers it:
--      Seeds Received · Planting · Seed Audit   → seed (the batch total)
--      Transplanting · 1st · 2nd · 3rd Culling  → plot (what is standing)
--
--  side_before is what the row was saved with. side_after is what the
--  app reads it as now. Where they differ, a figure moved on that batch.
--  Send the whole output back.
-- =====================================================================
SELECT
  batch_name AS batch,
  split_part(split_part(remark, 'Plot: ', 2), '.', 1)   AS plot,
  quantity_change                                       AS qty,
  split_part(split_part(remark, 'Report: ', 2), '.', 1) AS report,
  CASE WHEN remark LIKE '%Side: plot%' THEN 'plot' ELSE 'seed' END AS side_before,
  CASE WHEN lower(split_part(split_part(remark, 'Report: ', 2), '.', 1))
            IN ('seeds received','planting','seed audit')
       THEN 'seed' ELSE 'plot' END                      AS side_after,
  CASE WHEN remark LIKE '%[APPROVED by%' THEN 'yes' ELSE 'no' END  AS approved,
  left(remark, 160)                                     AS remark
FROM shared_inventory_logs
WHERE transaction_type = 'Stock_Calibration'
ORDER BY batch_name, report;
