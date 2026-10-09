-- =====================================================================
--  WHICH BATCHES THE 2ND-CULLING RULE MOVES, AND BY HOW MUCH
--  Paste into the Supabase SQL Editor and press Run. Read-only: it
--  changes nothing, so it is safe to run as often as you like.
--
--  Life of Seedlings used to let the 2nd culling stand in for the 3rd
--  until a 3rd was keyed. The two readers it has to agree with both say
--  the opposite, in their own words:
--
--    the Nursery Movement Report  "2nd Culled never deducts here, B/F
--    included -- 2nd Culling is Tab 6 own live snapshot as a batch works
--    through 3rd Culling, not a separate loss on top of it."
--
--    the Batch Report  culling rate is (1st + 3rd) over (transplanted +
--    1st), and cull2 is carried for reference only, because it is
--    inside cull3.
--
--  So a batch 2nd culled and not yet 3rd culled had its Total Culling
--  overstated and its Balance understated, by the 2nd culling, on the
--  one report the office reconciles against.
--
--  This names every batch that moves. It is the same number both ways:
--  Total Culling drops by it and Balance rises by it.
--
--  EVERY BATCH is examined. A batch that has a 3rd culling, or no 2nd,
--  does not move and is not listed.
--
--  WHAT A GOOD RESULT LOOKS LIKE
--    One row reading ALL with 0 batches means nothing moves -- every
--    batch that has been 2nd culled has been 3rd culled too.
--
--    Otherwise the ALL row with the totals, then one batch per row,
--    biggest mover first. moves_by is what that batch Total Culling
--    drops by and what its Balance rises by. Open the batch and the
--    2nd Culled column still shows the figure: it is reported, it is
--    just no longer subtracted twice over.
-- =====================================================================
WITH culls AS (
  SELECT l.batch_name,
         sum(CASE WHEN l.transaction_type = '1st_Culling'
                  THEN abs(COALESCE(l.quantity_change, 0)) ELSE 0 END) AS cull1,
         sum(CASE WHEN l.transaction_type = '2nd_Culling'
                  THEN abs(COALESCE(l.quantity_change, 0)) ELSE 0 END) AS cull2,
         sum(CASE WHEN l.transaction_type = '3rd_Culling'
                  THEN abs(COALESCE(l.quantity_change, 0)) ELSE 0 END) AS cull3
  FROM shared_inventory_logs l
  WHERE l.transaction_type IN ('1st_Culling', '2nd_Culling', '3rd_Culling')
    AND COALESCE(btrim(l.batch_name), '') <> ''
  GROUP BY l.batch_name
),
movers AS (
  -- The 2nd only ever stood in while no 3rd had been keyed, so those are
  -- the only batches that can move.
  SELECT batch_name, cull1, cull2, cull3
  FROM culls
  WHERE cull2 > 0 AND cull3 = 0
)
SELECT batch, cull1, cull2, cull3, total_culling_was, total_culling_now, moves_by
FROM (
  SELECT 0                                              AS sort_first,
         'ALL — ' || count(*) || ' batch'
           || CASE WHEN count(*) = 1 THEN '' ELSE 'es' END AS batch,
         COALESCE(sum(cull1), 0)                        AS cull1,
         COALESCE(sum(cull2), 0)                        AS cull2,
         COALESCE(sum(cull3), 0)                        AS cull3,
         COALESCE(sum(cull1 + cull2), 0)                AS total_culling_was,
         COALESCE(sum(cull1), 0)                        AS total_culling_now,
         COALESCE(sum(cull2), 0)                        AS moves_by
  FROM movers
  UNION ALL
  SELECT 1,
         batch_name,
         cull1,
         cull2,
         cull3,
         cull1 + cull2,
         cull1,
         cull2
  FROM movers
) q
ORDER BY sort_first, moves_by DESC, batch;
