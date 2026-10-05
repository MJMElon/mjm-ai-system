-- =====================================================================
--  WHY ONE PLOT'S BALANCE READS WHAT IT READS
--
--  Change the plot on the line marked PLOT below, paste the WHOLE file into
--  the Supabase SQL Editor and press Run.
--  READ-ONLY. It changes nothing.
--  No regular expressions and no backslashes, so it survives a paste.
--
--  WHY
--  A quantity on the Work Record with a link beside it is not stored
--  anywhere. It is the batch report's balance for that plot and those
--  batches, summed fresh every time the page draws, up to the work date:
--
--      transplanted in + transferred in
--        - sold - 3rd culled - transferred out + stock adjustment
--        - 2nd culled
--
--  It is NOT floored at nought. A plot where more has been taken off than
--  was ever put on reads negative, and that is the ledger saying so rather
--  than the page inventing a figure. So a negative quantity is a question
--  for THESE rows, not for the work record.
--
--  This lists every movement of one plot in date order with a running
--  balance, so the line where it goes wrong can be pointed at.
--
--  WHAT TO LOOK FOR
--
--    The 'balance' column is what a work record dated that day would show.
--    Read down it until it goes somewhere it should not. The row that took
--    it there is the one to look at: usually a Sold or a culling keyed
--    against the wrong plot or the wrong batch, or a transplant row that was
--    never written.
--
--    'counts' says whether a row is in the sum at all. A 3rd culling with no
--    drone map keyed, and a stock calibration nobody has approved, are both
--    still claims and are left out -- the same rule the movement report uses.
-- =====================================================================
WITH l AS (
  SELECT trim(COALESCE(plot_name, ''))  AS plot,
         trim(COALESCE(batch_name, '')) AS batch,
         transaction_type               AS kind,
         COALESCE(quantity_change, 0)   AS qty,
         COALESCE(remark, '')           AS remark,
         COALESCE(transaction_date::text, left(created_at::text, 10)) AS dated
    FROM shared_inventory_logs
   WHERE transaction_type IN ('Transplanted', 'Transplanted_DoubleTone',
                              '2nd_Culling', '3rd_Culling',
                              'Cull3_Transfer', 'Stock_Calibration')
),
m AS (
  SELECT plot, batch, kind, qty, dated,
         CASE
           -- A 3rd culling nobody has flown yet is a claim, not a deduction.
           WHEN kind = '3rd_Culling' AND position('MapQty:' IN remark) = 0 THEN 0
           -- An adjustment nobody has ruled on moves no figure anywhere.
           WHEN kind = 'Stock_Calibration' AND position('[APPROVED' IN remark) = 0 THEN 0
           WHEN kind IN ('Transplanted', 'Transplanted_DoubleTone', 'Cull3_Transfer')
             THEN abs(qty)
           WHEN kind IN ('2nd_Culling', '3rd_Culling') THEN -abs(qty)
           WHEN kind = 'Stock_Calibration' THEN qty
           ELSE 0 END AS effect,
         CASE
           WHEN kind = '3rd_Culling' AND position('MapQty:' IN remark) = 0
             THEN 'no - no drone map keyed, so it is still a claim'
           WHEN kind = 'Stock_Calibration' AND position('[APPROVED' IN remark) = 0
             THEN 'no - not approved yet'
           ELSE 'yes' END AS counts
    FROM l
   -- PLOT: change this to the plot you are looking at.
   WHERE upper(replace(plot, ' ', '')) = 'N15'
)
SELECT dated                                              AS date,
       kind                                               AS movement,
       batch,
       qty                                                AS quantity,
       effect                                             AS effect_on_balance,
       sum(effect) OVER (ORDER BY dated, batch, kind
                         ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS balance,
       counts
  FROM m
 ORDER BY dated, batch, kind;
