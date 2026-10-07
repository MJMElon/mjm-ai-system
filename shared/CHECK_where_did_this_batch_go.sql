-- ════════════════════════════════════════════════════════════════════════
-- EVERY PLOT A TROUBLED BATCH TOUCHES
--
-- A plot reading negative usually means the batchs intake was filed
-- somewhere its outgoings were not. This takes every batch that is
-- negative in ANY plot and lays out EVERY plot that batch appears in,
-- so the missing intake can be seen rather than guessed at.
--
-- IT READS THE LEDGER, NOT THE BALANCE VIEW. The view drops any plot and
-- batch that nets to exactly zero, so a plot holding the missing intake
-- can be absent from it entirely — which is how an earlier check of this
-- came back with no rows at all and looked like an answer.
--
-- The last row of each batch is its TOTAL across every plot. That is the
-- figure to read first: a batch whose total is sensible and positive has
-- its seedlings filed against the wrong plots, and is a matter of moving
-- rows. A batch whose TOTAL is negative has been culled or sold more than
-- it ever had, and is a matter of the records themselves.
--
-- Reads only.
-- ════════════════════════════════════════════════════════════════════════
WITH bad AS (
  SELECT DISTINCT batch_key FROM shared_plot_batch_balance WHERE qty < 0
),
ledger AS (
  SELECT mjm_plot_key(plot_name) AS pk, mjm_batch_key(batch_name) AS bk,
         btrim(plot_name) AS plot, btrim(batch_name) AS batch,
         CASE WHEN transaction_type IN ('Seeds_Received','Planted','Transplanted',
                                        'Transplanted_Premium','Transplanted_DoubleTone')
              THEN abs(coalesce(quantity_change,0)) ELSE 0 END AS came_in,
         CASE WHEN transaction_type IN ('Damaged_Seeds','1st_Culling','3rd_Culling')
              THEN abs(coalesce(quantity_change,0)) ELSE 0 END AS went_out,
         0 AS moved_in, 0 AS moved_out, 0::numeric AS calib
  FROM   shared_inventory_logs
  WHERE  transaction_type IN ('Seeds_Received','Planted','Transplanted',
                              'Transplanted_Premium','Transplanted_DoubleTone',
                              'Damaged_Seeds','1st_Culling','3rd_Culling')
  UNION ALL
  -- The 2nd culling only where no 3rd has replaced it, same as the view.
  SELECT mjm_plot_key(c.plot_name), mjm_batch_key(c.batch_name),
         btrim(c.plot_name), btrim(c.batch_name), 0,
         abs(coalesce(c.quantity_change,0)), 0, 0, 0
  FROM   shared_inventory_logs c
  WHERE  c.transaction_type = '2nd_Culling'
    AND  NOT EXISTS (SELECT 1 FROM shared_inventory_logs t
                     WHERE t.transaction_type = '3rd_Culling'
                       AND mjm_plot_key(t.plot_name)   = mjm_plot_key(c.plot_name)
                       AND mjm_batch_key(t.batch_name) = mjm_batch_key(c.batch_name))
  UNION ALL
  SELECT mjm_plot_key(plot_name), mjm_batch_key(batch_name),
         btrim(plot_name), btrim(batch_name), 0, 0,
         abs(coalesce(quantity_change,0)), 0, 0
  FROM   shared_inventory_logs WHERE transaction_type = 'Cull3_Transfer'
  UNION ALL
  SELECT mjm_plot_key(s.src), mjm_batch_key(l.batch_name),
         btrim(s.src), btrim(l.batch_name), 0, 0, 0,
         abs(coalesce(l.quantity_change,0)), 0
  FROM   shared_inventory_logs l
  CROSS  JOIN LATERAL (SELECT (regexp_match(l.remark,'From:\s*\[([^\]|]+)\|'))[1] AS src) s
  WHERE  l.transaction_type = 'Cull3_Transfer' AND s.src IS NOT NULL
  UNION ALL
  SELECT mjm_plot_key(plot_name), mjm_batch_key(batch_name),
         btrim(plot_name), btrim(batch_name), 0, 0, 0, 0, coalesce(quantity_change,0)
  FROM   shared_inventory_logs
  WHERE  transaction_type = 'Stock_Calibration'
    AND  coalesce(remark,'') ~ '\[APPROVED by [^\]]+ on [^\]]+\]'
),
dos AS (
  SELECT mjm_plot_key(v.p) AS pk, mjm_batch_key(v.b) AS bk, sum(v.q) AS sold
  FROM   shared_do_records d
  CROSS  JOIN LATERAL (VALUES (d.plot_1,d.qty_1,d.batch_1),(d.plot_2,d.qty_2,d.batch_2),
                              (d.plot_3,d.qty_3,d.batch_3),(d.plot_4,d.qty_4,d.batch_4),
                              (d.plot_5,d.qty_5,d.batch_5)) AS v(p,q,b)
  WHERE  coalesce(d.status,'') <> 'Cancelled'
    AND  coalesce(d.remark,'') NOT LIKE '%[CANCELLED]%' AND coalesce(v.q,0) <> 0
  GROUP  BY 1,2
),
per AS (
  SELECT l.bk, l.pk,
         (array_agg(l.batch ORDER BY l.plot))[1] AS batch,
         (array_agg(l.plot  ORDER BY l.plot))[1] AS plot,
         sum(l.came_in) AS came_in, sum(l.went_out) AS culled,
         sum(l.moved_in) AS moved_in, sum(l.moved_out) AS moved_out,
         sum(l.calib) AS calib
  FROM   ledger l JOIN bad ON bad.batch_key = l.bk
  WHERE  l.pk <> '' AND l.bk <> ''
  GROUP  BY 1,2
),
j AS (
  SELECT p.bk, p.batch, p.plot, p.came_in, p.culled, p.moved_in, p.moved_out,
         p.calib, coalesce(d.sold,0) AS sold,
         p.came_in + p.moved_in - p.culled - p.moved_out + p.calib - coalesce(d.sold,0) AS balance
  FROM   per p LEFT JOIN dos d ON d.pk = p.pk AND d.bk = p.bk
)
SELECT batch, plot, came_in, moved_in, culled, moved_out, calibration, sold, balance
FROM (
  SELECT batch, plot, came_in, moved_in, culled, moved_out, calib AS calibration,
         sold, balance, 0 AS is_total
  FROM   j
  UNION ALL
  SELECT batch, '>> BATCH TOTAL, EVERY PLOT', sum(came_in), sum(moved_in), sum(culled),
         sum(moved_out), sum(calib), sum(sold), sum(balance), 1
  FROM   j GROUP BY batch
) z
ORDER BY batch, is_total, plot;
