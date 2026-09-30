-- ════════════════════════════════════════════════════════════════════════
-- WHY IS THIS PLOT AND BATCH NEGATIVE
-- One row per negative plot·batch, every movement that made it, so the
-- cause can be read off instead of opened one at a time.
-- Reads only. Changes nothing.
-- ════════════════════════════════════════════════════════════════════════
WITH neg AS (
  SELECT plot_key, batch_key, plot_name, batch_name, qty
  FROM   shared_plot_batch_balance WHERE qty < 0
),
mv AS (
  SELECT mjm_plot_key(l.plot_name)   AS pk,
         mjm_batch_key(l.batch_name) AS bk,
         l.transaction_type          AS t,
         sum(abs(coalesce(l.quantity_change, 0)))      AS q,
         sum(coalesce(l.quantity_change, 0))           AS q_signed,
         count(*)                                      AS n
  FROM   shared_inventory_logs l
  GROUP  BY 1, 2, 3
),
-- A Cull3_Transfer leaving: the plot named in the remark, not on the row.
trout AS (
  SELECT mjm_plot_key(s.src) AS pk, mjm_batch_key(l.batch_name) AS bk,
         sum(abs(coalesce(l.quantity_change, 0))) AS q
  FROM   shared_inventory_logs l
  CROSS  JOIN LATERAL (SELECT (regexp_match(l.remark, 'From:\s*\[([^\]|]+)\|'))[1] AS src) s
  WHERE  l.transaction_type = 'Cull3_Transfer' AND s.src IS NOT NULL
  GROUP  BY 1, 2
),
dos AS (
  SELECT mjm_plot_key(v.p) AS pk, mjm_batch_key(v.b) AS bk, sum(v.q) AS q
  FROM   shared_do_records d
  CROSS  JOIN LATERAL (VALUES (d.plot_1, d.qty_1, d.batch_1), (d.plot_2, d.qty_2, d.batch_2),
                              (d.plot_3, d.qty_3, d.batch_3), (d.plot_4, d.qty_4, d.batch_4),
                              (d.plot_5, d.qty_5, d.batch_5)) AS v(p, q, b)
  WHERE  coalesce(d.status,'') <> 'Cancelled'
    AND  coalesce(d.remark,'') NOT LIKE '%[CANCELLED]%' AND coalesce(v.q,0) <> 0
  GROUP  BY 1, 2
),
g AS (
  SELECT n.plot_name, n.batch_name, n.qty,
         coalesce(sum(m.q) FILTER (WHERE m.t IN ('Seeds_Received','Planted')), 0)        AS pre_in,
         coalesce(sum(m.q) FILTER (WHERE m.t = 'Transplanted'), 0)                       AS transplanted,
         coalesce(sum(m.q) FILTER (WHERE m.t IN ('Transplanted_Premium',
                                                 'Transplanted_DoubleTone')), 0)         AS prem_dtone,
         coalesce(sum(m.q) FILTER (WHERE m.t = 'Cull3_Transfer'), 0)                     AS transfer_in,
         coalesce(max(t.q), 0)                                                           AS transfer_out,
         coalesce(sum(m.q) FILTER (WHERE m.t = 'Damaged_Seeds'), 0)                      AS damaged,
         coalesce(sum(m.q) FILTER (WHERE m.t = '1st_Culling'), 0)                        AS cull1,
         coalesce(sum(m.q) FILTER (WHERE m.t = '2nd_Culling'), 0)                        AS cull2,
         coalesce(sum(m.q) FILTER (WHERE m.t = '3rd_Culling'), 0)                        AS cull3,
         coalesce(sum(m.q_signed) FILTER (WHERE m.t = 'Stock_Calibration'), 0)           AS calib_all,
         coalesce(max(d.q), 0)                                                           AS sold
  FROM   neg n
  LEFT   JOIN mv    m ON m.pk = n.plot_key AND m.bk = n.batch_key
  LEFT   JOIN trout t ON t.pk = n.plot_key AND t.bk = n.batch_key
  LEFT   JOIN dos   d ON d.pk = n.plot_key AND d.bk = n.batch_key
  GROUP  BY 1, 2, 3
)
SELECT plot_name AS plot, batch_name AS batch, qty AS balance,
       pre_in, transplanted, prem_dtone, transfer_in, transfer_out,
       damaged, cull1, cull2, cull3, calib_all AS calibration, sold,
       -- Whether the 2nd culling deducted at all: after a 3rd it does not,
       -- because the 3rd already contains it.
       CASE WHEN cull3 > 0 THEN 0 ELSE cull2 END AS cull2_counted,
       -- The likeliest reading. Each test needs the figure to be there AND
       -- to be bigger on its own than everything that came in, so one big
       -- outgoing is never blamed on a different empty one.
       CASE
         WHEN pre_in + transplanted + prem_dtone + transfer_in = 0
           THEN 'NOTHING EVER CAME IN - the outgoings are filed against a plot that never received this batch'
         WHEN sold > 0 AND sold > pre_in + transplanted + prem_dtone + transfer_in
           THEN 'SOLD MORE THAN CAME IN - check the delivery orders for this plot and batch'
         WHEN cull3 > 0 AND cull3 > pre_in + transplanted + prem_dtone + transfer_in
           THEN 'CULLED MORE THAN CAME IN - the 3rd culling exceeds what this plot received'
         WHEN transfer_out > 0 AND transfer_out > pre_in + transplanted + prem_dtone + transfer_in
           THEN 'TRANSFERRED OUT MORE THAN CAME IN'
         ELSE 'no single movement is too big on its own - the outgoings together exceed what came in'
       END AS likely_cause
FROM   g
ORDER  BY qty;
