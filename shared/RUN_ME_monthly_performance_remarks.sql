-- ============================================================================
-- RUN_ME_monthly_performance_remarks.sql
--
-- The Monthly Performance table (Nursery Maintenance, Work Records, Monthly
-- Performance) carries a Remarks box on every plot row for the office to
-- write in. This file makes the one table those remarks are saved to,
-- nops_maint_perf_remarks: ONE remark per plot per month per nursery,
-- with who wrote it last and when.
--
-- Nothing else is changed by running it. Until it is run the page shows the
-- boxes read-only with a hint naming this file.
--
-- Safe to run twice: everything is IF NOT EXISTS and the policies are
-- dropped by name and made again.
--
-- WHAT A GOOD RESULT LOOKS LIKE -- four rows, each ending OK:
--   1  the remarks table ............... present -- OK
--   2  one remark per plot per month ... present -- OK
--   3  policies on the table ........... 2 or more -- OK
--   4  a remark saves and updates ...... write, overwrite and clean up -- OK
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.nops_maint_perf_remarks (
  id          BIGSERIAL PRIMARY KEY,
  nursery     TEXT        NOT NULL,
  month       TEXT        NOT NULL,
  plot        TEXT        NOT NULL,
  remark      TEXT        NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS nops_maint_perf_remarks_once
  ON public.nops_maint_perf_remarks (nursery, month, plot);

ALTER TABLE public.nops_maint_perf_remarks ENABLE ROW LEVEL SECURITY;

-- Staff only, the same gate every maintenance table carries.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = '_mjm_close_table') THEN
    PERFORM public._mjm_close_table('nops_maint_perf_remarks', 'maint');
  ELSE
    DROP POLICY IF EXISTS "Authenticated read maint"  ON public.nops_maint_perf_remarks;
    DROP POLICY IF EXISTS "Authenticated write maint" ON public.nops_maint_perf_remarks;
    CREATE POLICY "Authenticated read maint"  ON public.nops_maint_perf_remarks
      FOR SELECT TO authenticated USING (true);
    CREATE POLICY "Authenticated write maint" ON public.nops_maint_perf_remarks
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nops_maint_perf_remarks TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.nops_maint_perf_remarks_id_seq TO authenticated;

NOTIFY pgrst, 'reload schema';

-- The proof: write a remark the way the page writes one, overwrite it the
-- way the second keystroke does, and take the probe row out again.
DO $$
DECLARE
  n1 integer; n2 integer; r2 text;
BEGIN
  INSERT INTO public.nops_maint_perf_remarks (nursery, month, plot, remark, updated_by)
  VALUES ('ZZPROBE', 'Jan 2000', 'Z1', 'first', 'probe')
  ON CONFLICT (nursery, month, plot)
  DO UPDATE SET remark = EXCLUDED.remark, updated_at = now(), updated_by = EXCLUDED.updated_by;
  SELECT count(*) INTO n1 FROM public.nops_maint_perf_remarks
   WHERE nursery = 'ZZPROBE' AND month = 'Jan 2000' AND plot = 'Z1';

  INSERT INTO public.nops_maint_perf_remarks (nursery, month, plot, remark, updated_by)
  VALUES ('ZZPROBE', 'Jan 2000', 'Z1', 'second', 'probe')
  ON CONFLICT (nursery, month, plot)
  DO UPDATE SET remark = EXCLUDED.remark, updated_at = now(), updated_by = EXCLUDED.updated_by;
  SELECT count(*), max(remark) INTO n2, r2 FROM public.nops_maint_perf_remarks
   WHERE nursery = 'ZZPROBE' AND month = 'Jan 2000' AND plot = 'Z1';

  DELETE FROM public.nops_maint_perf_remarks
   WHERE nursery = 'ZZPROBE' AND month = 'Jan 2000' AND plot = 'Z1';

  PERFORM set_config('mjm.perf_probe',
    CASE WHEN n1 = 1 AND n2 = 1 AND r2 = 'second'
         THEN 'write, overwrite and clean up -- OK'
         ELSE 'NOT OK -- wrote ' || n1::text || ' then held ' || n2::text
              || ' rows reading ' || COALESCE(r2, 'nothing') END, false);
END $$;

-- The check above the query, as the editor needs: four rows, each OK.
SELECT * FROM (
  SELECT 1 AS ord, 'the remarks table' AS what,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
                       WHERE table_schema = 'public' AND table_name = 'nops_maint_perf_remarks')
         THEN 'present -- OK' ELSE 'MISSING -- NOT OK' END AS result
  UNION ALL
  SELECT 2, 'one remark per plot per month',
    CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
                       WHERE schemaname = 'public' AND indexname = 'nops_maint_perf_remarks_once')
         THEN 'present -- OK' ELSE 'MISSING -- NOT OK' END
  UNION ALL
  SELECT 3, 'policies on the table',
    (SELECT count(*)::text FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'nops_maint_perf_remarks')
    || CASE WHEN (SELECT count(*) FROM pg_policies
                   WHERE schemaname = 'public' AND tablename = 'nops_maint_perf_remarks') >= 2
            THEN ' -- OK' ELSE ' -- NOT OK, fewer than 2' END
  UNION ALL
  SELECT 4, 'a remark saves and updates',
    COALESCE(current_setting('mjm.perf_probe', true), 'NOT OK -- the probe never ran')
) t ORDER BY ord;
