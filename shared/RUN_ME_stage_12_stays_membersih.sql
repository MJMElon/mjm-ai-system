-- ============================================================================
-- RUN_ME_stage_12_stays_membersih.sql
--
-- RUN_ME_stage_12_is_membersih.sql moved the 11 entries left on stage 12
-- (Up-keep) to Membersih. This stops a 12 coming back.
--
-- A phone still holding the old stage list can go on offering Up-keep, and a
-- phone with no signal can be holding a day it keyed on it in its outbox and
-- send it days later. So the database does it, on the way in, whatever app or
-- version the row comes from:
--   - a plot log entry written on stage 12 is filed as Membersih
--   - a day of history naming 12 names Membersih instead
--
-- It acts ONLY while no stage on the list has the number 12, so the day the
-- office adds a real twelfth stage this steps aside by itself.
-- Nothing is deleted. Safe to run twice.
--
-- WHAT A GOOD RESULT LOOKS LIKE, four rows:
--   1  guard on the plot log ............... present -- OK
--   2  guard on the history ................ present -- OK
--   3  a stage 12 entry written just now ... filed as stage 4 -- OK
--   4  entries on a number with no stage ... 0 -- OK
-- Row 3 is the proof. It writes a stage 12 entry, reads back what was filed
-- and rolls it back, so nothing is left behind.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.palms_stage_12_is_membersih()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_mb SMALLINT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.nops_plot_status_stages WHERE sort_order = 12) THEN
    RETURN NEW;
  END IF;
  SELECT sort_order INTO v_mb
    FROM public.nops_plot_status_stages
   WHERE lower(btrim(name)) = 'membersih'
   ORDER BY sort_order LIMIT 1;
  IF v_mb IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'fcportal_palms_plot_logs' THEN
    IF NEW.act_n = 12 THEN
      NEW.act_n := v_mb;
    END IF;
  ELSIF NEW.acts IS NOT NULL AND 12 = ANY (NEW.acts) THEN
    NEW.acts := (SELECT array_agg(DISTINCT x ORDER BY x)
                   FROM unnest(array_replace(NEW.acts, 12::smallint, v_mb)) AS x);
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS palms_stage_12_is_membersih ON public.fcportal_palms_plot_logs;
CREATE TRIGGER palms_stage_12_is_membersih
  BEFORE INSERT OR UPDATE OF act_n ON public.fcportal_palms_plot_logs
  FOR EACH ROW EXECUTE FUNCTION public.palms_stage_12_is_membersih();

DO $do$
BEGIN
  IF to_regclass('public.fcportal_palms_history') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS palms_stage_12_is_membersih ON public.fcportal_palms_history';
    EXECUTE 'CREATE TRIGGER palms_stage_12_is_membersih
               BEFORE INSERT OR UPDATE OF acts ON public.fcportal_palms_history
               FOR EACH ROW EXECUTE FUNCTION public.palms_stage_12_is_membersih()';
  END IF;
END
$do$;

-- The proof: write a stage 12 entry, read back what was filed, roll it back.
SELECT set_config('palms12g.filed', '', false);

-- The answer is carried OUT of the rolled-back block in a variable and only
-- then written down: a setting made inside the block is rolled back with it.
DO $do$
DECLARE
  v_n   SMALLINT;
  v_out TEXT := '';
BEGIN
  BEGIN
    INSERT INTO public.fcportal_palms_plot_logs (client_uid, plot_name, act_n, start_date, recorded_by)
      VALUES ('PROBE-stage-12', 'PROBE', 12, current_date, 'probe')
      RETURNING act_n INTO v_n;
    v_out := COALESCE(v_n::text, '?');
    RAISE EXCEPTION 'palms12g_rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'palms12g_rollback' THEN
      v_out := 'could not write: ' || left(SQLERRM, 80);
    END IF;
  END;
  PERFORM set_config('palms12g.filed', COALESCE(v_out, ''), false);
END
$do$;

SELECT 1 AS n, 'guard on the plot log' AS item,
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
                          WHERE c.relname = 'fcportal_palms_plot_logs'
                            AND t.tgname = 'palms_stage_12_is_membersih')
            THEN 'present -- OK' ELSE 'MISSING -- NOT OK' END AS result
UNION ALL
SELECT 2, 'guard on the history',
       CASE WHEN to_regclass('public.fcportal_palms_history') IS NULL THEN 'no history table -- nothing to guard'
            WHEN EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
                          WHERE c.relname = 'fcportal_palms_history'
                            AND t.tgname = 'palms_stage_12_is_membersih')
            THEN 'present -- OK' ELSE 'MISSING -- NOT OK' END
UNION ALL
SELECT 3, 'a stage 12 entry written just now',
       CASE WHEN current_setting('palms12g.filed', true) =
                 (SELECT sort_order::text FROM public.nops_plot_status_stages
                   WHERE lower(btrim(name)) = 'membersih' ORDER BY sort_order LIMIT 1)
            THEN 'filed as stage ' || current_setting('palms12g.filed', true) || ' -- OK'
            ELSE 'filed as ' || COALESCE(NULLIF(current_setting('palms12g.filed', true), ''), 'nothing')
                 || ' -- NOT OK' END
UNION ALL
SELECT 4, 'entries on a number with no stage',
       (SELECT count(*)::text || CASE WHEN count(*) = 0 THEN ' -- OK' ELSE ' -- NOT OK' END
          FROM public.fcportal_palms_plot_logs l
         WHERE NOT EXISTS (SELECT 1 FROM public.nops_plot_status_stages s WHERE s.sort_order = l.act_n))
ORDER BY n;
