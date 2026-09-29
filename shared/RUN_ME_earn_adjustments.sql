-- ════════════════════════════════════════════════════════════════════════
-- PAYROLL — what an admin decided a job should pay instead
-- shared/RUN_ME_earn_adjustments.sql
--
-- Run this whole file in the Supabase SQL Editor. It creates one table and
-- nothing else: no existing table is read, changed or dropped, and it is
-- safe to run twice.
--
-- ── What this is for ──
--
-- The Work Maintenance and Transplanting claims work the money out: capacity
-- from the field, rate from Piece Rate, one multiplied by the other. Usually
-- that is the answer. Sometimes it is not — a plot half done, a rate that was
-- wrong all month, an agreement made with a worker on the day — and the
-- office needs to pay a different figure without going back and falsifying
-- the record of what was done.
--
-- So this table holds the OVERRIDE, not the work. The capacity, the rate and
-- the figure they come to stay exactly as the field and the office recorded
-- them; the claim shows the new number with the old one still under it, and
-- the reason beside. A month can always be read back as "this is what it came
-- to, this is what we paid, and this is why they differ".
--
-- ── Who may ──
--
-- The Adjust Pay tick on the payroll's own User Access screen, per person and
-- per sheet — admin-granted only. Not the same as being able to open the
-- sheet: reading what a month pays and changing it are different jobs.
--
-- ── The key ──
--
-- One override per worker per job per month per section. A worker who did
-- blanket spray in BNN and in UNN 1 has two figures, and adjusting one must
-- not move the other.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS mjmnpayroll_earn_adjustments (
  id           BIGSERIAL PRIMARY KEY,
  -- '2026-09', the same string the payroll's month picker uses.
  month        TEXT        NOT NULL,
  -- 'maint' | 'transplanting' — which claim the cell is on.
  sheet        TEXT        NOT NULL,
  -- The nursery or section the claim was showing. Part of the key: the same
  -- worker can earn the same job in two places in one month.
  section      TEXT        NOT NULL DEFAULT '',
  -- The register's own spelling of the name, which is what both claims key
  -- their rows on.
  worker_name  TEXT        NOT NULL,
  -- The work type's code: a MAINT_TYPES code, or a TRANSPLANT_JOBS key.
  work_code    TEXT        NOT NULL,
  -- What it pays INSTEAD. Not a delta: a delta has to be read together with
  -- a figure that can change underneath it, and then nobody can say what was
  -- agreed. This is the agreed number.
  amount       NUMERIC     NOT NULL,
  -- Why. Required by the form, because an adjustment nobody explained is one
  -- nobody can defend three months later.
  reason       TEXT,
  adjusted_by  TEXT,
  adjusted_at  TIMESTAMPTZ DEFAULT now(),
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- One override per cell. Adjusting the same cell twice is a correction, not
-- a second adjustment, and the app upserts to match.
CREATE UNIQUE INDEX IF NOT EXISTS mjmnpayroll_earn_adj_once
  ON mjmnpayroll_earn_adjustments (month, sheet, section, worker_name, work_code);

-- What the claim asks for: this month, this sheet.
CREATE INDEX IF NOT EXISTS mjmnpayroll_earn_adj_month_idx
  ON mjmnpayroll_earn_adjustments (month, sheet);


-- ── Row-level security ──────────────────────────────────────────────────
-- The same gate the rest of the payroll tables carry. This one decides what
-- people are paid, so it must not end up the open table in the set.
ALTER TABLE mjmnpayroll_earn_adjustments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = '_mjm_close_table') THEN
    PERFORM public._mjm_close_table('mjmnpayroll_earn_adjustments', 'npayroll');
    RAISE NOTICE 'closed with the internal-staff gate';
  ELSE
    DROP POLICY IF EXISTS "Authenticated read npayroll"  ON mjmnpayroll_earn_adjustments;
    DROP POLICY IF EXISTS "Authenticated write npayroll" ON mjmnpayroll_earn_adjustments;
    CREATE POLICY "Authenticated read npayroll"  ON mjmnpayroll_earn_adjustments
      FOR SELECT TO authenticated USING (true);
    CREATE POLICY "Authenticated write npayroll" ON mjmnpayroll_earn_adjustments
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
    RAISE NOTICE 'closed to signed-in staff — run migration_rls_hardening_2.sql for the finer gate';
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON mjmnpayroll_earn_adjustments TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE mjmnpayroll_earn_adjustments_id_seq TO authenticated;

-- The browser does not call Postgres, it calls PostgREST, which answers from
-- a cached picture of the schema. Until that is rebuilt the new table is
-- "Could not find the table" to the page, which reads exactly like this file
-- never having been run.
NOTIFY pgrst, 'reload schema';


-- ── What you should see ─────────────────────────────────────────────────
-- The SQL Editor shows only the LAST statement's result, so this is one
-- query. "policies" must be 2 or more; "adjustments" is 0 until somebody
-- changes a figure.
--
--   column     amount        numeric
--   column     work_code     text
--   …
--   index      mjmnpayroll_earn_adj_once   one override per cell
--   policies   2                           row-level security is on
--   adjustments 0                          nothing adjusted yet
--   VERDICT    ready
-- ────────────────────────────────────────────────────────────────────────
SELECT * FROM (
  SELECT 1 AS ord, 'column'::text AS what, column_name::text AS value, data_type::text AS detail
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'mjmnpayroll_earn_adjustments'
  UNION ALL
  SELECT 2, 'index', indexname::text, 'unique: one override per worker per job per month'
    FROM pg_indexes
   WHERE schemaname = 'public' AND indexname = 'mjmnpayroll_earn_adj_once'
  UNION ALL
  SELECT 3, 'policies', count(*)::text, 'row-level security policies on the table'
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'mjmnpayroll_earn_adjustments'
  UNION ALL
  SELECT 4, 'adjustments', count(*)::text, 'figures an admin has changed'
    FROM mjmnpayroll_earn_adjustments
  UNION ALL
  SELECT 9, 'VERDICT',
         CASE WHEN (SELECT count(*) FROM pg_policies
                     WHERE schemaname = 'public'
                       AND tablename = 'mjmnpayroll_earn_adjustments') >= 2
               AND EXISTS (SELECT 1 FROM pg_indexes
                            WHERE schemaname = 'public'
                              AND indexname = 'mjmnpayroll_earn_adj_once')
              THEN 'ready' ELSE 'something above is missing' END,
         'grant Adjust Pay on the payroll User Access screen, then the cells open'
) x
ORDER BY ord, value;
