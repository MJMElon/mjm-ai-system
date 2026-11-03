-- ════════════════════════════════════════════════════════════════════════
-- A TRANSPLANTING JOB THAT WAS NOT DONE IS AN ANSWER, NOT A GAP
-- shared/RUN_ME_transplant_not_done.sql
--
-- Run this whole file in the Supabase SQL Editor. It adds ONE column to
-- nops_transplant_field_records and replaces one trigger function. No row
-- is read, changed or deleted, and it is safe to run twice.
--
-- ── What this is for ──
--
-- A plot that takes seedlings owes four jobs: the blanket spray, the
-- lining, the polybag filling and the transplanting. The FC Portal raises
-- it on Pending Verification until all four are recorded, and the office
-- pays each one as a crew.
--
-- A BLANKET SPRAY IS NOT ALWAYS NEEDED. The grass does not always come, so
-- a plot can genuinely never have one -- and there was no way to say so.
-- The plot therefore owed four jobs for ever: its card could never be
-- cleared, it sat on the board under every plot that still had work owing,
-- and since a second delivery now asks for the four jobs again, it would
-- come back on every arrival. The office asked for it in one line:
-- an option that says it was not done.
--
-- So the conductor answers the job with "nobody did this" and that answer
-- is a RECORD: an ordinary row of this table, carrying the day, the plot,
-- the job, the batches it is about and who said so, with an EMPTY crew.
-- Nothing is deleted, and nothing is paid -- a crew of nobody divides into
-- no claim line, which is what keeps it off the money by construction
-- rather than by a rule somebody has to remember.
--
-- ── Why it is a COLUMN and not a word in the remark ──
--
-- The remark is free text the office edits. A decision that can be undone
-- by somebody tidying a sentence is not a record of anything -- the same
-- reason a rejected signup is two columns rather than a remark. And every
-- office screen reads a crew of nobody as a crew somebody forgot to fill
-- in, so without the column the sheet would say "names nobody, go and add
-- who did the work" about a job nobody is ever going to do.
--
-- ── Nothing is backfilled ──
--
-- There is no row in this table that anybody has said this about, so the
-- column starts false everywhere and the first one is written from the
-- phone. A flag nobody set is not an answer.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE nops_transplant_field_records
  ADD COLUMN IF NOT EXISTS not_done BOOLEAN NOT NULL DEFAULT false;

-- ── The tick comes off when this moves ─────────────────────────────────
-- SHARED FUNCTION: this is the same nops_transplant_clear_check that
-- shared/RUN_ME_transplant_checked.sql creates, with not_done added to the
-- list of fields that decide the money. Change one, change the other.
--
-- Turning a recorded job into a not-done one, or back, changes what is
-- paid, so the office agreement has to go with it like any other money
-- field. not_done is compared THROUGH to_jsonb rather than named as a
-- column, so this body is valid on a database where the ALTER above has
-- not run -- which is what lets the two files carry the same function
-- whichever order they are run in.
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
   OR (to_jsonb(NEW) ->> 'not_done') IS DISTINCT FROM (to_jsonb(OLD) ->> 'not_done')
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
-- answers from a cached picture of the schema. Until that is rebuilt the
-- new column is "could not find the not_done column" to both apps, which
-- reads exactly like this file never having been run -- and the phone
-- refuses the save and says so rather than writing a record naming nobody.
NOTIFY pgrst, 'reload schema';


-- ── What you should see ─────────────────────────────────────────────────
-- The SQL Editor shows only the LAST statements result, so this is one
-- query. Read it top to bottom:
--
--   column     not_done     boolean    NOT NULL default false
--   trigger    nops_transplant_clear_check_trg    clears the tick when the
--                                                 money moves
--   guard      not_done     in the trigger
--   records    41           transplanting records in the table
--   not done   0            of those, jobs answered as not done
--   VERDICT    ready        the FC Portal can record a job as not done
--
-- "not done 0" on the first run is correct and expected: nothing is
-- backfilled. The conductor answers a job on the FC Portal, under
-- Maintenance then Transplanting Job, and the count moves as they do.
-- ────────────────────────────────────────────────────────────────────────
SELECT * FROM (
  SELECT 1 AS ord, 'column'::text AS what, column_name::text AS value,
         (data_type || CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END
            || COALESCE(' default ' || column_default, ''))::text AS detail
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'nops_transplant_field_records'
     AND column_name = 'not_done'
  UNION ALL
  SELECT 2, 'trigger', tgname::text, 'clears the tick when the money moves'
    FROM pg_trigger
   WHERE tgname = 'nops_transplant_clear_check_trg' AND NOT tgisinternal
  UNION ALL
  SELECT 3, 'guard',
         CASE WHEN position('not_done' in COALESCE(prosrc, '')) > 0
              THEN 'not_done' ELSE 'MISSING' END,
         'in the trigger'
    FROM pg_proc
   WHERE proname = 'nops_transplant_clear_check'
  UNION ALL
  SELECT 4, 'records', count(*)::text, 'transplanting records in the table'
    FROM nops_transplant_field_records
  UNION ALL
  SELECT 5, 'not done', count(*)::text, 'of those, jobs answered as not done'
    FROM nops_transplant_field_records
   WHERE COALESCE((to_jsonb(nops_transplant_field_records) ->> 'not_done')::boolean, false)
  UNION ALL
  SELECT 9, 'VERDICT',
         CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                            WHERE table_schema = 'public'
                              AND table_name = 'nops_transplant_field_records'
                              AND column_name = 'not_done')
               AND EXISTS (SELECT 1 FROM pg_trigger
                            WHERE tgname = 'nops_transplant_clear_check_trg'
                              AND NOT tgisinternal)
               AND EXISTS (SELECT 1 FROM pg_proc
                            WHERE proname = 'nops_transplant_clear_check'
                              AND position('not_done' in COALESCE(prosrc, '')) > 0)
              THEN 'ready' ELSE 'something above is missing' END,
         'the FC Portal can record a job as not done'
) x
ORDER BY ord, value;
