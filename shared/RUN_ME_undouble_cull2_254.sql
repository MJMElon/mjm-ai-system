-- =====================================================================
--  PUT BATCH 254'S 2ND CULLING BACK
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  Safe to run twice: the second run changes nothing and prints the same
--  table. No regular expressions and no backslashes, so it survives a paste.
--
--  WHY
--  The 2nd Culling tab doubled every figure on it when two runs of its load
--  overlapped -- the pre-warm at page load and a click on the tab. Save
--  writes what is on screen, so opening the tab and saving wrote the doubled
--  figure into the ledger, and the next open doubled that again. The page is
--  fixed; this puts batch 254 back, because the fix cannot undo a save.
--
--  THE FIGURES ARE YOUR OWN. They are what CHECK_cull2_rows.sql read out of
--  this table BEFORE the save that doubled them:
--
--      B5   dead 243   alive 5706   transplanted 5949
--      U3   dead 3     alive 942    transplanted 945
--      N18  dead 17    alive 2279   transplanted 2296   -- already right
--
--  N18 is left alone: it was keyed by hand on the screen, so it was saved as
--  keyed rather than doubled.
--
--  The drone map on each row is kept. Only the numbers are rewritten, and
--  everything from CullDate onwards -- the date and the MapUrl -- is carried
--  over exactly as it is.
--
--  IF YOU WOULD RATHER NOT RUN SQL: open batch 254's 2nd Culling tab now
--  that the page is fixed, key 243 on B5 and 3 on U3, and press Save once.
--  The save clears the batch's rows and rewrites them, so it does the same
--  thing. This file exists so the maps and the dates cannot be lost in the
--  typing.
--
--  WHAT TO LOOK FOR
--  The table at the end is batch 254's three rows. Good means:
--      B5 243, U3 3, N18 17, and 'map kept = yes' on all three.
--  Run it a second time and it prints the same thing.
-- =====================================================================
UPDATE shared_inventory_logs AS il
   SET quantity_change = v.dead,
       remark = '2nd Culling. Alive: ' || v.alive::text
             || ', Dead: '             || v.dead::text
             || ', Cull: '             || v.pct
             || '%. Transplanted: '    || v.planted::text
             || '. CullDate:'          || split_part(il.remark, 'CullDate:', 2)
  FROM (VALUES
          ('B5', 243, 5706, 5949, '4.08'),
          ('U3',   3,  942,  945, '0.32')
       ) AS v(plot, dead, alive, planted, pct)
 WHERE il.transaction_type = '2nd_Culling'
   AND trim(il.batch_name) = '254'
   AND trim(il.plot_name)  = v.plot
   AND position('CullDate:' IN il.remark) > 0
   AND il.quantity_change IS DISTINCT FROM v.dead;

SELECT trim(plot_name)                                   AS plot,
       quantity_change                                   AS dead,
       NULLIF(trim(split_part(split_part(remark, 'Alive:', 2), ',', 1)), '')        AS alive,
       NULLIF(trim(split_part(split_part(remark, 'Transplanted:', 2), '.', 1)), '') AS transplanted,
       CASE WHEN position('MapUrl:' IN remark) > 0 THEN 'yes' ELSE 'no' END         AS map_kept,
       NULLIF(trim(left(split_part(remark, 'CullDate:', 2), 11)), '')               AS cull_date
  FROM shared_inventory_logs
 WHERE transaction_type = '2nd_Culling'
   AND trim(batch_name) = '254'
 ORDER BY left(trim(plot_name), 1), length(trim(plot_name)), trim(plot_name);
