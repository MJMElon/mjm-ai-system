/* ═══════════════════════════════════════════════════════════════════════
   WORKER SYSTEM — turning a signup down.

   Somebody signs themselves up and the office does not want them. Until
   now there was nothing to be done about it: the Waiting to be allocated
   queue is everybody on the register with no section, and a name nobody is
   ever going to file stays in that queue for ever.

   The X on a name now rejects the registration, and these are the two
   columns that record it:

     rejected_at   the moment it was decided. Its own column rather than a
                   sentence in the remark, because the remark is free text
                   the office edits and a rejection that can be undone by
                   somebody tidying a line is not a record of anything.

     rejected_by   who decided it. Not a read of updated_by, which the next
                   edit of that worker overwrites.

   IT IS A RECORD AND NEVER A DELETION. The worker row is what any work
   entry hangs off, and the register is the one place that says a person
   ever applied, so the row stays: the rejection marks it inactive and
   nothing is removed. Tick Show inactive on the Worker System screen to
   find them again, and setting them Active on their own record undoes it,
   which clears both columns.

   Nothing else on the register changes, and no existing row is touched: a
   worker already on the board is not a rejected signup and a backfill that
   guessed at one would be inventing a decision nobody made.

   Safe to run twice: the columns are added IF NOT EXISTS, so a second run
   finds them there and says so.
   ═══════════════════════════════════════════════════════════════════════ */

-- ── 1. The two columns ──────────────────────────────────────────────────
ALTER TABLE mjmnpayroll_workers
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by TEXT;


-- ── 2. PostgREST has to be told the shape changed ───────────────────────
-- Without this it goes on serving the old picture, the Worker System screen
-- goes on showing its orange warning, and the X goes on taking a name off
-- the board without recording why, however many times you reload.
NOTIFY pgrst, 'reload schema';


-- ── 3. What should have happened ────────────────────────────────────────
-- One result set, because the SQL Editor only shows the last statements
-- result.
--
-- A GOOD RESULT is four rows:
--   rejected_at column        yes
--   rejected_by column        yes
--   registrations rejected    0 on the first run -- nothing is backfilled,
--                             so this only grows as the office presses the X
--   workers on the register   <however many are on it>
SELECT 'rejected_at column'       AS check,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_name = 'mjmnpayroll_workers'
                            AND column_name = 'rejected_at')
            THEN 'yes' ELSE 'NO - the ALTER did not run' END AS result
UNION ALL
SELECT 'rejected_by column',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_name = 'mjmnpayroll_workers'
                            AND column_name = 'rejected_by')
            THEN 'yes' ELSE 'NO - the ALTER did not run' END
UNION ALL
SELECT 'registrations rejected',
       count(*)::text FROM mjmnpayroll_workers WHERE rejected_at IS NOT NULL
UNION ALL
SELECT 'workers on the register',
       count(*)::text FROM mjmnpayroll_workers;
