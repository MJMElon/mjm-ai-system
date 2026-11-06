-- =====================================================================
--  CLOSE EVERY SEPTEMBER MAINTENANCE CASE STILL ON THE TO DO LIST
--
--  Paste the WHOLE file into the Supabase SQL Editor, set the row limit
--  to "No limit", and press Run. Safe to run twice.
--  No regular expressions and no backslashes, so it survives a paste.
--
--  WHY
--  The office asked for the September maintenance cases to come off the
--  auditor board. There is exactly ONE thing that takes a maintenance row
--  off that board: a row in audit_maintenance_audits carrying its task id.
--  The cross on the board writes one, marked "Closed by admin", and that
--  is what this does in bulk -- the same row, the same wording, the same
--  remark naming the deadline and how far past it had gone.
--
--  SO NOTHING IS DELETED. The work records in nops_maint_field_records and
--  the office schedule are not read for writing and not touched, and every
--  closure lands in Audit History with a date on it like any other record.
--  shared/CHECK_audits_closed_by_admin.sql is the register of them.
--
--  WHAT IT WILL NOT TOUCH
--
--    A task that already carries an audit or a closure. Those are off the
--    board already, and a second row on one task is refused outright by
--    the unique index audit_maint_one_per_task.
--
--    Any month but September 2026. October and November are left exactly
--    as they are.
--
--    A plot that resolves to no nursery. Those are on no board to begin
--    with, and they are NAMED in the result rather than closed quietly.
--
--  WHAT IT COSTS, and it is worth knowing before the next report is read
--
--    The closures are dated TODAY, so they land in this month Monthly
--    Audit Report as maintenance records done by an admin. The Done By
--    filter on that report is what separates them from an auditor work,
--    and the remark on each one says what it was due and how overdue.
--
--  WHAT TO LOOK FOR
--
--    Row 1 is the headline: how many September cases were closed.
--    The "by nursery" rows say where they were.
--    The "not placed" rows name any plot that resolves to no nursery.
--    The last row is the proof: September should now carry NOUGHT
--    unanswered. A second run closes 0 and prints the same nought.
-- =====================================================================

-- The windows are read in a block rather than named in the query, because
-- audit_settings is optional -- audit_settings.js falls back to its own
-- defaults on a database without it, so a query naming it would fail to
-- PARSE on exactly the databases this most needs to run on.
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

-- THE WRITE IS A BLOCK AND THE CHECK IS THE QUERY, in that order, and the
-- first version got this wrong in a way worth keeping. Done as one
-- data-modifying WITH, the final SELECT reads the snapshot from BEFORE the
-- statement -- so the proof at the end counted the rows it had just closed
-- as still on the board and reported 6 where it should read nought. A
-- verification has to run as its own statement to be a verification at all.
DO $run$
DECLARE
  n_closed  INT := 0;
  n_skipped INT := 0;
  n_left    INT := 0;
  by_nur    TEXT := '';
  skipped   TEXT := '';
