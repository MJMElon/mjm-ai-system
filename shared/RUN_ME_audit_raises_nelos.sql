-- RUN_ME_audit_raises_nelos.sql
--
-- When a maintenance audit is marked Unsatisfactory, the database opens a
-- Nelos case for the Field Conductor of that nursery. The case carries the plot,
-- the nursery, the job, the workers named on the work record and the
-- remark from the auditor. The case number is written back onto the audit row as
-- nelos_case_id, so the Work Records page can show it under Nelos Case.
--
-- It runs on the database, not in a page, so every app and every version
-- that saves an audit raises the case the same way. Safe to run twice.
--
-- Field Conductor per nursery (from the Culling Monitoring rule):
--   BNN   Lalu Aenal mashuri
--   UNN1  Akbar
--   UNN2  Azhar
--
-- Only audits saved from now on raise a case. Older Unsatisfactory audits
-- keep no case until someone raises one by hand.

ALTER TABLE public.audit_maintenance_audits
  ADD COLUMN IF NOT EXISTS nelos_case_id BIGINT;

CREATE OR REPLACE FUNCTION public.audit_raise_nelos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_case     BIGINT;
  v_fc_id    UUID;
  v_fc_name  TEXT;
  v_nursery  TEXT;
  v_workers  TEXT;
  v_title    TEXT;
  v_body     TEXT;
BEGIN
  IF NEW.result IS DISTINCT FROM 'Unsatisfactory' THEN
    RETURN NEW;
  END IF;
  IF NEW.nelos_case_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF to_regclass('public.nelos_cases') IS NULL THEN
    RETURN NEW;
  END IF;

  v_nursery := upper(replace(coalesce(NEW.nursery, ''), ' ', ''));

  IF v_nursery = 'BNN' THEN
    v_fc_id   := 'ab526a67-20df-49aa-9512-9fb8adc11e03'::uuid;
    v_fc_name := 'Lalu Aenal mashuri';
  ELSIF v_nursery = 'UNN1' THEN
    v_fc_id   := '4571aec4-d252-4c4a-bf53-1b2b2178d4fb'::uuid;
    v_fc_name := 'Akbar';
  ELSIF v_nursery = 'UNN2' THEN
    v_fc_id   := 'b0cfd3ee-2f6f-4698-a43a-4f31c3c57660'::uuid;
    v_fc_name := 'Azhar';
  ELSE
    v_fc_id   := NULL;
    v_fc_name := NULL;
  END IF;

  -- The workers on the work record the audit is about. The task id is the
  -- record id. An office schedule row has no field record, so no names.
  v_workers := NULL;
  IF to_regclass('public.nops_maint_field_records') IS NOT NULL AND NEW.task_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(f.worked_by, ''), f.reported_by)
      INTO v_workers
      FROM public.nops_maint_field_records f
     WHERE f.id = NEW.task_id;
  END IF;

  v_title := 'Maintenance ' || COALESCE(NEW.task_type, 'job') || ' unsatisfied: '
             || COALESCE(NEW.plot, '?') || ' (' || COALESCE(NEW.nursery, '?') || ')';

  v_body := 'Audit ' || COALESCE(NEW.audit_id, '') || ' on '
            || COALESCE(to_char(NEW.date, 'DD Mon YYYY'), '?')
            || ' by ' || COALESCE(NULLIF(NEW.auditor_name, ''), 'auditor') || '.'
            || chr(10) || 'Workers on the work record: ' || COALESCE(v_workers, 'not recorded') || '.'
            || chr(10) || 'Auditor remark: ' || COALESCE(NULLIF(NEW.remarks, ''), '(none)');

  INSERT INTO public.nelos_cases
    (title, description, category, priority, status,
     source_module, assigned_module, nursery_name, plot_name,
     assignee_id, assignee_name, raised_by)
  VALUES
    (v_title, v_body, NULL, 'normal', 'open',
     'audit', 'nursery_ops', NEW.nursery, NEW.plot,
     v_fc_id, v_fc_name, 'Maintenance audit (system)')
  RETURNING id INTO v_case;

  UPDATE public.audit_maintenance_audits
     SET nelos_case_id = v_case
   WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_raise_nelos_trg ON public.audit_maintenance_audits;
CREATE TRIGGER audit_raise_nelos_trg
  AFTER INSERT OR UPDATE OF result ON public.audit_maintenance_audits
  FOR EACH ROW EXECUTE FUNCTION public.audit_raise_nelos();

REVOKE ALL ON FUNCTION public.audit_raise_nelos() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- WHAT A GOOD RESULT LOOKS LIKE: one line per check, read together.
--   column      present        the nelos_case_id column is on the audit table
--   trigger     present        the trigger is installed
--   unsat       N with case    Unsatisfactory audits that now carry a case
--   unsat       0 without      any Unsatisfactory audit still without a case
--                              (older audits before this file are expected here)
--   case        open or solved the cases raised by the system and their status
SELECT 'column' AS check_name,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema = 'public'
                            AND table_name = 'audit_maintenance_audits'
                            AND column_name = 'nelos_case_id')
            THEN 'present' ELSE 'MISSING' END AS result
UNION ALL
SELECT 'trigger',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                          WHERE tgname = 'audit_raise_nelos_trg'
                            AND NOT tgisinternal)
            THEN 'present' ELSE 'MISSING' END
UNION ALL
SELECT 'unsat with case',
       count(*)::text
  FROM public.audit_maintenance_audits
 WHERE result = 'Unsatisfactory' AND nelos_case_id IS NOT NULL
UNION ALL
SELECT 'unsat without case',
       count(*)::text
  FROM public.audit_maintenance_audits
 WHERE result = 'Unsatisfactory' AND nelos_case_id IS NULL
UNION ALL
SELECT 'case ' || c.case_no || ' ' || c.plot_name || ' ' || COALESCE(c.assignee_name, 'nobody'),
       c.status
  FROM public.nelos_cases c
 WHERE c.source_module = 'audit'
   AND c.raised_by = 'Maintenance audit (system)'
 ORDER BY 1;
