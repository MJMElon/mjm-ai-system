-- =====================================================================
--  WHERE A BATCH'S CULLING RATE COMES FROM
--  Paste into the Supabase SQL Editor and press Run. Read-only.
--
--  The office list shows:
--      culling rate = (1st + 2nd + 3rd culled) / (planted + D-Tone nursery) * 100
--      survival     = 100 - culling rate
--
--  Damaged seeds are NOT counted as culled — damage at planting is not
--  culling — but they are printed below so the figure is to hand.
--
--  Change the batch on the next line for a different one.
-- =====================================================================
WITH params AS (SELECT '225'::TEXT AS batch),
sums AS (
  SELECT
    SUM(ABS(COALESCE(quantity_change,0))) FILTER (WHERE transaction_type = 'Planted')       AS planted,
    SUM(ABS(COALESCE(quantity_change,0))) FILTER (WHERE transaction_type = 'Damaged_Seeds') AS damaged,
    SUM(ABS(COALESCE(quantity_change,0))) FILTER (WHERE transaction_type = '1st_Culling')   AS cull1,
    SUM(ABS(COALESCE(quantity_change,0))) FILTER (WHERE transaction_type = '2nd_Culling')   AS cull2,
    SUM(ABS(COALESCE(quantity_change,0))) FILTER (WHERE transaction_type = '3rd_Culling')   AS cull3,
    -- The admin-keyed D-Tone nursery quantity: NEWEST row, not a sum. The box
    -- is keyed and re-keyed and every save writes another row.
    (SELECT ABS(COALESCE(d.quantity_change,0)) FROM shared_inventory_logs d, params p2
      WHERE d.batch_name = p2.batch AND d.transaction_type = 'DTone_Nursery_Qty'
      ORDER BY d.id DESC LIMIT 1)                                                           AS dtone
  FROM shared_inventory_logs l, params p
  WHERE l.batch_name = p.batch
),
calc AS (
  SELECT COALESCE(planted,0) AS planted, COALESCE(damaged,0) AS damaged,
         COALESCE(dtone,0) AS dtone,
         COALESCE(planted,0)+COALESCE(dtone,0) AS base,
         COALESCE(cull1,0) AS cull1, COALESCE(cull2,0) AS cull2, COALESCE(cull3,0) AS cull3,
         COALESCE(cull1,0)+COALESCE(cull2,0)+COALESCE(cull3,0) AS total_culled
  FROM sums
)
SELECT * FROM (
  SELECT 1 AS n, 'Planted'::TEXT                 AS line, planted AS qty, NULL::NUMERIC AS pct FROM calc
  UNION ALL SELECT 2, '+ D-Tone nursery qty',    dtone,   NULL FROM calc
  UNION ALL SELECT 3, '= BASE (the denominator)', base,   NULL FROM calc
  UNION ALL SELECT 4, '1st culled',  cull1, ROUND(cull1*100.0/NULLIF(base,0), 2) FROM calc
  UNION ALL SELECT 5, '2nd culled',  cull2, ROUND(cull2*100.0/NULLIF(base,0), 2) FROM calc
  UNION ALL SELECT 6, '3rd culled',  cull3, ROUND(cull3*100.0/NULLIF(base,0), 2) FROM calc
  UNION ALL SELECT 7, '= CULLING RATE', total_culled,
                      ROUND(total_culled*100.0/NULLIF(base,0), 2) FROM calc
  UNION ALL SELECT 8, '= SURVIVAL', base - total_culled,
                      ROUND((base-total_culled)*100.0/NULLIF(base,0), 2) FROM calc
  UNION ALL SELECT 9, '(damaged seeds, not counted as culled)', damaged, NULL FROM calc
) x ORDER BY n;

-- WHAT A GOOD RESULT LOOKS LIKE
--   The three cull percentages add up to the CULLING RATE, and CULLING RATE
--   + SURVIVAL comes to 100. Those two are the "Culling Rate %" and
--   "Survival %" columns on the batch list.
--
--   For batch 225 the base is 10,423 + 280 = 10,703 and the culls come to
--   2,137, which is 19.97%.
--
--   If one line looks wrong, that names the report to go and check: each cull
--   is keyed on its own tab, and the D-Tone nursery quantity on Transplanting.