BEGIN
  -- A VIEW so the rule is written ONCE and can be read again after the
  -- insert, and DROPPED before this block ends so the project is not left
  -- carrying an object the Supabase linter will warn about. Created and
  -- dropped inside one statement block, it never outlives the run.
  DROP VIEW IF EXISTS mjm_sep_owed;
  CREATE VIEW mjm_sep_owed AS
  WITH win AS (
    SELECT current_setting('mjm.w_manuring')::INT AS manuring,
           current_setting('mjm.w_weeding')::INT  AS weeding,
           current_setting('mjm.w_interrow')::INT AS interrow,
           current_setting('mjm.w_other')::INT    AS other,
           current_setting('mjm.w_pd')::INT       AS pd
  ),
  -- Every maintenance task the board walks, from BOTH sources.
  tasks AS (
    SELECT f.id::TEXT                       AS task_id,
           f.work_date                      AS work_on,
           lower(COALESCE(f.work_type, '')) AS wt,
           upper(trim(COALESCE(f.plot_name, '')))    AS plot_raw,
           upper(trim(COALESCE(f.nursery_name, ''))) AS nur_raw,
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
           '',
           'office schedule'
      FROM nops_maint_records o,
           jsonb_array_elements(COALESCE(o.records, '[]'::jsonb)) r
  ),
  -- The plot as the board canonicalises it: the letter, the number padded
  -- to two digits, and a trailing -R kept.
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
  dated AS (
    SELECT c.*,
           CASE c.wt WHEN 'manuring' THEN w.manuring
                     WHEN 'weeding'  THEN w.weeding
                     WHEN 'interrow' THEN w.interrow
                     WHEN 'pd'       THEN w.pd
                     ELSE w.other END AS days
      FROM canon c, win w
     WHERE c.work_on IS NOT NULL
  ),
  due AS (
    SELECT d.*, (d.work_on + d.days) AS deadline
      FROM dated d
     WHERE d.days > 0
  ),
  -- WHICH NURSERY A PLOT IS IN, in the board own order: the custom plot
  -- list first, then the fixed ranges, then the record own nursery name.
  placed AS (
    SELECT u.*,
           COALESCE(
             (SELECT CASE upper(replace(replace(cp.nursery, ' ', ''), '-', ''))
                       WHEN 'PN'   THEN 'PN'   WHEN 'BNN'  THEN 'BNN'
                       WHEN 'UNN1' THEN 'UNN1' WHEN 'UNN2' THEN 'UNN2'
                       ELSE NULL END
                FROM nops_maint_custom_plots cp
               WHERE upper(trim(cp.plot)) = u.plot
                  OR upper(trim(cp.plot)) = u.plot_raw
               LIMIT 1),
             CASE
               WHEN left(u.plot, 1) = 'P' AND substr(u.plot, 2, 2) BETWEEN '01' AND '52' THEN 'PN'
               WHEN left(u.plot, 1) = 'B' AND substr(u.plot, 2, 2) BETWEEN '01' AND '14' THEN 'BNN'
               WHEN left(u.plot, 1) = 'U' AND substr(u.plot, 2, 2) BETWEEN '01' AND '18' THEN 'UNN1'
               WHEN left(u.plot, 1) = 'N' AND substr(u.plot, 2, 2) BETWEEN '01' AND '20' THEN 'UNN2'
               ELSE NULL
             END,
             CASE upper(replace(replace(u.nur_raw, ' ', ''), '-', ''))
               WHEN 'PN'   THEN 'PN'   WHEN 'BNN'  THEN 'BNN'
               WHEN 'UNN1' THEN 'UNN1' WHEN 'UNN2' THEN 'UNN2'
               WHEN 'PRENURSERY'  THEN 'PN'
               WHEN 'BATUNIAH'    THEN 'BNN'
               WHEN 'ULUNIAH1'    THEN 'UNN1'
               WHEN 'ULUNIAH2'    THEN 'UNN2'
               ELSE NULL END
           ) AS nursery
      FROM due u
  )
  -- September 2026 only, and only the ones nobody has answered. The view
  -- is re-read AFTER the insert by the check at the foot, which is the
  -- whole reason it is a view and not another CTE.
  SELECT p.task_id, p.work_on, p.wt, p.plot, p.src, p.deadline, p.nursery
    FROM placed p
   WHERE to_char(p.deadline, 'YYYY-MM') = '2026-09'
     AND NOT EXISTS (
           SELECT 1 FROM audit_maintenance_audits a
            WHERE a.task_id IS NOT NULL
              AND a.task_id::TEXT = p.task_id);

  SELECT COALESCE(string_agg(DISTINCT o.plot || '  (' || o.src || ')', chr(10)), '')
    INTO skipped
    FROM mjm_sep_owed o WHERE o.nursery IS NULL;
  SELECT count(*) INTO n_skipped FROM mjm_sep_owed WHERE nursery IS NULL;

  WITH written AS (
    INSERT INTO audit_maintenance_audits
      (audit_id, task_id, nursery, plot, task_type, result, remarks,
       photo_url, auditor_name, date)
    SELECT 'MTA-CL' || c.task_id,
           c.task_id::BIGINT,
           c.nursery,
           c.plot,
           CASE c.wt WHEN 'manuring' THEN 'Manuring'
                     WHEN 'weeding'  THEN 'Weeding'
                     WHEN 'interrow' THEN 'Interrow Spray'
                     WHEN 'pd'       THEN 'P & D Spraying'
                     ELSE 'Others' END,
           'Closed by admin',
           'Due ' || to_char(c.deadline, 'YYYY-MM-DD') || ', '
             || (CURRENT_DATE - c.deadline)::TEXT
             || ' days overdue. Closed without an audit with the whole of '
             || 'September 2026, work done ' || to_char(c.work_on, 'YYYY-MM-DD') || '.',
           NULL,
           'Office bulk close',
           CURRENT_DATE
      FROM mjm_sep_owed c
     WHERE c.nursery IS NOT NULL
    RETURNING nursery
  )
  -- sum(x.n), never count(*): the subquery is ONE ROW PER NURSERY, so a
  -- plain count said 3 under a list of per-nursery figures adding to 6.
  SELECT COALESCE(sum(x.n), 0),
         COALESCE(string_agg(x.nursery || '  ' || x.n::TEXT || ' closed', chr(10)
                             ORDER BY x.nursery), '')
    INTO n_closed, by_nur
    FROM (SELECT nursery, count(*) AS n FROM written GROUP BY nursery) x;

  -- THE PROOF IS READ HERE, after the insert and before the view goes.
  -- Asked from the final SELECT as a data-modifying CTE it read the
  -- snapshot from BEFORE the statement and reported every row it had just
  -- closed as still on the board.
  SELECT count(*) INTO n_left FROM mjm_sep_owed WHERE nursery IS NOT NULL;
  DROP VIEW mjm_sep_owed;

  PERFORM set_config('mjm.sep_left',    COALESCE(n_left::TEXT, '0'),    false);
  PERFORM set_config('mjm.sep_closed',  COALESCE(n_closed::TEXT, '0'),  false);
  PERFORM set_config('mjm.sep_skipped', COALESCE(n_skipped::TEXT, '0'), false);
  PERFORM set_config('mjm.sep_by_nur',  COALESCE(by_nur, ''),  false);
  PERFORM set_config('mjm.sep_names',   COALESCE(skipped, ''), false);
