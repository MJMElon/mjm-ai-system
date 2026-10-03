-- =====================================================================
--  EVERY 2ND CULLING FIGURE IN THE LEDGER, AND WHO PUT IT THERE
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  READ-ONLY. It changes nothing.
--  No regular expressions and no backslashes, so it survives a paste.
--
--  WHY
--  A 2nd culling figure on screen is not what it says if more than one row
--  is saved for the same batch and plot. The Save on that tab DELETES every
--  2nd_Culling row of the batch and writes the screen back, one row per
--  plot, and it writes no DestType -- so a plot that has an OLDER row from
--  when MAIN and D-TONE were saved separately ends up with two rows, and
--  the loader hands them out by render order. The screen then shows a figure
--  nobody keyed against that row.
--
--  Every row also carries who last saved it and when. Those columns are the
--  answer to "did this change, and who changed it": nothing can write here
--  without a signed-in account, so every figure has a name against it.
--
--  This lists every 2nd culling row of every batch -- the fix is never one
--  batch -- newest save first, with the duplicates called out at the top.
--
--  WHAT TO LOOK FOR
--
--    ord 1, 'summary'
--      -> how many 2nd culling rows there are, and how many batch+plot
--         pairs have MORE THAN ONE.
--
--    ord 2, 'TWO ROWS FOR ONE PLOT'
--      -> these are the ones whose screen figure cannot be trusted. Open
--         that batch's 2nd Culling tab, key the right DEAD on each plot and
--         press Save once: the save clears the whole batch's rows first, so
--         one save leaves exactly one row per plot and the doubling is gone.
--
--    ord 3, 'row'
--      -> every row, newest save first. 'dead' is the figure the screen
--         shows. 'by' and 'at' are who saved it and when. If a figure is not
--         the one you keyed, that line says who it came from and the day --
--         start there.
--
--    A row whose 'by' is empty was saved before those columns existed, or by
--    a database script. It is not a sign of anything on its own.
-- =====================================================================
WITH l AS (
  SELECT trim(COALESCE(batch_name, ''))  AS batch,
         trim(COALESCE(plot_name, ''))   AS plot,
         COALESCE(quantity_change, 0)    AS dead,
         COALESCE(remark, '')            AS remark,
         created_at,
         to_jsonb(il) ->> 'last_edited_by' AS by_who,
         to_jsonb(il) ->> 'last_edited_at' AS at_when
    FROM shared_inventory_logs il
   WHERE transaction_type = '2nd_Culling'
),
p AS (
  SELECT batch, plot, dead, created_at, by_who, at_when,
         -- The remark carries the arithmetic the screen showed when it was
         -- saved. split_part keeps this free of regular expressions.
         NULLIF(trim(split_part(split_part(remark, 'Alive:', 2), ',', 1)), '')        AS alive,
         NULLIF(trim(split_part(split_part(remark, 'Transplanted:', 2), '.', 1)), '') AS planted,
         NULLIF(trim(left(split_part(remark, 'CullDate:', 2), 11)), '')               AS cull_date,
         CASE WHEN position('DestType:' IN remark) > 0
              THEN trim(split_part(split_part(remark, 'DestType:', 2), ' ', 1))
              ELSE '(none)' END                                                       AS dest
    FROM l
),
dup AS (
  SELECT batch, plot, count(*) AS n, sum(dead) AS tot
    FROM p GROUP BY batch, plot HAVING count(*) > 1
)
SELECT * FROM (
  SELECT 1 AS ord,
         'summary'                                   AS what,
         '(all batches)'                             AS batch,
         ''                                          AS plot,
         ''                                          AS dead,
         (SELECT count(*)::text FROM p) || ' 2nd culling rows, '
           || (SELECT COALESCE(count(*), 0)::text FROM dup)
           || ' batch+plot pairs with more than one'  AS detail

  UNION ALL

  SELECT 2, 'TWO ROWS FOR ONE PLOT', batch, plot,
         tot::text,
         n::text || ' rows for this batch and plot - the screen cannot say '
           || 'which is the row. Re-save that batch''s 2nd Culling tab once.'
    FROM dup

  UNION ALL

  SELECT 3, 'row', batch, plot,
         dead::text,
         'alive ' || COALESCE(alive, '?')
           || ', transplanted ' || COALESCE(planted, '?')
           || ', culled ' || COALESCE(cull_date, '?')
           || ', dest ' || dest
           || ' - saved by ' || COALESCE(NULLIF(by_who, ''), '(not recorded)')
           || ' on ' || COALESCE(left(COALESCE(at_when, created_at::text), 16), '?')
    FROM p
) y
ORDER BY ord, batch, plot, detail DESC;
