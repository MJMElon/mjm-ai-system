-- =====================================================================
-- RUN_ME_custom_jobs.sql
--
-- Jobs the office adds on Work Maintenance, Settings, Where Each Job Is
-- Done, Add job. The job itself is a row of nops_maint_config (custom_jobs)
-- and needs nothing here. What needs a table is its WORK on Worker
-- Activity: the workers ticked on a row, the figures keyed, and Checked.
--
-- One row per job, month, nursery and row key. A row key is a plot, the
-- word nursery, or a hand-added row id. qty holds a hand-keyed figure, and
-- for a linked row the figure read when it was Checked.
--
-- Safe to run twice. Creates one table and nothing else, deletes nothing.
--
-- A good result is ONE line:  custom job rows table | ready | ...
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.nops_custom_job_rows (
  id           BIGSERIAL   PRIMARY KEY,
  job_key      TEXT        NOT NULL,
  month        TEXT        NOT NULL,
  nursery      TEXT        NOT NULL,
  row_key      TEXT        NOT NULL,
  qty          NUMERIC,
  date         DATE,
  plot         TEXT,
  batch        TEXT,
  remark       TEXT,
  workers      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  checked_at   TIMESTAMPTZ,
  checked_by   TEXT,
  updated_by   TEXT,
  updated_at   TIMESTAMPTZ DEFAULT now(),
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS nops_custom_job_rows_one
  ON public.nops_custom_job_rows (job_key, month, nursery, row_key);

ALTER TABLE public.nops_custom_job_rows ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = '_mjm_close_table') THEN
    PERFORM public._mjm_close_table('nops_custom_job_rows', 'maint');
  ELSE
    DROP POLICY IF EXISTS "Authenticated read maint"  ON public.nops_custom_job_rows;
    DROP POLICY IF EXISTS "Authenticated write maint" ON public.nops_custom_job_rows;
    CREATE POLICY "Authenticated read maint"  ON public.nops_custom_job_rows
      FOR SELECT TO authenticated USING (true);
    CREATE POLICY "Authenticated write maint" ON public.nops_custom_job_rows
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.nops_custom_job_rows TO authenticated;
  GRANT USAGE, SELECT ON SEQUENCE public.nops_custom_job_rows_id_seq TO authenticated;
END $$;

NOTIFY pgrst, 'reload schema';

SELECT 'custom job rows table' AS what,
       CASE WHEN to_regclass('public.nops_custom_job_rows') IS NOT NULL THEN 'ready' ELSE 'MISSING' END AS state,
       (SELECT count(*) FROM public.nops_custom_job_rows)::text || ' rows, '
       || (SELECT count(*) FROM pg_policies WHERE tablename = 'nops_custom_job_rows')::text || ' policies' AS detail;
