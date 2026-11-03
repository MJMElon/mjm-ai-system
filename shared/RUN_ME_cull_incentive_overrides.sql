-- ============================================================================
-- RUN_ME_cull_incentive_overrides.sql
--
-- The Culling Incentive on the Transplanting sheet of the Nursery Payroll
-- can now be changed by hand, plot by plot:
--   + Add plot / Count it  counts a plot whatever PALMS says
--   Remove                 takes a plot out of that month
--   Delete / Put back      deletes the by-hand record, so the plot goes
--                          back to what PALMS says
--
-- One record per plot per month. Nothing in PALMS or the ledger is changed.
-- The buttons show to anybody with Adjust Pay on Transplanting.
--
-- Safe to run twice: everything is IF NOT EXISTS, and the policies are
-- dropped by name and made again.
--
-- WHAT A GOOD RESULT LOOKS LIKE -- four rows:
--   1  table .................................. present -- OK
--   2  one record per plot per month ......... present -- OK
--   3  policies on the table .................. 2 or more -- OK
--   4  payroll logins that can add and delete  N of N -- OK
-- Row 4 is the proof. It writes a record AS each payroll login, deletes
-- it again, and rolls the lot back, so nothing is left behind. Anything
-- short of N of N names the login and the reason.
-- ============================================================================

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

ALTER TABLE public.mjmnpayroll_cull_incentive_overrides ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = '_mjm_close_table') THEN
    PERFORM public._mjm_close_table('mjmnpayroll_cull_incentive_overrides', 'npayroll');
  ELSE
    DROP POLICY IF EXISTS "Authenticated read npayroll"  ON public.mjmnpayroll_cull_incentive_overrides;
    DROP POLICY IF EXISTS "Authenticated write npayroll" ON public.mjmnpayroll_cull_incentive_overrides;
    CREATE POLICY "Authenticated read npayroll"  ON public.mjmnpayroll_cull_incentive_overrides
      FOR SELECT TO authenticated USING (true);
    CREATE POLICY "Authenticated write npayroll" ON public.mjmnpayroll_cull_incentive_overrides
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mjmnpayroll_cull_incentive_overrides TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.mjmnpayroll_cull_incentive_overrides_id_seq TO authenticated;

NOTIFY pgrst, 'reload schema';

-- The proof: as each payroll login, add a record and delete it.
SELECT set_config('mjm.ci_pass', '0', false),
       set_config('mjm.ci_total', '0', false),
       set_config('mjm.ci_bad', '', false);

DO $$
DECLARE
  p     record;
  good  boolean;
  why   text;
  who   text;
  n     bigint;
BEGIN
  FOR p IN SELECT id, email FROM public.shared_profiles
            WHERE COALESCE(permissions->'modules'->>'npayroll', 'none') <> 'none'
            ORDER BY email LOOP
    who  := COALESCE(NULLIF(p.email, ''), 'account ' || COALESCE(p.id::text, '?'));
    good := false;
    why  := '';
    BEGIN
      PERFORM set_config('request.jwt.claims',
                         json_build_object('sub', p.id, 'role', 'authenticated')::text, true);
      SET LOCAL ROLE authenticated;
      INSERT INTO public.mjmnpayroll_cull_incentive_overrides (month, plot, action, remark, created_by)
        VALUES ('PROBE', 'PROBE', 'add', 'probe row, rolled back', 'probe');
      DELETE FROM public.mjmnpayroll_cull_incentive_overrides
        WHERE month = 'PROBE' AND plot = 'PROBE';
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
    PERFORM set_config('mjm.ci_total', (current_setting('mjm.ci_total')::int + 1)::text, false);
    IF good THEN
      PERFORM set_config('mjm.ci_pass', (current_setting('mjm.ci_pass')::int + 1)::text, false);
    ELSIF length(COALESCE(current_setting('mjm.ci_bad', true), '')) < 400 THEN
      PERFORM set_config('mjm.ci_bad',
               COALESCE(current_setting('mjm.ci_bad', true), '')
               || CASE WHEN COALESCE(current_setting('mjm.ci_bad', true), '') = ''
                       THEN '' ELSE '; ' END
               || who || ' (' || COALESCE(NULLIF(why, ''), 'no reason given') || ')', false);
    END IF;
  END LOOP;
END $$;

SELECT 1 AS n, 'table' AS item,
       CASE WHEN to_regclass('public.mjmnpayroll_cull_incentive_overrides') IS NOT NULL
            THEN 'present -- OK' ELSE 'MISSING -- NOT OK' END AS result
UNION ALL
SELECT 2, 'one record per plot per month',
       CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
                          WHERE schemaname = 'public' AND indexname = 'mjmnpayroll_cull_inc_once')
            THEN 'present -- OK' ELSE 'MISSING -- NOT OK' END
UNION ALL
SELECT 3, 'policies on the table',
       (SELECT count(*) FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'mjmnpayroll_cull_incentive_overrides')::text
       || CASE WHEN (SELECT count(*) FROM pg_policies
                      WHERE schemaname = 'public'
                        AND tablename = 'mjmnpayroll_cull_incentive_overrides') >= 2
               THEN ' -- OK' ELSE ' -- NOT OK' END
UNION ALL
SELECT 4, 'payroll logins that can add and delete',
       current_setting('mjm.ci_pass') || ' of ' || current_setting('mjm.ci_total')
       || CASE WHEN current_setting('mjm.ci_pass') = current_setting('mjm.ci_total')
               THEN ' -- OK'
               ELSE ' -- NOT OK: ' || COALESCE(current_setting('mjm.ci_bad', true), '') END
ORDER BY n;