END
$run$;

SELECT what, detail_1, detail_2, detail_3 FROM (

  SELECT 1 AS ord, '' AS k, 'closed' AS what,
         current_setting('mjm.sep_closed') || ' September cases closed' AS detail_1,
         'dated ' || to_char(CURRENT_DATE, 'YYYY-MM-DD') AS detail_2,
         'the work records are untouched' AS detail_3

  UNION ALL

  SELECT 2, line, 'by nursery', split_part(line, '  ', 1),
         split_part(line, '  ', 2), ''
    FROM string_to_table(current_setting('mjm.sep_by_nur'), chr(10)) AS line
   WHERE length(trim(COALESCE(line, ''))) > 0

  UNION ALL

  -- A plot the board cannot place is on no list, so it is NAMED instead of
  -- being closed quietly.
  SELECT 3, line, 'not placed', split_part(line, '  ', 1),
         'resolves to no nursery, so it was on no board', split_part(line, '  ', 2)
    FROM string_to_table(current_setting('mjm.sep_names'), chr(10)) AS line
   WHERE length(trim(COALESCE(line, ''))) > 0

  UNION ALL

  -- Read back AFTER the insert, which is what makes it a check rather than
  -- a restatement of what was just done.
  SELECT 4, '', 'PROOF',
         current_setting('mjm.sep_left') || ' September cases left on the board',
         'nought is what this should read',
         CASE WHEN current_setting('mjm.sep_skipped') = '0'
              THEN 'a second run closes 0 and reads nought again'
              ELSE current_setting('mjm.sep_skipped')
                   || ' were on no board and were left alone' END
) z
ORDER BY ord, k;
