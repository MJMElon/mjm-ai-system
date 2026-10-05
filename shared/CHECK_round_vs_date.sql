-- =====================================================================
--  A ROUND DATED BEFORE THE ROUND BEFORE IT
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  READ-ONLY. It changes nothing.
--  No regular expressions and no backslashes, so it survives a paste.
--
--  WHY
--  A plot's rounds happen in order: Round 4 cannot be worked before Round 3.
--  So a round carrying an EARLIER date than the round before it is a date
--  that is wrong -- keyed wrong, or paired to the wrong round when the field
--  record came in.
--
--  It was invisible while the list drew in round order: the rounds climbed
--  and nobody reads down the date column checking. Sorting by date turned it
--  the other way up -- the dates climb and the ROUND numbers jump -- which is
--  what makes it visible, and is not itself the fault.
--
--  WHAT TO LOOK FOR
--
--    ord 1, 'summary'  -> how many plot-and-job groups have one.
--    ord 2, 'OUT OF STEP' -> the round, its date, and the round before it
--       with its date. One of those two dates is wrong. The drone map, the
--       field record or the paper says which.
--    Nothing listed means every round of every plot is dated after the one
--    before it.
-- =====================================================================
WITH r AS (
  SELECT trim(COALESCE(t.rec ->> 'plot', ''))   AS plot,
         COALESCE(t.rec ->> 'jenis', '')        AS jenis,
         trim(COALESCE(t.rec ->> 'tarikh', '-')) AS tarikh,
         COALESCE(t.rec ->> 'racun', '')        AS racun
    FROM nops_maint_records m,
         jsonb_array_elements(COALESCE(m.records, '[]'::jsonb))
           WITH ORDINALITY AS t(rec, ord)
   WHERE m.id = 1
),
d AS (
  SELECT plot, tarikh, racun,
         CASE WHEN position('Penyemburan' IN jenis) > 0 THEN 'P & D Spraying'
              WHEN position('rumput secara' IN jenis) > 0 THEN 'Interrow Spraying'
              WHEN position('Merumput' IN jenis) > 0 THEN 'Weeding'
              WHEN position('Membaja' IN jenis) > 0 THEN 'Manuring'
              ELSE COALESCE(NULLIF(jenis, ''), '(no job)') END AS job,
         -- "Round 3: Thiram 50gm" -> 3, with no regular expression in sight.
         CASE WHEN left(racun, 6) = 'Round '
               AND length(NULLIF(trim(split_part(split_part(racun, 'Round ', 2), ':', 1)), '')) > 0
               AND translate(trim(split_part(split_part(racun, 'Round ', 2), ':', 1)),
                             '0123456789', '') = ''
              THEN trim(split_part(split_part(racun, 'Round ', 2), ':', 1))::int END AS rnd
    FROM r
   WHERE plot <> '' AND tarikh NOT IN ('', '-')
),
seq AS (
  SELECT plot, job, rnd, tarikh,
         lag(rnd)    OVER (PARTITION BY plot, job ORDER BY rnd, tarikh) AS prev_rnd,
         lag(tarikh) OVER (PARTITION BY plot, job ORDER BY rnd, tarikh) AS prev_date
    FROM d
   WHERE rnd IS NOT NULL
),
bad AS (
  SELECT * FROM seq
   WHERE prev_rnd IS NOT NULL AND prev_rnd < rnd AND tarikh < prev_date
)
SELECT * FROM (
  SELECT 1 AS ord, 'summary' AS what, '(all plots)' AS plot, '' AS job,
         (SELECT count(*)::text FROM bad)
           || ' rounds are dated before the round before them' AS detail
  UNION ALL
  SELECT 2, 'OUT OF STEP', plot, job,
         'Round ' || rnd::text || ' is dated ' || tarikh
           || ', but Round ' || prev_rnd::text || ' is dated ' || prev_date
           || ' - one of those two dates is wrong'
    FROM bad
) y
ORDER BY ord, left(plot, 1), length(plot), plot, job;
