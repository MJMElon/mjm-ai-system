-- =====================================================================
--  ONE SEEDS IN ROW PER BATCH
--  Paste the whole file into the Supabase SQL Editor and press Run.
--  Safe to run twice: the second run finds nothing and says so.
--
--  A batch is meant to have exactly ONE Seeds_Received row. Batch 224
--  had NINETY-FIVE, every one of them identical — same quantity, same
--  remark, same supplier, same created_at to the microsecond. That is
--  one bulk insert that ran ninety-five times. Life of Seedlings added
--  them up and showed 997,500 seeds received against 9,920 planted.
--
--  ── What this deletes, and what it will not touch ──
--
--  Only rows that are COPIES. Two rows count as copies when every
--  column matches except the id, the created_at and the last-edited
--  stamps — built from the whole row rather than from a list of
--  columns, so a column added later is compared too instead of being
--  quietly ignored. The newest is kept (created_at, then the highest
--  id, which is how the Seeds In form and the batch list already pick
--  the one they show, so the figure on screen does not move).
--
--  A batch whose rows genuinely DIFFER is left exactly as it is. Which
--  of two different deliveries is the real one is not a thing SQL can
--  decide, and guessing would delete the wrong one. Those batches are
--  named in the result so somebody can look at them with
--  CHECK_duplicate_seeds_in_rows.sql.
--
--  Nothing else reads these rows in a way this changes: the Seeds In
--  form, the batch list and Life of Seedlings all show the newest row,
--  which is the one being kept, and shared_plot_batch_balance does not
--  count Seeds_Received at all.
--
--  Run CHECK_duplicate_seeds_in.sql first if you want to see the size
--  of it before anything is removed.
--
--  ── WHAT A GOOD RESULT LOOKS LIKE ──
--
--  One row.
--
--    rows_deleted      how many copies went. On the second run, 0.
--    batches_repaired  how many batches they came off.
--    batches_left      batches that still carry more than one row
--                      because their rows differ. Should be 0. If it is
--                      not, batches_left_names lists them and they need
--                      a person, not this file.
-- =====================================================================
-- Dropped first: the SQL Editor reuses a connection, so a second run
-- would otherwise stop on "relation already exists" and the file would
-- not be safe to run twice after all.
DROP TABLE IF EXISTS _seeds_in_dupes;

CREATE TEMP TABLE _seeds_in_dupes AS
WITH sr AS (
  SELECT l.id,
         l.batch_name,
         l.created_at,
         (to_jsonb(l) - 'id' - 'created_at' - 'last_edited_at' - 'last_edited_by')::text AS fingerprint
  FROM shared_inventory_logs l
  WHERE l.transaction_type = 'Seeds_Received'
    AND COALESCE(btrim(l.batch_name), '') <> ''
),
copies_only AS (
  -- Batches with more than one row where every row is the same row.
  SELECT batch_name
  FROM sr
  GROUP BY batch_name
  HAVING count(*) > 1 AND count(DISTINCT fingerprint) = 1
)
SELECT sr.id, sr.batch_name
FROM sr
JOIN copies_only c ON c.batch_name = sr.batch_name
WHERE sr.id <> (
  SELECT k.id FROM sr k
  WHERE k.batch_name = sr.batch_name
  ORDER BY k.created_at DESC, k.id DESC
  LIMIT 1
);

DELETE FROM shared_inventory_logs l
USING _seeds_in_dupes d
WHERE l.id = d.id;

SELECT (SELECT count(*) FROM _seeds_in_dupes)                      AS rows_deleted,
       (SELECT count(DISTINCT batch_name) FROM _seeds_in_dupes)    AS batches_repaired,
       left_over.batches                                           AS batches_left,
       left_over.names                                             AS batches_left_names
FROM (
  SELECT count(*)                                                  AS batches,
         COALESCE(string_agg(batch_name, ', ' ORDER BY batch_name), '') AS names
  FROM (
    SELECT batch_name
    FROM shared_inventory_logs
    WHERE transaction_type = 'Seeds_Received'
      AND COALESCE(btrim(batch_name), '') <> ''
    GROUP BY batch_name
    HAVING count(*) > 1
  ) q
) left_over;
