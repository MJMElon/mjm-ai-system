-- ONE AUDIT PER TASK -- REMOVE THE DUPLICATES AND STOP THEM COMING BACK
--
-- The office asked for this in one line, after reading the two CHECK
-- files beside it: remove all the duplicate cases, and never do it again.
-- So this file is BOTH halves. It deletes the extra rows AND it puts a
-- unique index on the table, because the app is not the only thing that
-- writes here: a phone holding an older build, a retry out of an outbox
-- and a hand edit in the dashboard all reach the same table.
--
-- WHY THEY EXIST. The maintenance module read the WHOLE audit table with
-- no filter, and Supabase caps a read at 1,000 rows. Once the table
-- passed a thousand the OLDEST rows fell out of what the module could
-- see, so a task whose audit had fallen out read as NOT YET AUDITED. The
-- board offered it again and the save took the insert branch. The read
-- is paged now, which is why the index below can be added without
-- refusing work somebody is doing.
--
-- WHICH ROW SURVIVES, and the order is the whole of the decision:
--
--   1. A REAL AUDIT BEATS A CLOSURE. A closure reads Closed by admin and
--      means nobody is ever going to walk this plot. An auditor walked
--      it. So the closure is the row of record about nothing, in BOTH
--      date orders -- including the ones where the admin closed on 23
--      Oct a task an auditor had already audited on the 13th.
--   2. AMONG AUDITS, THE NEWEST WINS, by the audit date and then by the
--      day it was saved. That is the rule the whole board already
--      follows: the latest audit is the state of the plot.
--   3. AMONG CLOSURES, the newest likewise, so a task closed twice keeps
--      one record of the one decision.
--
-- WHAT THAT COSTS, and it is named rather than buried. On a pair whose
-- two walks DISAGREE, keeping the newest changes the verdict the report
-- shows for that task. Section 2 NAMES every one of those, with what it
-- read before and reads now. On the data this was written against there
-- are two where both rows are real audits -- every other disagreement is
-- a closure against an audit, where the audit is plainly the better
-- record. A figure on the October report also moves wherever the row
-- that goes was dated in October and the row that stays is not.
--
-- NOTHING ELSE IS TOUCHED. The work records in nops_maint_field_records
-- are not read or written here. A task with ONE audit is not touched. A
-- row with no task at all is not touched, and the index does not reach
-- one.
--
-- SAFE TO RUN TWICE. The second run deletes nought, finds the index
-- already there, and draws the same NOTHING LEFT line.
--
-- WHAT A GOOD RESULT LOOKS LIKE
--
--   Section 1 is the count, by what kind of pair it was.
--   Section 2 names every task whose verdict MOVED. Read this one.
--   Section 3 is the state afterwards: duplicates left should be NOUGHT
--            and the index should read INSTALLED. If the index reads NOT
--            INSTALLED while duplicates left is nought, run the file
--            again -- something was inserted while it ran.

DO $$
DECLARE
  plan_ids  BIGINT[] := '{}';
  n_total   INT := 0;
  n_clos    INT := 0;
  n_same    INT := 0;
  n_diff    INT := 0;
  n_cc      INT := 0;
  changed   TEXT := '';
  idx_state TEXT := 'NOT INSTALLED';
  dupes_now INT := 0;
