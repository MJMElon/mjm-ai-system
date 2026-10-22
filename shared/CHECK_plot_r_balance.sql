-- CHECK — why a reserve plot is, or is not, on the Plot-R tab
--
-- The Monthly Maturity Allocation Plot-R tab lists every "-R" plot with
-- balance still to allocate. A plot is LIVE there while
--
--     transfer in  -  DO deducted  -  3rd culled  -  moved on
--
-- stays above nought, and drops into its History section the moment it
-- does not. This file prints that arithmetic for EVERY reserve plot, the
-- way the tab itself works it out:
--
--   transfer_in  = the Cull3_Transfer rows that landed on the plot
--   do_deducted  = DO collection lines naming the plot and batch
--                  (a single-line DO with no line qty counts its total,
--                  cancelled DOs do not count)
--   culled       = every 3rd_Culling row on the plot. NOTE: the Movement
--                  report only counts rows with MapQty evidence, so a
--                  plot can read 0 there and still carry culled rows here
--   moved_out    = Cull3_Transfer rows that LEFT this plot for another
--                  (matched on the From marker in the remark)
--
-- A plot the office expected to see (U6-R, U8-R) sitting here with
-- where_it_sits = History names the figure that ate its balance. A plot
-- missing from this list entirely has no Cull3_Transfer rows at all.
--
-- Good result: every reserve plot the Movement report shows standing has
-- plot_balance above nought and reads LIVE.

WITH rin AS (
  SELECT batch_name, plot_name,
         SUM(COALESCE(quantity_change, 0)) AS transfer_in
  FROM shared_inventory_logs
  WHERE transaction_type = 'Cull3_Transfer'
    AND upper(trim(COALESCE(plot_name, ''))) LIKE '%-R'
  GROUP BY batch_name, plot_name
),
culled AS (
  SELECT batch_name, plot_name,
         SUM(COALESCE(quantity_change, 0)) AS culled_qty,
         COUNT(*) AS culled_rows
  FROM shared_inventory_logs
  WHERE transaction_type = '3rd_Culling'
  GROUP BY batch_name, plot_name
),
moved AS (
  SELECT l.batch_name, r.plot_name,
         SUM(COALESCE(l.quantity_change, 0)) AS moved_out
  FROM shared_inventory_logs l
  JOIN rin r
    ON l.batch_name = r.batch_name
   AND position('From: [' || r.plot_name || '|' IN COALESCE(l.remark, '')) > 0
  WHERE l.transaction_type = 'Cull3_Transfer'
  GROUP BY l.batch_name, r.plot_name
),
dof AS (
  SELECT d.*,
         (CASE WHEN COALESCE(trim(d.plot_1), '') <> '' THEN 1 ELSE 0 END
        + CASE WHEN COALESCE(trim(d.plot_2), '') <> '' THEN 1 ELSE 0 END
        + CASE WHEN COALESCE(trim(d.plot_3), '') <> '' THEN 1 ELSE 0 END
        + CASE WHEN COALESCE(trim(d.plot_4), '') <> '' THEN 1 ELSE 0 END
        + CASE WHEN COALESCE(trim(d.plot_5), '') <> '' THEN 1 ELSE 0 END) AS filled
  FROM shared_do_records d
  WHERE COALESCE(d.status, '') <> 'Cancelled'
    AND position('[CANCELLED]' IN COALESCE(d.remark, '')) = 0
),
dolines AS (
  SELECT d.do_number, x.plot, x.batch,
         CASE WHEN COALESCE(x.qty, 0) > 0 THEN x.qty
              WHEN d.filled = 1 THEN COALESCE(d.total_qty, 0)
              ELSE 0 END AS qty
  FROM dof d
  CROSS JOIN LATERAL (VALUES
    (d.plot_1, d.batch_1, d.qty_1),
    (d.plot_2, d.batch_2, d.qty_2),
    (d.plot_3, d.batch_3, d.qty_3),
    (d.plot_4, d.batch_4, d.qty_4),
    (d.plot_5, d.batch_5, d.qty_5)
  ) AS x(plot, batch, qty)
  WHERE COALESCE(trim(x.plot), '') <> ''
),
dosum AS (
  SELECT upper(trim(plot)) AS plot_key,
         upper(rtrim(trim(COALESCE(batch, '')), '. ')) AS batch_key,
         SUM(qty) AS do_deducted,
         COUNT(*) AS do_lines
  FROM dolines
  GROUP BY 1, 2
)
SELECT r.plot_name                                   AS reserve_plot,
       r.batch_name                                  AS batch,
       r.transfer_in,
       COALESCE(ds.do_deducted, 0)                   AS do_deducted,
       COALESCE(ds.do_lines, 0)                      AS do_lines,
       COALESCE(c.culled_qty, 0)                     AS culled,
       COALESCE(c.culled_rows, 0)                    AS culled_rows,
       COALESCE(m.moved_out, 0)                      AS moved_out,
       r.transfer_in - COALESCE(ds.do_deducted, 0)
                     - COALESCE(c.culled_qty, 0)
                     - COALESCE(m.moved_out, 0)      AS plot_balance,
       CASE WHEN r.transfer_in - COALESCE(ds.do_deducted, 0)
                               - COALESCE(c.culled_qty, 0)
                               - COALESCE(m.moved_out, 0) > 0
            THEN 'LIVE on the Plot-R tab'
            ELSE 'History' END                       AS where_it_sits
FROM rin r
LEFT JOIN culled c ON c.batch_name = r.batch_name AND c.plot_name = r.plot_name
LEFT JOIN moved  m ON m.batch_name = r.batch_name AND m.plot_name = r.plot_name
LEFT JOIN dosum ds ON ds.plot_key  = upper(trim(r.plot_name))
                  AND ds.batch_key = upper(rtrim(trim(COALESCE(r.batch_name, '')), '. '))
ORDER BY plot_balance DESC, r.plot_name, r.batch_name;
