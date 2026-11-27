/* RUN_ME_mata_malam_report_in_office.sql

   The Mata Malam report moved off the phone into the office: Nursery
   Operation Management, Nursery Work and Schedule, Work Records, Monthly
   Night Watchman Record (nursery_ops/watchman_report.js).

   That page reads the check-ins as the signed in staff account. Until now
   only the mata_malam functions could read mata_malam_logs, so this adds
   ONE policy: a staff account may READ the check-ins. Nothing can write
   through it, and a guard on the phone is anon and still reaches nothing.
   It uses the same staff test as the settings row beside it.

   Safe to run twice. Nothing is deleted or changed.

   What a good result looks like, every line OK:
     1  staff test                     OK
     2  staff may read the check-ins   OK
     3  check-ins in the table         a number, the report counts them
*/

DO $do$
BEGIN
  IF to_regprocedure('public._mjm_ops_staff()') IS NULL THEN
    RAISE NOTICE 'no staff function here, skipping the read policy';
    RETURN;
  END IF;
  EXECUTE $p$DROP POLICY IF EXISTS "Staff read mata malam logs" ON public.mata_malam_logs$p$;
  EXECUTE $p$CREATE POLICY "Staff read mata malam logs" ON public.mata_malam_logs
             FOR SELECT TO authenticated USING ((SELECT public._mjm_ops_staff()))$p$;
END
$do$;

GRANT SELECT ON public.mata_malam_logs TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT 1 AS n, 'staff test' AS item,
       CASE WHEN to_regprocedure('public._mjm_ops_staff()') IS NOT NULL THEN 'OK' ELSE 'NOT OK -- missing' END AS result
UNION ALL
SELECT 2, 'staff may read the check-ins',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname = 'public' AND tablename = 'mata_malam_logs'
                            AND policyname = 'Staff read mata malam logs')
            THEN 'OK' ELSE 'NOT OK -- policy missing' END
UNION ALL
SELECT 3, 'check-ins in the table', (SELECT count(*)::text FROM public.mata_malam_logs);
