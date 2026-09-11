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
  UNION
  /* …and every plot seedlings were TRANSFERRED INTO. A "-R" plot is culled
     on the P-R Culling tab like any other, so it has to be covered too. */
  SELECT DISTINCT UPPER(TRIM(l.plot_name))
  FROM shared_inventory_logs l, params p
  WHERE l.batch_name = p.batch
    AND l.transaction_type = 'Cull3_Transfer'
    AND COALESCE(TRIM(l.plot_name), '') <> ''
),

/* What each plot's 3rd Culling record actually carries.

   A plot is finished when NOTHING IS LEFT STANDING IN IT:

       3rd culled  -  drone map qty  =  0

   N18-R had 131 to cull and the drone map counted 131: 131 - 131 = 0, done.
   A plot all sold out has nothing to cull: 0 - 0 = 0, done, with no map to
   attach. A missing map quantity counts as 0, so 500 to cull and no map is
   500 short and holds the batch in Active. */
actual AS (
  SELECT UPPER(TRIM(l.plot_name)) AS plot,
         SUM(COALESCE(l.quantity_change, 0))                                 AS culled,
         SUM(COALESCE((SUBSTRING(l.remark FROM 'MapQty:\s*([0-9]+)'))::INT, 0)) AS map_qty,
         BOOL_OR(l.remark ~ 'Remaining Balance:\s*0(\D|$)')                  AS says_nil,
         BOOL_OR(l.remark ~ 'CullDate:\s*[0-9]{4}-[0-9]{2}-[0-9]{2}')        AS has_cull_date,
         BOOL_OR(l.remark ~ 'DocUrl:\S+')                                    AS has_map_file,
         COUNT(*)                                                            AS records
  FROM shared_inventory_logs l, params p
  WHERE l.batch_name = p.batch AND l.transaction_type = '3rd_Culling'
  GROUP BY 1
),

verdict AS (
  SELECT e.plot,
         COALESCE(a.records, 0) AS records,
         COALESCE(a.culled, 0)  AS culled,
         COALESCE(a.map_qty, 0) AS map_qty,
         COALESCE(a.culled, 0) - COALESCE(a.map_qty, 0) AS still_standing,
         COALESCE(a.has_cull_date, FALSE) AS has_cull_date,
         COALESCE(a.has_map_file, FALSE)  AS has_map_file,
         COALESCE(a.says_nil, FALSE) AS says_nil,
         /* A nought has to be a REAL nought: a row that says nothing at all
            also comes to zero. A saved record carries its arithmetic, so
            "Remaining Balance: 0" is what tells a sold-out plot from one
            nobody has touched. */
         (COALESCE(a.records, 0) > 0
          AND COALESCE(a.culled, 0) - COALESCE(a.map_qty, 0) = 0
          AND (COALESCE(a.culled, 0) > 0 OR COALESCE(a.says_nil, FALSE))) AS done
  FROM expected e LEFT JOIN actual a ON a.plot = e.plot
)

/* ONE result set — the SQL Editor only shows the last statement's. The
   summary sorts first, then the plots that are blocking, then the rest. */
SELECT * FROM (
  SELECT 0 AS sort_order,
         '-- SUMMARY --'::TEXT AS plot,
         (SELECT batch FROM params) AS batch,
         CASE WHEN (SELECT COUNT(*) FROM verdict WHERE NOT done) = 0
              THEN 'COMPLETED: nothing left standing in any plot'
              ELSE 'NOT COMPLETED: ' || (SELECT COUNT(*) FROM verdict WHERE NOT done)
                   || ' of ' || (SELECT COUNT(*) FROM verdict) || ' plot(s) still carry a balance'
         END AS status,
         NULL::BIGINT AS culled, NULL::BIGINT AS map_qty, NULL::BIGINT AS still_standing,
         NULL::BOOLEAN AS has_cull_date, NULL::BOOLEAN AS has_map_file
  UNION ALL
  SELECT CASE WHEN done THEN 2 ELSE 1 END,
         v.plot,
         (SELECT batch FROM params),
         CASE WHEN v.records = 0 THEN 'BLOCKING - no 3rd Culling record at all'
              WHEN v.done AND v.culled = 0 THEN 'done - nothing left to cull'
              WHEN v.done THEN 'done - the drone map accounts for the cull'
              WHEN v.culled = 0 AND NOT v.says_nil
                   THEN 'BLOCKING - the record says nothing: no figures saved for this plot yet'
              WHEN v.map_qty = 0 THEN 'BLOCKING - ' || v.culled || ' to cull, no drone map qty keyed'
              ELSE 'BLOCKING - ' || v.still_standing || ' still standing ('
                   || v.culled || ' culled less ' || v.map_qty || ' on the map)'
         END,
         v.culled, v.map_qty, v.still_standing, v.has_cull_date, v.has_map_file
  FROM verdict v
) x
ORDER BY sort_order, plot;

-- WHAT A GOOD RESULT LOOKS LIKE
--   Row 1 reads "COMPLETED: nothing left standing in any plot", and every
--   plot below it says "done".
--
--   Anything marked BLOCKING is why the batch is still in Active, and the
--   text says how many seedlings that plot is short. Open the batch ->
--   3rd Culling -> find that plot -> key the drone map quantity, then press
--   Save 3rd Culling Report.
--
--   has_cull_date and has_map_file are shown for information only. Neither is
--   required for a batch to be Completed; the balance is.
