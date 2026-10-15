-- ============================================================================
-- RUN_ME_undo_archive_leftover_tables.sql
--
-- Puts back every table RUN_ME_archive_leftover_tables.sql moved, exactly as
-- it was. Only needed if something turns out to have used one of them.
--
-- Safe to run twice. A good result is the same thirteen names, each reading
-- "back in public".
-- ============================================================================

DO $back$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    '_mjm_adjrow_before', '_mjm_rename_log',
    'palms_log_backup_20260826', 'palms_log_backup_20260831',
    'tmp_c3_batch', 'tmp_c3_calc', 'tmp_c3_import', 'tmp_c3_issues',
    'tmp_c3_sales', 'tmp_c3_sheet', 'tmp_c3_write',
    'tmp_transfer_batch', 'tmp_transfer_import'
  ] LOOP
    CONTINUE WHEN to_regclass('archive.' || t) IS NULL;
    CONTINUE WHEN to_regclass('public.' || t) IS NOT NULL;
    EXECUTE format('ALTER TABLE archive.%I SET SCHEMA public', t);
  END LOOP;
END $back$;

SELECT l.t AS table_name,
       CASE WHEN to_regclass('public.' || l.t) IS NOT NULL THEN 'back in public'
            WHEN to_regclass('archive.' || l.t) IS NOT NULL THEN 'still in archive'
            ELSE 'not found' END AS now
  FROM unnest(ARRAY[
    '_mjm_adjrow_before', '_mjm_rename_log',
    'palms_log_backup_20260826', 'palms_log_backup_20260831',
    'tmp_c3_batch', 'tmp_c3_calc', 'tmp_c3_import', 'tmp_c3_issues',
    'tmp_c3_sales', 'tmp_c3_sheet', 'tmp_c3_write',
    'tmp_transfer_batch', 'tmp_transfer_import'
  ]) AS l(t)
 ORDER BY 1;
