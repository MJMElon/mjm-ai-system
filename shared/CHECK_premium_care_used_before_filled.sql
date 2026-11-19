-- CHECK: transplants out of PREMIUM CARE with no fill into PREMIUM CARE first
--
-- Every batch, every saved Transplanting row whose source tray is PREMIUM
-- CARE, where the batch has NO move from a pre-nursery tray into PREMIUM CARE
-- on or before that day. These are the old rows the new save rule leaves
-- alone, so nothing on the screen flags them.
--
-- The day of a row is its transaction_date, else the Date in its remark,
-- else the day it was saved (created_at), the same order the report uses.
--
-- What a good result looks like:
--   row 0 says how many rows were checked and how many are listed below
--   one row per transplant that needs a look, with the batch, the plot, the
--     day, the qty, and why: NO FILL AT ALL, or FIRST FILL IS LATER (with the
--     day of that first fill)
--   if nothing is wrong, a single line saying nothing to report
-- Running it changes nothing.

WITH logs AS (
  SELECT l.id, l.batch_name, l.plot_name, l.transaction_type, l.quantity_change AS qty, l.remark,
         upper(trim(split_part(split_part(coalesce(l.remark, ''), 'from tray [', 2), ']', 1))) AS src,
         coalesce(
           l.transaction_date::date,
           CASE WHEN left(split_part(coalesce(l.remark, ''), 'Date: ', 2), 10) LIKE '____-__-__'
                THEN left(split_part(l.remark, 'Date: ', 2), 10)::date END,
           l.created_at::date
         ) AS day
  FROM shared_inventory_logs l
  WHERE l.transaction_type IN ('Transplanted', 'Transplanted_Premium')
),
fills AS (
  SELECT batch_name, day, qty FROM logs
  WHERE transaction_type = 'Transplanted_Premium' AND src <> '' AND src <> 'PREMIUM CARE'
),
outs AS (
  SELECT * FROM logs WHERE transaction_type = 'Transplanted' AND src = 'PREMIUM CARE'
),
judged AS (
  SELECT o.batch_name, o.plot_name, o.day, o.qty,
         (SELECT min(f.day) FROM fills f WHERE f.batch_name = o.batch_name) AS first_fill,
         (SELECT coalesce(sum(f.qty), 0) FROM fills f WHERE f.batch_name = o.batch_name AND f.day <= o.day) AS filled_by_then
  FROM outs o
),
bad AS (
  SELECT * FROM judged WHERE filled_by_then = 0
)
SELECT 0 AS n, 'SUMMARY' AS batch, '' AS plot, '' AS day, NULL::numeric AS qty,
       (SELECT count(*) FROM outs)::text || ' transplants out of PREMIUM CARE checked, '
       || (SELECT count(*) FROM bad)::text || ' have no fill into PREMIUM CARE on or before their day' AS what
UNION ALL
SELECT 1, '-', '', '', NULL, 'nothing to report: every transplant out of PREMIUM CARE has a fill first'
WHERE NOT EXISTS (SELECT 1 FROM bad)
UNION ALL
SELECT 2, b.batch_name, coalesce(b.plot_name, ''), b.day::text, b.qty::numeric,
       CASE WHEN b.first_fill IS NULL THEN 'NO FILL AT ALL into PREMIUM CARE for this batch'
            ELSE 'FIRST FILL IS LATER: first move into PREMIUM CARE is ' || b.first_fill::text END
FROM bad b
ORDER BY 1, 2, 4, 3;
