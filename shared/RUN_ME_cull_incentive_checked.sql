-- ============================================================================
-- RUN_ME_cull_incentive_checked.sql
--
-- The Culling Incentive has moved to Work Maintenance, Worker Activity, under
-- its own tab. There the office goes through the plots (the plot, the days it
-- took, the dates and who earns it) and presses Check. The Nursery Payroll
-- now pays ONLY the plots that were Checked there.
--
-- This file makes the one new table the Check is written to,
-- nops_cull_incentive_checks: ONE record per plot per month, carrying the
-- dates and days the plot read when it was agreed, and who agreed it and
-- when. It also makes sure the by-hand table from
-- RUN_ME_cull_incentive_overrides.sql is there, because Add and Remove moved
-- with the rest of it.
--
-- Nothing in PALMS, the ledger or the payroll is changed by running it.
--
-- Safe to run twice: everything is IF NOT EXISTS, and the policies are
-- dropped by name and made again.
--
-- WHAT A GOOD RESULT LOOKS LIKE -- five rows:
--   1  the Checked table ...................... present -- OK
--   2  one Check per plot per month ............ present -- OK
--   3  the by-hand table ...................... present -- OK
--   4  policies on the two tables ............. 4 or more -- OK
--   5  office logins that can check and add ... N of N -- OK
-- Row 5 is the proof. As every login holding Work Maintenance or the
-- Nursery Payroll it writes a Check and a by-hand record, deletes both and
-- rolls the lot back, so nothing is left behind. Anything short of N of N
-- names the login and the reason.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.nops_cull_incentive_checks (
  id               BIGSERIAL PRIMARY KEY,
  month            TEXT        NOT NULL,
  plot             TEXT        NOT NULL,
  section          TEXT,
  saringan_date    DATE,
  transplant_date  DATE,
  days             INTEGER,
  checked_at       TIMESTAMPTZ,
  checked_by       TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS nops_cull_inc_check_once
  ON public.nops_cull_incentive_checks (month, plot);

CREATE TABLE IF NOT EXISTS public.mjmnpayroll_cull_incentive_overrides (
  id               BIGSERIAL PRIMARY KEY,
  month            TEXT        NOT NULL,
  plot             TEXT        NOT NULL,
  action           TEXT        NOT NULL CHECK (action IN ('add', 'remove')),
  section          TEXT,
  saringan_date    DATE,
  transplant_date  DATE,
  remark           TEXT,
  created_by       TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS mjmnpayroll_cull_inc_once
  ON public.mjmnpayroll_cull_incentive_overrides (month, plot);

ALTER TABLE public.nops_cull_incentive_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mjmnpayroll_cull_incentive_overrides ENABLE ROW LEVEL SECURITY;

-- Staff only, the same gate every payroll and maintenance table carries.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = '_mjm_close_table') THEN
    PERFORM public._mjm_close_table('nops_cull_incentive_checks', 'maint');
    PERFORM public._mjm_close_table('mjmnpayroll_cull_incentive_overrides', 'npayroll');
  ELSE
    DROP POLICY IF EXISTS "Authenticated read maint"  ON public.nops_cull_incentive_checks;
    DROP POLICY IF EXISTS "Authenticated write maint" ON public.nops_cull_incentive_checks;
    CREATE POLICY "Authenticated read maint"  ON public.nops_cull_incentive_checks
      FOR SELECT TO authenticated USING (true);
    CREATE POLICY "Authenticated write maint" ON public.nops_cull_incentive_checks
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "Authenticated read npayroll"  ON public.mjmnpayroll_cull_incentive_overrides;
    DROP POLICY IF EXISTS "Authenticated write npayroll" ON public.mjmnpayroll_cull_incentive_overrides;
    CREATE POLICY "Authenticated read npayroll"  ON public.mjmnpayroll_cull_incentive_overrides
      FOR SELECT TO authenticated USING (true);
    CREATE POLICY "Authenticated write npayroll" ON public.mjmnpayroll_cull_incentive_overrides
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nops_cull_incentive_checks TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.nops_cull_incentive_checks_id_seq TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mjmnpayroll_cull_incentive_overrides TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.mjmnpayroll_cull_incentive_overrides_id_seq TO authenticated;

NOTIFY pgrst, 'reload schema';

-- The proof: as each office login, write a Check and a by-hand record, then
-- delete both.
SELECT set_config('mjm.cc_pass', '0', false),
       set_config('mjm.cc_total', '0', false),
       set_config('mjm.cc_bad', '', false);

DO $$
DECLARE
  p     record;
  good  boolean;
  why   text;
  who   text;
  n     bigint;
BEGIN
  FOR p IN SELECT id, email FROM public.shared_profiles
            WHERE COALESCE(user_type, 'system') <> 'customer'
              AND (COALESCE(permissions->'modules'->>'nursery_ops', 'none') <> 'none'
                OR COALESCE(permissions->'modules'->>'npayroll', 'none') <> 'none')
            ORDER BY email LOOP
    who  := COALESCE(NULLIF(p.email, ''), 'account ' || COALESCE(p.id::text, '?'));
    good := false;
    why  := '';
    BEGIN
      PERFORM set_config('request.jwt.claims',
                         json_build_object('sub', p.id, 'role', 'authenticated')::text, true);
      SET LOCAL ROLE authenticated;
      INSERT INTO public.nops_cull_incentive_checks (month, plot, days, checked_at, checked_by)
        VALUES ('PROBE', 'PROBE', 1, now(), 'probe');
      INSERT INTO public.mjmnpayroll_cull_incentive_overrides (month, plot, action, remark, created_by)
        VALUES ('PROBE', 'PROBE', 'add', 'probe row, rolled back', 'probe');
      DELETE FROM public.nops_cull_incentive_checks WHERE month = 'PROBE' AND plot = 'PROBE';
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n <> 1 THEN
        RAISE EXCEPTION 'mjm_probe_check_delete_saw_%', n;
      END IF;
      DELETE FROM public.mjmnpayroll_cull_incentive_overrides WHERE month = 'PROBE' AND plot = 'PROBE';
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n <> 1 THEN
        RAISE EXCEPTION 'mjm_probe_override_delete_saw_%', n;
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
    PERFORM set_config('mjm.cc_total', (current_setting('mjm.cc_total')::int + 1)::text, false);
    IF good THEN
      PERFORM set_config('mjm.cc_pass', (current_setting('mjm.cc_pass')::int + 1)::text, false);
    ELSIF length(COALESCE(current_setting('mjm.cc_bad', true), '')) < 400 THEN
      PERFORM set_config('mjm.cc_bad',
               COALESCE(current_setting('mjm.cc_bad', true), '')
               || CASE WHEN COALESCE(current_setting('mjm.cc_bad', true), '') = ''
                       THEN '' ELSE '; ' END
               || who || ' (' || COALESCE(NULLIF(why, ''), 'no reason given') || ')', false);
    END IF;
  END LOOP;
END $$;

SELECT 1 AS n, 'the Checked table' AS item,
       CASE WHEN to_regclass('public.nops_cull_incentive_checks') IS NOT NULL
            THEN 'present -- OK' ELSE 'MISSING -- NOT OK' END AS result
UNION ALL
SELECT 2, 'one Check per plot per month',
       CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
                          WHERE schemaname = 'public' AND indexname = 'nops_cull_inc_check_once')
            THEN 'present -- OK' ELSE 'MISSING -- NOT OK' END
UNION ALL
SELECT 3, 'the by-hand table',
       CASE WHEN to_regclass('public.mjmnpayroll_cull_incentive_overrides') IS NOT NULL
            THEN 'present -- OK' ELSE 'MISSING -- NOT OK' END
UNION ALL
SELECT 4, 'policies on the two tables',
       (SELECT count(*) FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename IN ('nops_cull_incentive_checks', 'mjmnpayroll_cull_incentive_overrides'))::text
       || CASE WHEN (SELECT count(*) FROM pg_policies
                      WHERE schemaname = 'public'
                        AND tablename IN ('nops_cull_incentive_checks',
                                          'mjmnpayroll_cull_incentive_overrides')) >= 4
               THEN ' -- OK' ELSE ' -- NOT OK' END
UNION ALL
SELECT 5, 'office logins that can check and add',
       current_setting('mjm.cc_pass') || ' of ' || current_setting('mjm.cc_total')
       || CASE WHEN current_setting('mjm.cc_pass') = current_setting('mjm.cc_total')
               THEN ' -- OK'
               ELSE ' -- NOT OK: ' || COALESCE(current_setting('mjm.cc_bad', true), '') END
ORDER BY n;
