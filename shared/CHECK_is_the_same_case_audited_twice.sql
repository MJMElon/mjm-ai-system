-- IS THE SAME MAINTENANCE CASE ON THE REPORT TWICE
--
-- Three rows reading 22 Oct, B05, Interrow Spray, Unsatisfactory, Main
-- Nursery Auditor look like one case printed three times. There are two
-- quite different things that produce that, and the report cannot tell
-- them apart because it shows neither id:
--
--   A TRUE DUPLICATE -- two or more audit rows against the SAME task_id.
--   One task is meant to have one audit, so every row past the first is a
--   record of nothing. A save that went in twice, a phone that retried
--   after the row was already there, or the same task audited twice on
--   two devices.
--
--   SEPARATE TASKS THAT LOOK ALIKE -- different task_id, same plot, same
--   job, same day. Not a duplicate at all. A maintenance task comes from
--   one work record, so a plot sprayed by three workers, or over three
--   batches, is three tasks and three audits, and all three belong on the
--   report. The audit is dated the day it was SAVED, so a backlog walked
--   in one sitting lands on one date and stacks up.
--
-- This counts both. It changes nothing and is safe to run as often as you
-- like.
--
-- WHAT A GOOD RESULT LOOKS LIKE, and what each answer means
--
-- Section 1, over the whole history:
--
--   audit rows            every maintenance audit there has ever been
--   tasks audited         how many different tasks those rows cover
--   TRUE DUPLICATES       rows past the first on a task that has more than
--                         one. NOUGHT IS THE ANSWER YOU WANT. Above
--                         nought, section 2 names every one.
--   rows with no task     an audit filed against no task at all. It is on
--                         the report and retires nothing on the board.
--
-- Section 2 names each task audited more than once -- how many rows, and
-- whether they SAY THE SAME THING or differ. Rows that differ need a
-- person to decide which is right. Identical ones are a save that landed
-- twice.
--
-- Section 3 is the look-alike count: plot, job and day shared across
-- DIFFERENT tasks. A figure here is NOT a fault, and is almost certainly
-- what is being looked at. The worst offenders are named so one can be
-- checked against the work records it came from.

WITH rows_all AS (
  SELECT a.task_id, a.audit_id, a.nursery, a.plot, a.task_type,
         a.result, a.auditor_name, a.date, a.created_at
  FROM   audit_maintenance_audits a
),
per_task AS (
  SELECT r.task_id,
         count(*)::INT AS n,
         count(DISTINCT COALESCE(r.result, '') || '|' || COALESCE(r.date::TEXT, '')
               || '|' || COALESCE(r.auditor_name, ''))::INT AS tellings,
         min(r.plot)      AS plot,
         min(r.nursery)   AS nursery,
         min(r.task_type) AS task_type,
         min(r.date)      AS d1,
         max(r.date)      AS d2
  FROM   rows_all r
  WHERE  r.task_id IS NOT NULL
  GROUP  BY r.task_id
),
dupes AS (
  SELECT * FROM per_task WHERE n > 1
),
look_alike AS (
  SELECT r.nursery, r.plot, r.task_type, r.date,
         count(DISTINCT r.task_id)::INT AS tasks,
         count(*)::INT                  AS rows_drawn
  FROM   rows_all r
  WHERE  r.task_id IS NOT NULL
  GROUP  BY r.nursery, r.plot, r.task_type, r.date
  HAVING count(DISTINCT r.task_id) > 1
)
SELECT 1 AS ord, 'COUNT' AS section, 'audit rows' AS label,
       (SELECT count(*) FROM rows_all)::INT AS n,
       'every maintenance audit there has ever been' AS note
UNION ALL
SELECT 1, 'COUNT', 'tasks audited',
       (SELECT count(*) FROM per_task)::INT,
       'how many different tasks those rows cover'
UNION ALL
SELECT 1, 'COUNT', 'TRUE DUPLICATES -- rows past the first on one task',
       (SELECT COALESCE(sum(n - 1), 0) FROM dupes)::INT,
       'nought is the answer you want -- above nought, see section 2'
UNION ALL
SELECT 1, 'COUNT', 'tasks carrying a duplicate',
       (SELECT count(*) FROM dupes)::INT,
       'each one named in section 2'
UNION ALL
SELECT 1, 'COUNT', 'rows with no task at all',
       (SELECT count(*) FROM rows_all WHERE task_id IS NULL)::INT,
       'on the report, and retires nothing on the board'
UNION ALL
SELECT 1, 'COUNT', 'LOOK-ALIKE rows -- different tasks, same plot, job and day',
       (SELECT COALESCE(sum(rows_drawn), 0) FROM look_alike)::INT,
       'NOT a fault -- separate tasks, and all of them belong on the report'
UNION ALL
SELECT 2, 'DUPLICATE', 'task ' || d.task_id || ' -- '
         || COALESCE(d.nursery, '?') || ' ' || COALESCE(d.plot, '?')
         || ' ' || COALESCE(d.task_type, '?'), d.n,
       CASE WHEN d.tellings = 1
              THEN 'every row says the same thing -- one save that landed '
                   || d.n || ' times'
            ELSE 'the rows DIFFER -- somebody has to say which is right' END
         || ', dated ' || d.d1::TEXT
         || CASE WHEN d.d2 <> d.d1 THEN ' to ' || d.d2::TEXT ELSE '' END
FROM   dupes d
UNION ALL
SELECT 3, 'LOOK-ALIKE', COALESCE(l.nursery, '?') || ' ' || COALESCE(l.plot, '?')
         || ' ' || COALESCE(l.task_type, '?') || ' on ' || l.date::TEXT,
       l.rows_drawn,
       l.tasks || ' separate tasks, so ' || l.rows_drawn
         || ' rows -- check them against the work records on that plot'
FROM   look_alike l
ORDER  BY 1, 4 DESC, 3;
