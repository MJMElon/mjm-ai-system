-- =====================================================================
--  CLOSE THE PLANTING-DISCREPANCY CASES NELOS SHOULD NOT BE HOLDING
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  Safe to run twice: the second run finds nothing left to close and
--  says so.
--
--  WHY
--  Saving the planting report used to raise a Nelos case whenever the
--  figures did not tally. The question belongs on the Planting tab, where
--  the person who keyed the report can answer it while they are looking
--  at it, and that is where it is asked now — the app no longer raises
--  these at all.
--
--  What it cannot do is tidy up the ones already filed. Worse, those
--  cases never closed themselves: fixing the figures only stopped a NEW
--  one being raised, so some of these have been answered for weeks.
--
--  WHAT THIS DOES
--  Closes every OPEN or IN-PROGRESS case that the planting report raised
--  automatically, and writes on each one why it was closed, so a case
--  somebody is part-way through is not simply deleted out from under
--  them.
--
--  WHAT IT LEAVES ALONE
--  · Cases already resolved or closed — nothing to do.
--  · Cases raised by hand, whatever they are about. The rule keys on the
--    category the automatic raise used ('Planting Discrepancy') AND on
--    the source module being 'operation', which is what that raise set.
--  · Every other Nelos case on the system, including the Empty Hole ones
--    the Planting tab still raises when somebody presses the button.
--    Those are a person asking for a job to be done, not an automatic
--    complaint about arithmetic.
-- =====================================================================

-- The closing note, on the case itself, so it reads as an answer and not
-- as a case that vanished.
UPDATE nelos_cases
   SET status      = 'closed',
       closed_at   = COALESCE(closed_at, now()),
       closed_by   = COALESCE(closed_by, 'System — moved to the Planting tab'),
       resolution  = COALESCE(
         NULLIF(TRIM(COALESCE(resolution, '')), ''),
         'Closed automatically. Planting discrepancies are now explained on the '
         || 'batch report''s Planting & Damage tab, in the "Explain the discrepancy" '
         || 'box, rather than raised as a case here. Open the batch to read or write '
         || 'the reason.'),
       updated_at  = now()
 WHERE category      = 'Planting Discrepancy'
   AND source_module = 'operation'
   AND status IN ('open', 'in_progress');

/* ONE result set — the SQL Editor only shows the last statement's. */
SELECT
  (SELECT count(*) FROM nelos_cases
    WHERE category = 'Planting Discrepancy' AND source_module = 'operation')
                                                              AS planting_cases_in_total,
  (SELECT count(*) FROM nelos_cases
    WHERE category = 'Planting Discrepancy' AND source_module = 'operation'
      AND status IN ('open', 'in_progress'))                  AS still_open,
  (SELECT count(*) FROM nelos_cases
    WHERE category = 'Planting Discrepancy' AND source_module = 'operation'
      AND status = 'closed')                                  AS now_closed,
  (SELECT count(*) FROM nelos_cases
    WHERE status IN ('open', 'in_progress'))                  AS other_cases_still_open,
  CASE WHEN (SELECT count(*) FROM nelos_cases
               WHERE category = 'Planting Discrepancy' AND source_module = 'operation'
                 AND status IN ('open', 'in_progress')) = 0
       THEN 'Done. No planting-discrepancy case is waiting on anybody any more. '
            || 'From now on a shortfall is explained on the batch''s Planting & Damage tab.'
       ELSE 'NOT DONE: some are still open. Send back the still_open figure.'
  END                                                         AS result;

-- WHAT A GOOD RESULT LOOKS LIKE
--   One row. still_open is 0 and result says "Done."
--
--   planting_cases_in_total is however many were ever raised — they are
--   kept, not deleted, so the history is still there to look at. now_closed
--   should equal it (less any that were already resolved by hand, which
--   carry status 'resolved' and are left exactly as they were).
--
--   other_cases_still_open is every OTHER Nelos case still waiting. That
--   number must not have moved — if it looks lower than you expect, stop
--   and send it back rather than running anything else.
--
--   A second run reports still_open 0 again and changes nothing.
