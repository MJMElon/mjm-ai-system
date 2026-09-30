-- Every movement of one plot and batch, in date order, with a running
-- balance. The last row's running total is what the phone will offer.
-- Edit the two values on the first line.
WITH want AS (SELECT 'U1'::text AS plot, '250'::text AS batch),
-- Does a 3rd culling exist for this plot and batch? If it does, the 2nd
-- culling is already inside it and deducts nothing - same rule the view and
-- the Movement Report apply. Without this the running total ends at minus
-- the 2nd culling and looks like a shortfall that is not there.
c3 AS (
  SELECT EXISTS (SELECT 1 FROM shared_inventory_logs l, want w
                 WHERE l.transaction_type = '3rd_Culling'
                   AND mjm_plot_key(l.plot_name)   = mjm_plot_key(w.plot)
                   AND mjm_batch_key(l.batch_name) = mjm_batch_key(w.batch)) AS yes
),
rows AS (
  SELECT coalesce(l.transaction_date::text, l.created_at::text) AS on_date,
         l.transaction_type AS movement,
         CASE WHEN l.transaction_type IN ('Seeds_Received','Planted','Transplanted',
                                          'Transplanted_Premium','Transplanted_DoubleTone',
                                          'Cull3_Transfer')
              THEN abs(coalesce(l.quantity_change,0))
              WHEN l.transaction_type = 'Stock_Calibration'
              THEN coalesce(l.quantity_change,0)
              WHEN l.transaction_type = '2nd_Culling' AND c3.yes THEN 0
              ELSE -abs(coalesce(l.quantity_change,0)) END AS moves,
         CASE WHEN l.transaction_type = '2nd_Culling' AND c3.yes
              THEN '(already inside the 3rd culling, so deducts nothing) '
              ELSE '' END || left(coalesce(l.remark,''), 80) AS remark
  FROM   shared_inventory_logs l, want w, c3
  WHERE  mjm_plot_key(l.plot_name) = mjm_plot_key(w.plot)
    AND  mjm_batch_key(l.batch_name) = mjm_batch_key(w.batch)
  UNION ALL
  SELECT d.delivery_date::text, 'SOLD (delivery order)',
         -abs(v.q), coalesce(d.do_number,'')
  FROM   shared_do_records d, want w
  CROSS  JOIN LATERAL (VALUES (d.plot_1,d.qty_1,d.batch_1),(d.plot_2,d.qty_2,d.batch_2),
                              (d.plot_3,d.qty_3,d.batch_3),(d.plot_4,d.qty_4,d.batch_4),
                              (d.plot_5,d.qty_5,d.batch_5)) AS v(p,q,b)
  WHERE  coalesce(d.status,'') <> 'Cancelled'
    AND  coalesce(d.remark,'') NOT LIKE '%[CANCELLED]%' AND coalesce(v.q,0) <> 0
    AND  mjm_plot_key(v.p) = mjm_plot_key(w.plot)
    AND  mjm_batch_key(v.b) = mjm_batch_key(w.batch)
)
SELECT on_date, movement, moves,
       sum(moves) OVER (ORDER BY on_date, movement
                        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_balance,
       remark
FROM   rows
ORDER  BY on_date, movement;
