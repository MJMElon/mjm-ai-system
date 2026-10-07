-- =====================================================================
--  WHICH INTERROW ROWS CANNOT SHOW THE FULL-PLOT FIGURE
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  READ-ONLY. It changes nothing.
--  No regular expressions and no backslashes, so it survives a paste.
--
--  WHY
--  Interrow spraying is now counted as the WHOLE PLOT, before the 2nd
--  culling: the worker walks the whole plot and the polybags a 2nd culling
--  emptied are still standing in the rows. The page works that out from the
--  batch report, for every plot, with nobody keying anything.
--
--  It cannot do it on a row that already has a QUANTITY KEYED BY HAND. A
--  keyed number always wins -- that is what keying one means -- so a row
--  somebody typed 6,515 into last month goes on reading 6,515. It is not
--  that the job was not recognised; the page was never asked.
--
--  This names every such row, on every plot. The remedy is one thing: open
--  the row, CLEAR the Quantity cell, save. It will link itself from then on.
--
--  WHAT TO LOOK FOR
--
--    ord 1, summary
--      -> how many interrow rows there are, and how many are blocked.
--
--    ord 2, quantity keyed by hand
--      -> these are the ones reading the old number. Clear the Quantity cell
--         on each. If the keyed figure is one you want to keep, leave it --
--         a keyed number is a decision and the page will not overrule it.
--
--    ord 3, links by itself
--      -> nothing keyed, so these already show the whole plot before the 2nd
--         culling. Nothing to do.
--
--    A batch written on an interrow row is no longer a problem and is not
--    listed: interrow covers the plot, so the batch name is ignored when the
--    figure is worked out.
-- =====================================================================
WITH src AS (
  SELECT rec ->> 'plot'   AS plot,
         rec ->> 'jenis'  AS jenis,
         rec ->> 'racun'  AS racun,
         rec ->> 'tarikh' AS tarikh,
         rec ->> 'qty'    AS qty,
         rec ->> 'batch'  AS batch
    FROM nops_maint_records m,
         jsonb_array_elements(COALESCE(m.records, '[]'::jsonb)) rec
   WHERE m.id = 1
),
ir AS (
  SELECT *
    FROM src
   WHERE lower(COALESCE(jenis, '')) LIKE '%rumput secara selingan%'
      OR lower(COALESCE(jenis, '')) LIKE '%interrow%'
),
blocked AS (SELECT * FROM ir WHERE COALESCE(qty, '') NOT IN ('', 'null')),
linking AS (SELECT * FROM ir WHERE COALESCE(qty, '') IN ('', 'null'))
SELECT * FROM (
  SELECT 1 AS ord,
         'summary'                                   AS what,
         '(all plots)'                               AS plot,
         ''                                          AS worked,
         (SELECT count(*)::text FROM ir) || ' interrow rows, '
           || (SELECT count(*)::text FROM blocked)
           || ' with a quantity keyed by hand'        AS detail

  UNION ALL

  SELECT 2, 'quantity keyed by hand',
         COALESCE(plot, '(no plot)'),
         COALESCE(NULLIF(tarikh, '-'), 'no date'),
         'qty ' || qty || ' - clear the Quantity cell on this row and it links'
    FROM blocked

  UNION ALL

  SELECT 3, 'links by itself',
         COALESCE(plot, '(no plot)'),
         COALESCE(NULLIF(tarikh, '-'), 'no date'),
         'nothing keyed - already the whole plot before the 2nd culling'
    FROM linking
) y
ORDER BY ord, left(plot, 1), length(plot), plot, worked;
