-- =====================================================================
--  TRAY STATUS — EVERY TRAY AT ONCE
--  Paste into the Supabase SQL Editor and press Run. Read-only: it
--  changes nothing, so it is safe to run as often as you like.
--
--  The batch list's Tray Status tab answers "how many holes are free in
--  this tray, and whose seedlings are in the rest". This asks the
--  database the same question with the same arithmetic, so the screen
--  can be checked against the table behind it rather than trusted.
--
--  THE RULE (shared/shared_tray_stock.js — change one, change the other)
--
--  A tray holds no more than the batch still has standing:
--
--      standing = everything that entered that batch's trays
--               − everything that left its pre-nursery
--
--  Planted and Transplanted_Premium / _DoubleTone put seedlings INTO a
--  tray. 1st Culling and every transplant take them OUT. The remark says
--  WHICH tray a transplant came from ("tray [P6]"), and where it does
--  not, the seedlings are gone all the same — so the shortfall still
--  comes off that batch's trays, largest first.
--
--  That is the fix for trays P4–P7 on batch 227: the field emptied them
--  in May 2025, and they read as occupied for a year because the only
--  thing that could empty a tray was a remark worded the way today's
--  save words it.
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
  SELECT l.batch_name, TRIM(l.plot_name) AS tray, ABS(COALESCE(l.quantity_change, 0)) AS qty
  FROM shared_inventory_logs l
  WHERE l.transaction_type = 'Planted'
),
cull1 AS (
  SELECT l.batch_name, TRIM(l.plot_name) AS tray, ABS(COALESCE(l.quantity_change, 0)) AS qty
  FROM shared_inventory_logs l
  WHERE l.transaction_type = '1st_Culling'
),
moved AS (
  SELECT l.batch_name,
         TRIM(l.plot_name)                                                  AS dest,
         -- The same loose pattern the batch report's Source Tray column
         -- reads. Asking for the exact phrase today's save writes is what
         -- left the older rows unable to give their tray back.
         NULLIF(TRIM((REGEXP_MATCH(COALESCE(l.remark, ''),
                'tray \[([^\]]+)\]', 'i'))[1]), '')                         AS src,
         ABS(COALESCE(l.quantity_change, 0))                                AS qty
  FROM shared_inventory_logs l
  WHERE l.transaction_type IN ('Transplanted', 'Transplanted_Premium', 'Transplanted_DoubleTone')
),

/* What each batch still has standing in pre-nursery, wording aside. */
ins AS (
  SELECT batch_name, SUM(qty) AS qty FROM (
    SELECT p.batch_name, p.qty FROM planted p JOIN trays t ON t.tray_name = p.tray
    UNION ALL
    SELECT m.batch_name, m.qty FROM moved m JOIN trays t ON t.tray_name = m.dest
  ) x GROUP BY 1
),
outs AS (
  SELECT batch_name, SUM(qty) AS qty FROM (
    SELECT batch_name, qty FROM cull1
    UNION ALL
    SELECT batch_name, qty FROM moved
  ) y GROUP BY 1
),
standing AS (
  SELECT COALESCE(i.batch_name, o.batch_name)                       AS batch_name,
         GREATEST(0, COALESCE(i.qty, 0) - COALESCE(o.qty, 0))       AS qty
  FROM ins i FULL JOIN outs o ON o.batch_name = i.batch_name
),

/* And where it is standing, as far as the remarks can say. */
net AS (
  SELECT f.tray, f.batch_name, SUM(f.delta) AS qty
  FROM (
    SELECT batch_name, tray, qty  AS delta FROM planted
    UNION ALL
    SELECT batch_name, tray, -qty          FROM cull1
    UNION ALL
    SELECT batch_name, src,  -qty          FROM moved WHERE src IS NOT NULL
    UNION ALL
    SELECT batch_name, dest, qty           FROM moved
  ) f
  JOIN trays t ON t.tray_name = f.tray      -- only real trays; plots drop out here
  GROUP BY 1, 2
  HAVING SUM(f.delta) > 0
),

/* Where the two disagree, the batch's own total wins and the difference
   comes off its biggest tray first — the same order the page takes it in,
   so the two answers are the same answer. */
ranked AS (
  SELECT n.tray, n.batch_name, n.qty,
         SUM(n.qty) OVER (PARTITION BY n.batch_name)                                 AS batch_net,
         COALESCE(SUM(n.qty) OVER (PARTITION BY n.batch_name
                                   ORDER BY n.qty DESC, n.tray
                                   ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS bigger_trays
  FROM net n
),
allotted AS (
  SELECT r.tray, r.batch_name,
         r.qty - LEAST(GREATEST(r.batch_net - COALESCE(s.qty, 0) - r.bigger_trays, 0), r.qty) AS qty
  FROM ranked r
  LEFT JOIN standing s ON s.batch_name = r.batch_name
),

filled AS (
  SELECT t.tray_name,
         t.nursery_name,
         t.capacity,
         LEAST(t.capacity, COALESCE(SUM(a.qty), 0)) AS occupied,
         STRING_AGG(a.batch_name || ' (' || a.qty || ')', ', ' ORDER BY a.qty DESC) AS held_by
  FROM trays t
  LEFT JOIN allotted a ON a.tray = t.tray_name AND a.qty > 0
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
--   A tray whose batch has moved everything to the field reads "empty —
--   ready to plant" with nobody named, however long ago that was and
--   however the transplant's remark was worded.
--
--   occupied_by names every batch with seedlings still standing in the
--   tray and how many each has. A tray listing two batches is not a
--   fault: two batches can share a tray, and the tab says so too.
--
--   If a tray still reads occupied and the field says it is empty, the
--   batch named beside it has seedlings unaccounted for somewhere else:
--   its Transplanting report is short of what was actually moved out, or
--   its 1st Culling was never keyed. Open that batch and the figures will
--   not add up either — which is the real thing to fix.
