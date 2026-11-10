-- =====================================================================
--  ONE MORNING ON ONE PLOT FOR ONE JOB IS ONE CASE: WHAT THAT MOVES
--
--  Paste the WHOLE file into the Supabase SQL Editor, set the row limit
--  to "No limit", and press Run. READ-ONLY. It changes nothing, and
--  there is nothing to run in the database for this change.
--  No regular expressions and no backslashes, so it survives a paste.
--
--  WHY
--  The office, in one line: "as long as is the same work, no matter
--  submitted by how many workers, it should consider as 1 time only."
--
--  A maintenance TASK has always been one work RECORD, and one morning on
--  one plot can be several of them:
--
--    a PHONE RECORD       nops_maint_field_records, ONE ROW PER WORKER per
--                         plot per job. A small serial id.
--    an OFFICE SCHEDULE   one entry of the nops_maint_records list, drawn
--    ROW                  by the Work Maintenance schedule. A long id.
--
--  So a plot weeded by seven people on one morning raised seven cases and
--  wore seven chips, the auditor walked it once and saved once, which
--  answered ONE of them, and the other six went on asking. That is what
--  the office saw as B06 three times and U02 seven, and it is why an
--  October plot they had audited and saved was still on the To Do list.
--
--  The auditor board and the maintenance module now group the records by
--  NURSERY, PLOT, JOB and THE DAY THE WORK WAS DONE -- the office own
--  sentence and nothing else in it, so not the batch and not the worker --
--  and an audit or an admin closure on ANY record of a morning answers
--  the whole of it. This file is the same grouping asked of the data, so
--  the check and the screen cannot say different things.
--
--  WHAT TO LOOK FOR
--
--    Row 1 is the whole answer: how many RECORDS carry a past deadline,
--    how many CASES they group into, how many of those cases are already
--    answered, and how many the board draws now -- beside the number of
--    chips it drew before, which is the figure that was too high.
--
--    The "month" rows split that by deadline month. October and September
--    are the two the office has been looking at.
--
--    The "folded" rows name the mornings that were several chips and are
--    one now, worst first, with how many of their records carry an answer.
--    A morning with one answer and five records is six chips becoming
--    nought, which is the office October complaint exactly.
--
--    The "owed" rows are what is left: a morning nobody has answered at
--    all. Those are real work, however they are grouped.
-- =====================================================================

-- The windows are read in a block rather than named in the query, because
-- audit_settings is optional: a query naming it would fail to PARSE on a
-- database that has not got it.
DO $w$
DECLARE m JSONB := '{}'::JSONB;
BEGIN
  IF to_regclass('public.audit_settings') IS NOT NULL THEN
    EXECUTE 'SELECT COALESCE(data -> ''maintenance'', ''{}''::jsonb)'
         || ' FROM audit_settings WHERE id = 1' INTO m;
  END IF;
  m := COALESCE(m, '{}'::JSONB);
  PERFORM set_config('mjm.w_manuring', COALESCE(m ->> 'manuring', '3'), false);
  PERFORM set_config('mjm.w_weeding',  COALESCE(m ->> 'weeding',  '3'), false);
  PERFORM set_config('mjm.w_interrow', COALESCE(m ->> 'interrow', '5'), false);
  PERFORM set_config('mjm.w_other',    COALESCE(m ->> 'other',    '3'), false);
  PERFORM set_config('mjm.w_pd',       COALESCE(m ->> 'pd',       '0'), false);
END
$w$;

