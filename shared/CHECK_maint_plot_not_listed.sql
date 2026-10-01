-- =====================================================================
--  WHY A PLOT'S ROWS ARE NOT DRAWN ON THE WORK MAINTENANCE LIST
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  READ-ONLY. It changes nothing.
--  No regular expressions and no backslashes, so it survives a paste.
--
--  WHY
--  CHECK_maint_rows_missing.sql found the rows: they are in the list, on
--  plots the screen does not draw. A plot is drawn when it is on its
--  nursery's list, and a plot joins that list by having a CAPACITY GREATER
--  THAN NOUGHT recorded for that nursery -- Setting -> Plot Capacity. A
--  transfer plot (-R) is not in the built-in list, so the capacity is the
--  only thing that puts it there.
--
--  This says, for every plot ending in -R, whether Seedling Stock knows it
--  and whether a capacity is on record. Between them that is which button to
--  press.
--
--  WHAT TO LOOK FOR
--
--    capacity a number greater than 0, and listed = yes
--      -> the plot IS on the list and the rows should be drawing. If they
--         are not, the nursery name differs between the two tables. The
--         "nursery" columns below say which names are in play.
--
--    capacity 0 or (none), listed = yes
--      -> Setting -> Plot Capacity, find the plot, key its capacity. The
--         rows appear as soon as it is above nought.
--
--    listed = no
--      -> Seedling Stock has no such plot, so the Setting grid will not
--         offer it. Add the plot there first (Seedling Stock -> plots), or
--         say so and the maintenance page can be given a way to key the name
--         directly -- the function is already written and has no button.
-- =====================================================================
WITH r AS (
  SELECT DISTINCT trim(plot_name) AS plot, trim(nursery_name) AS nursery
    FROM shared_plots
   WHERE right(trim(plot_name), 2) = '-R'
),
q AS (
  SELECT trim(plot) AS plot, trim(nursery) AS nursery, qty
    FROM nops_maint_plot_qty
   WHERE right(trim(plot), 2) = '-R'
)
SELECT * FROM (
  SELECT 1 AS ord,
         'in Seedling Stock'                       AS what,
         r.plot                                    AS plot,
         r.nursery                                 AS nursery,
         'listed = yes'                            AS detail
    FROM r

  UNION ALL

  SELECT 2,
         'capacity on record',
         q.plot,
         COALESCE(q.nursery, '(no nursery)'),
         'capacity = ' || COALESCE(q.qty::text, '(none)')
           || CASE WHEN COALESCE(q.qty, 0) > 0 THEN ' - this plot IS on the list'
                   ELSE ' - NOT above nought, so the plot is not on the list' END
    FROM q

  UNION ALL

  -- A plot the maintenance list has rows for that Seedling Stock does not
  -- know at all. The Setting grid is built from Seedling Stock, so it cannot
  -- offer one of these and the capacity cannot be keyed against it.
  SELECT 3,
         'rows but no plot',
         x.plot,
         '(not in Seedling Stock)',
         x.n::text || ' rows on the maintenance list'
    FROM (
      SELECT rec ->> 'plot' AS plot, count(*) AS n
        FROM nops_maint_records m,
             jsonb_array_elements(COALESCE(m.records, '[]'::jsonb)) rec
       WHERE m.id = 1
         AND right(COALESCE(rec ->> 'plot', ''), 2) = '-R'
       GROUP BY rec ->> 'plot'
    ) x
   WHERE NOT EXISTS (SELECT 1 FROM r WHERE r.plot = x.plot)
) y
ORDER BY ord, plot, nursery;
