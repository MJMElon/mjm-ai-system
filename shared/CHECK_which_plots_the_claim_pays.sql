-- =====================================================================
--  WHICH PLOTS THE SALARY CLAIM CAN PAY, AND WHICH IT STILL CANNOT
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  READ-ONLY. It changes nothing.
--  No regular expressions and no backslashes, so it survives a paste.
--
--  WHY
--  A work record names its PLOT and nothing else, so the plot is what puts it
--  back under a nursery. A plot the claim cannot place is capacity dropped on
--  the floor -- the sheet shows dashes, which look exactly like a quiet month.
--
--  The claim places a plot three ways, and this asks all three the way the
--  page does, on letters and digits:
--
--    BUILT IN        B1-B14, U1-U18, N1-N20, P01-P52
--    SEEDLING STOCK  shared_plots -- where the office says which nursery a
--                    plot is in. This is the one the transfer plots ("-R")
--                    come through, and the one the claim could not read until
--                    now.
--    ADDED BY HAND   nops_maint_custom_plots
--
--  WHAT TO LOOK FOR
--
--    ord 1, 'summary'
--      -> how many plots carry work records, and how many of those still
--         belong to nobody.
--
--    ord 2, 'PAYS NOBODY'
--      -> work on these is still not priced. Hopefully none. If a "-R" plot
--         is here, Seedling Stock does not have it under any nursery this
--         page knows -- add it there.
--
--    ord 3, 'paid'
--      -> every plot that carries work, the nursery it pays into, how many
--         rows it has, and which of the three placed it. The "-R" lines
--         reading 'Seedling Stock' are the ones that paid nobody before.
-- =====================================================================
WITH rec AS (
  SELECT trim(COALESCE(r ->> 'plot', '')) AS plot, count(*) AS rows_on_it
    FROM nops_maint_records m,
         jsonb_array_elements(COALESCE(m.records, '[]'::jsonb)) r
   WHERE m.id = 1
     AND trim(COALESCE(r ->> 'plot', '')) <> ''
   GROUP BY 1
),
k AS (
  SELECT plot, rows_on_it,
         upper(replace(replace(replace(plot, ' ', ''), '-', ''), '_', '')) AS pk
    FROM rec
),
builtin AS (
  SELECT 'B' || g AS p FROM generate_series(1, 14) g
  UNION ALL SELECT 'U' || g FROM generate_series(1, 18) g
  UNION ALL SELECT 'N' || g FROM generate_series(1, 20) g
  UNION ALL SELECT 'P' || to_char(g, 'FM00') FROM generate_series(1, 52) g
),
stock AS (
  SELECT upper(replace(replace(replace(trim(plot_name), ' ', ''), '-', ''), '_', '')) AS pk,
         max(trim(nursery_name)) AS nursery
    FROM shared_plots
   WHERE trim(COALESCE(plot_name, '')) <> ''
   GROUP BY 1
),
cust AS (
  SELECT upper(replace(replace(replace(trim(plot), ' ', ''), '-', ''), '_', '')) AS pk,
         max(trim(nursery)) AS nursery
    FROM nops_maint_custom_plots
   WHERE trim(COALESCE(plot, '')) <> ''
   GROUP BY 1
),
j AS (
  SELECT k.plot, k.rows_on_it, k.pk,
         (SELECT 1 FROM builtin b
           WHERE upper(b.p) = k.pk LIMIT 1) AS is_builtin,
         s.nursery AS stock_nursery,
         c.nursery AS custom_nursery
    FROM k LEFT JOIN stock s ON s.pk = k.pk
           LEFT JOIN cust  c ON c.pk = k.pk
)
SELECT * FROM (
  SELECT 1 AS ord, 'summary' AS what, '(all plots)' AS plot, '' AS nursery,
         (SELECT count(*)::text FROM j) || ' plots carry work records, '
           || (SELECT count(*)::text FROM j
                WHERE is_builtin IS NULL AND stock_nursery IS NULL AND custom_nursery IS NULL)
           || ' of them belong to nobody' AS detail

  UNION ALL

  SELECT 2, 'PAYS NOBODY', plot, '(none)',
         rows_on_it::text || ' rows, and no nursery claims this plot'
    FROM j
   WHERE is_builtin IS NULL AND stock_nursery IS NULL AND custom_nursery IS NULL

  UNION ALL

  SELECT 3, 'paid', plot,
         COALESCE(stock_nursery, custom_nursery,
                  CASE WHEN is_builtin IS NOT NULL THEN '(built in)' END),
         rows_on_it::text || ' rows, placed by '
           || CASE WHEN is_builtin IS NOT NULL THEN 'the built-in list'
                   WHEN stock_nursery IS NOT NULL THEN 'Seedling Stock'
                   ELSE 'a plot added by hand' END
    FROM j
   WHERE is_builtin IS NOT NULL OR stock_nursery IS NOT NULL OR custom_nursery IS NOT NULL
) y
ORDER BY ord, left(plot, 1), length(plot), plot;
