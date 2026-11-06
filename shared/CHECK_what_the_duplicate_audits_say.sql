-- THE 468 TASKS AUDITED TWICE -- WHAT EACH PAIR ACTUALLY SAYS
--
-- CHECK_is_the_same_case_audited_twice.sql named them. This is the
-- drill-down: it splits them by whether the two rows AGREE, because that
-- is what decides whether anybody has to look.
--
-- WHY THEY EXIST, which matters before deciding what to do with them.
-- The maintenance module reads the WHOLE audit table with no filter, and
-- Supabase caps a read at 1,000 rows. So once the table passed a
-- thousand, the OLDEST audits fell out of what the module could see --
-- the read is newest first -- and a task whose audit had fallen out read
-- as NOT YET AUDITED. The board offered it again, the auditor walked it
-- again, and the save took the insert branch rather than the edit one,
-- because nothing on screen knew an audit already existed.
--
-- SO BOTH ROWS RECORD A REAL WALK. The auditor was told the plot needed
-- auditing and audited it. Nothing here is a phantom row, which is
-- exactly why there is no repair file beside this one: deleting the
-- later row throws away work somebody did, and deleting the earlier one
-- throws away the record the board had already lost once.
--
-- The reading cap is fixed, so no new pair can be made this way.
--
-- WHAT A GOOD RESULT LOOKS LIKE, and what each answer means
--
-- Section 1 splits the duplicated tasks three ways:
--
--   same result        both walks found the same thing. Nothing is in
--                      doubt. The only cost is that the report counts
--                      the task twice.
--   DIFFERENT result   one walk says Satisfactory and the other does
--                      not. These are the ones a person has to look at,
--                      and section 2 names every one.
--   more than two      a task audited three times or more.
--
-- Section 2 is one line per task whose two walks DISAGREE, with what
-- each said and when. The later walk is the more recent state of the
-- plot. Whether it replaces the earlier one is the office decision this
-- file exists to inform, and nothing here makes it.
--
-- Section 3 counts the pairs by month, so the size of it can be seen
-- against the month each report covers.

WITH rows_all AS (
  SELECT a.task_id, a.audit_id, a.nursery, a.plot, a.task_type,
         a.result, a.auditor_name, a.date, a.created_at
  FROM   audit_maintenance_audits a
  WHERE  a.task_id IS NOT NULL
),
per_task AS (
  SELECT r.task_id,
         count(*)::INT                      AS n,
         count(DISTINCT COALESCE(r.result, ''))::INT AS verdicts,
         min(r.nursery)   AS nursery,
         min(r.plot)      AS plot,
         min(r.task_type) AS task_type
  FROM   rows_all r
  GROUP  BY r.task_id
  HAVING count(*) > 1
),
first_last AS (
  SELECT p.task_id, p.nursery, p.plot, p.task_type, p.n, p.verdicts,
         (SELECT r.result FROM rows_all r WHERE r.task_id = p.task_id
           ORDER BY r.date ASC, r.created_at ASC LIMIT 1)        AS first_result,
         (SELECT r.date   FROM rows_all r WHERE r.task_id = p.task_id
           ORDER BY r.date ASC, r.created_at ASC LIMIT 1)        AS first_date,
         (SELECT r.auditor_name FROM rows_all r WHERE r.task_id = p.task_id
           ORDER BY r.date ASC, r.created_at ASC LIMIT 1)        AS first_who,
         (SELECT r.result FROM rows_all r WHERE r.task_id = p.task_id
           ORDER BY r.date DESC, r.created_at DESC LIMIT 1)      AS last_result,
         (SELECT r.date   FROM rows_all r WHERE r.task_id = p.task_id
           ORDER BY r.date DESC, r.created_at DESC LIMIT 1)      AS last_date,
         (SELECT r.auditor_name FROM rows_all r WHERE r.task_id = p.task_id
           ORDER BY r.date DESC, r.created_at DESC LIMIT 1)      AS last_who
  FROM   per_task p
),
by_month AS (
  SELECT to_char(f.last_date, 'YYYY-MM') AS ym, count(*)::INT AS n
  FROM   first_last f
  GROUP  BY 1
)
SELECT 1 AS ord, 'SPLIT' AS section, 'tasks audited more than once' AS label,
       (SELECT count(*) FROM first_last)::INT AS n,
       'each one is a task the board offered twice' AS note
UNION ALL
SELECT 1, 'SPLIT', 'both walks found the SAME result',
       (SELECT count(*) FROM first_last WHERE verdicts = 1)::INT,
       'nothing in doubt -- the only cost is the report counting it twice'
UNION ALL
SELECT 1, 'SPLIT', 'the walks DISAGREE on the result',
       (SELECT count(*) FROM first_last WHERE verdicts > 1)::INT,
       'a person has to look -- every one named in section 2'
UNION ALL
SELECT 1, 'SPLIT', 'audited three times or more',
       (SELECT count(*) FROM first_last WHERE n > 2)::INT,
       'the board kept offering it'
UNION ALL
SELECT 2, 'DISAGREE', COALESCE(f.nursery, '?') || ' ' || COALESCE(f.plot, '?')
         || ' ' || COALESCE(f.task_type, '?') || ' -- task ' || f.task_id, f.n,
       'first ' || COALESCE(f.first_result, 'none') || ' on ' || f.first_date::TEXT
         || ' by ' || COALESCE(NULLIF(btrim(f.first_who), ''), 'nobody named')
         || ', then ' || COALESCE(f.last_result, 'none') || ' on ' || f.last_date::TEXT
         || ' by ' || COALESCE(NULLIF(btrim(f.last_who), ''), 'nobody named')
FROM   first_last f
WHERE  f.verdicts > 1
UNION ALL
SELECT 3, 'BY MONTH', b.ym, b.n, 'tasks whose second walk landed in this month'
FROM   by_month b
ORDER  BY 1, 4 DESC, 3;
