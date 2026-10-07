/* ═══════════════════════════════════════════════════════════════════════
   WORKER SYSTEM — when somebody joined, and when they left.

   Two dates on the worker register, asked for on the Worker System screen:

     registered_on  the day they joined. Its own column rather than a read
                    of created_at, because a worker is keyed in days or
                    weeks after they start — and sometimes years after, when
                    an old paper register is typed up. created_at answers
                    "when was this row written", which is a different
                    question and only looks like the same one.

     last_day       the last day of somebody who has left. Only asked once
                    their status is Inactive, and cleared if they are ever
                    turned back to Active — a stale date is how a rejoining
                    worker ends up filed as having left.

   Nothing else on the register changes, and nothing is dropped. Every row
   already there gets registered_on filled in from created_at, which is the
   best answer the database holds for a worker nobody has keyed a date for;
   a row with no created_at either is left null rather than being given a
   date somebody would have to trust.

   Safe to run twice: the columns are added IF NOT EXISTS, and the backfill
   only touches rows where registered_on is still null, so a second run
   finds nothing to do and says so.
   ═══════════════════════════════════════════════════════════════════════ */

-- ── 1. The two columns ──────────────────────────────────────────────────
ALTER TABLE mjmnpayroll_workers
  ADD COLUMN IF NOT EXISTS registered_on DATE,
  ADD COLUMN IF NOT EXISTS last_day      DATE;


-- ── 2. Fill in what the database already knows ──────────────────────────
-- Only rows that have not been given a registered date. Run this file
-- again tomorrow and this matches nothing.
UPDATE mjmnpayroll_workers
   SET registered_on = created_at::date
 WHERE registered_on IS NULL
   AND created_at IS NOT NULL;


-- ── 3. PostgREST has to be told the shape changed ───────────────────────
-- Without this it goes on serving the old picture and the two new boxes on
-- the Worker System screen stay read-only however many times you reload.
NOTIFY pgrst, 'reload schema';


-- ── 4. What should have happened ────────────────────────────────────────
-- One result set, because the SQL Editor only shows the last statements.
--
-- A GOOD RESULT is four rows:
--   registered_on column      yes
--   last_day column           yes
--   workers with a join date  <every worker who has a created_at>
--   workers still with none   0   (or the number of rows that have no
--                                  created_at either — those are the ones
--                                  to key a date for by hand)
SELECT 'registered_on column'      AS check,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_name = 'mjmnpayroll_workers'
                            AND column_name = 'registered_on')
            THEN 'yes' ELSE 'NO - the ALTER did not run' END AS result
UNION ALL
SELECT 'last_day column',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_name = 'mjmnpayroll_workers'
                            AND column_name = 'last_day')
            THEN 'yes' ELSE 'NO - the ALTER did not run' END
UNION ALL
SELECT 'workers with a join date',
       count(*)::text FROM mjmnpayroll_workers WHERE registered_on IS NOT NULL
UNION ALL
SELECT 'workers still with none',
       count(*)::text FROM mjmnpayroll_workers WHERE registered_on IS NULL;