WITH win AS (
  SELECT current_setting('mjm.w_manuring')::INT AS manuring,
         current_setting('mjm.w_weeding')::INT  AS weeding,
         current_setting('mjm.w_interrow')::INT AS interrow,
         current_setting('mjm.w_other')::INT    AS other,
         current_setting('mjm.w_pd')::INT       AS pd
),
tasks AS (
  SELECT f.id::TEXT                       AS task_id,
         f.work_date                      AS work_on,
         lower(COALESCE(f.work_type, '')) AS wt,
         upper(trim(COALESCE(f.plot_name, ''))) AS plot_raw,
         'phone record'                   AS src
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
         upper(trim(COALESCE(r ->> 'plot', ''))),
         'office schedule'
    FROM nops_maint_records o,
         jsonb_array_elements(COALESCE(o.records, '[]'::jsonb)) r
),
canon AS (
  SELECT t.*,
         CASE
           WHEN right(t.plot_raw, 2) = '-R'
             THEN left(t.plot_raw, 1)
               || lpad(substr(left(t.plot_raw, length(t.plot_raw) - 2), 2), 2, '0')
               || '-R'
           ELSE left(t.plot_raw, 1) || lpad(substr(t.plot_raw, 2), 2, '0')
         END AS plot
    FROM tasks t
   WHERE t.plot_raw <> ''
),
due AS (
  SELECT c.task_id, c.work_on, c.wt, c.plot, c.src,
         (c.work_on + CASE c.wt WHEN 'manuring' THEN w.manuring
                                WHEN 'weeding'  THEN w.weeding
                                WHEN 'interrow' THEN w.interrow
                                WHEN 'pd'       THEN w.pd
                                ELSE w.other END) AS deadline,
         CASE c.wt WHEN 'manuring' THEN w.manuring
                   WHEN 'weeding'  THEN w.weeding
                   WHEN 'interrow' THEN w.interrow
                   WHEN 'pd'       THEN w.pd
                   ELSE w.other END AS days
    FROM canon c, win w
   WHERE c.work_on IS NOT NULL
),
-- What answers a record, and which kind of answer it was. The board has
-- never cared which: both are a row in audit_maintenance_audits.
ans AS (
  SELECT a.task_id::TEXT AS task_id,
         CASE WHEN COALESCE(a.result, '') = 'Closed by admin'
              THEN 'closed by admin' ELSE 'audited' END AS kind,
         COALESCE(a.auditor_name, '') AS who
    FROM audit_maintenance_audits a
   WHERE a.task_id IS NOT NULL
),
-- Every record carrying a PAST deadline. P and D has a window of nought
-- days, so it raises no audit at all and is out of this entirely.
recs AS (
  SELECT d.task_id, d.work_on, d.wt, d.plot, d.src, d.deadline,
         to_char(d.deadline, 'YYYY-MM') AS due_month,
         n.kind, n.who
    FROM due d
    LEFT JOIN ans n ON n.task_id = d.task_id
   WHERE d.days > 0
     AND d.deadline < CURRENT_DATE
),
-- THE GROUP IS THE UNIT: plot, job, and the day the work was done. The
-- nursery is not in the key because the plot decides the nursery, which
-- is the house rule, so two plots of one name in two nurseries do not
-- exist.
cases AS (
  SELECT plot, wt, work_on,
         min(due_month)                                   AS due_month,
         count(*)                                         AS records,
         count(kind)                                      AS answered_recs,
         count(DISTINCT src)                              AS sources,
         min(task_id)                                     AS named_after,
         string_agg(DISTINCT COALESCE(kind, ''), ', ')
           FILTER (WHERE kind IS NOT NULL)                AS kinds,
         string_agg(DISTINCT who, ', ')
           FILTER (WHERE kind IS NOT NULL)                AS who
    FROM recs
   GROUP BY plot, wt, work_on
),
folded AS (SELECT * FROM cases WHERE records > 1),
owed   AS (SELECT * FROM cases WHERE answered_recs = 0)
SELECT what, detail_1, detail_2, detail_3, detail_4 FROM (

  SELECT 1 AS ord, '' AS k, 'ANSWER' AS what,
         (SELECT count(*)::TEXT FROM recs)  || ' records carry a past deadline' AS detail_1,
         (SELECT count(*)::TEXT FROM cases) || ' cases once the mornings are grouped' AS detail_2,
         (SELECT count(*)::TEXT FROM owed) || ' case'
           || CASE WHEN (SELECT count(*) FROM owed) = 1 THEN '' ELSE 's' END
           || ' the board draws now' AS detail_3,
         (SELECT count(*)::TEXT FROM recs WHERE kind IS NULL) || ' chip'
           || CASE WHEN (SELECT count(*) FROM recs WHERE kind IS NULL) = 1
                   THEN '' ELSE 's' END
           || ' it drew before' AS detail_4

  UNION ALL

  SELECT 2, due_month, 'month', due_month,
         count(*)::TEXT || ' case' || CASE WHEN count(*) = 1 THEN '' ELSE 's' END,
         sum(CASE WHEN answered_recs = 0 THEN 1 ELSE 0 END)::TEXT || ' on the board now',
         sum(records - answered_recs)::TEXT || ' chip'
           || CASE WHEN sum(records - answered_recs) = 1 THEN '' ELSE 's' END || ' before'
    FROM cases
   GROUP BY due_month

  UNION ALL

  SELECT 3, lpad((1000 - records)::TEXT, 4, '0') || due_month || plot, 'folded',
         due_month || '  ' || plot || '  ' || wt,
         records::TEXT || ' records on ' || to_char(work_on, 'DD Mon YYYY')
           || ' from ' || sources::TEXT || ' source'
           || CASE WHEN sources = 1 THEN '' ELSE 's' END,
         CASE WHEN answered_recs = 0
              THEN 'none of them answered, so it is one chip now'
              ELSE answered_recs::TEXT || ' answered (' || COALESCE(kinds, '')
                || '), so the whole morning is off the board' END,
         CASE WHEN answered_recs = 0 THEN 'named after case ' || named_after
              ELSE 'by ' || COALESCE(who, '') END
    FROM folded

  UNION ALL

  SELECT 4, due_month || plot || named_after, 'owed',
         due_month || '  ' || plot || '  ' || wt,
         'worked ' || to_char(work_on, 'DD Mon YYYY'),
         records::TEXT || ' record' || CASE WHEN records = 1 THEN '' ELSE 's' END
           || ', none answered',
         'case ' || named_after
    FROM owed

  UNION ALL

  SELECT 3, 'zzzz', 'folded', 'nothing to report',
         'no morning carries more than one record', '', ''
   WHERE NOT EXISTS (SELECT 1 FROM folded)

  UNION ALL

  SELECT 4, 'zzzz', 'owed', 'nothing to report',
         'every past deadline has been answered', '', ''
   WHERE NOT EXISTS (SELECT 1 FROM owed)
) z
ORDER BY ord, k;
