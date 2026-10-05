-- =====================================================================
--  WHAT IS ACTUALLY IN THE WORK MAINTENANCE LIST
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  READ-ONLY. It changes nothing.
--  No regular expressions and no backslashes, so it survives a paste.
--
--  WHY
--  Rows added by hand went missing, and rows that had been edited came back
--  to their old wording. The cause is fixed in the page, but that fix cannot
--  bring back what was already overwritten -- the whole list lives in ONE
--  JSONB column that is rewritten every time it is saved, so the previous
--  contents are not kept anywhere this can read.
--
--  There is one case where nothing was lost and the row is simply not drawn:
--  the list only shows plots that belong to the nursery on the topbar, so a
--  row on a plot that nursery's list does not hold -- a transfer plot like
--  B3-R, a plot keyed with a space or a different case -- is IN the data and
--  invisible on the screen. This says which rows those are.
--
--  WHAT TO LOOK FOR
--
--    "saved"      -- when the list was last written, and how many rows it
--                    holds. If that time is BEFORE the rows went missing,
--                    nothing has overwritten them since.
--
--    "plot" rows  -- every plot in the list and how many rows it has. The
--                    standard plots are B1-B14, U1-U18, N1-N20, P01-P52.
--                    Anything else here is a row the screen will not draw
--                    unless that plot has been added to its nursery under
--                    Setting -> Plot Capacity.
--
--    "transfer plot" rows -- the ones ending in -R, called out on their own
--                    because they are the usual answer: added, saved, and
--                    never shown.
--
--    NOTHING AT ALL for a plot you added -- then that row was overwritten
--    and has to be keyed again. The page will not do it again: a row with no
--    schedule slot is no longer touched by the sync.
-- =====================================================================
WITH blob AS (
  SELECT records, updated_at
    FROM nops_maint_records
   WHERE id = 1
),
rows AS (
  SELECT r ->> 'plot'  AS plot,
         r ->> 'jenis' AS jenis,
         r ->> 'racun' AS racun,
         r ->> 'tarikh' AS tarikh
    FROM blob, jsonb_array_elements(COALESCE(blob.records, '[]'::jsonb)) r
)
SELECT * FROM (
  SELECT 1 AS ord,
         'saved'                                        AS what,
         to_char((SELECT updated_at FROM blob), 'YYYY-MM-DD HH24:MI') AS detail_1,
         (SELECT count(*)::text FROM rows) || ' rows'    AS detail_2,
         'when the list was last written'                AS detail_3

  UNION ALL

  -- Every plot the list holds, and whether the standard lists know it.
  SELECT 2,
         CASE WHEN right(COALESCE(plot, ''), 2) = '-R'
              THEN 'transfer plot' ELSE 'plot' END,
         COALESCE(plot, '(no plot)'),
         count(*)::text || ' rows',
         CASE
           WHEN COALESCE(plot, '') = '' THEN 'no plot on the row - never drawn'
           WHEN right(plot, 2) = '-R'
             THEN 'add it under Setting -> Plot Capacity, or it is not drawn'
           WHEN left(plot, 1) IN ('B', 'U', 'N', 'P') THEN 'a standard plot'
           ELSE 'not a standard plot - add it under Setting -> Plot Capacity'
         END
    FROM rows
   GROUP BY plot

  UNION ALL

  -- The rows on those plots, so they can be recognised one by one.
  SELECT 3,
         'row on ' || COALESCE(plot, '(no plot)'),
         COALESCE(racun, '(no chemical)'),
         COALESCE(jenis, ''),
         CASE WHEN COALESCE(tarikh, '-') = '-' THEN 'no date keyed'
              ELSE 'dated ' || tarikh END
    FROM rows
   WHERE COALESCE(plot, '') = ''
      OR right(plot, 2) = '-R'
      OR left(plot, 1) NOT IN ('B', 'U', 'N', 'P')
) x
ORDER BY ord, detail_1, detail_2;
