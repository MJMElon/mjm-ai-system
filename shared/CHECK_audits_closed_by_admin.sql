-- WHICH MAINTENANCE PLOTS WERE CLOSED WITHOUT AN AUDIT
--
-- A maintenance deadline overdue by two months is not work anybody is
-- going to do: the job it was raised against was finished long ago and
-- there is nothing left in the plot to look at. An admin may close one
-- from the To-Do board, and what that writes is an ordinary
-- audit_maintenance_audits row against the same task, with its result
-- reading "Closed by admin".
--
-- An admin may also close a WHOLE SECTION at once -- every plot waiting
-- on one job -- because that is the unit the decision is made in. Those
-- rows go up in one insert, so they share a day and a job, and their
-- remark says which section they went with and how many plots were in
-- it. That matters to reading this list: a lot of closures on one day
-- used to be the thing to look at, and now it is the ordinary shape of
-- one section being closed.
--
-- Nothing is deleted by any of it. The work record in
-- nops_maint_field_records is untouched, so this query can still show
-- what was closed, when the work was done, and how long it had been
-- waiting.
--
-- It changes nothing and is safe to run as often as you like.
--
-- WHAT A GOOD RESULT LOOKS LIKE
-- Row 1 is the count, split into the ones closed on their own and the
-- ones closed with a section. Under it, one row per SECTION close --
-- the day, the nursery, the job, who did it and how many plots went --
-- so a section reads as one decision rather than as twelve. Under that,
-- one row per closure, newest first: who closed it, the plot and the
-- job, the day the work was done, and how many days the audit had been
-- outstanding by the time it was closed. A month nobody closed anything
-- in shows the count at 0 and no rows.
--
-- A long list under one name, or a lot of SINGLE closures on one day, is
-- the thing to look at: closing is meant to be the exception for work
-- that has gone cold, not a way of clearing a board.

WITH closed AS (
  SELECT a.task_id,
         a.plot,
         a.nursery,
         a.task_type,
         a.result,
         a.remarks,
         a.auditor_name,
         a.date AS closed_on,
         -- The remark the board writes for a section close carries the
         -- words "section (" and the plot count. No regular expression:
         -- the SQL Editor has choked on one.
         (position('section (' in COALESCE(a.remarks, '')) > 0) AS by_section
  FROM   audit_maintenance_audits a
  WHERE  a.result = 'Closed by admin'
),
work AS (
  SELECT f.id,
         f.work_date,
         f.plot_name,
         f.nursery_name,
         f.jenis
  FROM   nops_maint_field_records f
)
SELECT 1 AS ord, 'COUNT' AS section,
       ''::TEXT AS closed_on, ''::TEXT AS nursery, ''::TEXT AS plot,
       ''::TEXT AS job, ''::TEXT AS work_done, NULL::INT AS days_waiting,
       ''::TEXT AS closed_by,
       (SELECT count(*) FROM closed)::TEXT || ' plot(s) closed without an audit, '
       || (SELECT count(*) FROM closed WHERE by_section)::TEXT
       || ' of them with a whole section' AS why
UNION ALL
SELECT 2, 'BY SECTION',
       COALESCE(s.closed_on::TEXT, ''),
       COALESCE(s.nursery, ''),
       ''::TEXT,
       COALESCE(s.task_type, ''),
       ''::TEXT,
       NULL::INT,
       COALESCE(s.auditor_name, ''),
       s.n::TEXT || ' plot(s) closed together'
FROM   (SELECT closed_on, nursery, task_type, auditor_name, count(*) AS n
        FROM   closed
        WHERE  by_section
        GROUP  BY closed_on, nursery, task_type, auditor_name) s
UNION ALL
SELECT 3, 'CLOSED',
       COALESCE(c.closed_on::TEXT, ''),
       COALESCE(c.nursery, ''),
       COALESCE(c.plot, ''),
       COALESCE(c.task_type, COALESCE(w.jenis, '')),
       COALESCE(w.work_date::TEXT, 'work record not found'),
       CASE WHEN w.work_date IS NULL OR c.closed_on IS NULL THEN NULL
            ELSE (c.closed_on - w.work_date)::INT END,
       COALESCE(c.auditor_name, ''),
       COALESCE(c.remarks, 'no reason given')
FROM   closed c
LEFT   JOIN work w ON w.id = c.task_id
ORDER  BY 1, 3 DESC, 5;
