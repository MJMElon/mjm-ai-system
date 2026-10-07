-- =====================================================================
--  MOVE TRANSPLANTING RECORDS TO THE MONTH THE WORK WAS ACTUALLY DONE
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  Safe to run twice: the second run finds nothing left to move and says so.
--  No regular expressions and no backslashes, so it survives a paste.
--
--  WHY
--  Until now the FC Portal filed a transplanting record under the month its
--  BOARD was showing, and saved the day it was keyed as the work date. That
--  is right only while a conductor records a job in the same month he does
--  it. UNN 2s September work was keyed in October, so it filed itself under
--  October: Septembers salary claim was short by it and Octobers carries
--  work nobody did in October.
--
--  The portal no longer does this -- the job form now asks when the work was
--  done and the month follows that date. This moves the records already
--  filed under the wrong one.
--
-- ── What you should see ─────────────────────────────────────────────────
-- The SQL Editor shows only the LAST statements result, so this is one
-- query. A line per record moved, a line per record that could not be, and
-- a summary.
--
--   moved      N3 / transplant   qty 1200 - crew 2   now in Sep 2026
--   moved      N3 / polybag      qty 1200 - crew 3   now in Sep 2026
--   summary    moved             2                   from Oct 2026 to Sep 2026
--
-- One line per JOB, not per plot: a plot has four of them and each is its own
-- record, so moving N3 moves every job recorded on N3 that month.
--
-- NO "moved" LINES AND A SUMMARY OF 0 on the first run means nothing matched
-- -- check the nursery and plot spellings against what
-- shared/CHECK_transplant_not_on_claim.sql prints.
--
-- A SECOND RUN prints only the summary, with 0 moved. That is the file
-- working, not failing.
--
-- A "left behind" line means that plots job is ALREADY recorded in the
-- destination month. Two records for one job on one plot is not something
-- this file can choose between -- open both in the FC Portal and delete the
-- one that is wrong.
--
-- A record with "crew 0" has nobody named on it. Moving it puts it in the
-- right month, but it still pays nobody until somebody is added to it in the
-- FC Portal -- see shared/CHECK_transplant_not_on_claim.sql.
-- ────────────────────────────────────────────────────────────────────────
--
--  SET THE FIVE VALUES BELOW. They are the whole of what this file does:
--  the records of that nursery in FROM_MONTH move to TO_MONTH, and their
--  work date is stamped with NEW_DATE.
--
--  PLOT narrows it to one plot. It is set to N3 because that is the one
--  that was asked for. LEAVE IT EMPTY --  -- and every plot of that
--  nursery in FROM_MONTH moves. Run it with one plot first and look at what
--  comes back before widening it.
--
--  NEW_DATE is one date for all of them because the database has no record
--  of the real ones -- the old code never stored a work date, only the day of
--  keying. Pick the day the work was done, or the last day of the month.
-- =====================================================================
WITH q AS (
  SELECT 'UNN 2'::text      AS nursery,     -- as it is spelled on the records
         'N3'::text         AS plot,        --  for every plot
         'Oct 2026'::text   AS from_month,
         'Sep 2026'::text   AS to_month,
         DATE '2026-09-30'  AS new_date
),
-- Spaces and case ignored, so "UNN 2", "UNN2" and "unn 2" are one nursery.
-- No regex, on purpose.
pick AS (
  SELECT t.id, t.plot_name, t.work_type
    FROM nops_transplant_field_records t, q
   WHERE t.schedule_month = q.from_month
     AND upper(replace(COALESCE(t.nursery_name, ''), ' ', ''))
       = upper(replace(q.nursery, ' ', ''))
     -- One plot, or every plot when PLOT is left empty. Compared the same
     -- way as the nursery, so "N3" and "n 3" are one plot.
     AND (q.plot = ''
          OR upper(replace(COALESCE(t.plot_name, ''), ' ', ''))
           = upper(replace(q.plot, ' ', '')))
),
-- The destination month already has this plots job. One record per plot per
-- job per month is a unique index, so moving this one would fail the whole
-- statement -- and if it did not, one of the two would be lost without a
-- word. Left where it is and reported at the end instead.
blocked AS (
  SELECT p.id
    FROM pick p, q
   WHERE EXISTS (
     SELECT 1 FROM nops_transplant_field_records x
      WHERE x.schedule_month = q.to_month
        AND x.plot_name      = p.plot_name
        AND x.work_type      = p.work_type
   )
),
moved AS (
  UPDATE nops_transplant_field_records t
     SET schedule_month = (SELECT to_month FROM q),
         work_date      = (SELECT new_date FROM q),
         updated_at     = now()
   WHERE t.id IN (SELECT id FROM pick)
     AND t.id NOT IN (SELECT id FROM blocked)
  RETURNING t.id, t.plot_name, t.work_type, t.source_qty,
            (SELECT count(*)
               FROM jsonb_array_elements(COALESCE(t.workers, '[]'::jsonb)) w
              WHERE COALESCE(w ->> 'name', '') <> '') AS crew
)
SELECT * FROM (
  SELECT 1 AS ord,
         'moved'                                         AS what,
         m.plot_name || ' / ' || m.work_type             AS detail_1,
         'qty ' || COALESCE(m.source_qty::text, '-')
           || ' - crew ' || m.crew::text                 AS detail_2,
         'now in ' || (SELECT to_month FROM q)           AS detail_3
    FROM moved m
  UNION ALL
  SELECT 2,
         'left behind',
         t.plot_name || ' / ' || t.work_type,
         'already recorded in ' || (SELECT to_month FROM q),
         'open both in the FC Portal and delete the wrong one'
    FROM nops_transplant_field_records t
   WHERE t.id IN (SELECT id FROM blocked)
  UNION ALL
  SELECT 3,
         'summary',
         'moved',
         (SELECT count(*)::text FROM moved),
         'from ' || (SELECT from_month FROM q) || ' to ' || (SELECT to_month FROM q)
) x
ORDER BY ord, detail_1;
