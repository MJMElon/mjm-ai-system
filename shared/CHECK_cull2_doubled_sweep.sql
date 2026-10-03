-- =====================================================================
--  WHICH 2ND CULLING ROWS WERE SAVED WHILE THE TAB WAS DOUBLING
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  READ-ONLY. It changes nothing.
--  No regular expressions and no backslashes, so it survives a paste.
--
--  WHY
--  When two runs of the 2nd Culling tab's load overlapped, the merge SUMMED
--  the rows it joined -- both the DEAD figure and the TRANSPLANTED one. Save
--  writes what is on screen, so a save made in that state wrote the doubled
--  Dead into the row AND the doubled Transplanted into its remark.
--
--  That second number is the fingerprint. The real transplanted total for a
--  plot is the sum of its Transplanted rows in this same table, and the
--  culling tab cannot touch it. A 2nd culling remark claiming an exact
--  multiple of that is a row whose LAST save was made while the screen was
--  doubling.
--
--  BUT NOT EVERY DEAD ON SUCH A ROW IS DOUBLED. A Dead somebody TYPED in
--  that same session was saved as typed -- only the ones left alone carried
--  the doubled figure up from the database. The division tells them apart:
--  a Dead that does not divide by the multiple cannot have come from
--  doubling an whole number, so it was keyed by hand and is right as it is.
--
--  AND IT ONLY SEES THE LAST SAVE. Open the tab again on a good day and save,
--  and the remark's Transplanted is written back correct while the doubled
--  Dead stays -- the fingerprint is wiped and the wrong number is not. So a
--  clean result here does NOT mean a batch was never doubled. Batch 254 is
--  exactly that case and does not appear below.
--
--  WHAT TO LOOK FOR
--
--    ord 1, 'summary'
--      -> the counts.
--
--    ord 2, 'DEAD IS DOUBLED'
--      -> the multiple divides the Dead exactly. The line gives the figure
--         it should be. Check one or two against the paper, then the repair
--         can be written to sweep them.
--
--    ord 3, 'keyed by hand that day'
--      -> same doubled save, but this Dead does not divide by the multiple,
--         so somebody typed it in that session. It is RIGHT. Left alone.
--
--    ord 4, 'transplanted differs, not a multiple'
--      -> the two numbers disagree but not by a whole multiple. NOT this
--         fault: a plot transplanted in two goes, an approved adjustment, or
--         a culling keyed before a later transplant all do it.
--
--    Rows where the two agree are counted in the summary and not listed.
-- =====================================================================
WITH c AS (
  SELECT trim(COALESCE(batch_name, '')) AS batch,
         trim(COALESCE(plot_name, ''))  AS plot,
         COALESCE(quantity_change, 0)::bigint AS dead,
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
         sum(abs(COALESCE(quantity_change, 0)))::bigint AS actual
    FROM shared_inventory_logs
   WHERE transaction_type IN ('Transplanted', 'Transplanted_DoubleTone')
   GROUP BY 1, 2
),
j AS (
  SELECT cn.batch, cn.plot, cn.dead, cn.said_n, t.actual,
         CASE WHEN t.actual IS NOT NULL AND t.actual > 0
               AND cn.said_n IS NOT NULL
               AND cn.said_n > t.actual
               AND mod(cn.said_n, t.actual) = 0
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
           || (SELECT count(*)::text FROM j WHERE mult IS NOT NULL AND mod(dead, mult) = 0)
           || ' with a doubled Dead, '
           || (SELECT count(*)::text FROM j WHERE mult IS NOT NULL AND mod(dead, mult) <> 0)
           || ' keyed by hand that day, '
           || (SELECT count(*)::text FROM j
                WHERE mult IS NULL AND said_n IS NOT NULL AND actual IS NOT NULL
                  AND said_n <> actual)
           || ' differ some other way'                 AS detail

  UNION ALL

  SELECT 2, 'DEAD IS DOUBLED', batch, plot, dead::text,
         'transplanted: remark ' || said_n::text || ' vs rows ' || actual::text
           || ' - times ' || mult::text
           || ', so dead should be ' || (dead / mult)::text
    FROM j WHERE mult IS NOT NULL AND mod(dead, mult) = 0

  UNION ALL

  SELECT 3, 'keyed by hand that day', batch, plot, dead::text,
         'transplanted: remark ' || said_n::text || ' vs rows ' || actual::text
           || ' - times ' || mult::text
           || ', but ' || dead::text || ' does not divide by it, so this one was typed. Leave it.'
    FROM j WHERE mult IS NOT NULL AND mod(dead, mult) <> 0

  UNION ALL

  SELECT 4, 'transplanted differs, not a multiple', batch, plot, dead::text,
         'remark ' || COALESCE(said_n::text, '(none)')
           || ' vs rows ' || COALESCE(actual::text, '(no rows)')
           || ' - not this fault, look only if it surprises you'
    FROM j
   WHERE mult IS NULL AND said_n IS NOT NULL AND actual IS NOT NULL
     AND said_n <> actual
) y
ORDER BY ord, batch, left(plot, 1), length(plot), plot;
