-- =====================================================================
--  WHAT THE SEED AUDIT ROWS ACTUALLY HOLD
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  READ-ONLY. It changes nothing.
--  No regular expressions and no backslashes, so it survives a paste.
--
--  WHY
--  Bags were counted, Save was pressed more than once, and every row came
--  back offering "Count Seeds" again. The app writes the count into the
--  rows remark as "AiCount:250." and reads it back from there, and that
--  round trip has been driven end to end and works -- so the answer is in
--  what is actually stored.
--
--  This lists every seed-audit row on a batch and says, per bag, whether
--  the count is there, whether a photo is, and when the row was written.
--
--  CHANGE THE BATCH ON THE NEXT LINE if it is not 242.
-- =====================================================================
WITH b AS (SELECT '242'::text AS batch)
SELECT
  l.batch_name                                                      AS batch,
  l.plot_name                                                       AS bag_no,
  split_part(split_part(l.remark, 'SupplierQty:', 2), '.', 1)       AS supplier_qty,
  split_part(split_part(l.remark, 'ReceivedQty:', 2), '.', 1)       AS audited_qty,
  CASE WHEN position('AiCount:' in COALESCE(l.remark, '')) > 0
       THEN split_part(split_part(l.remark, 'AiCount:', 2), '.', 1)
       ELSE '-- NO COUNT STORED --' END                             AS ai_count,
  CASE WHEN position('PhotoUrl:' in COALESCE(l.remark, '')) > 0
       THEN 'yes' ELSE 'no' END                                     AS photo_kept,
  l.created_at                                                      AS written_at,
  l.last_edited_by                                                  AS written_by,
  left(l.remark, 200)                                               AS remark
FROM shared_inventory_logs l, b
WHERE l.transaction_type = 'Seed_Audit'
  AND l.batch_name = b.batch
ORDER BY l.created_at, l.plot_name;

-- WHAT TO LOOK FOR
--   ai_count showing a number on every bag  → the counts ARE stored, and
--   the problem is on the way back in. Send the output and say which bags
--   came up blank on screen.
--
--   ai_count saying "-- NO COUNT STORED --"  → the save wrote the bag and
--   the two quantities but not the count, which means the count was not in
--   the pages memory at the moment Save ran. written_at says when that
--   save happened -- compare it with when the counting was done.
--
--   FEWER ROWS THAN BAGS, or bag_no blank → the row was written from a
--   line that had no bag number.
--
--   Note photo_kept is expected to be "no" on a bag that tallies: a count
--   matching both quantities keeps no photo on purpose. It is only kept
--   when the three figures disagree.
