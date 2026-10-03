-- =====================================================================
--  WHICH 2ND CULLING ROWS WERE SAVED WHILE THE TAB WAS DOUBLING
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  READ-ONLY. It changes nothing.
--  No regular expressions and no backslashes, so it survives a paste.
--
--  WHY
--  When two runs of the 2nd Culling tab's load overlapped, the merge SUMMED
--  the rows it joined -- so both the DEAD figure and the TRANSPLANTED figure
--  doubled. Save writes what is on screen, so a save made in that state
--  wrote the doubled Dead into the row AND the doubled Transplanted into its
--  remark.
--
--  That second number is the fingerprint. The real transplanted total for a
--  plot is the sum of its Transplanted rows in this same table, and it is
--  not something the culling tab can change. So a 2nd culling remark saying
--  TWICE (or three times, or five times) what the transplant rows say is a
--  row that was saved while the screen was doubling -- and its Dead is out
--  by the same multiple.
--
--  Every batch, not one. The page is fixed; this is for what is already in.
--
--  WHAT TO LOOK FOR
--
--    ord 1, 'summary'
--      -> how many 2nd culling rows there are, how many carry an exact
--         multiple, and how many differ some other way.
--
--    ord 2, 'SAVED WHILE DOUBLING'
--      -> the remark's Transplanted is an exact multiple of what the
--         transplant rows say. 'dead now' is out by that same multiple, and
--         the line gives the figure it should be. Check one or two against
--         the paper before trusting the lot -- then say so and the repair
--         can be written to sweep them all.
--
--    ord 3, 'transplanted differs, not a multiple'
--      -> the two numbers disagree but not by a whole multiple. That is NOT
--         this fault: a plot transplanted in two goes, an approved stock
--         adjustment, or a row keyed before a later transplant will all do
--         it. Listed so it is not mistaken for the above, and so a genuinely
--         odd one can be seen.
--
--    Rows where the two numbers agree are counted in the summary and not
--    listed. Those are fine.
-- =====================================================================
WITH c AS (
  SELECT trim(COALESCE(batch_name, '')) AS batch,
         trim(COALESCE(plot_name, ''))  AS plot,
         COALESCE(quantity_change, 0)   AS dead,
         NULLIF(trim(split_part(split_part(COALESCE(remark, ''), 'Transplanted:', 2), '.', 1)), '') AS said
    FROM shared_inventory_logs
   WHERE transaction_type = '2nd_Culling'
),
-- Digits only, so a remark that never carried the number cannot break the cast.
cn AS (
  SELECT batch, plot, dead,
         CASE WHEN said IS NOT NULL AND translate(said, '0123456789', '') = ''
              THEN said::bigint END AS said_n
    FROM c
),
t AS (
  SELECT trim(COALESCE(batch_name, '')) AS batch,
         trim(COALESCE(plot_name, ''))  AS plot,
         sum(abs(COALESCE(quantity_change, 0))) AS actual
    FROM shared_inventory_logs
   WHERE transaction_type IN ('Transplanted', 'Transplanted_DoubleTone')
   GROUP BY 1, 2
),
j AS (
  SELECT cn.batch, cn.plot, cn.dead, cn.said_n, t.actual,
         CASE WHEN t.actual IS NOT NULL AND t.actual > 0
               AND cn.said_n IS NOT NULL
               AND cn.said_n > t.actual
               AND cn.said_n % t.actual = 0
              THEN cn.said_n / t.actual END AS mult
    FROM cn LEFT JOIN t ON t.batch = cn.batch AND t.plot = cn.plot
)
SELECT * FROM (
  SELECT 1 AS ord,
         'summary'                                    AS what,
         '(all batches)'                              AS batch,
         ''                                           AS plot,
         ''                                           AS dead_now,
         (SELECT count(*)::text FROM j) || ' rows, '
           || (SELECT count(*)::text FROM j WHERE mult IS NOT NULL)
           || ' saved while doubling, '
           || (SELECT count(*)::text FROM j
                WHERE mult IS NULL AND said_n IS NOT NULL AND actual IS NOT NULL
                  AND said_n <> actual)
           || ' differ some other way'                 AS detail

  UNION ALL

  SELECT 2, 'SAVED WHILE DOUBLING', batch, plot, dead::text,
         'remark says transplanted ' || said_n::text
           || ' but the transplant rows say ' || actual::text
           || ' - times ' || mult::text
           || ', so dead should be ' || (dead / mult)::text
    FROM j WHERE mult IS NOT NULL

  UNION ALL

  SELECT 3, 'transplanted differs, not a multiple', batch, plot, dead::text,
         'remark says ' || COALESCE(said_n::text, '(none)')
           || ', transplant rows say ' || COALESCE(actual::text, '(no rows)')
           || ' - not this fault, look only if it surprises you'
    FROM j
   WHERE mult IS NULL AND said_n IS NOT NULL AND actual IS NOT NULL
     AND said_n <> actual
) y
ORDER BY ord, batch, left(plot, 1), length(plot), plot;
