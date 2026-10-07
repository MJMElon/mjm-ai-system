-- =====================================================================
--  WHICH PLOTS CHANGED POSITION IN THE LISTS
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  READ-ONLY. It changes nothing.
--  No regular expressions and no backslashes, so it survives a paste.
--
--  WHY
--  Every list on the maintenance page is drawn from one array per nursery.
--  That array starts as the built-in plots -- B1 to B14, U1 to U18, N1 to
--  N20 -- and anything else is APPENDED to the end of it: a transfer plot
--  (-R), a plot added by hand, a plot that earned its place by having a
--  capacity or rows of its own. So those sat after B14 on every screen built
--  from the array: the Work Record, the four schedule editors, the Worker
--  Record, the PDF.
--
--  They are sorted by name now, so a transfer plot sits behind the plot it
--  came off. ONLY the appended ones moved. The built-in plots were already
--  in that order and have not moved at all.
--
--  Nothing in the data is keyed by position -- a row is filed under its plot
--  NAME -- so this changes where a plot is drawn and nothing else.
--
--  WHAT TO LOOK FOR
--
--    ord 1, summary
--      -> how many plots there are and how many of them moved.
--
--    ord 2, MOVED
--      -> these are the ones that used to be at the end of their nurserys
--         list and now sit in name order. The line says where each one now
--         sits -- and says so plainly when the plot it is named after does
--         not exist, because then there is nowhere for it to sit but the end.
--
--    ord 3, did not move
--      -> counted only, because they are every ordinary plot.
-- =====================================================================
WITH p AS (
  SELECT DISTINCT trim(nursery_name) AS nursery, trim(plot_name) AS plot
    FROM shared_plots
   WHERE trim(COALESCE(plot_name, '')) <> ''
),
k AS (
  SELECT nursery, plot,
         left(plot, 1)  AS head,
         substr(plot, 2) AS tail
    FROM p
),
j AS (
  SELECT nursery, plot, head, tail,
         -- A built-in plot is a letter and nothing but digits after it,
         -- inside the range the page was written with.
         CASE WHEN length(tail) > 0 AND translate(tail, '0123456789', '') = ''
              THEN tail::int END AS num
    FROM k
),
f AS (
  SELECT nursery, plot, head, num,
         CASE WHEN num IS NULL THEN false
              WHEN head = 'B' AND num BETWEEN 1 AND 14 THEN true
              WHEN head = 'U' AND num BETWEEN 1 AND 18 THEN true
              WHEN head = 'N' AND num BETWEEN 1 AND 20 THEN true
              ELSE false END AS built_in
    FROM j
)
SELECT * FROM (
  SELECT 1 AS ord,
         'summary'                                AS what,
         '(all nurseries)'                        AS nursery,
         ''                                       AS plot,
         (SELECT count(*)::text FROM f) || ' plots, '
           || (SELECT count(*)::text FROM f WHERE NOT built_in)
           || ' of them moved'                     AS detail

  UNION ALL

  SELECT 2, 'MOVED', f.nursery, f.plot,
         'was at the end of ' || f.nursery || ', now sits in name order'
           || CASE
                WHEN right(f.plot, 2) <> '-R' THEN ''
                /* Only claim a parent that EXISTS. UP-R and NP-R have none --
                   there is no plot called UP or NP -- so they sort after
                   every numbered plot of their nursery, which is the end,
                   which is where they already were. */
                WHEN EXISTS (SELECT 1 FROM p q
                              WHERE q.nursery = f.nursery
                                AND q.plot = left(f.plot, length(f.plot) - 2))
                THEN ' - behind ' || left(f.plot, length(f.plot) - 2)
                ELSE ' - no plot called ' || left(f.plot, length(f.plot) - 2)
                     || ', so it sorts after every numbered plot: the end of '
                     || f.nursery || ', where it already was'
              END
    FROM f WHERE NOT f.built_in

  UNION ALL

  SELECT 3, 'did not move', nursery, '(' || count(*)::text || ' plots)',
         'the built-in plots, already in this order'
    FROM f WHERE built_in GROUP BY nursery
) y
ORDER BY ord, nursery, left(plot, 1), length(plot), plot;
