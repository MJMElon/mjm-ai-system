-- =====================================================================
--  BATCH 252's U10 AND U3 WERE DOUBLED TWICE, NOT ONCE
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  Safe to run twice: the second run changes nothing and prints the same
--  table. No regular expressions and no backslashes, so it survives a paste.
--
--  WHY THE LAST REPAIR DID NOT GO FAR ENOUGH
--  The fingerprint it worked from is the Transplanted figure in the remark,
--  and SAVE REWRITES THAT EVERY TIME. So it only ever records the multiple
--  of the LAST save -- while the Dead keeps compounding across saves:
--
--      U10   2  ->  4  ->  8      remark said "times 2" both times
--      U3   12  -> 24  -> 48      the same
--
--  Dividing once gave 4 and 24. The office says the right figures are 2 and
--  12, which is the same two divided again. The transplanted totals are
--  right as they stand -- 1,416 and 1,813.
--
--  This names those two rows outright rather than dividing by a rule,
--  because the rule cannot see how many times a row was saved and guessing
--  a second division would be as wrong on a row that was only doubled once.
--  252's U1 (10) and N11 (1) are confirmed right and are left alone.
--
--  STILL TO CHECK BY HAND: batch 256's N5 now reads 8. If it too was saved
--  twice while doubling, it is 4. Nothing in the data can say which -- the
--  paper or the drone map can.
--
--  Each row's drone map and cull date are carried over untouched.
--
--  WHAT TO LOOK FOR
--  The table at the end is batch 252's rows. Good means
--      N11 1, U1 10, U3 12, U10 2
--  with transplanted 1,405 / 4,201 / 1,813 / 1,416, every line's
--  transplanted minus dead equal to its alive, and 'map kept' yes.
--  Run it a second time and it prints the same thing.
-- =====================================================================
UPDATE shared_inventory_logs AS il
   SET quantity_change = v.dead,
       remark = '2nd Culling. Alive: ' || (v.planted - v.dead)::text
             || ', Dead: '             || v.dead::text
             || ', Cull: '             || round(v.dead * 100.0 / v.planted, 2)::text
             || '%. Transplanted: '    || v.planted::text
             || '. CullDate:'          || split_part(il.remark, 'CullDate:', 2)
  FROM (VALUES
          ('U10',  2, 1416),
          ('U3',  12, 1813)
       ) AS v(plot, dead, planted)
 WHERE il.transaction_type = '2nd_Culling'
   AND trim(il.batch_name) = '252'
   AND trim(il.plot_name)  = v.plot
   AND position('CullDate:' IN il.remark) > 0
   AND il.quantity_change IS DISTINCT FROM v.dead;

SELECT trim(plot_name)  AS plot,
       quantity_change  AS dead,
       NULLIF(trim(split_part(split_part(remark, 'Alive:', 2), ',', 1)), '')        AS alive,
       NULLIF(trim(split_part(split_part(remark, 'Transplanted:', 2), '.', 1)), '') AS transplanted,
       CASE WHEN position('MapUrl:' IN remark) > 0 THEN 'yes' ELSE 'no' END         AS map_kept,
       NULLIF(trim(left(split_part(remark, 'CullDate:', 2), 11)), '')               AS cull_date
  FROM shared_inventory_logs
 WHERE transaction_type = '2nd_Culling'
   AND trim(batch_name) = '252'
 ORDER BY left(trim(plot_name), 1), length(trim(plot_name)), trim(plot_name);
