-- =====================================================================
--  THE SEEDS IN ROWS OF ONE BATCH, SIDE BY SIDE
--  Paste into the Supabase SQL Editor and press Run. Read-only: it
--  changes nothing, so it is safe to run as often as you like.
--
--  THE DRILL-DOWN. CHECK_duplicate_seeds_in.sql comes first and gives
--  one row per batch. This one lists the rows themselves, and is worth
--  opening only for a batch that check marked all_identical = NO, where
--  somebody has to decide which is the real delivery. Batch 224 has
--  ninety-five identical rows and there is nothing to read in them.
--
--  Set the batch on the line marked BATCH below, or leave it empty to
--  list every batch that has more than one.
--
--  A batch is meant to have exactly ONE Seeds_Received row. Two ways it
--  ended up with more:
--
--    · the Seeds In form saved twice before the duplicate guard existed
--      (batch 261 went in seven times, 260 twice)
--    · an update keyed on created_at rather than on the row id, which
--      damaged the 224-241 range
--
--  Both are written up in operation/operation_batch_detail.html beside
--  the save on that form.
--
--  The Seeds In form and the batch list both show the NEWEST row, and
--  Life of Seedlings now does too. So the figures on screen are right —
--  but the ledger still holds the stale row, and nothing will ever
--  delete it unless somebody is told it is there.
--
--  EVERY BATCH is examined, not the one somebody noticed.
--
--  WHAT A GOOD RESULT LOOKS LIKE
--    No rows at all. Every batch has one Seeds In row and there is
--    nothing to clean up.
--
--    Otherwise one row per EXTRA row, so a batch saved three times
--    appears twice. Read it as "this is the row to delete, and this is
--    the one being kept":
--
--    keeping = yes   the newest row, the one all three screens show.
--    keeping blank   a stale row. qty, do_qty and supplier are what
--                    it holds, so you can see which one is the real
--                    delivery before anything is removed.
--
--    sum_if_added_up is what Life of Seedlings used to show for the
--    batch, and is the quickest way to recognise the one you were
--    looking at — batch 224 reads 997,500 against a real 10,500.
--
--    Nothing here deletes anything. Send me the rows and I will write
--    the repair, or delete by the id in the last column once you are
--    satisfied which row is the real one.
-- =====================================================================
WITH params AS (
  -- BATCH. One batch name, or empty for all of them.
  SELECT ''::TEXT AS only_batch
),
sr AS (
  SELECT l.id,
         l.batch_name,
         l.quantity_change,
         l.transaction_date,
         l.created_at,
         l.breed_name,
         l.remark,
         count(*)      OVER (PARTITION BY l.batch_name) AS rows_for_batch,
         sum(COALESCE(l.quantity_change, 0))
                       OVER (PARTITION BY l.batch_name) AS sum_if_added_up,
         row_number()  OVER (PARTITION BY l.batch_name
                             ORDER BY l.created_at DESC, l.id DESC) AS newest_first
  FROM shared_inventory_logs l, params p
  WHERE l.transaction_type = 'Seeds_Received'
    AND COALESCE(btrim(l.batch_name), '') <> ''
    AND (p.only_batch = '' OR l.batch_name = p.only_batch)
)
SELECT batch_name                                                  AS batch,
       CASE WHEN newest_first = 1 THEN 'yes' ELSE '' END           AS keeping,
       rows_for_batch,
       sum_if_added_up,
       COALESCE(quantity_change, 0)                                AS qty_on_this_row,
       -- The D/O quantity out of the remark, without a regular
       -- expression: everything after "DO_Qty: " up to the next full
       -- stop. A legacy row carries no such marker and reads 0.
       CASE
         WHEN position('DO_Qty: ' IN COALESCE(remark, '')) = 0 THEN 0
         ELSE COALESCE(NULLIF(split_part(
                split_part(remark, 'DO_Qty: ', 2), '.', 1), ''), '0')::BIGINT
       END                                                         AS do_qty_on_this_row,
       -- And the supplier, the same way. Cut at EVERY part that can follow
       -- it, not just MPOB: an older row carries no licence, and cutting
       -- only at that one left "Old Co. DO_Qty: 5000." in the column. A
       -- supplier name has full stops of its own ("Sdn. Bhd."), which is why
       -- this cuts at the labels rather than at the first period.
       CASE
         WHEN position('Supplier: ' IN COALESCE(remark, '')) = 0 THEN ''
         ELSE btrim(split_part(split_part(split_part(split_part(split_part(
                split_part(remark, 'Supplier: ', 2),
                ' MPOB:', 1), ' D/O:', 1), ' DO_Qty:', 1),
                ' Incl.', 1), ' Replacement:', 1))
       END                                                         AS supplier_on_this_row,
       COALESCE(breed_name, '')                                    AS breed,
       transaction_date,
       created_at,
       id
FROM sr
WHERE rows_for_batch > 1
ORDER BY sum_if_added_up DESC, batch_name, newest_first;
