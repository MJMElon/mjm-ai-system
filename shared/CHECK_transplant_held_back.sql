-- =====================================================================
--  WHAT THE CHECKED GATE ACTUALLY MOVES ON THE TRANSPLANTING CLAIM
--  shared/CHECK_transplant_held_back.sql
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  READ-ONLY. It changes nothing.
--  No regular expressions and no backslashes, so it survives a paste.
--
--  WHY
--  The transplanting salary claim used to be paid straight off the Field
--  Conductors own record. It is now paid on a row the OFFICE has agreed --
--  Nursery Operation -> Work Maintenance -> Worker Record -> Transplanting,
--  the Checked column. Only a checked row reaches the claim.
--
--  The question that decides whether a rule like that is right is "what
--  does it actually move", and this is the only thing that answers it.
--  Run it before you believe a claim is short, and run it the day after
--  RUN_ME_transplant_checked.sql: nothing is backfilled, so on that day
--  EVERY row reads held and every transplanting claim is nought until
--  somebody ticks. That is the office being asked the question for the
--  first time, not a fault.
--
--  WHAT TO LOOK FOR
--
--    A "month" ROW WHOSE held IS NOT 0
--    -> that nursery-month has work on no claim. detail_1 is the capacity
--       being held, which is what the claim says under its total.
--
--    A "held" ROW
--    -> one line per record nobody has agreed: the plot, the job and the
--       capacity. This is the list somebody works down on the Worker
--       Record tab.
--
--    "no gate" INSTEAD OF EVERYTHING ELSE
--    -> the two Checked columns are not on this database, so every
--       recorded row is still being paid. Run
--       shared/RUN_ME_transplant_checked.sql first.
--
--  The nursery here is the one WRITTEN ON THE RECORD. Both screens decide
--  it from the PLOT instead, which is the house rule, so a record whose
--  nursery_name is empty or spelled another way still lands on the right
--  sheet and may read oddly in this list. The plot is the column to go by.
-- =====================================================================

-- The gate has to exist before anything below it means anything, and a
-- query naming a column the table has not got fails to PARSE however well
-- the branch is guarded. Two things keep this one parsing on a database
-- that has not had the gate installed: the answer is worked out in a DO
-- block into a session setting, and the tick is read out of the whole row
-- as JSON (to_jsonb), which asks for a KEY and so names no column. Nothing
-- is created either -- a TEMP table has the editor warning that a table is
-- being made with no Row Level Security, which is a false alarm somebody
-- still has to click past.
DO $$
DECLARE has_gate BOOLEAN;
BEGIN
  SELECT count(*) = 2 INTO has_gate
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'nops_transplant_field_records'
     AND column_name IN ('checked_at', 'checked_by');
  PERFORM set_config('mjm.tp_gate', CASE WHEN has_gate THEN 'yes' ELSE 'no' END, false);
END $$;

WITH tp AS (
  SELECT r.schedule_month,
         COALESCE(r.nursery_name, '(none)') AS nursery,
         r.plot_name,
         r.work_type,
         CASE WHEN r.work_type = 'polybag_fill'
              THEN COALESCE(r.total_qty, r.source_qty, 0)
              ELSE COALESCE(r.source_qty, 0) END AS cap,
         (to_jsonb(r) ->> 'checked_at') IS NOT NULL AS agreed
    FROM nops_transplant_field_records r
   WHERE current_setting('mjm.tp_gate', true) = 'yes'
)
SELECT * FROM (
  SELECT 0 AS ord, 'no gate'::text AS what,
         'the Checked columns are not on this database'::text AS value,
         'run shared/RUN_ME_transplant_checked.sql -- every row is still paid'::text AS detail,
         ''::text AS detail_1
   WHERE current_setting('mjm.tp_gate', true) IS DISTINCT FROM 'yes'
  UNION ALL
  SELECT 1, 'month',
         COALESCE(schedule_month, '(no month)') || ' -- ' || nursery,
         count(*)::text || ' row(s), ' || count(*) FILTER (WHERE agreed)::text
           || ' agreed, ' || count(*) FILTER (WHERE NOT agreed)::text || ' held',
         'held capacity ' || to_char(COALESCE(sum(cap) FILTER (WHERE NOT agreed), 0), 'FM999,999,999')
    FROM tp
   GROUP BY schedule_month, nursery
  UNION ALL
  SELECT 2, 'held',
         COALESCE(schedule_month, '(no month)') || ' -- ' || plot_name,
         work_type,
         to_char(cap, 'FM999,999,999') || ' on no claim'
    FROM tp
   WHERE NOT agreed
  UNION ALL
  SELECT 9, 'VERDICT',
         CASE WHEN current_setting('mjm.tp_gate', true) IS DISTINCT FROM 'yes'
                THEN 'the gate is not installed'
              WHEN (SELECT count(*) FROM tp WHERE NOT agreed) = 0
                THEN 'every recorded row is agreed and on its claim'
              ELSE (SELECT count(*)::text FROM tp WHERE NOT agreed)
                   || ' row(s) are waiting on the office' END,
         CASE WHEN current_setting('mjm.tp_gate', true) IS DISTINCT FROM 'yes'
              THEN 'nothing above it can be answered until the gate is installed'
              ELSE 'tick them on Worker Record -> Transplanting' END,
         ''
) x
ORDER BY ord, value, detail;
