-- ============================================================================
-- RUN_ME_payroll_reads_palms.sql
--
-- The Transplanting sheet of the Nursery Payroll now pays a CULLING
-- INCENTIVE: a plot that went from Saringan Anak Bibit to the end of
-- Transplanting inside 15 days. How long a plot took is read from PALMS,
-- the table fcportal_palms_plot_logs.
--
-- That table is only readable by accounts holding the FC Portal (scan) or
-- Nursery Operation module, or who manage users. A payroll clerk with only
-- the Nursery Payroll module gets NO ROWS back -- not an error, just
-- nothing -- and the sheet would read every plot as having no Saringan.
--
-- This adds ONE extra policy: anybody holding the Nursery Payroll module
-- may READ the plot log. Read only. Writing and deleting are untouched and
-- stay with the FC Portal, and palms_has_access is not widened, because
-- that one also grants writing.
--
-- Safe to run twice: the function is CREATE OR REPLACE and the policy is
-- dropped by name and made again.
--
-- WHAT A GOOD RESULT LOOKS LIKE -- four rows:
--   1  the read policy for payroll ........ present -- OK
--   2  plot log rows in PALMS ............. a number above nought
--   3  payroll logins tried ............... how many hold the module
--   4  payroll logins that read all of it . N of N -- OK
-- Row 4 is the proof. It reads the plot log AS each payroll login in turn
-- and compares what they see with what is there. Anything short of N of N
-- names the login that still sees less.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.palms_payroll_may_read()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT COALESCE(p.permissions->'modules'->>'npayroll', 'none') <> 'none'
       FROM public.shared_profiles p WHERE p.id = auth.uid()),
    false)
$$;

GRANT EXECUTE ON FUNCTION public.palms_payroll_may_read() TO authenticated;

DROP POLICY IF EXISTS "palms read for payroll" ON public.fcportal_palms_plot_logs;
CREATE POLICY "palms read for payroll" ON public.fcportal_palms_plot_logs
  FOR SELECT TO authenticated
  USING (public.palms_payroll_may_read());

NOTIFY pgrst, 'reload schema';

-- The proof: read the plot log as every payroll login.
SELECT set_config('mjm.cull_pass', '0', false),
       set_config('mjm.cull_total', '0', false),
       set_config('mjm.cull_bad', '', false);

DO $$
DECLARE
  p     record;
  seen  bigint;
  there bigint;
  who   text;
BEGIN
  SELECT count(*) INTO there FROM public.fcportal_palms_plot_logs;
  FOR p IN SELECT id, email FROM public.shared_profiles
            WHERE COALESCE(permissions->'modules'->>'npayroll', 'none') <> 'none'
            ORDER BY email LOOP
    who  := COALESCE(NULLIF(p.email, ''), 'account ' || COALESCE(p.id::text, '?'));
    seen := -1;
    BEGIN
      PERFORM set_config('request.jwt.claims',
                         json_build_object('sub', p.id, 'role', 'authenticated')::text, true);
      SET LOCAL ROLE authenticated;
      SELECT count(*) INTO seen FROM public.fcportal_palms_plot_logs;
      RESET ROLE;
    EXCEPTION WHEN OTHERS THEN
      seen := -1;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
    PERFORM set_config('mjm.cull_total', (current_setting('mjm.cull_total')::int + 1)::text, false);
    IF seen = there THEN
      PERFORM set_config('mjm.cull_pass', (current_setting('mjm.cull_pass')::int + 1)::text, false);
    ELSIF length(COALESCE(current_setting('mjm.cull_bad', true), '')) < 400 THEN
      PERFORM set_config('mjm.cull_bad',
               COALESCE(current_setting('mjm.cull_bad', true), '')
               || CASE WHEN COALESCE(current_setting('mjm.cull_bad', true), '') = ''
                       THEN '' ELSE ', ' END
               || who || ' sees ' || COALESCE(seen::text, '?'), false);
    END IF;
  END LOOP;
END $$;

SELECT 1 AS n, 'read policy for payroll on the PALMS plot log' AS item,
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname = 'public'
                            AND tablename = 'fcportal_palms_plot_logs'
                            AND policyname = 'palms read for payroll')
            THEN 'present -- OK' ELSE 'MISSING -- NOT OK' END AS result
UNION ALL
SELECT 2, 'plot log rows in PALMS',
       (SELECT count(*) FROM public.fcportal_palms_plot_logs)::text
UNION ALL
SELECT 3, 'payroll logins tried', current_setting('mjm.cull_total')
UNION ALL
SELECT 4, 'payroll logins that read all of it',
       current_setting('mjm.cull_pass') || ' of ' || current_setting('mjm.cull_total')
       || CASE WHEN current_setting('mjm.cull_pass') = current_setting('mjm.cull_total')
               THEN ' -- OK'
               ELSE ' -- NOT OK: ' || COALESCE(current_setting('mjm.cull_bad', true), '') END
ORDER BY n;
