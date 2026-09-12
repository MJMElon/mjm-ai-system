-- =====================================================================
--  WHERE A BATCH'S CULLING RATE COMES FROM
--  Paste into the Supabase SQL Editor and press Run. Read-only.
--
--      culling rate = (1st culled + 3rd culled) / (transplanted + 1st culled)
--      survival     = 100 - culling rate
--
--  The 2nd cull is NOT added: a plot's 3rd culled figure is worked out as
--  "2nd culled + balance", so the second cull is already inside it and
--  adding it again would count those seedlings twice. It is printed below
--  for reference, as are the damaged seeds, which are not culling.
--
--  "Transplanted" means what reached a PLOT. The step that fills the D-Tone
--  tray is not counted; those seedlings leave it later as ordinary
--  transplants and would otherwise be counted twice.
--
--  Change the batch on the next line for a different one.
-- =====================================================================
WITH params AS (SELECT '225'::TEXT AS batch),
sums AS (
  SELECT
    SUM(ABS(COALESCE(quantity_change,0))) FILTER (WHERE transaction_type = 'Planted')       AS planted,
    SUM(ABS(COALESCE(quantity_change,0))) FILTER (WHERE transaction_type = 'Transplanted')  AS transplanted,
    SUM(ABS(COALESCE(quantity_change,0))) FILTER (WHERE transaction_type = 'Damaged_Seeds') AS damaged,
    SUM(ABS(COALESCE(quantity_change,0))) FILTER (WHERE transaction_type = '1st_Culling')   AS cull1,
    SUM(ABS(COALESCE(quantity_change,0))) FILTER (WHERE transaction_type = '2nd_Culling')   AS cull2,
    SUM(ABS(COALESCE(quantity_change,0))) FILTER (WHERE transaction_type = '3rd_Culling')   AS cull3
  FROM shared_inventory_logs l, params p
  WHERE l.batch_name = p.batch
),
calc AS (
  SELECT COALESCE(planted,0) AS planted, COALESCE(transplanted,0) AS transplanted,
         COALESCE(damaged,0) AS damaged, COALESCE(cull1,0) AS cull1,
         COALESCE(cull2,0) AS cull2, COALESCE(cull3,0) AS cull3,
         COALESCE(transplanted,0) + COALESCE(cull1,0) AS base,
         COALESCE(cull1,0) + COALESCE(cull3,0)        AS total_culled
  FROM sums
)
SELECT * FROM (
  SELECT 1 AS n, 'Transplanted (reached a plot)'::TEXT AS line, transplanted AS qty, NULL::NUMERIC AS pct FROM calc
  UNION ALL SELECT 2, '+ 1st culled',              cull1, NULL FROM calc
  UNION ALL SELECT 3, '= BASE (the denominator)',  base,  NULL FROM calc
  UNION ALL SELECT 4, '1st culled',  cull1, ROUND(cull1*100.0/NULLIF(base,0), 2) FROM calc
  UNION ALL SELECT 5, '3rd culled',  cull3, ROUND(cull3*100.0/NULLIF(base,0), 2) FROM calc
  UNION ALL SELECT 6, '= CULLING RATE', total_culled,
                      ROUND(total_culled*100.0/NULLIF(base,0), 2) FROM calc
  UNION ALL SELECT 7, '= SURVIVAL', base - total_culled,
                      ROUND((base-total_culled)*100.0/NULLIF(base,0), 2) FROM calc
  UNION ALL SELECT 8, '(2nd culled - already inside the 3rd, not added again)', cull2, NULL FROM calc
  UNION ALL SELECT 9, '(damaged seeds - not culling)',                        damaged, NULL FROM calc
  UNION ALL SELECT 10,'(planted, for reference)',                             planted, NULL FROM calc
) x ORDER BY n;

-- WHAT A GOOD RESULT LOOKS LIKE
--   Lines 4 and 5 add up to the CULLING RATE, and CULLING RATE + SURVIVAL
--   comes to 100. Those two are the "Culling Rate %" and "Survival %"
--   columns on the batch list.
--
--   For batch 225 the base is 9,889 + 815 = 10,704 and the culls come to
--   2,085, which is 19.48%.
--
--   If a line looks wrong, that names the report to go and check: the
--   transplanted total on Transplanting, and each cull on its own tab.
