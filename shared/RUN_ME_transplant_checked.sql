-- ════════════════════════════════════════════════════════════════════════
-- THE TRANSPLANTING CLAIM IS PAID ON A CHECKED ROW
-- shared/RUN_ME_transplant_checked.sql
--
-- Run this whole file in the Supabase SQL Editor. It adds two columns and
-- one trigger to nops_transplant_field_records and nothing else: no row is
-- read, changed or deleted, and it is safe to run twice.
--
-- ── What this is for ──
--
-- The four transplanting jobs are keyed by the Field Conductor on his own
-- portal and used to reach the salary claim straight from there. The office
-- now reads them on Worker Record -> Transplanting, and the claim is paid on
-- what the office has been through and agreed -- the same Checked tick the
-- other four tabs have carried for months.
--
-- Nothing is backfilled. A tick nobody made is not a signature, and seeding
-- one would be this file deciding a month the office has not looked at. So
-- the first claim after this is run shows the work held back and names it,
-- which is the office being asked the question for the first time rather
-- than a quiet month.
--
-- ── Why the tick is cleared by a TRIGGER and not by a screen ──
--
-- Three things write this table: the FC Portal sheet, this page, and
-- somebody in the Supabase dashboard. A conductor who corrects a crew after
-- the office agreed the row has changed what is being paid, so the agreement
-- has to go with it -- and a rule living in one screen is a rule the other
-- two do not obey. Same reasoning as previous_names on the worker register.
--
-- Only the fields that decide the MONEY clear it: the day, the plot, the
-- job, the month it is claimed in, the quantity and the crew. A remark, a
-- batch name or a nursery spelling corrected afterwards leaves the agreement
-- standing, because none of them moves a figure.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE nops_transplant_field_records
  ADD COLUMN IF NOT EXISTS checked_at TIMESTAMPTZ;

ALTER TABLE nops_transplant_field_records
  ADD COLUMN IF NOT EXISTS checked_by TEXT;

CREATE OR REPLACE FUNCTION public.nops_transplant_clear_check()
RETURNS TRIGGER AS $$
BEGIN
  -- IS DISTINCT FROM, so a column going from NULL to a value counts as a
  -- change. A plain <> answers NULL and leaves the tick standing.
  IF  NEW.work_date      IS DISTINCT FROM OLD.work_date
   OR NEW.plot_name      IS DISTINCT FROM OLD.plot_name
   OR NEW.work_type      IS DISTINCT FROM OLD.work_type
   OR NEW.schedule_month IS DISTINCT FROM OLD.schedule_month
   OR NEW.source_qty     IS DISTINCT FROM OLD.source_qty
   OR NEW.total_qty      IS DISTINCT FROM OLD.total_qty
   OR NEW.workers        IS DISTINCT FROM OLD.workers
  THEN
    -- Only where the agreement was not part of this same write. An office
    -- correcting a figure AND agreeing it in one go has agreed what it
    -- wrote, and clearing that would make the tick impossible to set.
    IF NEW.checked_at IS NOT DISTINCT FROM OLD.checked_at THEN
      NEW.checked_at := NULL;
      NEW.checked_by := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS nops_transplant_clear_check_trg
  ON nops_transplant_field_records;

CREATE TRIGGER nops_transplant_clear_check_trg
  BEFORE UPDATE ON nops_transplant_field_records
  FOR EACH ROW EXECUTE FUNCTION public.nops_transplant_clear_check();

-- The phone and the office do not call Postgres, they call PostgREST, which
-- answers from a cached picture of the schema. Until that is rebuilt the two
-- new columns are "could not find the column" to both apps, which reads
-- exactly like this file never having been run.
NOTIFY pgrst, 'reload schema';


-- ── What you should see ─────────────────────────────────────────────────
-- The SQL Editor shows only the LAST statements result, so this is one
-- query. Read it top to bottom:
--
--   column    checked_at    timestamp with time zone
--   column    checked_by    text
--   trigger   nops_transplant_clear_check_trg   clears the tick when the
--                                               money moves
--   records   41            transplanting records in the table
--   checked   0             of those, rows the office has agreed
--   VERDICT   ready         the claim can now be gated
--
-- "checked 0" on the first run is correct and expected -- nothing is
-- backfilled. The office ticks the rows on Worker Record -> Transplanting
-- and the claim picks them up as they are ticked.
-- ────────────────────────────────────────────────────────────────────────
SELECT * FROM (
  SELECT 1 AS ord, 'column'::text AS what, column_name::text AS value,
         data_type::text AS detail
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'nops_transplant_field_records'
     AND column_name IN ('checked_at', 'checked_by')
  UNION ALL
  SELECT 2, 'trigger', tgname::text, 'clears the tick when the money moves'
    FROM pg_trigger
   WHERE tgname = 'nops_transplant_clear_check_trg' AND NOT tgisinternal
  UNION ALL
  SELECT 3, 'records', count(*)::text, 'transplanting records in the table'
    FROM nops_transplant_field_records
  UNION ALL
  SELECT 4, 'checked', count(*)::text, 'of those, rows the office has agreed'
    FROM nops_transplant_field_records WHERE checked_at IS NOT NULL
  UNION ALL
  SELECT 9, 'VERDICT',
         CASE WHEN (SELECT count(*) FROM information_schema.columns
                     WHERE table_schema = 'public'
                       AND table_name = 'nops_transplant_field_records'
                       AND column_name IN ('checked_at', 'checked_by')) = 2
               AND EXISTS (SELECT 1 FROM pg_trigger
                            WHERE tgname = 'nops_transplant_clear_check_trg'
                              AND NOT tgisinternal)
              THEN 'ready' ELSE 'something above is missing' END,
         'the claim can now be gated'
) x
ORDER BY ord, value;
