-- =====================================================================
--  CLEAR THE MOVEMENTS THAT WERE RECORDED TWICE
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  Safe to run twice: the second run finds nothing left and says so.
--
--  RUN shared/CHECK_duplicate_transfers.sql FIRST. It says which
--  batches are affected and — from created_at — whether each one was a
--  double key-in or a delete that is not taking. This file only clears
--  what is there; if the verdict was SEPARATE SAVES, they will come back
--  and the cause needs fixing rather than the symptom.
--
--  WHAT THIS DOES
--  Where the SAME movement is recorded more than once — same batch, same
--  sending plot, same destination, same quantity, same day — it keeps the
--  FIRST one written and deletes the rest.
--
--  The first, not the last, because the first is the one the rest of the
--  system has had longest and because created_at is then still the day
--  the movement was actually keyed.
--
--  WHAT IT LEAVES ALONE
--  · Movements that differ in ANY of those five things. Two lorries on
--    the same day to the same plot carrying DIFFERENT quantities are two
--    movements, and so are the same quantities on different days.
--  · Every other transaction type. Only Cull3_Transfer is touched.
--  · The 3rd Culling records themselves — the culled quantities, the
--    drone maps, the dates. Nothing here reads or writes them.
-- =====================================================================

-- Keep the oldest of each identical group; delete the rest.
WITH ranked AS (
  SELECT l.id,
         ROW_NUMBER() OVER (
           PARTITION BY
             l.batch_name,
             COALESCE(SUBSTRING(l.remark FROM 'From:\s*\[([^\]|]+)\|'), ''),
             REGEXP_REPLACE(UPPER(TRIM(COALESCE(l.plot_name, ''))), '\s+', ' ', 'g'),
             l.quantity_change,
             COALESCE(l.transaction_date::text,
                      SUBSTRING(l.remark FROM 'Date:\s*(\d{4}-\d{2}-\d{2})'), '')
           ORDER BY l.created_at, l.id
         ) AS copy_no
  FROM shared_inventory_logs l
  WHERE l.transaction_type = 'Cull3_Transfer'
)
DELETE FROM shared_inventory_logs
 WHERE id IN (SELECT id FROM ranked WHERE copy_no > 1);

/* ONE result set — the SQL Editor only shows the last statement's. */
WITH still AS (
  SELECT l.batch_name, count(*) AS copies
  FROM shared_inventory_logs l
  WHERE l.transaction_type = 'Cull3_Transfer'
  GROUP BY l.batch_name,
           COALESCE(SUBSTRING(l.remark FROM 'From:\s*\[([^\]|]+)\|'), ''),
           REGEXP_REPLACE(UPPER(TRIM(COALESCE(l.plot_name, ''))), '\s+', ' ', 'g'),
           l.quantity_change,
           COALESCE(l.transaction_date::text,
                    SUBSTRING(l.remark FROM 'Date:\s*(\d{4}-\d{2}-\d{2})'), '')
  HAVING count(*) > 1
)
SELECT (SELECT count(*) FROM shared_inventory_logs
         WHERE transaction_type = 'Cull3_Transfer')        AS movements_now,
       (SELECT count(*) FROM still)                        AS still_doubled,
       (SELECT COALESCE(STRING_AGG(DISTINCT batch_name, ', '), '—') FROM still) AS on_batches,
       CASE WHEN (SELECT count(*) FROM still) = 0
            THEN 'Done. Every movement on every batch is recorded once. Open batch 242 (or '
                 || 'whichever the check named) and the Total Transferred figure should now '
                 || 'match what actually moved.'
            ELSE 'NOT DONE: some are still doubled. Send back the on_batches list.'
       END                                                 AS result;

-- WHAT A GOOD RESULT LOOKS LIKE
--   One row. still_doubled is 0 and result says "Done."
--
--   movements_now is every transfer left on the system — compare it with
--   what CHECK_duplicate_transfers.sql reported and the difference is what
--   was cleared.
--
--   A second run reports still_doubled 0 again and deletes nothing.
--
--   If they come back in a week, the cause is the delete not taking, not
--   the copies. Run the CHECK again and send back any row whose verdict
--   says SEPARATE SAVES.
