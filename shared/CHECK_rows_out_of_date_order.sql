-- =====================================================================
--  WHERE THE DATES WERE OUT OF ORDER, AND SO HAVE MOVED ON SCREEN
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  READ-ONLY. It changes nothing.
--  No regular expressions and no backslashes, so it survives a paste.
--
--  WHY
--  The Work Record and the Worker Record used to draw their rows in the
--  order the list happens to be SAVED in -- which is the order the schedule
--  generated them, every P & D round before every manuring round, with
--  anything added later on the end. They are sorted now: the Work Record by
--  work type then day, the Worker Record by plot then day.
--
--  That moves rows on EVERY plot that had a group whose dates did not
--  already climb. This says which, so the change can be seen rather than
--  taken on trust. Nothing in the data moved -- only where a row is drawn.
--
--  WHAT TO LOOK FOR
--
--    ord 1, 'summary'
--      -> how many plot-and-job groups there are, and how many of them were
--         out of date order.
--
--    ord 2, 'MOVED'
--      -> one line per plot and job whose rows the sorting reordered, with
--         the dates as they were SAVED. Read it as: this group used to draw
--         in this order, and now draws oldest first.
--
--    ord 3, 'already in order'
--      -> counted per nursery letter only. These look exactly as they did.
--
--  A row with no date yet ('-') counts as the end of its group, because it
--  has not happened. In the saved order it could be anywhere.
-- =====================================================================
WITH r AS (
  SELECT t.ord,
         trim(COALESCE(t.rec ->> 'plot', ''))   AS plot,
         COALESCE(t.rec ->> 'jenis', '')        AS jenis,
         COALESCE(t.rec ->> 'tarikh', '-')      AS tarikh
    FROM nops_maint_records m,
         jsonb_array_elements(COALESCE(m.records, '[]'::jsonb))
           WITH ORDINALITY AS t(rec, ord)
   WHERE m.id = 1
),
d AS (
  SELECT plot, ord, tarikh,
         CASE WHEN position('Penyemburan' IN jenis) > 0 THEN 'P & D Spraying'
              WHEN position('rumput secara' IN jenis) > 0 THEN 'Interrow Spraying'
              WHEN position('Merumput' IN jenis) > 0 THEN 'Weeding'
              WHEN position('Membaja' IN jenis) > 0 THEN 'Manuring'
              ELSE COALESCE(NULLIF(jenis, ''), '(no job)') END AS job,
         CASE WHEN trim(tarikh) IN ('', '-') THEN '9999-99-99'
              ELSE trim(tarikh) END AS day
    FROM r
   WHERE plot <> ''
),
seq AS (
  SELECT plot, job, ord, tarikh, day,
         lag(day) OVER (PARTITION BY plot, job ORDER BY ord) AS prev
    FROM d
),
bad AS (
  SELECT DISTINCT plot, job FROM seq WHERE prev IS NOT NULL AND day < prev
),
grp AS (
  SELECT DISTINCT plot, job FROM d
),
saved AS (
  SELECT seq.plot, seq.job,
         string_agg(CASE WHEN trim(seq.tarikh) IN ('', '-') THEN 'no date'
                         ELSE trim(seq.tarikh) END, ' -> ' ORDER BY seq.ord) AS was
    FROM seq JOIN bad ON bad.plot = seq.plot AND bad.job = seq.job
   GROUP BY seq.plot, seq.job
)
SELECT * FROM (
  SELECT 1 AS ord,
         'summary'                                   AS what,
         '(all plots)'                               AS plot,
         ''                                          AS job,
         (SELECT count(*)::text FROM grp) || ' plot-and-job groups, '
           || (SELECT count(*)::text FROM bad) || ' of them were out of order' AS detail

  UNION ALL

  SELECT 2, 'MOVED', plot, job,
         'was saved as ' || was
    FROM saved

  UNION ALL

  SELECT 3, 'already in order', left(plot, 1) || ' plots',
         '(' || count(*)::text || ' groups)',
         'these look exactly as they did'
    FROM grp
   WHERE NOT EXISTS (SELECT 1 FROM bad WHERE bad.plot = grp.plot AND bad.job = grp.job)
   GROUP BY left(plot, 1)
) y
ORDER BY ord, left(plot, 1), length(plot), plot, job;
