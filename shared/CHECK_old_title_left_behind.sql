-- =====================================================================
--  WHERE IS THE OLD TITLE STILL WRITTEN DOWN?
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  READ-ONLY. It changes nothing -- it only counts.
--  No regular expressions and no backslashes, so it survives a paste.
--
--  RUN_ME_rename_pre_nursery_auditor.sql changed the name where the name
--  LIVES: shared_profiles.full_name and nelos_handlers.full_name. Those
--  are "who this person is", and they now say
--  "Pre Nursery Auditor + Drone Operator".
--
--  But this system also COPIES a name into a record at the moment the
--  record is written -- who solved a Nelos case, who did and who verified
--  a maintenance job, who approved a stock adjustment. Those copies are
--  history: they say who it was AT THE TIME, and the rename does not and
--  should not reach them.
--
--  This counts them, so the decision is made on numbers rather than on a
--  guess. Nothing is changed either way.
-- =====================================================================

DROP TABLE IF EXISTS _mjm_old_title_log;
CREATE TABLE _mjm_old_title_log (
  table_name   text,
  column_name  text,
  rows_found   int
);

DO $$
DECLARE
  old_title CONSTANT text := 'Pre Nursery Auditor';
  new_title CONSTANT text := 'Pre Nursery Auditor + Drone Operator';
  r  record;
  n  int;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name   = c.table_name
     AND t.table_type   = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND (left(c.table_name,  6) = 'nelos_'
        OR left(c.table_name,  6) = 'audit_'
        OR left(c.table_name,  7) = 'shared_'
        OR left(c.table_name, 10) = 'operation_'
        OR left(c.table_name,  5) = 'nops_'
        OR left(c.table_name,  9) = 'npayroll_')
      -- Columns that hold a name COPIED IN at the time, plus the remark
      -- fields where an approval writes "[APPROVED by <who> on <when>]".
      AND c.column_name IN ('worked_by', 'verified_by', 'resolved_by',
                            'approved_by', 'signed_by', 'handled_by',
                            'checked_by', 'assigned_to', 'created_by_name',
                            'rejected_by', 'remark', 'remarks', 'note',
                            'notes', 'description')
      AND c.data_type IN ('text', 'character varying')
    ORDER BY c.table_name, c.column_name
  LOOP
    -- Contains the old title but is NOT already the new one. position()
    -- rather than a regex, and the new title starts with the old, so the
    -- second test is what keeps already-renamed values out of the count.
    EXECUTE format(
      'SELECT count(*) FROM public.%I '
      || 'WHERE position($1 in %I) > 0 AND position($2 in %I) = 0',
      r.table_name, r.column_name, r.column_name)
      INTO n USING old_title, new_title;

    IF n > 0 THEN
      INSERT INTO _mjm_old_title_log VALUES (r.table_name, r.column_name, n);
    END IF;
  END LOOP;
END $$;

-- ONE result set -- the SQL Editor only shows the last statement's.
SELECT 0                                            AS sort,
       'OLD TITLE STILL WRITTEN IN OLD RECORDS'::text AS place,
       (SELECT COALESCE(sum(rows_found), 0) FROM _mjm_old_title_log)::int AS rows_found,
       CASE
         WHEN (SELECT COALESCE(sum(rows_found), 0) FROM _mjm_old_title_log) = 0
           THEN 'Nothing left anywhere. The rename was the whole job -- no old '
                || 'record carries the old wording.'
         ELSE 'These are records that copied the name down when they were '
              || 'written. They are history, so nothing here has been changed. '
              || 'Send this list back if you want them reworded too.'
       END                                          AS result
UNION ALL
SELECT 1,
       table_name || ' . ' || column_name,
       rows_found,
       'old records, left as they were'
FROM _mjm_old_title_log
ORDER BY sort, place;

-- WHAT A GOOD RESULT LOOKS LIKE
--   One row saying "Nothing left anywhere", rows_found 0 -- the rename
--   covered everything and there is nothing more to decide.
--
--   Otherwise, one row per place, with a count. A handful of rows on
--   nelos_cases.resolved_by or nops_maint_field_records.verified_by is
--   normal and usually correct to leave: the record is saying who did the
--   work under the title they held that day.
--
--   Nothing is changed by running this, and running it twice is the same
--   as running it once.
--
--   Afterwards, DROP TABLE _mjm_old_title_log; tidies up.
