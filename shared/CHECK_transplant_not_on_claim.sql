-- =====================================================================
--  WHY A NURSERYS TRANSPLANTING IS NOT ON THE SALARY CLAIM
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  READ-ONLY. It changes nothing.
--  No regular expressions and no backslashes, so it survives a paste.
--
--  WHY
--  Monthly Payroll -> Transplanting, with a nursery circle chosen, reads
--  "Nothing transplanted in <nursery> for <month>". That sentence is printed
--  for several different situations, and only one of them is "nothing was
--  recorded". The others are:
--
--    · the records are there, but on another nurserys plots
--    · the records are on this nurserys plots and NOBODY IS NAMED on
--      them -- the claim pays per worker, so a crew of nobody is no lines
--      at all, however big the quantity
--    · the plots nursery name is spelled in a way the payroll sections do
--      not recognise, so the work lands under "No section"
--    · the records are there and the office has not ticked CHECKED on them
--    · the month on the record is spelled differently from the month on
--      the page, so the page asks for a string nothing carries
--    · the lines exist, but under the section the WORKER REGISTER puts
--      those people in, not the one the plot is in
--
--  This says which. It reads nothing but the records themselves, and it
--  answers for EVERY section in one run rather than one circle at a time.
--
-- WHAT TO LOOK FOR
--
--   THE "checked column" ROW
--   -> "the gate is installed" means a record reaches the claim only once
--      somebody ticks Checked on Worker Record -> Transplanting. "NOT
--      installed" means RUN_ME_transplant_checked.sql has not been run, the
--      claim is paying every record the way it did before the tick existed,
--      and the claim itself says so in red. In that state no record can be
--      held, so held counts below read nought and mean nothing.
--
--   NO "month in table" ROW SAYING "this is the month the page is showing"
--   -> nothing was ever saved for that month. Either the work was recorded
--      under another month, or it never reached the database at all. The
--      other "month in table" rows say which months DO hold records.
--
--   A "section" ROW READING 0 records
--   -> nothing on that circle for the month, for any reason at all. Look at
--      the "record" rows underneath to see where the months work went.
--
--   A "section" ROW WITH records BUT 0 checked
--   -> every record is waiting for the office. The claim is right to be
--      empty and the sheet should say so in words. Tick Checked on
--      Worker Record -> Transplanting.
--
--   "record" ROWS SAYING "NOBODY NAMED"
--   -> the work and its quantity are in the database, but no worker is on
--      the record. The claim pays per person, so it has nobody to pay and
--      shows nothing. Open each plot named here in the FC Portal under
--      Maintenance -> Transplanting Job and add who did the work. This is
--      the usual answer when a conductor is sure he keyed it.
--
--   "record" ROWS SAYING "waiting to be Checked"
--   -> recorded, agreed by nobody yet, on no claim. That is the gate doing
--      its job, not a fault.
--
--   ANY "nursery not a section" ROW
--   -> that plots nursery is spelled in a way the payroll does not know.
--      The work is on the claim, but under the "No section" circle. Correct
--      the plots nursery in Facility Management.
--
--   EVERY "record" ROW SAYING "on the claim", AND THE SHEET STILL EMPTY
--   -> the lines exist but are filed under the section the WORKER REGISTER
--      puts those people in. The claim itself says so in red under the
--      table. shared/CHECK_why_worker_missing.sql goes into that one.
--
--  AND ONE THING THIS CANNOT SEE. If the claim could not READ the table at
--  all -- an RLS refusal, a dropped connection -- the page shows an empty
--  month with nothing saying so. If every row below says the work is there
--  and on the claim, reload the page before looking any further.
--
--  CHANGE THE MONTH ON THE NEXT LINE if it is not Oct 2026. It is spelled
--  exactly as the page spells it: three letters, a space, four digits.
-- =====================================================================
WITH q AS (
  SELECT 'Oct 2026'::text AS month
),
-- The payroll sections, spelled the way the claim normalises them.
secs(section) AS (
  VALUES ('PN'), ('BNN'), ('UNN1'), ('UNN2'), ('UNE'), ('DRIVER')
),
-- Is the Checked gate installed at all. Asked of the catalogue, because a
-- query that NAMES a column the table has not got fails to parse however
-- well the branch around it is guarded.
gate AS (
  SELECT count(*) AS n
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'nops_transplant_field_records'
     AND column_name  = 'checked_at'
),
-- A nursery name compared the way a person compares it: spaces and case
-- ignored, so "UNN 2" and "unn2" are one nursery. No regex, on purpose.
--
-- checked_at is read OUT OF THE ROWS OWN JSON rather than named as a
-- column, for the same reason as the gate CTE above: this file has to run
-- on a database that has not had RUN_ME_transplant_checked.sql yet. An
-- absent column and an unticked row both read NULL here, which is why the
-- gate row above has to be read first.
r AS (
  SELECT t.*,
         upper(replace(COALESCE(t.nursery_name, ''), ' ', '')) AS nkey,
         (SELECT count(*)
            FROM jsonb_array_elements(COALESCE(t.workers, '[]'::jsonb)) w
           WHERE COALESCE(w ->> 'name', '') <> '')              AS crew,
         to_jsonb(t) ->> 'checked_at'                           AS checked_txt
    FROM nops_transplant_field_records t
)
SELECT * FROM (

  -- 1. IS THE GATE THERE.
  SELECT 1 AS ord,
         'checked column'                       AS what,
         'nops_transplant_field_records.checked_at' AS detail_1,
         ''                                     AS detail_2,
         ''                                     AS detail_3,
         CASE WHEN (SELECT n FROM gate) > 0
              THEN 'the gate is installed -- only a Checked row reaches the claim'
              ELSE 'NOT installed -- every record is paid, and held counts below mean nothing'
         END                                    AS verdict

  UNION ALL

  -- 2. WHICH MONTHS THE TABLE ACTUALLY HOLDS.
  --    The page asks for one exact string. A record saved under any other
  --    spelling is invisible to it no matter what else is right.
  SELECT 2,
         'month in table',
         COALESCE(r.schedule_month, '(none)'),
         count(*)::text || ' record(s)',
         '',
         CASE WHEN r.schedule_month = (SELECT month FROM q)
              THEN 'this is the month the page is showing'
              ELSE 'NOT the month on screen' END
    FROM r
   GROUP BY r.schedule_month

  UNION ALL

  -- 3. EVERY SECTION, FOR THAT MONTH. One circle per row, so the answer to
  --    "which nurseries are empty" is read off the screen instead of being
  --    found by running this file once per circle.
  SELECT 3,
         'section',
         s.section,
         (SELECT count(*)::text FROM r, q
           WHERE r.schedule_month = q.month AND r.nkey = s.section) || ' record(s)',
         'checked: ' || (SELECT count(*)::text FROM r, q
                          WHERE r.schedule_month = q.month AND r.nkey = s.section
                            AND r.checked_txt IS NOT NULL)
           || ' / nobody named: ' || (SELECT count(*)::text FROM r, q
                          WHERE r.schedule_month = q.month AND r.nkey = s.section
                            AND r.crew = 0),
         CASE
           WHEN (SELECT count(*) FROM r, q
                  WHERE r.schedule_month = q.month AND r.nkey = s.section) = 0
             THEN 'nothing on this circle for this month'
           -- NOBODY NAMED is asked FIRST on purpose: a record with an empty
           -- crew pays nothing even once somebody ticks it, so that is the
           -- answer somebody can act on.
           WHEN (SELECT count(*) FROM r, q
                  WHERE r.schedule_month = q.month AND r.nkey = s.section
                    AND r.crew > 0) = 0
             THEN 'recorded, and NOBODY IS NAMED on any of them -- no lines to pay'
           WHEN (SELECT n FROM gate) > 0
            AND (SELECT count(*) FROM r, q
                  WHERE r.schedule_month = q.month AND r.nkey = s.section
                    AND r.checked_txt IS NOT NULL) = 0
             THEN 'recorded, and NOT ONE of them is Checked -- the claim is empty for that reason'
           ELSE 'work on this circle reaches the claim'
         END
    FROM secs s

  UNION ALL

  -- 4. EVERY RECORD IN THAT MONTH, AND WHAT THE CLAIM MAKES OF IT.
  SELECT 4,
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
           WHEN (SELECT n FROM gate) > 0 AND r.checked_txt IS NULL
             THEN 'waiting to be Checked -- recorded, on no claim'
           ELSE 'on the claim, under ' || r.nkey
         END
    FROM r, q
   WHERE r.schedule_month = q.month

  UNION ALL

  -- 5. THE NURSERY NAMES THAT MATCH NO PAYROLL SECTION.
  --    The sections are PN, BNN, UNN1, UNN2, UNE and Driver. A plot whose
  --    nursery is written any other way files its work under "No section",
  --    which is a circle most people never click. Fix it on the plot in
  --    Facility Management, not here.
  SELECT 5,
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

  -- 6. THE ANSWER IN ONE LINE.
  SELECT 6,
         'summary',
         'records this month',
         (SELECT count(*)::text FROM r, q WHERE r.schedule_month = q.month),
         'checked: ' || (SELECT count(*)::text FROM r, q
                          WHERE r.schedule_month = q.month AND r.checked_txt IS NOT NULL)
           || ' / nobody named: ' || (SELECT count(*)::text FROM r, q
                          WHERE r.schedule_month = q.month AND r.crew = 0),
         'records in the table under every other month: '
           || (SELECT count(*)::text FROM r, q WHERE r.schedule_month IS DISTINCT FROM q.month)

) x
ORDER BY ord, detail_1, detail_2;
