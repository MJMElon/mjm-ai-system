-- =====================================================================
--  WHY A SEPTEMBER MAINTENANCE ROW IS BACK ON THE AUDITOR BOARD
--
--  Paste the WHOLE file into the Supabase SQL Editor, set the row limit
--  to "No limit", and press Run. READ-ONLY. It changes nothing.
--  No regular expressions and no backslashes, so it survives a paste.
--
--  WHY
--  The auditor To Do board carries MAINTENANCE forward from earlier
--  months and nothing else, so a September deadline nobody has answered
--  is drawn on the board today. That is the design. The question is what
--  counts as answered, and there is exactly one thing: a row in
--  audit_maintenance_audits carrying that task_id -- an audit somebody
--  walked, or a closure an admin pressed the cross on.
--
--  So a September card is one of two quite different things, and they
--  look identical on screen:
--
--    THE TASK HAS NO ROW AT ALL -- nobody audited it and nobody closed
--    it. The board is right and the work is genuinely owed. Audit it, or
--    close the section with the cross.
--
--    THE TASK HAS A ROW -- somebody answered it and the board drew it
--    anyway, which means the board could not SEE that row when it read
--    the table. Those are the plots to report: the chip is stale, and
--    pressing the cross on it was being refused.
--
--  WHAT TO LOOK FOR, in order
--
--    Row 1 says whether one task can still be audited twice. After
--    RUN_ME_remove_duplicate_audits.sql it reads INSTALLED and the rows
--    and the tasks are the same number. If they are not, run that file
--    first -- a task with two rows is a different fault.
--
--    The "window" rows are the days an auditor is given per job, read
--    out of audit_settings, so the deadlines below are the deadlines the
--    screen itself works out. A window of 0 raises no audit at all.
--
--    The "month" rows are the whole answer at a glance: per deadline
--    month, how many tasks carry an audit, how many carry a closure, and
--    how many carry NOTHING. The last figure is what the board draws.
--
--    The "owed" rows name every task carrying nothing whose deadline has
--    passed. If the plots on the September cards are all here, the board
--    is right and this is real work.
--
--    The "ALREADY ANSWERED" rows name every task that carries a row and
--    whose deadline has passed. NONE of these belongs on the board. One
--    of them turning up on a card is the read, not the record.
-- =====================================================================
-- ── THE WINDOWS ARE READ IN A BLOCK, NOT NAMED IN THE QUERY ──
-- audit_settings is optional: audit_settings.js falls back to its own
-- defaults on a database that has not got that table, so a query naming
-- it would fail to PARSE on exactly the databases this most needs to
-- answer on -- however well the branch were guarded. The same trick the
-- save probe uses to keep storage.buckets out of a CASE.
DO $do$
DECLARE m JSONB := '{}'::JSONB;
BEGIN
  IF to_regclass('public.audit_settings') IS NOT NULL THEN
    EXECUTE 'SELECT COALESCE(data -> ''maintenance'', ''{}''::jsonb)'
         || ' FROM audit_settings WHERE id = 1' INTO m;
  END IF;
  m := COALESCE(m, '{}'::JSONB);
  -- Defaulted exactly as audit_settings.js defaults them.
  PERFORM set_config('mjm.w_manuring', COALESCE(m ->> 'manuring', '3'), false);
  PERFORM set_config('mjm.w_weeding',  COALESCE(m ->> 'weeding',  '3'), false);
  PERFORM set_config('mjm.w_interrow', COALESCE(m ->> 'interrow', '5'), false);
  PERFORM set_config('mjm.w_other',    COALESCE(m ->> 'other',    '3'), false);
  PERFORM set_config('mjm.w_pd',       COALESCE(m ->> 'pd',       '0'), false);
END
$do$;

