-- ════════════════════════════════════════════════════════════════════════
-- TRANSPLANTING JOBS — the four jobs a plot needs when seedlings go into it
-- shared/RUN_ME_transplant_records.sql
--
-- Run this whole file in the Supabase SQL Editor. It creates one table and
-- nothing else: no existing table is read, changed or dropped, and it is
-- safe to run twice.
--
-- ── What this is for ──
--
-- The FC Portals Maintenance page gains a Transplanting Job button. It
-- reads the months transplanting straight out of the operation report —
-- shared_inventory_logs, transaction_type Transplanted / _Premium /
-- _DoubleTone — so the plot, the batch and the quantity are the offices own
-- figures and nobody re-keys them. What the Field Conductor adds is who did
-- the work:
--
--   blanket_spray   Blanket Spray
--   lining          Lining and Arranging Polybag
--   polybag_fill    Polybag Filling 15" x 18"
--   transplanting   Transplanting (Hy Plug to polybag 15" x 18")
--
-- ── Why the workers are JSONB ──
--
-- Three of the four jobs are "these people did this plot" — a list of names
-- and nothing else. Polybag filling is paid by the bag, so it is "these
-- people did this many each", and the office needs the split to pay it.
--
-- One shape carries both: workers = [{"name": "...", "qty": 1200}, ...],
-- with qty null on the three that do not split. A second table for the
-- three-quarters of rows that would carry one column is a join for nothing.
--
-- ── source_qty is the reports figure, kept ──
--
-- The quantity is read from the ledger when the record is made and stored
-- beside it. The ledger can be corrected afterwards, and when it is, this
-- still says what the conductor was looking at when he credited the work —
-- which is the figure the pay was worked out from.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS nops_transplant_field_records (
  id             BIGSERIAL PRIMARY KEY,
  work_date      DATE        NOT NULL,
  nursery_name   TEXT,
  plot_name      TEXT        NOT NULL,
  batch_name     TEXT,
  -- blanket_spray | lining | polybag_fill | transplanting
  work_type      TEXT        NOT NULL,
  -- The offices own wording, stored alongside so the two systems can be
  -- matched up without re-deriving it there.
  jenis          TEXT,
  -- Sep 2026 — the month of the transplanting this answers, in the same
  -- wording the maintenance schedule uses.
  schedule_month TEXT,
  -- What the operation report said had been transplanted into this plot
  -- when the record was made.
  source_qty     NUMERIC,
  -- [{"name": "Ali", "qty": 1200}, …]. qty is null except on polybag_fill.
  workers        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  -- The sum of the workers quantities. Stored rather than worked out on
  -- read: the office lists a nurserys month and adding up a JSONB array per
  -- row is not a query anybody wants to run.
  total_qty      NUMERIC,
  remark         TEXT,
  reported_by    TEXT,
  -- Written by a queued record so a repeated flush is refused by the unique
  -- index rather than crediting the same mornings work twice.
  client_uid     TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- One record per plot per job per month. Recording the same job twice on the
-- same plot is a correction, not a second crew — the app updates in place.
CREATE UNIQUE INDEX IF NOT EXISTS nops_transplant_field_once
  ON nops_transplant_field_records (plot_name, work_type, schedule_month);

-- What the screen asks for: this nursery, this month.
CREATE INDEX IF NOT EXISTS nops_transplant_field_nursery_idx
  ON nops_transplant_field_records (nursery_name, schedule_month);

-- A queued record that reached the server twice.
CREATE UNIQUE INDEX IF NOT EXISTS nops_transplant_field_uid
  ON nops_transplant_field_records (client_uid) WHERE client_uid IS NOT NULL;


-- ── Row-level security ──────────────────────────────────────────────────
-- The same gate the other nops_maint_* tables carry, applied the same way,
-- so this table cannot drift into being the open one. Where
-- migration_rls_hardening_2.sql has been run its helper does the work; where
-- it has not, the table is still closed to anonymous callers rather than
-- being left open until somebody remembers.
ALTER TABLE nops_transplant_field_records ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = '_mjm_close_table') THEN
    PERFORM public._mjm_close_table('nops_transplant_field_records', 'maint');
    RAISE NOTICE 'closed with the internal-staff gate';
  ELSE
    DROP POLICY IF EXISTS "Authenticated read maint"  ON nops_transplant_field_records;
    DROP POLICY IF EXISTS "Authenticated write maint" ON nops_transplant_field_records;
    CREATE POLICY "Authenticated read maint"  ON nops_transplant_field_records
      FOR SELECT TO authenticated USING (true);
    CREATE POLICY "Authenticated write maint" ON nops_transplant_field_records
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
    RAISE NOTICE 'closed to signed-in staff — run migration_rls_hardening_2.sql for the finer gate';
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON nops_transplant_field_records TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE nops_transplant_field_records_id_seq TO authenticated;

-- The phone does not call Postgres, it calls PostgREST, which answers from a
-- cached picture of the schema. Until that is rebuilt the new table is
-- "Could not find the table" to the app, which reads exactly like this file
-- never having been run.
NOTIFY pgrst, 'reload schema';


-- ── What you should see ─────────────────────────────────────────────────
-- The SQL Editor shows only the LAST statements result, so this is one
-- query. Every "column" row is one the app writes; "policies" must be 2 or
-- more, and "records" is 0 until a conductor saves the first job.
--
--   column     work_type       text
--   column     workers         jsonb
--   …
--   index      nops_transplant_field_once     one record per plot per job
--   policies   2                              row-level security is on
--   records    0                              nothing recorded yet
--   VERDICT    ready
-- ────────────────────────────────────────────────────────────────────────
SELECT * FROM (
  SELECT 1 AS ord, 'column'::text AS what, column_name::text AS value, data_type::text AS detail
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'nops_transplant_field_records'
  UNION ALL
  SELECT 2, 'index', indexname::text, 'unique: one record per plot per job per month'
    FROM pg_indexes
   WHERE schemaname = 'public' AND indexname = 'nops_transplant_field_once'
  UNION ALL
  SELECT 3, 'policies', count(*)::text, 'row-level security policies on the table'
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'nops_transplant_field_records'
  UNION ALL
  SELECT 4, 'records', count(*)::text, 'transplanting jobs recorded so far'
    FROM nops_transplant_field_records
  UNION ALL
  SELECT 9, 'VERDICT',
         CASE WHEN (SELECT count(*) FROM pg_policies
                     WHERE schemaname = 'public'
                       AND tablename = 'nops_transplant_field_records') >= 2
               AND EXISTS (SELECT 1 FROM pg_indexes
                            WHERE schemaname = 'public'
                              AND indexname = 'nops_transplant_field_once')
              THEN 'ready' ELSE 'something above is missing' END,
         'the Transplanting Job button can now save'
) x
ORDER BY ord, value;
