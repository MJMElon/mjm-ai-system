-- =====================================================================
--  WHAT THE NEW BALANCE MOVES, BATCH BY BATCH
--  Paste into the Supabase SQL Editor and press Run. Read-only: it
--  changes nothing, so it is safe to run as often as you like.
--
--  Life of Seedlings used to answer a different question in the column
--  headed Balance:
--
--    OLD   actual planted
--          less total culling (1st + 3rd)
--          less total sales
--          plus approved stock calibration
--
--  which is everything the batch has ANYWHERE, the tray included.
--
--    NEW   transplant qty
--          less 3rd culling
--          less total sales
--          plus approved stock calibration
--
--  which is what is standing in the field. An UNAPPROVED calibration
--  counts for nothing on either side, which is the rule every reader
--  of this ledger shares.
--
--  The 1st culling is not taken off the new one on purpose. A 1st
--  culling happens in the TRAY, before any of those seedlings go out,
--  so the transplant quantity is already net of it and taking it
--  off again would subtract the same seedlings twice. Whatever is
--  still sitting in a tray is not in this figure either: that is the
--  Pre-Nursery side, and it has not changed.
--
--  WHAT A GOOD RESULT LOOKS LIKE
--    The ALL row first with the totals and the counts, then one row
--    per batch whose Balance moves. A batch that does not move is not
--    listed, and that is the normal case for a fully allocated batch.
--
--    bal_old        what the column read before.
--    bal_new        what it reads now.
--    moved_by       bal_new less bal_old. On a batch that was over or
--                   under allocated this is the allocation gap, and it
--                   never used to close.
--    calibration    the approved stock calibration on that batch, which
--                   is inside bal_new.
--    settles        yes where bal_new is nought, which is the batch
--                   reconciling to the seedling.
--
--    Batches 224, 225 and 226 are the ones this was raised on. On the
--    three terms alone they came to 1, minus 1 and 13, against
--    calibrations of minus 1, plus 1 and minus 13 — so with the
--    calibration in, all three should read 0 under bal_new and yes
--    under settles, against minus 416, minus 280 and minus 560 under
--    bal_old.
-- =====================================================================
WITH led AS (
  SELECT btrim(l.batch_name) AS batch_name,
         sum(CASE WHEN l.transaction_type = 'Transplanted'
                  THEN abs(COALESCE(l.quantity_change, 0)) ELSE 0 END) AS trans,
         sum(CASE WHEN l.transaction_type = 'Planted'
                  THEN abs(COALESCE(l.quantity_change, 0)) ELSE 0 END) AS planted,
         sum(CASE WHEN l.transaction_type = '1st_Culling'
                  THEN abs(COALESCE(l.quantity_change, 0)) ELSE 0 END) AS cull1,
         sum(CASE WHEN l.transaction_type = '3rd_Culling'
                  THEN abs(COALESCE(l.quantity_change, 0)) ELSE 0 END) AS cull3,
         sum(CASE WHEN l.transaction_type = 'Stock_Calibration'
                   AND COALESCE(l.remark, '') LIKE '%[APPROVED by %'
                  THEN COALESCE(l.quantity_change, 0) ELSE 0 END)      AS calibration
  FROM shared_inventory_logs l
  WHERE COALESCE(btrim(l.batch_name), '') <> ''
  GROUP BY btrim(l.batch_name)
),
do_lines AS (
  SELECT btrim(COALESCE((ARRAY[d.batch_1, d.batch_2, d.batch_3,
                              d.batch_4, d.batch_5])[i], ''))          AS batch_name,
         COALESCE((ARRAY[d.qty_1, d.qty_2, d.qty_3,
                         d.qty_4, d.qty_5])[i], 0)                     AS qty
  FROM shared_do_records d,
       generate_series(1, 5) AS i
  WHERE COALESCE(d.status, '') <> 'Cancelled'
    AND COALESCE(d.remark, '') NOT LIKE '%[CANCELLED]%'
),
sold AS (
  SELECT batch_name, sum(qty) AS sales
  FROM do_lines
  WHERE batch_name <> ''
  GROUP BY batch_name
),
calc AS (
  SELECT l.batch_name,
         l.planted,
         l.trans,
         l.cull1,
         l.cull3,
         COALESCE(s.sales, 0)                                          AS sales,
         l.calibration,
         l.planted - (l.cull1 + l.cull3)
           - COALESCE(s.sales, 0) + l.calibration                      AS bal_old,
         l.trans - l.cull3 - COALESCE(s.sales, 0) + l.calibration      AS bal_new
  FROM led l
  LEFT JOIN sold s ON s.batch_name = l.batch_name
)
SELECT batch, planted, trans, cull1, cull3, sales,
       bal_old, bal_new, moved_by, calibration, settles
FROM (
  SELECT 0                                                             AS sort_first,
         0                                                             AS sort_size,
         'ALL — ' || count(*) || ' batches, '
           || count(*) FILTER (WHERE bal_old <> bal_new) || ' move, '
           || count(*) FILTER (WHERE bal_new = 0)
           || ' settle to nought'                                      AS batch,
         sum(planted)   AS planted,
         sum(trans)     AS trans,
         sum(cull1)     AS cull1,
         sum(cull3)     AS cull3,
         sum(sales)     AS sales,
         sum(bal_old)   AS bal_old,
         sum(bal_new)   AS bal_new,
         sum(bal_new) - sum(bal_old)                                   AS moved_by,
         sum(calibration)                                              AS calibration,
         ''                                                            AS settles
  FROM calc
  UNION ALL
  SELECT 1,
         abs(bal_new - bal_old),
         batch_name, planted, trans, cull1, cull3, sales,
         bal_old, bal_new, bal_new - bal_old, calibration,
         CASE WHEN bal_new = 0 THEN 'yes' ELSE '' END
  FROM calc
  WHERE bal_old <> bal_new
) q
ORDER BY sort_first, sort_size DESC, batch;
