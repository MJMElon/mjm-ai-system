-- ════════════════════════════════════════════════════════════════════════
-- A WORKER IS THE REGISTER ROW, SO THE ROW REMEMBERS ITS OLD NAMES
-- shared/RUN_ME_worker_previous_names.sql
--
-- Paste the WHOLE file into the Supabase SQL Editor and press Run.
-- Safe to run twice. No regular expressions, no backslashes, no apostrophe
-- in any comment.
--
-- WHAT IS WRONG
--
-- The Worker Record stores its ticks keyed by NAME, because that is what a
-- column header is: nops_maint_payroll.data is
--     { recordId: { "Andi Rosmini": 1 } }
-- Correct a name on the payroll register and every tick ever made under the
-- old spelling is orphaned. The sheet has no column for it, the capacity
-- drops out of the totals, and the salary claim stops paying it. Nothing is
-- deleted and nothing says a word.
--
-- It has happened. Fauzan was registered first and later corrected to
-- Muhamad Fauzan -- the same person, the same row, the same id, because the
-- office EDITED the row rather than making a second one. Every tick saved
-- before that correction still says Fauzan.
--
-- WHAT THIS DOES
--
-- mjmnpayroll_workers.id is a BIGSERIAL and an edit keeps it, whatever is
-- done to the name, the PIN, the bank account or the role. So the row is
-- given a list of the names it has ever been known by, and a TRIGGER appends
-- to it whenever full_name changes.
--
-- A trigger rather than a line in one of the screens, because the register is
-- edited from more than one place -- the office module, the Worker Portal
-- Manage page, and by hand in Supabase. A rule that lives in one screen is a
-- rule the other two do not obey.
--
-- WHAT IT DOES NOT DO
--
-- It cannot know about renames that happened BEFORE it existed, because
-- nothing recorded them. Those are found by
-- shared/CHECK_worker_names_with_no_column.sql, which lists every tick name
-- the register cannot place, and seeded by
-- shared/RUN_ME_worker_name_was.sql, which names its pairs rather than
-- guessing a rule.
--
-- WHAT TO LOOK FOR
--   1 COLUMN   previous_names exists and is an array
--   2 TRIGGER  the rename recorder is attached
--   3 NAMES    how many rows already carry an older name, and which
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE mjmnpayroll_workers
  ADD COLUMN IF NOT EXISTS previous_names JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION mjmnpayroll_remember_old_name()
RETURNS TRIGGER AS $$
BEGIN
  -- Only a real change of name, and never a blank.
  IF NEW.full_name IS DISTINCT FROM OLD.full_name
     AND COALESCE(btrim(OLD.full_name), '') <> '' THEN
    -- Kept once. A name corrected and then corrected back must not pile up,
    -- and the list is read as a set.
    IF NOT (COALESCE(OLD.previous_names, '[]'::jsonb) @> to_jsonb(btrim(OLD.full_name))) THEN
      NEW.previous_names := COALESCE(OLD.previous_names, '[]'::jsonb)
                            || jsonb_build_array(btrim(OLD.full_name));
    ELSE
      NEW.previous_names := COALESCE(OLD.previous_names, '[]'::jsonb);
    END IF;
    -- The name it is being given is its current one, so it does not belong
    -- in the list of former ones.
    NEW.previous_names := COALESCE((
      SELECT jsonb_agg(x) FROM jsonb_array_elements(NEW.previous_names) AS e(x)
       WHERE btrim(x #>> '{}') <> btrim(NEW.full_name)
    ), '[]'::jsonb);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mjmnpayroll_remember_old_name ON mjmnpayroll_workers;
CREATE TRIGGER trg_mjmnpayroll_remember_old_name
  BEFORE UPDATE ON mjmnpayroll_workers
  FOR EACH ROW EXECUTE FUNCTION mjmnpayroll_remember_old_name();

NOTIFY pgrst, 'reload schema';

SELECT * FROM (
  SELECT 1 AS ord, '1 COLUMN'::text AS what,
         (SELECT count(*)::text FROM information_schema.columns
           WHERE table_name = 'mjmnpayroll_workers' AND column_name = 'previous_names') AS n,
         'should be 1 -- the row can now remember what it was called'::text AS detail
  UNION ALL
  SELECT 2, '2 TRIGGER',
         (SELECT count(*)::text FROM pg_trigger
           WHERE tgname = 'trg_mjmnpayroll_remember_old_name' AND NOT tgisinternal),
         'should be 1 -- a rename from ANY screen is recorded from now on'
  UNION ALL
  SELECT 3, '3 NAMES',
         (SELECT count(*)::text FROM mjmnpayroll_workers
           WHERE jsonb_array_length(COALESCE(previous_names, '[]'::jsonb)) > 0),
         COALESCE((SELECT string_agg(full_name || ' was ' || (previous_names #>> '{0}'), '; ')
                     FROM mjmnpayroll_workers
                    WHERE jsonb_array_length(COALESCE(previous_names, '[]'::jsonb)) > 0),
                  'none yet -- renames from before today were never recorded, see CHECK_worker_names_with_no_column.sql')
) z
ORDER BY ord;
