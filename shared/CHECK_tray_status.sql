-- =====================================================================
--  TRAY STATUS — EVERY TRAY AT ONCE
--  Paste into the Supabase SQL Editor and press Run. Read-only: it
--  changes nothing, so it is safe to run as often as you like.
--
--  The batch list's new Tray Status tab answers "how many holes are free
--  in this tray, and whose seedlings are in the rest". This asks the
--  database the same question with the same arithmetic, so the screen
--  can be checked against the table behind it rather than trusted.
--
--  THE RULE (shared/shared_tray_stock.js — change one, change the other)
--    Planted        plot_name IS the tray            -> in
--    1st_Culling    plot_name IS the tray            -> out
--    Transplanted*  remark says "from tray [X]"      -> out of X, and
--                   plot_name is where they went, which for Premium Care
--                   and Double-Tone is itself a tray -> in
--  A batch that has emptied its pre-nursery altogether (planted less
--  transplanted less 1st culling at or below nought) holds no tray at
--  all, whatever the per-tray sums come to — that is the safety net for
--  movements logged before the source tray was written into the remark.
-- =====================================================================
WITH

trays AS (
  SELECT t.tray_name,
         COALESCE(t.nursery_name, '') AS nursery_name,
         -- A tray with no size keeps the 2,560 every tray was assumed to
         -- hold before that field existed.
         CASE WHEN COALESCE(t.total_vacant, 0) > 0 THEN t.total_vacant ELSE 2560 END AS capacity
  FROM operation_trays t
  WHERE COALESCE(TRIM(t.tray_name), '') <> ''
),

planted AS (
  SELECT batch_name, TRIM(plot_name) AS tray, ABS(COALESCE(quantity_change, 0)) AS qty
  FROM shared_inventory_logs
  WHERE transaction_type = 'Planted'
),
cull1 AS (
  SELECT batch_name, TRIM(plot_name) AS tray, ABS(COALESCE(quantity_change, 0)) AS qty
  FROM shared_inventory_logs
  WHERE transaction_type = '1st_Culling'
),
moved AS (
  SELECT batch_name,
         TRIM(plot_name)                                                   AS dest,
         NULLIF(TRIM((REGEXP_MATCH(COALESCE(remark, ''),
                'from tray \[([^\]]+)\]', 'i'))[1]), '')                   AS src,
         ABS(COALESCE(quantity_change, 0))                                 AS qty
  FROM shared_inventory_logs
  WHERE transaction_type IN ('Transplanted', 'Transplanted_Premium', 'Transplanted_DoubleTone')
),

/* Which batches have finished with their pre-nursery entirely. */
per_batch AS (
  SELECT b.batch_name,
         COALESCE(SUM(p.qty), 0) AS planted_qty,
         COALESCE(MAX(m.moved_qty), 0) AS moved_qty,
         COALESCE(MAX(c.cull_qty), 0)  AS cull_qty
  FROM (SELECT DISTINCT batch_name FROM planted) b
  LEFT JOIN planted p ON p.batch_name = b.batch_name
  LEFT JOIN (SELECT batch_name, SUM(qty) AS moved_qty FROM moved GROUP BY 1) m ON m.batch_name = b.batch_name
  LEFT JOIN (SELECT batch_name, SUM(qty) AS cull_qty  FROM cull1 GROUP BY 1) c ON c.batch_name = b.batch_name
  GROUP BY 1
),
emptied AS (
  SELECT batch_name
  FROM per_batch
  WHERE planted_qty > 0 AND planted_qty - moved_qty - cull_qty <= 0
),

/* In and out, tray by tray AND batch by batch. */
flows AS (
  SELECT batch_name, tray, qty            AS delta FROM planted
  UNION ALL
  SELECT batch_name, tray, -qty           FROM cull1
  UNION ALL
  SELECT batch_name, src,  -qty           FROM moved WHERE src IS NOT NULL
  UNION ALL
  SELECT batch_name, dest, qty            FROM moved
),
live AS (
  SELECT f.tray, f.batch_name, SUM(f.delta) AS net
  FROM flows f
  JOIN trays t ON t.tray_name = f.tray          -- only real trays; plots drop out here
  WHERE f.batch_name NOT IN (SELECT batch_name FROM emptied)
  GROUP BY 1, 2
  HAVING SUM(f.delta) > 0
),

filled AS (
  SELECT t.tray_name,
         t.nursery_name,
         t.capacity,
         LEAST(t.capacity, COALESCE(SUM(l.net), 0)) AS occupied,
         STRING_AGG(l.batch_name || ' (' || l.net || ')', ', ' ORDER BY l.net DESC) AS held_by
  FROM trays t
  LEFT JOIN live l ON l.tray = t.tray_name
  GROUP BY 1, 2, 3
)

/* ONE result set — the SQL Editor only shows the last statement's.
   The trays with no room left sort to the top. */
SELECT tray_name                                   AS tray,
       nursery_name                                AS nursery,
       capacity                                    AS total_holes,
       occupied,
       capacity - occupied                         AS vacant,
       COALESCE(held_by, '')                       AS occupied_by,
       ROUND(100.0 * occupied / NULLIF(capacity, 0))::INT AS pct_used,
       CASE
         WHEN occupied <= 0            THEN 'empty — ready to plant'
         WHEN occupied >= capacity     THEN 'FULL — nothing can be planted into it'
         ELSE (capacity - occupied) || ' free'
       END                                         AS status
FROM filled
ORDER BY (capacity - occupied) ASC, nursery_name, tray_name;

-- WHAT A GOOD RESULT LOOKS LIKE
--   One row per tray in Settings, and the figures match the Tray Status
--   tab on the batch list exactly — tray for tray, number for number.
--   That is the whole point of running it.
--
--   occupied_by names every live batch with seedlings in the tray and how
--   many each has. A tray listing two batches is not a fault: two batches
--   can share a tray, and the tab says so too.
--
--   A tray reading FULL with nothing planted in it lately is worth a
--   look: it means seedlings left it without the movement saying which
--   tray they came from, so the holes never came back. Those movements
--   are the ones saved before "from tray [X]" was written into the
--   remark — re-saving that transplant row on the batch report fixes it.
