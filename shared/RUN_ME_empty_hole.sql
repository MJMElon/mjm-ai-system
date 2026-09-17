-- =====================================================================
--  EMPTY HOLE RECORDS — check the database will take them
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  Read-only except for the index, which is created only if missing, so
--  it is safe to run twice.
--
--  WHAT THE FEATURE STORES
--  The Planting report's new Empty Hole tab writes ONE ROW PER HOLE into
--  shared_inventory_logs — the same table and shape as every other fact
--  on that page. No new table and no new column:
--
--      transaction_type  'Empty_Hole'
--      batch_name        the batch
--      plot_name         the tray
--      quantity_change   1          (each record IS one hole, so a count
--                                    is a count of rows, not a sum)
--      remark            'Empty hole. Row: <r>. Hole: <h>. <note>'
--
--  FROM BATCH 276 ONWARDS, AND NOWHERE BEFORE IT
--  Counting hole by hole is a change to how the field works, so it starts
--  with the batches planted after it was asked for. Open batch 275 or
--  anything older and there are no sub-tabs at all: the planting report is
--  the whole of that page, and its Empty Holes box is keyed by the person
--  who counted, exactly as it was. The cut-off is EMPTY_HOLE_FROM_BATCH in
--  operation/operation_batch_detail.html.
--
--  So there is nothing to migrate. This file exists to PROVE that before
--  somebody keys a day's counting into a screen that cannot save it: if
--  transaction_type carries a CHECK constraint listing the allowed
--  values, 'Empty_Hole' has to be in it, and the check below says so
--  either way.
-- =====================================================================

/* Reading a batch's holes is "this batch, this type" — the same shape as
   every other read on the page, and the existing batch_name index already
   serves it. This narrows it further and costs nothing when there are no
   empty holes at all. IF NOT EXISTS, so a second run is a no-op. */
CREATE INDEX IF NOT EXISTS shared_inventory_logs_empty_hole_idx
  ON shared_inventory_logs (batch_name)
  WHERE transaction_type = 'Empty_Hole';

/* ONE result set — the SQL Editor only shows the last statement's. */
WITH constraint_check AS (
  SELECT COUNT(*) AS n,
         LEFT(COALESCE(STRING_AGG(pg_get_constraintdef(c.oid), ' | '), ''), 300) AS defs
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'shared_inventory_logs'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%transaction_type%'
),
allows AS (
  SELECT (SELECT n FROM constraint_check) = 0
      OR (SELECT defs FROM constraint_check) ILIKE '%Empty_Hole%' AS ok
),
already AS (
  SELECT COUNT(*) AS rows_now,
         COUNT(DISTINCT batch_name) AS batches
  FROM shared_inventory_logs
  WHERE transaction_type = 'Empty_Hole'
),
indexed AS (
  SELECT COUNT(*) AS n FROM pg_indexes
  WHERE tablename = 'shared_inventory_logs'
    AND indexname = 'shared_inventory_logs_empty_hole_idx'
)
SELECT (SELECT ok       FROM allows)            AS type_allowed,
       (SELECT n        FROM indexed)           AS index_present,
       (SELECT rows_now FROM already)           AS empty_hole_rows,
       (SELECT batches  FROM already)           AS batches_with_records,
       CASE WHEN (SELECT ok FROM allows)
            THEN 'Ready. The Empty Hole tab can save. Open a batch -> '
                 || 'Planting & Damage -> Empty Hole, add a record under a '
                 || 'tray, and press Save Empty Hole Records.'
            ELSE 'BLOCKED: transaction_type has a CHECK constraint that does '
                 || 'not list Empty_Hole, so the save will be refused. Send '
                 || 'this line back: ' || (SELECT defs FROM constraint_check)
       END                                      AS result;

-- WHAT A GOOD RESULT LOOKS LIKE
--   One row. type_allowed is true and index_present is 1, and the result
--   column says "Ready."
--
--   empty_hole_rows is 0 the first time — nothing has been keyed yet.
--   After somebody saves a tray's holes it is the number of holes, one
--   row each.
--
--   type_allowed false is the one case that needs a person: copy the
--   result line and send it back, and the constraint gets a migration of
--   its own rather than a guess.
