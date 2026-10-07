-- =====================================================================
--  WHY A NURSERYS TRANSPLANTING IS NOT ON THE SALARY CLAIM
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  READ-ONLY. It changes nothing.
--  No regular expressions and no backslashes, so it survives a paste.
--
--  WHY
--  Monthly Payroll -> Transplanting, with a nursery circle chosen, said
--  "No transplanting recorded in the FC Portal for <month>". That sentence
--  was printed for five different situations, and only one of them is
--  "nothing was recorded". The other four are:
--
--    · the records are there, but on another nurserys plots
--    · the records are on this nurserys plots and NOBODY IS NAMED on
--      them -- the claim pays per worker, so a crew of nobody is no lines
--      at all, however big the quantity
--    · the plots nursery name is spelled in a way the payroll sections do
--      not recognise, so the work lands under "No section"
--    · the lines exist, but under the section the WORKER REGISTER puts
--      those people in, not the one the plot is in
--
--  This says which. It reads nothing but the records themselves.
--
-- WHAT TO LOOK FOR
--
--   NO "month in table" ROW SAYING "this is the month the page is showing"
--   -> nothing was ever saved for that month. Either the work was recorded
--      under another month, or it never reached the database at all. The
--      other "month in table" rows say which months DO hold records.
--
--   "record" ROWS SAYING "NOBODY NAMED"
--   -> the work and its quantity are in the database, but no worker is on
--      the record. The claim pays per person, so it has nobody to pay and
--      shows nothing. Open each plot named here in the FC Portal under
--      Maintenance -> Transplanting Job and add who did the work. This is
--      the usual answer when a conductor is sure he keyed it.
--
--   "record" ROWS SAYING "another nursery"
--   -> they are filed under the nursery shown in detail_1. Click that
--      circle on the claim.
--
--   ANY "nursery not a section" ROW
--   -> that plots nursery is spelled in a way the payroll does not know.
--      The work is on the claim, but under the "No section" circle. Correct
--      the plots nursery in Facility Management.
--
--   EVERY "record" ROW SAYING "on the claim for this nursery", AND THE
--   SHEET STILL EMPTY
--   -> the lines exist but are filed under the section the WORKER REGISTER
--      puts those people in. The claim itself now says so in red under the
--      table. shared/CHECK_why_worker_missing.sql goes into that one.
--
--  CHANGE THE MONTH AND THE NURSERY ON THE NEXT TWO LINES if they are not
--  Sep 2026 and UNN2. The month is spelled exactly as the page spells it:
--  three letters, a space, four digits.
-- =====================================================================
WITH q AS (
  SELECT 'Sep 2026'::text AS month,
         'UNN2'::text     AS section
),
-- A nursery name compared the way a person compares it: spaces and case
-- ignored, so "UNN 2" and "unn2" are one nursery. No regex, on purpose.
r AS (
  SELECT t.*,
         upper(replace(COALESCE(t.nursery_name, ''), ' ', '')) AS nkey,
         (SELECT count(*)
            FROM jsonb_array_elements(COALESCE(t.workers, '[]'::jsonb)) w
           WHERE COALESCE(w ->> 'name', '') <> '')              AS crew
    FROM nops_transplant_field_records t
)
SELECT * FROM (

  -- 1. WHICH MONTHS THE TABLE ACTUALLY HOLDS.
  --    The page asks for one exact string. A record saved under any other
  --    spelling is invisible to it no matter what else is right.
  SELECT 1 AS ord,
         'month in table'                   AS what,
         COALESCE(r.schedule_month, '(none)') AS detail_1,
         count(*)::text || ' record(s)'     AS detail_2,
         ''                                 AS detail_3,
         CASE WHEN r.schedule_month = (SELECT month FROM q)
              THEN 'this is the month the page is showing'
              ELSE 'NOT the month on screen' END AS verdict
    FROM r
   GROUP BY r.schedule_month

  UNION ALL

  -- 2. EVERY RECORD IN THAT MONTH, AND WHAT THE CLAIM MAKES OF IT.
  SELECT 2,
         'record',
         COALESCE(r.nursery_name, '(no nursery)') || ' / ' || COALESCE(r.plot_name, '(no plot)'),
         COALESCE(r.work_type, '(no job)') || ' / qty '
           || COALESCE(r.source_qty::text, '-'),
         'crew: ' || r.crew::text,
         CASE
           WHEN r.crew = 0
             THEN 'NOBODY NAMED -- this record pays nothing and shows nowhere'
           WHEN r.nkey NOT IN ('PN', 'BNN', 'UNN1', 'UNN2', 'UNE', 'DRIVER')
             THEN 'nursery name is not a payroll section -- lands under "No section"'
           WHEN r.nkey <> upper(replace(q.section, ' ', ''))
             THEN 'another nursery -- it belongs on that circle'
           ELSE 'on the claim for this nursery'
         END
    FROM r, q
   WHERE r.schedule_month = q.month

  UNION ALL

  -- 3. THE NURSERY NAMES THAT MATCH NO PAYROLL SECTION.
  --    The sections are PN, BNN, UNN1, UNN2, UNE and Driver. A plot whose
  --    nursery is written any other way files its work under "No section",
  --    which is a circle most people never click. Fix it on the plot in
  --    Facility Management, not here.
  SELECT 3,
         'nursery not a section',
         COALESCE(r.nursery_name, '(no nursery)'),
         count(*)::text || ' record(s)',
         '',
         'work lands under "No section" on the claim'
    FROM r, q
   WHERE r.schedule_month = q.month
     AND r.nkey NOT IN ('PN', 'BNN', 'UNN1', 'UNN2', 'UNE', 'DRIVER')
   GROUP BY r.nursery_name

  UNION ALL

  -- 4. THE ANSWER IN ONE LINE.
  SELECT 4,
         'summary',
         'records this month',
         (SELECT count(*)::text FROM r, q WHERE r.schedule_month = q.month),
         'of them on this nursery: '
           || (SELECT count(*)::text FROM r, q
                WHERE r.schedule_month = q.month
                  AND r.nkey = upper(replace(q.section, ' ', ''))),
         'with nobody named: '
           || (SELECT count(*)::text FROM r, q
                WHERE r.schedule_month = q.month
                  AND r.nkey = upper(replace(q.section, ' ', ''))
                  AND r.crew = 0)

) x
ORDER BY ord, detail_1, detail_2;
