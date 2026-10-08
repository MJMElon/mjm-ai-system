-- =====================================================================
--  WHICH BATCHES CARRY MORE THAN ONE SEEDS IN ROW
--  Paste into the Supabase SQL Editor and press Run. Read-only: it
--  changes nothing, so it is safe to run as often as you like.
--
--  A batch is meant to have exactly ONE Seeds_Received row. Batch 224
--  had NINETY-FIVE, every one of them identical — same quantity, same
--  remark, same created_at to the microsecond. That is one bulk insert
--  that ran ninety-five times, not an edit somebody made twice.
--
--  ONE ROW PER BATCH, because 95 rows about one batch is not a list
--  anybody can read. CHECK_duplicate_seeds_in_rows.sql is the drill-down
--  once this has named a batch.
--
--  all_identical is the column that decides what happens next. Two rows
--  are counted as the same when every column matches except the id, the
--  created_at and the last-edited stamps, so a repeated save and a bulk
--  insert both read yes.
--
--  WHAT A GOOD RESULT LOOKS LIKE
--    One row, reading ALL with 0 batches. Every batch has one Seeds In
--    row and there is nothing to clean up.
--
--    Otherwise the ALL row first with the totals, then one row per
--    batch, worst first.
--
--    all_identical = yes   every row is a copy of the same one. Nothing
--                          has to be decided: RUN_ME_dedupe_seeds_in.sql
--                          keeps one and deletes the rest.
--    all_identical = NO    the rows genuinely differ, so somebody has to
--                          say which is the real delivery. The repair
--                          leaves these alone on purpose. Open the
--                          drill-down for that batch.
--
--    sum_if_added_up is what Life of Seedlings used to show before it
--    was changed to read the newest row, and is the quickest way to
--    recognise the batch you were looking at.
-- =====================================================================
WITH sr AS (
  SELECT l.batch_name,
         l.id,
         l.created_at,
         COALESCE(l.quantity_change, 0) AS qty,
         -- Everything about the row EXCEPT what may legitimately differ
         -- between two copies of it. Built from the whole row rather than
         -- from a list of columns, so a column added later is compared
         -- too instead of being quietly ignored.
         (to_jsonb(l) - 'id' - 'created_at' - 'last_edited_at' - 'last_edited_by')::text AS fingerprint
  FROM shared_inventory_logs l
  WHERE l.transaction_type = 'Seeds_Received'
    AND COALESCE(btrim(l.batch_name), '') <> ''
),
newest AS (
  SELECT DISTINCT ON (batch_name) batch_name, id, qty
  FROM sr
  ORDER BY batch_name, created_at DESC, id DESC
),
per_batch AS (
  SELECT sr.batch_name,
         count(*)                   AS rows_for_batch,
         count(DISTINCT sr.fingerprint) AS different_rows,
         sum(sr.qty)                AS sum_if_added_up,
         max(n.qty)                 AS kept_qty,
         max(n.id)                  AS kept_id
  FROM sr
  JOIN newest n ON n.batch_name = sr.batch_name
  GROUP BY sr.batch_name
  HAVING count(*) > 1
)
SELECT batch, all_identical, rows_for_batch, rows_that_would_go,
       sum_if_added_up, kept_qty, different_rows, kept_id
FROM (
SELECT 0                                            AS sort_first,
       'ALL — ' || count(*) || ' batch'
         || CASE WHEN count(*) = 1 THEN '' ELSE 'es' END AS batch,
       ''                                           AS all_identical,
       COALESCE(sum(rows_for_batch), 0)             AS rows_for_batch,
       COALESCE(sum(rows_for_batch - 1), 0)         AS rows_that_would_go,
       COALESCE(sum(sum_if_added_up), 0)            AS sum_if_added_up,
       COALESCE(sum(kept_qty), 0)                   AS kept_qty,
       0                                            AS different_rows,
       0                                            AS kept_id
FROM per_batch
UNION ALL
SELECT 1,
       batch_name,
       CASE WHEN different_rows = 1 THEN 'yes' ELSE 'NO' END,
       rows_for_batch,
       rows_for_batch - 1,
       sum_if_added_up,
       kept_qty,
       different_rows,
       kept_id
FROM per_batch
) q
ORDER BY sort_first, rows_for_batch DESC, batch;
