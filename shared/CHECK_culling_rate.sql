-- =====================================================================
--  WHERE A BATCH'S CULLING RATE COMES FROM
--  Paste into the Supabase SQL Editor and press Run. Read-only.
--
--  The office list shows:
--      culling rate = (damaged + 1st + 2nd + 3rd culled) / planted * 100
--      survival     = 100 - culling rate
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
    SUM(ABS(COALESCE(quantity_change,0))) FILTER (WHERE transaction_type = '3rd_Culling')   AS cull3
  FROM shared_inventory_logs l, params p
  WHERE l.batch_name = p.batch
),
calc AS (
  SELECT COALESCE(planted,0) AS planted, COALESCE(damaged,0) AS damaged,
         COALESCE(cull1,0) AS cull1, COALESCE(cull2,0) AS cull2, COALESCE(cull3,0) AS cull3,
         COALESCE(damaged,0)+COALESCE(cull1,0)+COALESCE(cull2,0)+COALESCE(cull3,0) AS total_culled
  FROM sums
)
SELECT * FROM (
  SELECT 1 AS n, 'Planted (the denominator)'::TEXT AS line, planted        AS qty, NULL::NUMERIC AS pct FROM calc
  UNION ALL SELECT 2, 'Damaged seeds',      damaged, ROUND(damaged*100.0/NULLIF(planted,0), 2) FROM calc
  UNION ALL SELECT 3, '1st culled',         cull1,   ROUND(cull1  *100.0/NULLIF(planted,0), 2) FROM calc
  UNION ALL SELECT 4, '2nd culled',         cull2,   ROUND(cull2  *100.0/NULLIF(planted,0), 2) FROM calc
  UNION ALL SELECT 5, '3rd culled',         cull3,   ROUND(cull3  *100.0/NULLIF(planted,0), 2) FROM calc
  UNION ALL SELECT 6, '= TOTAL CULLED',     total_culled,
                      ROUND(total_culled*100.0/NULLIF(planted,0), 2) FROM calc
  UNION ALL SELECT 7, '= SURVIVAL',         planted - total_culled,
                      ROUND((planted-total_culled)*100.0/NULLIF(planted,0), 2) FROM calc
) x ORDER BY n;

-- WHAT A GOOD RESULT LOOKS LIKE
--   The four middle percentages add up to the TOTAL CULLED percentage, and
--   TOTAL CULLED + SURVIVAL comes to 100. The TOTAL CULLED percentage is the
--   "Culling Rate %" on the batch list, and SURVIVAL is the "Survival %".
--
--   If one line looks wrong, that is the report to go and check: damaged
--   seeds are keyed on Planting & Damage, and each cull on its own tab.
