-- =====================================================================
WITH sr AS (
  SELECT l.id,
         l.batch_name,
         l.created_at,
         -- Everything about the row EXCEPT what may legitimately differ
         -- between two copies of it. Built from the whole row rather than
         -- from a list of columns, so a column added later is compared
         -- too instead of being quietly ignored.
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
),
differ AS (
  -- And the ones this file deliberately will not touch. Counted from the
  -- same snapshot the DELETE runs against, which is sound precisely
  -- because these are the rows it does not delete: what they are before
  -- is what they are after.
  SELECT batch_name
  FROM sr
  GROUP BY batch_name
  HAVING count(*) > 1 AND count(DISTINCT fingerprint) > 1
),
keep AS (
  -- The one row that stays, per batch: the newest, which is the row the
  -- Seeds In form and the batch list already show, so no figure moves.
  SELECT DISTINCT ON (batch_name) batch_name, id
  FROM sr
  ORDER BY batch_name, created_at DESC, id DESC
),
doomed AS (
  SELECT sr.id
  FROM sr
  JOIN copies_only c ON c.batch_name = sr.batch_name
  JOIN keep k        ON k.batch_name = sr.batch_name
  WHERE sr.id <> k.id
),
gone AS (
  DELETE FROM shared_inventory_logs l
  USING doomed d
  WHERE l.id = d.id
  RETURNING l.batch_name
)
SELECT (SELECT count(*) FROM gone)                   AS rows_deleted,
       (SELECT count(DISTINCT batch_name) FROM gone) AS batches_repaired,
       (SELECT count(*) FROM differ)                 AS batches_left,
       (SELECT COALESCE(string_agg(batch_name, ', ' ORDER BY batch_name), '')
          FROM differ)                               AS batches_left_names;
