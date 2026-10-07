-- =====================================================================
-- RUN_ME_drop_audit_task_fk.sql
-- Let every maintenance audit save — drop the foreign keys on
-- audit_maintenance_audits.
--
-- WHY: the auditor app showed "1 failed to sync — A linked record
-- (batch or task) is missing" (Postgres error 23503, foreign key
-- violation), and the record stayed stuck on the phone for ever.
--
-- An audit is task_id can NOT be a real foreign key. Audit tasks come
-- from two sources (see audit/audit_maintenance_script.js loadAll):
--   1. nops_maint_field_records — real table rows, real BIGSERIAL ids;
--   2. the office Maintenance schedule — rows INSIDE the JSONB blob of
--      nops_maint_records, whose ids are JS timestamps that exist in
--      no table at all.
-- A foreign key on task_id therefore rejects every audit of an
-- office-schedule task, which is exactly the stuck record. No repo
-- migration ever created such a constraint — it was added directly in
-- Supabase — so this file removes whatever foreign keys the table has.
-- The audit rows own nursery / plot / task_type / date columns are
-- the working link; nothing reads task_id through a join.
--
-- Safe to run twice: a second run finds no constraints and drops
-- nothing. After it runs, press OK on the phones sync dialog and the
-- stuck audit goes through.
-- =====================================================================

DO $$
DECLARE c RECORD;
BEGIN
  IF to_regclass('public.audit_maintenance_audits') IS NULL THEN
    RAISE NOTICE 'audit_maintenance_audits is not in this database - nothing to do';
    RETURN;
  END IF;
  FOR c IN
    SELECT conname
    FROM   pg_constraint
    WHERE  conrelid = 'public.audit_maintenance_audits'::regclass
    AND    contype  = 'f'
  LOOP
    EXECUTE 'ALTER TABLE public.audit_maintenance_audits DROP CONSTRAINT ' || quote_ident(c.conname);
    RAISE NOTICE 'dropped foreign key: %', c.conname;
  END LOOP;
END $$;

-- Good result: ONE row reading
--   audit_maintenance_audits foreign keys remaining: 0 - OK, press OK on the phone sync dialog
-- Anything other than 0 means a constraint survived - run the file again,
-- and if it still shows, send Claude the constraint name it prints.
SELECT 'audit_maintenance_audits foreign keys remaining: '
       || count(*)::text
       || CASE WHEN count(*) = 0
               THEN ' - OK, press OK on the phone sync dialog'
               ELSE ' - NOT OK: ' || string_agg(conname, ', ')
          END AS result
FROM pg_constraint
WHERE conrelid = to_regclass('public.audit_maintenance_audits')
AND   contype  = 'f';
