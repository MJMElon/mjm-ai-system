-- ============================================================================
-- RUN_ME_seed_planting_workers.sql
--
-- Work Maintenance, Worker Activity, Pre Nursery, Seed Planting. Its rows
-- are read from the batch report (Seed Planting tab, by its date): ONE ROW
-- PER BATCH, with the batch total planted quantity. The office keys the
-- month workers by hand, and each worker keys how many THEY planted.
--
-- Four tables, all made here:
--   nops_seed_planting_batch_workers  the figures, one record per batch
--   nops_seed_planting_names          the worker names, one list per month
--   nops_seed_planting_batch_month    a batch moved to a later month by hand,
--                                     for seedlings sown too late for their
--                                     own month (277 on 28 Sep into October)
--   nops_seed_planting_workers        the first version, one record per tray
--                                     per day. No longer read. Kept, not
--                                     dropped, and row 6 counts what is in it.
--
-- Nothing in the ledger is changed, and nothing reaches the payroll claim.
--
-- Safe to run twice: everything is IF NOT EXISTS, and the policies are
-- dropped by name and made again.
--
-- WHAT A GOOD RESULT LOOKS LIKE -- six rows:
--   1  the per batch figures table ............ present -- OK
--   2  the month names table .................. present -- OK
--   3  the batch moved by hand table .......... present -- OK
--   4  policies on the three tables ........... 6 or more -- OK
--   5  office logins that can save ............ N of N -- OK
--   6  per tray figures from the first version  a number, read below
-- Row 5 is the proof. As every login holding Nursery Operation it writes,
-- changes and deletes a record in each of the three tables and rolls the
-- lot back, so nothing is left behind. Anything short of N of N names the
-- login and the reason. Row 6 is 0 unless somebody keyed figures in the
-- per tray version, and those are not shown on the new sheet.
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

CREATE TABLE IF NOT EXISTS public.nops_seed_planting_batch_workers (
  batch_name    TEXT        PRIMARY KEY,
  month         TEXT        NOT NULL,
  planted_date  DATE,
  qty_planted   NUMERIC,
  workers       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_by    TEXT,
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nops_seed_planting_batch_workers_month
  ON public.nops_seed_planting_batch_workers (month);

CREATE TABLE IF NOT EXISTS public.nops_seed_planting_names (
  month        TEXT        PRIMARY KEY,
  names        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  updated_by   TEXT,
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nops_seed_planting_batch_month (
  batch_name   TEXT        PRIMARY KEY,
  month        TEXT        NOT NULL,
  created_by   TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.nops_seed_planting_batch_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nops_seed_planting_names         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nops_seed_planting_batch_month   ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['nops_seed_planting_batch_workers',
                           'nops_seed_planting_names',
                           'nops_seed_planting_batch_month'] LOOP
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname = '_mjm_close_table') THEN
      PERFORM public._mjm_close_table(t, 'maint');
    ELSE
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Authenticated read maint', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Authenticated write maint', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
                     'Authenticated read maint', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
                     'Authenticated write maint', t);
    END IF;
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- The proof: as each office login, write each table twice and delete it.
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

      INSERT INTO public.nops_seed_planting_batch_workers (batch_name, month, planted_date, qty_planted, workers, updated_by)
        VALUES ('PROBE', 'PROBE', DATE '1900-01-01', 1, '{"probe": 1}'::jsonb, 'probe')
        ON CONFLICT (batch_name) DO UPDATE SET workers = EXCLUDED.workers, updated_at = now();
      INSERT INTO public.nops_seed_planting_batch_workers (batch_name, month, planted_date, qty_planted, workers, updated_by)
        VALUES ('PROBE', 'PROBE', DATE '1900-01-01', 1, '{"probe": 2}'::jsonb, 'probe')
        ON CONFLICT (batch_name) DO UPDATE SET workers = EXCLUDED.workers, updated_at = now();
      DELETE FROM public.nops_seed_planting_batch_workers WHERE batch_name = 'PROBE';
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n <> 1 THEN RAISE EXCEPTION 'mjm_probe_figures_delete_saw_%', n; END IF;

      INSERT INTO public.nops_seed_planting_names (month, names, updated_by)
        VALUES ('PROBE', '["probe"]'::jsonb, 'probe')
        ON CONFLICT (month) DO UPDATE SET names = EXCLUDED.names, updated_at = now();
      INSERT INTO public.nops_seed_planting_names (month, names, updated_by)
        VALUES ('PROBE', '["probe", "probe two"]'::jsonb, 'probe')
        ON CONFLICT (month) DO UPDATE SET names = EXCLUDED.names, updated_at = now();
      DELETE FROM public.nops_seed_planting_names WHERE month = 'PROBE';
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n <> 1 THEN RAISE EXCEPTION 'mjm_probe_names_delete_saw_%', n; END IF;

      INSERT INTO public.nops_seed_planting_batch_month (batch_name, month, created_by)
        VALUES ('PROBE', 'PROBE', 'probe')
        ON CONFLICT (batch_name) DO UPDATE SET month = EXCLUDED.month, created_at = now();
      INSERT INTO public.nops_seed_planting_batch_month (batch_name, month, created_by)
        VALUES ('PROBE', 'PROBE TWO', 'probe')
        ON CONFLICT (batch_name) DO UPDATE SET month = EXCLUDED.month, created_at = now();
      DELETE FROM public.nops_seed_planting_batch_month WHERE batch_name = 'PROBE';
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n <> 1 THEN RAISE EXCEPTION 'mjm_probe_moves_delete_saw_%', n; END IF;

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

SELECT 1 AS n, 'the per batch figures table' AS item,
       CASE WHEN to_regclass('public.nops_seed_planting_batch_workers') IS NOT NULL
            THEN 'present -- OK' ELSE 'MISSING -- NOT OK' END AS result
UNION ALL
SELECT 2, 'the month names table',
       CASE WHEN to_regclass('public.nops_seed_planting_names') IS NOT NULL
            THEN 'present -- OK' ELSE 'MISSING -- NOT OK' END
UNION ALL
SELECT 3, 'the batch moved by hand table',
       CASE WHEN to_regclass('public.nops_seed_planting_batch_month') IS NOT NULL
            THEN 'present -- OK' ELSE 'MISSING -- NOT OK' END
UNION ALL
SELECT 4, 'policies on the three tables',
       (SELECT count(*) FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename IN ('nops_seed_planting_batch_workers', 'nops_seed_planting_names',
                             'nops_seed_planting_batch_month'))::text
       || CASE WHEN (SELECT count(*) FROM pg_policies
                      WHERE schemaname = 'public'
                        AND tablename IN ('nops_seed_planting_batch_workers', 'nops_seed_planting_names',
                                          'nops_seed_planting_batch_month')) >= 6
               THEN ' -- OK' ELSE ' -- NOT OK' END
UNION ALL
SELECT 5, 'office logins that can save',
       current_setting('mjm.sp_pass') || ' of ' || current_setting('mjm.sp_total')
       || CASE WHEN current_setting('mjm.sp_pass') = current_setting('mjm.sp_total')
               THEN ' -- OK'
               ELSE ' -- NOT OK: ' || COALESCE(current_setting('mjm.sp_bad', true), '') END
UNION ALL
SELECT 6, 'per tray figures from the first version (not shown any more)',
       (SELECT count(*) FROM public.nops_seed_planting_workers
         WHERE workers <> '{}'::jsonb)::text
ORDER BY n;
