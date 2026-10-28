-- =====================================================================
--  WHY A TRANSPLANTED PLOT IS NOT ON PENDING VERIFICATION
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  READ-ONLY. It changes nothing.
--  No regular expressions and no backslashes, so it survives a paste.
--
--  WHY
--  The office counted their own cards: the board showed B2 and B3 and not
--  B11, over a month where all three took seedlings and none of the three
--  had a single job recorded.
--
--  This asks the question THE BOARD ASKS, which is not the question the
--  other checks ask, and the difference is the whole point:
--
--    · the board sums every arrival since TRANSPLANT_FLOW_FROM, which is
--      2026-08-25 -- not since the 1st of the month -- and it is ONE row
--      per plot carrying the total, however many deliveries it took
--    · it then asks whether that plot has each of the four jobs recorded
--      IN ANY MONTH since that same date, not in the month on screen
--    · so a plot whose four jobs were recorded for an EARLIER delivery
--      counts as done, and drops off the board the moment it is asked --
--      even though seedlings arrived again afterwards and that is four
--      more crews owed their pay
--    · and it counts ONLY the plain `Transplanted` movement. A plot that
--      took Premium or Double Tone and nothing else is invisible to it.
--
-- WHAT TO LOOK FOR
--
--   verdict "ON THE BOARD"
--   -> the plot is raised, or should be. If it is not on the phone, the
--      phone is holding an old copy -- hard reload it.
--
--   verdict "OFF THE BOARD, AND SEEDLINGS ARRIVED AFTER ITS JOBS WERE
--   RECORDED"
--   -> THIS IS THE FAULT. The four jobs were recorded for an earlier
--      delivery, so the board treats the plot as finished, while the
--      arrival in detail_3 has nobody named against it. detail_2 says
--      which day the newest record was keyed for, so the gap is readable.
--      Every row like this is work somebody did and nobody is being asked
--      to record.
--
--   verdict "off the board, correctly"
--   -> all four jobs recorded and nothing has arrived since.
--
--   verdict "NOT A PLAIN Transplanted ROW"
--   -> the plot took only Premium or Double Tone seedlings, which the
--      board does not count at all. It will never raise this plot.
--
--   CHANGE NOTHING unless the floor moved: the date on the next line is
--   TRANSPLANT_FLOW_FROM in transplantData.js, and the two must agree or
--   this file answers about a different window from the one the phone is
--   looking at.
-- =====================================================================
WITH q AS (
  SELECT DATE '2026-08-25' AS floor_day
),
-- The four jobs, spelled the way the sheet saves them.
jobs(k) AS (
  VALUES ('blanket_spray'), ('lining'), ('polybag_fill'), ('transplanting')
),
-- A plot name compared the way the phone compares it: letters and digits
-- only, uppercased. That is plotKey in transplantData.js.
stock AS (
  SELECT upper(replace(replace(replace(btrim(COALESCE(p.plot_name, '')), ' ', ''), '-', ''), '_', '')) AS pk,
         btrim(COALESCE(p.nursery_name, '(no nursery)')) AS nursery,
         btrim(COALESCE(p.plot_name, '(no plot)'))       AS stock_plot
    FROM shared_plots p
),
plots AS (
  SELECT s.pk,
         string_agg(DISTINCT s.nursery, ' + ' ORDER BY s.nursery) AS nursery
    FROM stock s
   GROUP BY s.pk
),
-- Every arrival since the floor, by plot. Both the plain movement the
-- board counts and the two it does not, kept apart so a plot it can never
-- raise is named rather than left looking ordinary.
arr AS (
  SELECT upper(replace(replace(replace(btrim(COALESCE(l.plot_name, '')), ' ', ''), '-', ''), '_', '')) AS pk,
         btrim(COALESCE(l.plot_name, '(no plot)')) AS plot,
         sum(CASE WHEN l.transaction_type = 'Transplanted'
                  THEN abs(COALESCE(l.quantity_change, 0)) ELSE 0 END) AS qty_plain,
         sum(abs(COALESCE(l.quantity_change, 0)))                      AS qty_any,
         max(CASE WHEN l.transaction_type = 'Transplanted'
                  THEN COALESCE(l.transaction_date, l.created_at::date) END) AS last_plain,
         max(COALESCE(l.transaction_date, l.created_at::date))               AS last_any
    FROM shared_inventory_logs l, q
   WHERE l.transaction_type IN ('Transplanted', 'Transplanted_Premium', 'Transplanted_DoubleTone')
     AND COALESCE(l.transaction_date, l.created_at::date) >= q.floor_day
   GROUP BY 1, 2
),
-- The records the board reads: every month, work_date on or after the
-- same floor. This is loadTransplantRecords, which deliberately asks for
-- no month at all.
rec AS (
  SELECT upper(replace(replace(replace(btrim(COALESCE(r.plot_name, '')), ' ', ''), '-', ''), '_', '')) AS pk,
         count(DISTINCT r.work_type) FILTER (
           WHERE r.work_type IN ('blanket_spray', 'lining', 'polybag_fill', 'transplanting')) AS jobs_done,
         max(r.work_date)      AS last_work,
         string_agg(DISTINCT COALESCE(r.schedule_month, '(no month)'), ', '
                    ORDER BY COALESCE(r.schedule_month, '(no month)')) AS months
    FROM nops_transplant_field_records r, q
   WHERE r.work_date >= q.floor_day
   GROUP BY 1
)
SELECT * FROM (

  SELECT 1 AS ord,
         'plot'                                        AS what,
         COALESCE(p.nursery, '(not in Seedling Stock)')
           || ' / ' || a.plot                           AS detail_1,
         COALESCE(rc.jobs_done, 0)::text || ' of 4 jobs recorded'
           || CASE WHEN rc.last_work IS NULL THEN ''
                   ELSE ', newest for ' || rc.last_work::text END AS detail_2,
         a.qty_plain::text || ' seedlings, newest '
           || COALESCE(a.last_plain::text, '(none plain)')        AS detail_3,
         CASE
           WHEN a.qty_plain = 0
             THEN 'NOT A PLAIN Transplanted ROW -- the board counts no other kind, so it can never raise this plot'
           WHEN COALESCE(rc.jobs_done, 0) < 4
             THEN 'ON THE BOARD -- ' || (4 - COALESCE(rc.jobs_done, 0))::text || ' job(s) still owed'
           WHEN a.last_plain > rc.last_work
             THEN 'OFF THE BOARD, AND SEEDLINGS ARRIVED AFTER ITS JOBS WERE RECORDED -- that arrival has nobody named against it'
           ELSE 'off the board, correctly -- all four recorded and nothing has arrived since'
         END                                            AS verdict
    FROM arr a
    LEFT JOIN plots p  ON p.pk  = a.pk
    LEFT JOIN rec   rc ON rc.pk = a.pk

  UNION ALL

  -- THE COUNT, because one row is an example and the question is how big
  -- this is. A number above nought here is work nobody is being asked for.
  SELECT 2,
         'summary',
         'plots that took seedlings since the floor',
         (SELECT count(*)::text FROM arr)::text,
         'on the board now: ' || (SELECT count(*)::text FROM arr a
                                    LEFT JOIN rec rc ON rc.pk = a.pk
                                   WHERE a.qty_plain > 0
                                     AND COALESCE(rc.jobs_done, 0) < 4),
         'DROPPED off it with a later arrival: '
           || (SELECT count(*)::text FROM arr a
                 JOIN rec rc ON rc.pk = a.pk
                WHERE a.qty_plain > 0
                  AND rc.jobs_done >= 4
                  AND a.last_plain > rc.last_work)

) x
ORDER BY ord, verdict, detail_1;