BEGIN
  -- Everything the report needs is collected in ONE pass, BEFORE the
  -- delete, because afterwards the rows are gone. No table is created:
  -- the SQL Editor warns about one made without row level security, and
  -- a warning somebody has to click past is a bad thing to hand over.
  WITH ranked AS (
    SELECT a.id, a.task_id, a.nursery, a.plot, a.task_type,
           a.result, a.auditor_name, a.date,
           CASE WHEN COALESCE(a.result, '') = 'Closed by admin'
                  THEN 1 ELSE 0 END AS is_closure,
           row_number() OVER (
             PARTITION BY a.task_id
             ORDER BY CASE WHEN COALESCE(a.result, '') = 'Closed by admin'
                             THEN 1 ELSE 0 END,
                      a.date DESC NULLS LAST,
                      a.created_at DESC NULLS LAST,
                      a.id DESC) AS rn,
           count(*) OVER (PARTITION BY a.task_id) AS n_rows
    FROM   public.audit_maintenance_audits a
    WHERE  a.task_id IS NOT NULL
  ),
  plan AS (
    SELECT r.id, r.is_closure, r.result,
           k.is_closure AS kept_is_closure, k.result AS kept_result,
           COALESCE(r.nursery, '?') || ' ' || COALESCE(r.plot, '?')
             || ' ' || COALESCE(r.task_type, '?')
             || ' -- task ' || r.task_id
             || ' -- was ' || COALESCE(r.result, 'none')
             || ' on ' || COALESCE(r.date::TEXT, 'no date')
             || ' by ' || COALESCE(NULLIF(btrim(r.auditor_name), ''), 'nobody named')
             || ', now ' || COALESCE(k.result, 'none')
             || ' on ' || COALESCE(k.date::TEXT, 'no date')
             || ' by ' || COALESCE(NULLIF(btrim(k.auditor_name), ''), 'nobody named')
             || CASE WHEN r.is_closure = 1 THEN ' [a closure gave way to a real audit]'
                     WHEN k.is_closure = 1 THEN ' [a closure was kept]'
                     ELSE ' [TWO REAL AUDITS -- the newer one stands]' END AS line
    FROM   ranked r
    JOIN   ranked k ON k.task_id = r.task_id AND k.rn = 1
    WHERE  r.n_rows > 1 AND r.rn > 1
  )
  SELECT COALESCE(array_agg(p.id), '{}'),
         count(*)::INT,
         count(*) FILTER (WHERE p.is_closure = 1 AND p.kept_is_closure = 0)::INT,
         count(*) FILTER (WHERE p.is_closure = 1 AND p.kept_is_closure = 1)::INT,
         count(*) FILTER (WHERE p.is_closure = 0 AND p.kept_is_closure = 0
                            AND COALESCE(p.result, '') = COALESCE(p.kept_result, ''))::INT,
         count(*) FILTER (WHERE p.is_closure = 0 AND p.kept_is_closure = 0
                            AND COALESCE(p.result, '') <> COALESCE(p.kept_result, ''))::INT,
         COALESCE(string_agg(DISTINCT p.line, chr(10))
                    FILTER (WHERE COALESCE(p.result, '') <> COALESCE(p.kept_result, '')), '')
    INTO plan_ids, n_total, n_clos, n_cc, n_same, n_diff, changed
  FROM   plan p;

  DELETE FROM public.audit_maintenance_audits
  WHERE  id = ANY(plan_ids);

  SELECT COALESCE(sum(t.c - 1), 0)::INT INTO dupes_now
  FROM ( SELECT count(*) AS c
         FROM   public.audit_maintenance_audits
         WHERE  task_id IS NOT NULL
         GROUP  BY task_id
         HAVING count(*) > 1 ) t;

  -- The index is the half the office asked for in the words never again.
  -- It is only safe to add once the table really holds one row per task,
  -- so a run that could not finish the clearing leaves it off and says so
  -- rather than failing the whole paste.
  IF dupes_now = 0
     AND to_regclass('public.audit_maint_one_per_task') IS NULL THEN
    CREATE UNIQUE INDEX audit_maint_one_per_task
      ON public.audit_maintenance_audits (task_id)
      WHERE task_id IS NOT NULL;
  END IF;

  IF to_regclass('public.audit_maint_one_per_task') IS NOT NULL THEN
    idx_state := 'INSTALLED';
  END IF;

  -- Every piece is COALESCEd: set_config with a NULL BLANKS the setting,
  -- which is how a previous file in this folder came to erase the reasons
  -- it had collected and report a failure as OK.
  PERFORM set_config('mjm.d_total',   COALESCE(n_total::TEXT, '0'),   false);
  PERFORM set_config('mjm.d_clos',    COALESCE(n_clos::TEXT, '0'),    false);
  PERFORM set_config('mjm.d_cc',      COALESCE(n_cc::TEXT, '0'),      false);
  PERFORM set_config('mjm.d_same',    COALESCE(n_same::TEXT, '0'),    false);
  PERFORM set_config('mjm.d_diff',    COALESCE(n_diff::TEXT, '0'),    false);
  PERFORM set_config('mjm.d_left',    COALESCE(dupes_now::TEXT, '0'), false);
  PERFORM set_config('mjm.d_idx',     COALESCE(idx_state, 'UNKNOWN'), false);
  PERFORM set_config('mjm.d_changed', COALESCE(changed, ''),          false);
END $$;


SELECT 1 AS ord, 'REMOVED' AS section, 'rows deleted in all' AS label,
       COALESCE(current_setting('mjm.d_total', true), '0')::INT AS n,
       'every row past the first on a task that had more than one' AS note
UNION ALL
SELECT 1, 'REMOVED', 'a closure, because the plot WAS audited',
       COALESCE(current_setting('mjm.d_clos', true), '0')::INT,
       'Closed by admin gave way to a real audit on the same task'
UNION ALL
SELECT 1, 'REMOVED', 'a second closure on one task',
       COALESCE(current_setting('mjm.d_cc', true), '0')::INT,
       'one decision recorded twice -- the newest is kept'
UNION ALL
SELECT 1, 'REMOVED', 'a second audit SAYING THE SAME THING',
       COALESCE(current_setting('mjm.d_same', true), '0')::INT,
       'nothing was in doubt -- the report simply counted the task twice'
UNION ALL
SELECT 1, 'REMOVED', 'a second audit that DISAGREED',
       COALESCE(current_setting('mjm.d_diff', true), '0')::INT,
       'the newer reading stands -- every one named in section 2'
UNION ALL
SELECT 2, 'VERDICT MOVED', c.line, 1,
       CASE WHEN COALESCE(current_setting('mjm.d_changed', true), '') = ''
              THEN 'every surviving row says what the row it replaced said'
            ELSE 'read this -- the report now shows the second verdict' END
FROM   string_to_table(
         COALESCE(NULLIF(current_setting('mjm.d_changed', true), ''),
                  'nothing -- no verdict moved'), chr(10)) AS c(line)
UNION ALL
SELECT 3, 'AFTER', 'duplicates left on the table',
       COALESCE(current_setting('mjm.d_left', true), '0')::INT,
       'NOUGHT is the answer you want'
UNION ALL
SELECT 3, 'AFTER', 'one audit per task is now enforced: '
       || COALESCE(current_setting('mjm.d_idx', true), 'UNKNOWN'), 0,
       'a second insert on one task now comes back 23505 and cannot land'
UNION ALL
SELECT 3, 'AFTER', 'audit rows on the table now',
       (SELECT count(*) FROM public.audit_maintenance_audits)::INT,
       'tasks audited: ' || (SELECT count(DISTINCT task_id)
                             FROM public.audit_maintenance_audits
                             WHERE task_id IS NOT NULL)::TEXT
ORDER  BY 1, 4 DESC, 3;
