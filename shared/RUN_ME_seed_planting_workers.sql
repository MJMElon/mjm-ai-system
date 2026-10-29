-- ============================================================================
-- RUN_ME_seed_planting_workers.sql
--
-- Work Maintenance, Worker Activity now has a Pre Nursery part with one tab,
-- Seed Planting. Its rows are read from the batch report (Seed Planting tab,
-- by its date): one row per tray per day. Each Pre Nursery worker keys how
-- many THEY planted, and this is the table that keeps what they keyed.
--
-- ONE record per tray per day: the tray, the day, the month it is shown
-- under, the figure the batch report read when it was keyed, and the
-- figures per worker as a list of name and number.
--
-- Nothing in the ledger is changed, and nothing reaches the payroll claim.
--
-- Safe to run twice: everything is IF NOT EXISTS, and the policies are
-- dropped by name and made again.
--
-- WHAT A GOOD RESULT LOOKS LIKE -- four rows:
--   1  the Seed Planting table ................ present -- OK
--   2  one record per tray per day ............ present -- OK
--   3  policies on the table .................. 2 or more -- OK
--   4  office logins that can save ............ N of N -- OK
-- Row 4 is the proof. As every login holding Nursery Operation it writes a
-- record, changes it, deletes it and rolls the lot back, so nothing is left
-- behind. Anything short of N of N names the login and the reason.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.nops_seed_planting_workers (
  id           BIGSERIAL PRIMARY KEY,
  work_date    DATE        NOT NULL,
  tray         TEXT        NOT NULL,
  month        TEXT        NOT NULL,
  qty_planted  NUMERIC,
  workers      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_by   TEXT,
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS nops_seed_planting_once
  ON public.nops_seed_planting_workers (work_date, tray);

CREATE INDEX IF NOT EXISTS nops_seed_planting_month
  ON public.nops_seed_planting_workers (month);

ALTER TABLE public.nops_seed_planting_workers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = '_mjm_close_table') THEN
    PERFORM public._mjm_close_table('nops_seed_planting_workers', 'maint');
  ELSE
    DROP POLICY IF EXISTS "Authenticated read maint"  ON public.nops_seed_planting_workers;
    DROP POLICY IF EXISTS "Authenticated write maint" ON public.nops_seed_planting_workers;
    CREATE POLICY "Authenticated read maint"  ON public.nops_seed_planting_workers
      FOR SELECT TO authenticated USING (true);
    CREATE POLICY "Authenticated write maint" ON public.nops_seed_planting_workers
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nops_seed_planting_workers TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.nops_seed_planting_workers_id_seq TO authenticated;

NOTIFY pgrst, 'reload schema';

-- The proof: as each office login, save a record twice and delete it.
SELECT set_config('mjm.sp_pass', '0', false),
       set_config('mjm.sp_total', '0', false),
       set_config('mjm.sp_bad', '', false);

DO $$
DECLARE
  p     record;
  good  boolean;
  why   text;
  who   text;
  n     bigint;
BEGIN
  FOR p IN SELECT id, email FROM public.shared_profiles
            WHERE COALESCE(permissions->'modules'->>'nursery_ops', 'none') <> 'none'
            ORDER BY email LOOP
    who  := COALESCE(NULLIF(p.email, ''), 'account ' || COALESCE(p.id::text, '?'));
    good := false;
    why  := '';
    BEGIN
      PERFORM set_config('request.jwt.claims',
                         json_build_object('sub', p.id, 'role', 'authenticated')::text, true);
      SET LOCAL ROLE authenticated;
      INSERT INTO public.nops_seed_planting_workers (work_date, tray, month, qty_planted, workers, updated_by)
        VALUES (DATE '1900-01-01', 'PROBE', 'PROBE', 1, '{"probe": 1}'::jsonb, 'probe')
        ON CONFLICT (work_date, tray)
        DO UPDATE SET workers = EXCLUDED.workers, updated_at = now();
      INSERT INTO public.nops_seed_planting_workers (work_date, tray, month, qty_planted, workers, updated_by)
        VALUES (DATE '1900-01-01', 'PROBE', 'PROBE', 1, '{"probe": 2}'::jsonb, 'probe')
        ON CONFLICT (work_date, tray)
        DO UPDATE SET workers = EXCLUDED.workers, updated_at = now();
      DELETE FROM public.nops_seed_planting_workers
        WHERE work_date = DATE '1900-01-01' AND tray = 'PROBE';
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n <> 1 THEN
        RAISE EXCEPTION 'mjm_probe_delete_saw_%', n;
      END IF;
      RAISE EXCEPTION 'mjm_probe_rollback';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM = 'mjm_probe_rollback' THEN
        good := true;
      ELSE
        why := SQLSTATE || ' ' || left(SQLERRM, 70);
      END IF;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
    PERFORM set_config('mjm.sp_total', (current_setting('mjm.sp_total')::int + 1)::text, false);
    IF good THEN
      PERFORM set_config('mjm.sp_pass', (current_setting('mjm.sp_pass')::int + 1)::text, false);
    ELSIF length(COALESCE(current_setting('mjm.sp_bad', true), '')) < 400 THEN
      PERFORM set_config('mjm.sp_bad',
               COALESCE(current_setting('mjm.sp_bad', true), '')
               || CASE WHEN COALESCE(current_setting('mjm.sp_bad', true), '') = ''
                       THEN '' ELSE '; ' END
               || who || ' (' || COALESCE(NULLIF(why, ''), 'no reason given') || ')', false);
    END IF;
  END LOOP;
END $$;

SELECT 1 AS n, 'the Seed Planting table' AS item,
       CASE WHEN to_regclass('public.nops_seed_planting_workers') IS NOT NULL
            THEN 'present -- OK' ELSE 'MISSING -- NOT OK' END AS result
UNION ALL
SELECT 2, 'one record per tray per day',
       CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
                          WHERE schemaname = 'public' AND indexname = 'nops_seed_planting_once')
            THEN 'present -- OK' ELSE 'MISSING -- NOT OK' END
UNION ALL
SELECT 3, 'policies on the table',
       (SELECT count(*) FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'nops_seed_planting_workers')::text
       || CASE WHEN (SELECT count(*) FROM pg_policies
                      WHERE schemaname = 'public'
                        AND tablename = 'nops_seed_planting_workers') >= 2
               THEN ' -- OK' ELSE ' -- NOT OK' END
UNION ALL
SELECT 4, 'office logins that can save',
       current_setting('mjm.sp_pass') || ' of ' || current_setting('mjm.sp_total')
       || CASE WHEN current_setting('mjm.sp_pass') = current_setting('mjm.sp_total')
               THEN ' -- OK'
               ELSE ' -- NOT OK: ' || COALESCE(current_setting('mjm.sp_bad', true), '') END
ORDER BY n;
