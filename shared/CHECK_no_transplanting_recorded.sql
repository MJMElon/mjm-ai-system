-- =====================================================================
--  A NURSERY-MONTH WITH NO TRANSPLANTING RECORD AT ALL -- WHY
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  READ-ONLY. It changes nothing.
--  No regular expressions and no backslashes, so it survives a paste.
--
--  WHY
--  CHECK_transplant_not_on_claim.sql says WHICH records exist and what the
--  claim makes of them. When its answer is "0 record(s)" for a nursery
--  there is nothing left for it to report, and two questions remain:
--
--    1. Is the work filed under ANOTHER MONTH. A transplanting record is
--       stamped with the month the SHEET was on when it was keyed, not the
--       day the work was done. Key October work while the sheet is still
--       showing September and the row reads Sep 2026 with an October
--       work_date on it -- invisible to Octobers claim for ever.
--       shared/RUN_ME_move_transplant_month.sql is the repair.
--
--    2. Was there anything to record in the first place. The four
--       transplanting jobs are done where seedlings ARRIVE, so a nursery
--       that took no seedlings that month has no work to key and an empty
--       claim is simply correct.
--
--  This answers both, for every nursery, in one run.
--
-- WHAT TO LOOK FOR
--
--   ANY "month out of step" ROW
--   -> that record is filed under a month it was not worked in. If its
--      work_date falls in the month you are asking about, THAT is the
--      missing work. Move it with RUN_ME_move_transplant_month.sql rather
--      than re-keying it, or the sheet it is on now loses it.
--
--   A "ledger" ROW FOR THE NURSERY, AND NO RECORD
--   -> seedlings went into that nurserys plots and nobody keyed the work.
--      The FC Portal raises it under Maintenance -> Transplanting Job, and
--      the dashboard Verification Board raises the plot while any of its
--      four jobs is unrecorded.
--
--   NO "ledger" ROW FOR THE NURSERY
--   -> nothing was transplanted into it that month, so there was no work
--      to record and the empty claim is right. This is the answer that
--      ends the question. Check the "plot not in Seedling Stock" rows
--      first: a nursery reads empty if its plot is not on that list.
--
--   A RECORD WITH NO work_date is on no "month out of step" row, because
--   there is nothing to compare it against. It is counted in section 3
--   under whatever month it was filed in.
--
--   "recorded in this month" ROWS
--   -> what IS keyed for the month, by nursery, so the two sides can be
--      read against each other without scrolling.
--
--  CHANGE THE MONTH ON THE NEXT LINE if it is not October 2026. It is the
--  FIRST of the month, as a date.
-- =====================================================================
WITH q AS (
  SELECT DATE '2026-10-01' AS m0
),
mth AS (
  SELECT m0,
         (m0 + INTERVAL '1 month')::date AS m1,
         to_char(m0, 'Mon YYYY')         AS label
    FROM q
),
-- A plot name compared the way a person compares it: letters and digits
-- only. The ledger and Seedling Stock do not always agree on spacing.
plots AS (
  SELECT upper(replace(replace(replace(btrim(COALESCE(p.plot_name, '')), ' ', ''), '-', ''), '_', '')) AS pk,
         btrim(COALESCE(p.nursery_name, '(no nursery)')) AS nursery
    FROM shared_plots p
),
tx AS (
  SELECT upper(replace(replace(replace(btrim(COALESCE(l.plot_name, '')), ' ', ''), '-', ''), '_', '')) AS pk,
         btrim(COALESCE(l.plot_name, '(no plot)'))   AS plot,
         l.transaction_type                          AS t,
         COALESCE(l.quantity_change, 0)              AS qty,
         COALESCE(l.transaction_date, l.created_at::date) AS happened
    FROM shared_inventory_logs l
)
SELECT * FROM (

  -- 1. RECORDS FILED UNDER A MONTH THEY WERE NOT WORKED IN.
  --    Asked of every record in the table, not only the month on screen:
  --    the whole point is that the missing work is somewhere else.
  SELECT 1 AS ord,
         'month out of step'                                   AS what,
         COALESCE(r.nursery_name, '(no nursery)') || ' / '
           || COALESCE(r.plot_name, '(no plot)')               AS detail_1,
         'says ' || COALESCE(r.schedule_month, '(none)')       AS detail_2,
         'worked ' || COALESCE(r.work_date::text, '(no date)') AS detail_3,
         CASE WHEN r.work_date >= (SELECT m0 FROM mth)
               AND r.work_date <  (SELECT m1 FROM mth)
              THEN 'THIS IS THE MONTH YOU ARE ASKING ABOUT -- the work is here'
              ELSE 'filed under ' || COALESCE(r.schedule_month, '(none)')
                   || ', worked in ' || to_char(r.work_date, 'Mon YYYY')
         END                                                   AS verdict
    FROM nops_transplant_field_records r
   WHERE r.work_date IS NOT NULL
     AND COALESCE(r.schedule_month, '') IS DISTINCT FROM to_char(r.work_date, 'Mon YYYY')

  UNION ALL

  -- 2. WHAT THE LEDGER SAYS ARRIVED IN EACH NURSERY THAT MONTH.
  --    One row per nursery per movement type, so a nursery that only took
  --    double tone is not read as a nursery that took nothing.
  SELECT 2,
         'ledger',
         p.nursery,
         tx.t,
         count(DISTINCT tx.plot)::text || ' plot(s) / '
           || sum(tx.qty)::text || ' seedlings',
         'seedlings arrived here in ' || (SELECT label FROM mth)
           || ' -- the four jobs are owed on these plots'
    FROM tx
    JOIN plots p ON p.pk = tx.pk
   WHERE tx.t IN ('Transplanted', 'Transplanted_Premium', 'Transplanted_DoubleTone')
     AND tx.happened >= (SELECT m0 FROM mth)
     AND tx.happened <  (SELECT m1 FROM mth)
   GROUP BY p.nursery, tx.t

  UNION ALL

  -- 2b. AND THE ARRIVALS SEEDLING STOCK CANNOT PLACE.
  --     Section 2 reads the nursery off shared_plots, so a plot missing
  --     from Seedling Stock would quietly drop out of it -- and a nursery
  --     declared empty because its plot is unlisted is the worst answer
  --     this file could give. Those plots are named instead.
  SELECT 2,
         'ledger, plot not in Seedling Stock',
         tx.plot,
         tx.t,
         sum(tx.qty)::text || ' seedlings',
         'this arrival is under no nursery -- add the plot in Seedling Stock'
    FROM tx
   WHERE tx.t IN ('Transplanted', 'Transplanted_Premium', 'Transplanted_DoubleTone')
     AND tx.happened >= (SELECT m0 FROM mth)
     AND tx.happened <  (SELECT m1 FROM mth)
     AND NOT EXISTS (SELECT 1 FROM plots p WHERE p.pk = tx.pk)
   GROUP BY tx.plot, tx.t

  UNION ALL

  -- 3. WHAT IS KEYED FOR THAT MONTH, BY NURSERY.
  SELECT 3,
         'recorded in this month',
         COALESCE(r.nursery_name, '(no nursery)'),
         count(*)::text || ' record(s)',
         count(DISTINCT r.plot_name)::text || ' plot(s)',
         'keyed on the FC Portal under ' || (SELECT label FROM mth)
    FROM nops_transplant_field_records r, mth
   WHERE r.schedule_month = mth.label
   GROUP BY r.nursery_name

  UNION ALL

  -- 4. THE ANSWER IN ONE LINE.
  SELECT 4,
         'summary',
         (SELECT label FROM mth),
         (SELECT count(*)::text FROM nops_transplant_field_records r, mth
           WHERE r.schedule_month = mth.label) || ' record(s) keyed',
         (SELECT count(DISTINCT p.nursery)::text
            FROM tx JOIN plots p ON p.pk = tx.pk, mth
           WHERE tx.t IN ('Transplanted', 'Transplanted_Premium', 'Transplanted_DoubleTone')
             AND tx.happened >= mth.m0 AND tx.happened < mth.m1)
           || ' nursery(s) took seedlings',
         'records filed under a month they were not worked in: '
           || (SELECT count(*)::text FROM nops_transplant_field_records r
                WHERE r.work_date IS NOT NULL
                  AND COALESCE(r.schedule_month, '')
                      IS DISTINCT FROM to_char(r.work_date, 'Mon YYYY'))

) x
ORDER BY ord, detail_1, detail_2;
