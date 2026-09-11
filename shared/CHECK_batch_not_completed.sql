-- =====================================================================
--  WHY IS THIS BATCH NOT IN "COMPLETED"?
--  Paste into the Supabase SQL Editor and press Run. Read-only: it
--  changes nothing, so it is safe to run as often as you like.
--
--  Change the batch number on the next line if you want a different one.
-- =====================================================================
WITH params AS (SELECT '225'::TEXT AS batch),

/* What the batch list expects to be covered: every plot the batch was
   transplanted INTO. Premium Care is skipped — it is a holding tray, never
   3rd-culled, and the list skips it too. */
expected AS (
  SELECT DISTINCT UPPER(TRIM(l.plot_name)) AS plot
  FROM shared_inventory_logs l, params p
  WHERE l.batch_name = p.batch
    AND l.transaction_type IN ('Transplanted', 'Transplanted_DoubleTone')
    AND COALESCE(TRIM(l.plot_name), '') <> ''
),

/* What each plot's 3rd Culling record actually carries. A plot counts as
   done when its record has BOTH a drone-map quantity and a culled date —
   the same two things the 3rd Culling tab asks for. */
actual AS (
  SELECT UPPER(TRIM(l.plot_name)) AS plot,
         BOOL_OR(l.remark ~ 'MapQty:\s*[0-9]+')                  AS has_map_qty,
         BOOL_OR(l.remark ~ 'CullDate:\s*[0-9]{4}-[0-9]{2}-[0-9]{2}') AS has_cull_date,
         BOOL_OR(l.remark ~ 'DocUrl:\S+')                        AS has_map_file,
         COUNT(*)                                                AS records
  FROM shared_inventory_logs l, params p
  WHERE l.batch_name = p.batch AND l.transaction_type = '3rd_Culling'
  GROUP BY 1
),

verdict AS (
  SELECT e.plot,
         COALESCE(a.records, 0)       AS records,
         COALESCE(a.has_map_qty, FALSE)   AS has_map_qty,
         COALESCE(a.has_cull_date, FALSE) AS has_cull_date,
         COALESCE(a.has_map_file, FALSE)  AS has_map_file,
         (COALESCE(a.has_map_qty, FALSE) AND COALESCE(a.has_cull_date, FALSE)) AS done
  FROM expected e LEFT JOIN actual a ON a.plot = e.plot
)

/* ONE result set — the SQL Editor only shows the last statement's. The
   summary sorts first, then the plots that are blocking, then the rest. */
SELECT * FROM (
  SELECT 0 AS sort_order,
         '— SUMMARY —'::TEXT AS plot,
         (SELECT batch FROM params) AS batch,
         CASE WHEN (SELECT COUNT(*) FROM verdict WHERE NOT done) = 0
              THEN 'COMPLETED: every plot has a map qty and a culled date'
              ELSE 'NOT COMPLETED: ' || (SELECT COUNT(*) FROM verdict WHERE NOT done)
                   || ' of ' || (SELECT COUNT(*) FROM verdict) || ' plot(s) still missing something'
         END AS status,
         NULL::BIGINT AS records, NULL::BOOLEAN AS has_map_qty,
         NULL::BOOLEAN AS has_cull_date, NULL::BOOLEAN AS has_map_file
  UNION ALL
  SELECT CASE WHEN done THEN 2 ELSE 1 END,
         v.plot,
         (SELECT batch FROM params),
         CASE WHEN v.records = 0        THEN 'BLOCKING — no 3rd Culling record at all'
              WHEN NOT v.has_map_qty
               AND NOT v.has_cull_date  THEN 'BLOCKING — no drone map qty and no culled date'
              WHEN NOT v.has_map_qty    THEN 'BLOCKING — drone map qty not keyed in'
              WHEN NOT v.has_cull_date  THEN 'BLOCKING — culled date not keyed in'
              ELSE 'done'
         END,
         v.records, v.has_map_qty, v.has_cull_date, v.has_map_file
  FROM verdict v
) x
ORDER BY sort_order, plot;

-- WHAT A GOOD RESULT LOOKS LIKE
--   Row 1 reads "COMPLETED: every plot has a map qty and a culled date",
--   and every plot below it says "done".
--
--   Anything marked BLOCKING is why the batch is still in Active. Open that
--   batch → 3rd Culling → find that plot → fill in what the row names, then
--   press Save 3rd Culling Report.
--
--   has_map_file is shown for information only. An attached photograph is
--   NOT required for a batch to be Completed.
