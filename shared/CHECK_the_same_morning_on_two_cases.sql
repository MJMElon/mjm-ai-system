-- =====================================================================
--  AN AUDITED PLOT STILL ON THE LIST: THE OTHER CASE FOR THE SAME MORNING
--
--  Paste the WHOLE file into the Supabase SQL Editor, set the row limit
--  to "No limit", and press Run. READ-ONLY. It changes nothing.
--  No regular expressions and no backslashes, so it survives a paste.
--
--  WHY
--  The office audited an October plot, saved it, and the plot is still on
--  the To Do list. Auditing really does take a case off the board -- the
--  one thing that retires a maintenance chip is a row in
--  audit_maintenance_audits carrying its task id -- so a chip that stays
--  is a DIFFERENT CASE for the same morning.
--
--  There are two sources, and one morning can be in both:
--
--    a PHONE RECORD       nops_maint_field_records, one row per worker per
--                         plot per job. A small serial id.
--    an OFFICE SCHEDULE   one entry of the nops_maint_records list, drawn
--    ROW                  by the Work Maintenance schedule. A long id.
--
--  Each becomes its own case with its own task id, so a plot weeded on the
--  18th can carry a phone case AND a schedule case. The auditor walks the
--  plot once and saves once, which answers ONE of them, and the other goes
--  on asking.
--
--  WHAT TO LOOK FOR
--
--    Row 1 is the whole answer: of the past deadlines still on the board,
--    how many are the SAME MORNING as a case somebody has already answered
--    -- same plot, same job, same work date -- and how many are genuinely
--    unaudited work.
--
--    The "month" rows split that by deadline month.
--
--    The "twin" rows name each one: the case still on the board, and the
--    case for the same morning that was answered, with what it said.
--    These are the chips to expect to see over an audited plot.
--
--    The "no twin" rows are the other kind -- nothing else covers that
--    morning, so the work really has not been audited.
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
-- What answers a case, and which kind it was.
ans AS (
  SELECT a.task_id::TEXT AS task_id,
         CASE WHEN COALESCE(a.result, '') = 'Closed by admin'
              THEN 'closed by admin' ELSE 'audited' END AS kind,
         COALESCE(a.result, '')       AS result,
         COALESCE(a.auditor_name, '') AS who,
         a.date                       AS on_day
    FROM audit_maintenance_audits a
   WHERE a.task_id IS NOT NULL
),
cases AS (
  SELECT d.*, n.kind, n.result, n.who, n.on_day,
         to_char(d.deadline, 'YYYY-MM') AS due_month
    FROM due d
    LEFT JOIN ans n ON n.task_id = d.task_id
   WHERE d.days > 0
),
-- Still on the board: a past deadline nobody has answered.
owed AS (
  SELECT * FROM cases
   WHERE kind IS NULL
     AND deadline < CURRENT_DATE
),
-- THE SAME MORNING: same plot, same job, same work date, a DIFFERENT case,
-- and that one IS answered. This is the pair the office is looking at.
paired AS (
  SELECT o.*,
         t.task_id AS twin_id, t.src AS twin_src, t.kind AS twin_kind,
         t.result  AS twin_result, t.who AS twin_who
    FROM owed o
    JOIN LATERAL (
      SELECT c.task_id, c.src, c.kind, c.result, c.who
        FROM cases c
       WHERE c.plot    = o.plot
         AND c.wt      = o.wt
         AND c.work_on = o.work_on
         AND c.task_id <> o.task_id
         AND c.kind IS NOT NULL
       ORDER BY c.kind, c.task_id
       LIMIT 1) t ON TRUE
),
lonely AS (
  SELECT o.* FROM owed o
   WHERE NOT EXISTS (SELECT 1 FROM paired p WHERE p.task_id = o.task_id)
)
SELECT what, detail_1, detail_2, detail_3, detail_4 FROM (

  SELECT 1 AS ord, '' AS k, 'ANSWER' AS what,
         (SELECT count(*)::TEXT FROM owed)   || ' past deadlines on the board' AS detail_1,
         (SELECT count(*)::TEXT FROM paired) || ' are the SAME MORNING as a case already answered' AS detail_2,
         (SELECT count(*)::TEXT FROM lonely) || ' have no twin, so that work really is unaudited' AS detail_3,
         'the first figure is the second plus the third' AS detail_4

  UNION ALL

  SELECT 2, due_month, 'month', due_month,
         count(*)::TEXT || ' on the board',
         sum(CASE WHEN tw THEN 1 ELSE 0 END)::TEXT || ' are a twin',
         sum(CASE WHEN tw THEN 0 ELSE 1 END)::TEXT || ' really unaudited'
    FROM (SELECT due_month, TRUE  AS tw FROM paired
          UNION ALL
          SELECT due_month, FALSE       FROM lonely) z2
   GROUP BY due_month

  UNION ALL

  SELECT 3, due_month || plot || task_id, 'twin',
         due_month || '  ' || plot || '  ' || wt,
         'on the board: ' || src || ' case ' || task_id,
         'already ' || twin_kind || ': ' || twin_src || ' case ' || twin_id,
         'worked ' || to_char(work_on, 'DD Mon YYYY') || ', by ' || twin_who
    FROM paired

  UNION ALL

  SELECT 4, due_month || plot || task_id, 'no twin',
         due_month || '  ' || plot || '  ' || wt,
         src || ' case ' || task_id,
         'worked ' || to_char(work_on, 'DD Mon YYYY'),
         'nothing else covers this morning'
    FROM lonely
) z
ORDER BY ord, k;
