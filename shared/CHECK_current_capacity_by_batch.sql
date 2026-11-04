-- ============================================================================
-- CHECK_current_capacity_by_batch.sql
--
-- What the Work Maintenance Setting grid now shows as a plot Capacity, and
-- every batch it is made of. Reads only. Changes nothing.
--
-- The grid reads the Main Nursery Movement Report BALANCE as at today, the
-- report that carries a 2nd Culled column:
--   transplanted + transferred in - sold - 3rd culled with a drone MapQty
--   - transferred out + approved stock adjustment
--   - the 2nd culling, but ONLY while that batch has no 3rd culling on the
--     plot, because a 3rd culling already includes it.
--
-- ONE ROW PER PLOT AND BATCH, then a TOTAL row per plot, for every plot.
-- Columns
--   plot, batch
--   balance_report   the Main Nursery Movement Report figure
--   cull_2nd         2nd culling on that plot and batch
--   has_3rd          YES when a 3rd culling with a MapQty is keyed, and then
--                    the 2nd culling is NOT taken off
--   on_grid          what the grid counts, the Balance on the report
--                    (a batch below nought counts nought on the total row)
--   keyed_before     the capacity keyed on Setting before it was linked
-- Look for the plot asked about, N20 for example, and read its batches.
-- ============================================================================

WITH bal AS (
  SELECT plot_key, plot_name, batch_key, batch_name, qty::numeric AS qty
    FROM public.shared_plot_batch_balance
),
c2 AS (
  SELECT mjm_plot_key(plot_name) AS plot_key,
         mjm_batch_key(batch_name) AS batch_key,
         sum(abs(coalesce(quantity_change, 0)))::numeric AS qty
    FROM public.shared_inventory_logs
   WHERE transaction_type = '2nd_Culling'
   GROUP BY 1, 2
),
c3 AS (
  SELECT DISTINCT mjm_plot_key(plot_name) AS plot_key,
         mjm_batch_key(batch_name) AS batch_key
    FROM public.shared_inventory_logs
   WHERE transaction_type = '3rd_Culling'
     AND left(ltrim(split_part(coalesce(remark, ''), 'MapQty:', 2)), 1) BETWEEN '0' AND '9'
),
rows_ AS (
  SELECT b.plot_key, b.plot_name, b.batch_name,
         b.qty AS balance_report,
         coalesce(c.qty, 0) AS cull_2nd,
         CASE WHEN t.plot_key IS NULL THEN 'no' ELSE 'YES' END AS has_3rd,
         b.qty - CASE WHEN t.plot_key IS NULL THEN coalesce(c.qty, 0) ELSE 0 END AS on_grid
    FROM bal b
    LEFT JOIN c2 c ON c.plot_key = b.plot_key AND c.batch_key = b.batch_key
    LEFT JOIN c3 t ON t.plot_key = b.plot_key AND t.batch_key = b.batch_key
),
keyed AS (
  SELECT mjm_plot_key(plot) AS plot_key, max(qty)::numeric AS qty
    FROM public.nops_maint_plot_qty
   GROUP BY 1
)
SELECT plot, batch, balance_report, cull_2nd, has_3rd, on_grid, keyed_before
  FROM (
    SELECT r.plot_name AS plot, r.batch_name AS batch,
           r.balance_report, r.cull_2nd, r.has_3rd, r.on_grid,
           NULL::numeric AS keyed_before,
           r.plot_key AS k, 0 AS ord
      FROM rows_ r
    UNION ALL
    SELECT min(r.plot_name), 'TOTAL',
           sum(r.balance_report), sum(r.cull_2nd), '',
           greatest(sum(r.on_grid), 0),
           max(k2.qty),
           r.plot_key, 1
      FROM rows_ r
      LEFT JOIN keyed k2 ON k2.plot_key = r.plot_key
     GROUP BY r.plot_key
  ) x
 ORDER BY k, ord, batch;
