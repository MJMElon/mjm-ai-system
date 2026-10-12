-- WHICH MAINTENANCE PLOTS WERE CLOSED WITHOUT AN AUDIT
--
-- A maintenance deadline overdue by two months is not work anybody is
-- going to do: the job it was raised against was finished long ago and
-- there is nothing left in the plot to look at. An admin may close one
-- from the To-Do board, and what that writes is an ordinary
-- audit_maintenance_audits row against the same task, with its result
-- reading "Closed by admin".
--
-- Nothing is deleted by it. The work record in nops_maint_field_records
-- is untouched, so this query can still show what was closed, when the
-- work was done, and how long it had been waiting.
--
-- It changes nothing and is safe to run as often as you like.
--
-- WHAT A GOOD RESULT LOOKS LIKE
-- Row 1 is the count. Under it, one row per closure, newest first: who
-- closed it, the plot and the job, the day the work was done, and how
-- many days the audit had been outstanding by the time it was closed. A
-- month nobody closed anything in shows the count at 0 and no rows.
--
-- A long list under one name, or a lot of them on one day, is the thing
-- to look at: closing is meant to be the exception for work that has
-- gone cold, not a way of clearing a board.

WITH closed AS (
  SELECT a.task_id,
         a.plot,
         a.nursery,
         a.task_type,
         a.result,
         a.remarks,
         a.auditor_name,
         a.date AS closed_on
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
       (SELECT count(*) FROM closed)::TEXT || ' plot(s) closed without an audit' AS why
UNION ALL
SELECT 2, 'CLOSED',
       COALESCE(c.closed_on::TEXT, ''),
       COALESCE(c.nursery, ''),
       COALESCE(c.plot, ''),
       COALESCE(c.task_type, COALESCE(w.jenis, '')),
       COALESCE(w.work_date::TEXT, 'work record not found'),
       CASE WHEN w.work_date IS NULL OR c.closed_on IS NULL THEN NULL
            ELSE (c.closed_on - w.work_date)::INT END,
       COALESCE(c.closed_by_name, ''),
       COALESCE(c.remarks, 'no reason given')
FROM   (SELECT closed.*, closed.auditor_name AS closed_by_name FROM closed) c
LEFT   JOIN work w ON w.id = c.task_id
ORDER  BY 1, 3 DESC, 5;
