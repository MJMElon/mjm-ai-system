-- ============================================================================
-- RUN_ME_archive_leftover_tables.sql
--
-- Step 2 of the database tidy-up. Moves the thirteen LEFTOVER tables -- work
-- tables and backups made by one-off repairs in August and September -- out
-- of the live schema into a schema called archive.
--
-- NOTHING IS DELETED. Every row stays exactly where it is, only the table
-- moves. RUN_ME_undo_archive_leftover_tables.sql puts them all back with one
-- paste. Once nobody has missed them for a month or two they can be dropped
-- for good, and that will be a separate file you are asked about.
--
-- Why archive first and not drop: these were made by repair files, and two of
-- them are backups of the palms log taken on 26 and 31 August. A backup is
-- worth keeping until somebody says it is not.
--
-- The archive schema is closed to the apps -- no login, no anon key, no
-- portal can read it. Only the SQL Editor can.
--
-- A table that any database function still names is NOT moved, because the
-- function would break, and the result says which function.
--
-- Safe to run twice: a table already in archive is left where it is.
--
-- A good result is thirteen rows, every one reading "archived", each with the
-- same row count the check showed. Any row reading "kept" names the function
-- that still uses it -- send me that row.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS archive;
REVOKE ALL ON SCHEMA archive FROM PUBLIC;
DO $rv$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA archive FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA archive FROM authenticated';
  END IF;
END $rv$;

DO $mv$
DECLARE
  t   TEXT;
  ref TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    '_mjm_adjrow_before', '_mjm_rename_log',
    'palms_log_backup_20260826', 'palms_log_backup_20260831',
    'tmp_c3_batch', 'tmp_c3_calc', 'tmp_c3_import', 'tmp_c3_issues',
    'tmp_c3_sales', 'tmp_c3_sheet', 'tmp_c3_write',
    'tmp_transfer_batch', 'tmp_transfer_import'
  ] LOOP
    CONTINUE WHEN to_regclass('public.' || t) IS NULL;
    CONTINUE WHEN to_regclass('archive.' || t) IS NOT NULL;
    SELECT string_agg(p.proname, ', ') INTO ref
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (position(('public.' || t) IN lower(p.prosrc)) > 0
         OR position((' ' || t || ' ') IN lower(p.prosrc)) > 0
         OR position((' ' || t || chr(10)) IN lower(p.prosrc)) > 0);
    CONTINUE WHEN ref IS NOT NULL;
    EXECUTE format('ALTER TABLE public.%I SET SCHEMA archive', t);
  END LOOP;
END $mv$;

SELECT l.t AS table_name,
       CASE
         WHEN to_regclass('archive.' || l.t) IS NOT NULL THEN 'archived'
         WHEN to_regclass('public.' || l.t) IS NOT NULL THEN 'kept -- still named by function: ' || COALESCE((
              SELECT string_agg(p.proname, ', ')
                FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public'
                 AND (position(('public.' || l.t) IN lower(p.prosrc)) > 0
                   OR position((' ' || l.t || ' ') IN lower(p.prosrc)) > 0
                   OR position((' ' || l.t || chr(10)) IN lower(p.prosrc)) > 0)), '?')
         ELSE 'not found -- already gone'
       END AS now,
       CASE WHEN to_regclass('archive.' || l.t) IS NOT NULL
            THEN (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM archive.%I', l.t), false, true, '')))[1]::text::BIGINT
            WHEN to_regclass('public.' || l.t) IS NOT NULL
            THEN (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', l.t), false, true, '')))[1]::text::BIGINT
       END AS row_count
  FROM unnest(ARRAY[
    '_mjm_adjrow_before', '_mjm_rename_log',
    'palms_log_backup_20260826', 'palms_log_backup_20260831',
    'tmp_c3_batch', 'tmp_c3_calc', 'tmp_c3_import', 'tmp_c3_issues',
    'tmp_c3_sales', 'tmp_c3_sheet', 'tmp_c3_write',
    'tmp_transfer_batch', 'tmp_transfer_import'
  ]) AS l(t)
 ORDER BY 1;
