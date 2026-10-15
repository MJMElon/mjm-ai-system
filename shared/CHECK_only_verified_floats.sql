-- WHAT DOES THE VERIFIED-ONLY RULE ACTUALLY MOVE?
--
-- Life of Seedlings now builds every figure out of the ledger lines SOMEBODY
-- HAS SIGNED. A line nobody has signed takes no part in it and joins the
-- figure the day it is signed.
--
-- This is the size of that, batch by batch: what the ledger holds, what is
-- signed, and the Balance each way. The Balance is
--   transplant qty - 3rd culling - total sales + approved stock calibration
-- and here it is shown on the ledger as keyed and on the signed lines only.
--
-- Sales and the stock calibration are signed off elsewhere, so they are the
-- same on both sides and are left out of this comparison. Only the three
-- batch report figures move.
--
-- A LINE IS SIGNED when the whole tab carries a signature, or when the tab is
-- signed row by row and that row has a Row_Verification of its own. The row
-- key starts with the plot, except a transfer card which keeps its transfer
-- suffix. That is the same rule the page uses.
--
-- WHAT A GOOD RESULT LOOKS LIKE
--   Row 1 is the whole nursery: how many batches move at all, and by how much
--   the Balance moves across all of them.
--   Then one row per batch that moves, worst first. Each says how much of its
--   transplanting and its 3rd culling is signed, and what the Balance reads
--   each way. A batch fully signed does not appear.
--   Nothing moving at all means every line in the ledger is signed off.
--
-- Safe to run as often as you like. It reads and writes nothing.

WITH stage_sign AS (
  SELECT DISTINCT batch_name, stage
    FROM operation_batch_verifications
   WHERE batch_name IS NOT NULL AND stage IS NOT NULL
),
row_sign AS (
  SELECT DISTINCT
         batch_name,
         split_part(plot_name, '::', 1) AS stage,
         upper(split_part(split_part(plot_name, '::', 2), '|', 1)) AS plot_key,
         CASE WHEN position('|transfer' in lower(plot_name)) > 0 THEN 1 ELSE 0 END AS is_transfer
    FROM shared_inventory_logs
   WHERE transaction_type = 'Row_Verification'
     AND batch_name IS NOT NULL
     AND position('::' in COALESCE(plot_name, '')) > 0
),
lines AS (
  SELECT l.batch_name,
         l.transaction_type,
         abs(COALESCE(l.quantity_change, 0)) AS qty,
         CASE
           WHEN l.transaction_type = 'Transplanted'    THEN 'transplanting'
           WHEN l.transaction_type = '3rd_Culling'     THEN 'cull_3'
           WHEN l.transaction_type = 'Cull3_Transfer'  THEN 'cull_3'
           WHEN l.transaction_type = '1st_Culling'     THEN 'cull_1'
           WHEN l.transaction_type = '2nd_Culling'     THEN 'cull_2'
           ELSE 'other'
         END AS stage,
         CASE
           WHEN l.transaction_type = 'Cull3_Transfer' THEN 1 ELSE 0
         END AS is_transfer,
         upper(COALESCE(l.plot_name, '')) AS plot_key
    FROM shared_inventory_logs l
   WHERE l.transaction_type IN ('Transplanted', '1st_Culling', '2nd_Culling',
                                '3rd_Culling', 'Cull3_Transfer')
     AND l.batch_name IS NOT NULL
),
marked AS (
  SELECT ln.batch_name,
         ln.stage,
         ln.qty,
         ln.transaction_type,
         CASE WHEN EXISTS (SELECT 1 FROM stage_sign s
                            WHERE s.batch_name = ln.batch_name AND s.stage = ln.stage)
              THEN 1
              WHEN ln.is_transfer = 1 AND EXISTS (
                   SELECT 1 FROM row_sign r
                    WHERE r.batch_name = ln.batch_name AND r.stage = ln.stage
                      AND r.is_transfer = 1)
              THEN 1
              WHEN ln.is_transfer = 0 AND EXISTS (
                   SELECT 1 FROM row_sign r
                    WHERE r.batch_name = ln.batch_name AND r.stage = ln.stage
                      AND r.is_transfer = 0 AND r.plot_key = ln.plot_key)
              THEN 1
              ELSE 0
         END AS signed
    FROM lines ln
),
per_batch AS (
  SELECT batch_name,
         SUM(CASE WHEN transaction_type = 'Transplanted' THEN qty ELSE 0 END) AS trans_all,
         SUM(CASE WHEN transaction_type = 'Transplanted' AND signed = 1 THEN qty ELSE 0 END) AS trans_ok,
         SUM(CASE WHEN transaction_type = '3rd_Culling' THEN qty ELSE 0 END) AS cull3_all,
         SUM(CASE WHEN transaction_type = '3rd_Culling' AND signed = 1 THEN qty ELSE 0 END) AS cull3_ok,
         SUM(CASE WHEN transaction_type = '1st_Culling' THEN qty ELSE 0 END) AS cull1_all,
         SUM(CASE WHEN transaction_type = '1st_Culling' AND signed = 1 THEN qty ELSE 0 END) AS cull1_ok,
         COUNT(*) AS lines_all,
         SUM(signed) AS lines_ok
    FROM marked
   GROUP BY batch_name
),
moved AS (
  SELECT *,
         (trans_all - cull3_all) AS bal_all,
         (trans_ok  - cull3_ok)  AS bal_ok
    FROM per_batch
   WHERE lines_ok < lines_all
)
SELECT batch, lines_signed, lines_total,
       transplant_keyed, transplant_signed, cull3_keyed, cull3_signed,
       balance_on_ledger, balance_on_signed, balance_moves_by, batches_moving
  FROM (
SELECT 1 AS ord,
       0::bigint AS sort_by,
       'ALL BATCHES' AS batch,
       NULL::bigint AS lines_signed,
       NULL::bigint AS lines_total,
       NULL::bigint AS transplant_keyed,
       NULL::bigint AS transplant_signed,
       NULL::bigint AS cull3_keyed,
       NULL::bigint AS cull3_signed,
       SUM(bal_all)::bigint AS balance_on_ledger,
       SUM(bal_ok)::bigint  AS balance_on_signed,
       SUM(bal_ok - bal_all)::bigint AS balance_moves_by,
       COUNT(*)::bigint AS batches_moving
  FROM moved
UNION ALL
SELECT 2,
       abs(bal_ok - bal_all)::bigint,
       batch_name,
       lines_ok::bigint,
       lines_all::bigint,
       trans_all::bigint,
       trans_ok::bigint,
       cull3_all::bigint,
       cull3_ok::bigint,
       bal_all::bigint,
       bal_ok::bigint,
       (bal_ok - bal_all)::bigint,
       NULL::bigint
  FROM moved
) q
 ORDER BY ord, sort_by DESC, batch;