WITH win AS (
  SELECT current_setting('mjm.w_manuring')::INT AS manuring,
         current_setting('mjm.w_weeding')::INT  AS weeding,
         current_setting('mjm.w_interrow')::INT AS interrow,
         current_setting('mjm.w_other')::INT    AS other,
         current_setting('mjm.w_pd')::INT       AS pd
),
-- Every maintenance task the board walks, from BOTH sources. A phone
-- record carries its work type. An office schedule row carries a jenis,
-- and the jenis is the job -- never the chemical.
tasks AS (
  SELECT f.id::TEXT                    AS task_id,
         f.work_date                   AS work_on,
         lower(COALESCE(f.work_type, '')) AS wt,
         COALESCE(f.plot_name, '')     AS plot,
         'phone record'                AS src
    FROM nops_maint_field_records f

  UNION ALL

  SELECT r ->> 'id',
         CASE
           WHEN length(COALESCE(r ->> 'tarikh', '')) = 10
            AND substr(r ->> 'tarikh', 3, 1) = '-'
            AND substr(r ->> 'tarikh', 6, 1) = '-'
             THEN (substr(r ->> 'tarikh', 7, 4) || '-'
                || substr(r ->> 'tarikh', 4, 2) || '-'
                || substr(r ->> 'tarikh', 1, 2))::DATE
           WHEN length(COALESCE(r ->> 'tarikh', '')) = 10
            AND substr(r ->> 'tarikh', 5, 1) = '-'
             THEN (r ->> 'tarikh')::DATE
           ELSE NULL
         END,
         CASE r ->> 'jenis'
           WHEN 'Penyemburan racun kulat dan serangga' THEN 'pd'
           WHEN 'Meracun rumput secara selingan'       THEN 'interrow'
           WHEN 'Merumput'                             THEN 'weeding'
           WHEN 'Membaja'                              THEN 'manuring'
           ELSE 'other'
         END,
         COALESCE(r ->> 'plot', ''),
         'office schedule'
    FROM nops_maint_records o,
         jsonb_array_elements(COALESCE(o.records, '[]'::jsonb)) r
),
dated AS (
  SELECT t.task_id, t.work_on, t.wt, t.plot, t.src,
         CASE t.wt WHEN 'manuring' THEN w.manuring
                   WHEN 'weeding'  THEN w.weeding
                   WHEN 'interrow' THEN w.interrow
                   WHEN 'pd'       THEN w.pd
                   ELSE w.other END AS days
    FROM tasks t, win w
   WHERE t.work_on IS NOT NULL
),
due AS (
  SELECT d.*, (d.work_on + d.days) AS deadline
    FROM dated d
   WHERE d.days > 0
),
-- What answers a task. An audit and a closure both retire it, and they
-- are told apart because a closure says so in its result, exactly.
answer AS (
  SELECT a.task_id::TEXT AS task_id,
         max(CASE WHEN COALESCE(a.result, '') = 'Closed by admin'
                  THEN 0 ELSE 1 END) AS has_audit,
         max(CASE WHEN COALESCE(a.result, '') = 'Closed by admin'
                  THEN 1 ELSE 0 END) AS has_closure,
         count(*)::INT               AS rows_on_task
    FROM audit_maintenance_audits a
   WHERE a.task_id IS NOT NULL
   GROUP BY a.task_id::TEXT
),
joined AS (
  SELECT u.*, COALESCE(n.has_audit, 0) AS has_audit,
              COALESCE(n.has_closure, 0) AS has_closure,
              COALESCE(n.rows_on_task, 0) AS rows_on_task,
         to_char(u.deadline, 'YYYY-MM') AS due_month
    FROM due u
    LEFT JOIN answer n ON n.task_id = u.task_id
)
SELECT what, detail_1, detail_2, detail_3, detail_4 FROM (

  -- 1. Can a task still be audited twice at all.
  SELECT 1 AS ord, 0 AS sub, ''::TEXT AS k,
         'one row per task' AS what,
         CASE WHEN to_regclass('public.audit_maint_one_per_task') IS NULL
              THEN 'the unique index is NOT installed'
              ELSE 'INSTALLED' END AS detail_1,
         (SELECT count(*)::TEXT FROM audit_maintenance_audits
           WHERE task_id IS NOT NULL) || ' rows' AS detail_2,
         (SELECT count(*)::TEXT FROM answer) || ' tasks' AS detail_3,
         CASE WHEN (SELECT count(*) FROM answer WHERE rows_on_task > 1) = 0
              THEN 'no task carries two rows'
              ELSE (SELECT count(*)::TEXT FROM answer WHERE rows_on_task > 1)
                   || ' tasks carry more than one -- run RUN_ME_remove_duplicate_audits.sql first'
         END AS detail_4

  UNION ALL

  -- 2. The windows the deadlines below are worked out from.
  SELECT 2, 1, 'manuring', 'window', 'manuring',
         (SELECT manuring::TEXT FROM win) || ' days', '', ''
  UNION ALL
  SELECT 2, 2, 'weeding', 'window', 'weeding',
         (SELECT weeding::TEXT FROM win) || ' days', '', ''
  UNION ALL
  SELECT 2, 3, 'interrow', 'window', 'interrow spray',
         (SELECT interrow::TEXT FROM win) || ' days', '', ''
  UNION ALL
  SELECT 2, 4, 'other', 'window', 'others',
         (SELECT other::TEXT FROM win) || ' days', '', ''
  UNION ALL
  SELECT 2, 5, 'pd', 'window', 'P and D spraying',
         (SELECT pd::TEXT FROM win) || ' days',
         CASE WHEN (SELECT pd FROM win) = 0 THEN 'raises no audit' ELSE '' END, ''

  UNION ALL

  -- 3. Per deadline month: answered, closed, and carrying nothing.
  SELECT 3, 0, due_month, 'month', due_month,
         count(*)::TEXT || ' tasks',
         sum(CASE WHEN rows_on_task = 0 THEN 1 ELSE 0 END)::TEXT
           || ' carry NOTHING',
         sum(CASE WHEN has_audit = 1 THEN 1 ELSE 0 END)::TEXT || ' audited, '
           || sum(CASE WHEN has_closure = 1 AND has_audit = 0 THEN 1 ELSE 0 END)::TEXT
           || ' closed by admin'
    FROM joined
   GROUP BY due_month

  UNION ALL

  -- 4. Every task carrying nothing whose deadline has gone by. This is
  --    what the board is drawing, and it is right to draw it.
  SELECT 4, 0, due_month || plot || task_id, 'owed',
         due_month || '  ' || plot,
         wt || ', worked ' || to_char(work_on, 'DD Mon YYYY'),
         'due ' || to_char(deadline, 'DD Mon YYYY') || ', '
           || (CURRENT_DATE - deadline)::TEXT || ' days overdue',
         src || ', case ' || task_id
    FROM joined
   WHERE rows_on_task = 0
     AND deadline < date_trunc('month', CURRENT_DATE)::DATE

  UNION ALL

  -- 5. Every task that IS answered and whose deadline has gone by. None
  --    of these belongs on the board.
  SELECT 5, 0, due_month || plot || task_id, 'ALREADY ANSWERED',
         due_month || '  ' || plot,
         wt || ', worked ' || to_char(work_on, 'DD Mon YYYY'),
         CASE WHEN has_audit = 1 THEN 'audited' ELSE 'closed by admin' END
           || ', due ' || to_char(deadline, 'DD Mon YYYY'),
         src || ', case ' || task_id
    FROM joined
   WHERE rows_on_task > 0
     AND deadline < date_trunc('month', CURRENT_DATE)::DATE

  UNION ALL

  -- 6. The verdict, in one line.
  SELECT 6, 0, '', 'VERDICT',
         (SELECT count(*)::TEXT FROM joined
           WHERE rows_on_task = 0
             AND deadline < date_trunc('month', CURRENT_DATE)::DATE)
           || ' past deadlines carry nothing',
         (SELECT count(*)::TEXT FROM joined
           WHERE rows_on_task > 0
             AND deadline < date_trunc('month', CURRENT_DATE)::DATE)
           || ' are already answered',
         'a plot on a card that is in the ALREADY ANSWERED list is the read',
         'everything in the owed list is real work'
) z
ORDER BY ord, sub, k;
