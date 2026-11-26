-- Pusingan Jualan: why does a plot read OVER 100 percent?
--
-- The page (Life of Plot and the Nursery Dashboard Site Audit) shows, per
-- plot and month, the seedlings collected on delivery orders CUMULATIVE since
-- the latest EARLIER month that had a transplant into that plot, over the
-- capacity keyed on Work Maintenance Setting. This lists every plot and month
-- where that comes to more than the capacity, worked out the same way, and
-- beside it the figures that say which of the possible causes it is:
--
--   capacity            what the page divides by (nops_maint_plot_qty)
--   cumulative_sold     what the page adds up
--   sold_window         the months added up: from after last_fill to the month
--   filled_last_fill    transplanted into the plot in the last_fill month
--   filled_12m          transplanted into the plot in the 12 months to the month
--   sold_batches        the batches the delivery orders in the window name
--   filled_batches      the batches transplanted into the plot in those 12 months
--
-- How to read it:
--   * filled_12m well above capacity, and sold_batches including batches that
--     are NOT in the last fill: the plot holds two rounds at once (old batches
--     still being sold while new ones go in), so the window adds both.
--   * filled_12m about the capacity but cumulative_sold above it: a delivery
--     order line names this plot for seedlings that came from another one,
--     or the same sale was keyed twice. sold_batches says which batch.
--   * capacity far below filled_12m on every row of a plot: the capacity
--     keyed on Work Maintenance Setting is out of date.
-- No rows at all means nothing goes over 100 percent.
WITH tr AS (
  SELECT translate(upper(coalesce(l.plot_name, '')), ' -_.,()/[]', '') AS k,
         coalesce(l.batch_name, '') AS b,
         left(CASE WHEN position('Date: ' in coalesce(l.remark, '')) > 0
                   THEN substring(l.remark from position('Date: ' in l.remark) + 6 for 10)
                   WHEN l.transaction_date IS NOT NULL THEN l.transaction_date::text
                   ELSE l.created_at::text END, 7) AS ym,
         coalesce(l.quantity_change, 0)::numeric AS q
  FROM   shared_inventory_logs l
  WHERE  l.transaction_type = 'Transplanted'
),
so AS (
  SELECT translate(upper(coalesce(v.p, '')), ' -_.,()/[]', '') AS k,
         left(d.delivery_date::text, 7) AS ym,
         abs(coalesce(v.q, 0))::numeric AS q,
         coalesce(v.b::text, '') AS b,
         coalesce(d.do_number::text, '') AS dn
  FROM   shared_do_records d
  CROSS  JOIN LATERAL (VALUES (d.plot_1, d.qty_1, d.batch_1), (d.plot_2, d.qty_2, d.batch_2),
                              (d.plot_3, d.qty_3, d.batch_3), (d.plot_4, d.qty_4, d.batch_4),
                              (d.plot_5, d.qty_5, d.batch_5)) AS v(p, q, b)
  WHERE  coalesce(d.status, '') <> 'Cancelled'
    AND  position('[CANCELLED]' in coalesce(d.remark, '')) = 0
    AND  coalesce(v.p, '') <> '' AND coalesce(v.q, 0) <> 0
    AND  d.delivery_date IS NOT NULL
),
sold_m AS (SELECT k, ym, sum(q) AS sold FROM so GROUP BY k, ym),
fill_m AS (SELECT k, ym, sum(q) AS filled FROM tr GROUP BY k, ym HAVING sum(q) > 0),
cap AS (
  SELECT translate(upper(coalesce(plot, '')), ' -_.,()/[]', '') AS k, max(qty)::numeric AS cap
  FROM   nops_maint_plot_qty WHERE coalesce(qty, 0) > 0 GROUP BY 1
),
win AS (
  SELECT s.k, s.ym,
         (SELECT max(f.ym) FROM fill_m f WHERE f.k = s.k AND f.ym < s.ym) AS last_fill
  FROM   sold_m s
),
calc AS (
  SELECT w.k, w.ym, w.last_fill, c.cap,
         (SELECT sum(s2.sold) FROM sold_m s2
           WHERE s2.k = w.k AND s2.ym > coalesce(w.last_fill, '') AND s2.ym <= w.ym) AS cum
  FROM   win w JOIN cap c ON c.k = w.k
)
SELECT x.k AS plot,
       x.ym AS month,
       x.cap::bigint AS capacity,
       x.cum::bigint AS cumulative_sold,
       round(x.cum * 100 / x.cap) AS pct,
       coalesce(x.last_fill, 'none') || ' to ' || x.ym AS sold_window,
       coalesce((SELECT sum(f.filled) FROM fill_m f WHERE f.k = x.k AND f.ym = x.last_fill), 0)::bigint AS filled_last_fill,
       coalesce((SELECT sum(t.q) FROM tr t
                  WHERE t.k = x.k AND t.ym <= x.ym
                    AND t.ym > to_char((x.ym || '-01')::date - interval '12 months', 'YYYY-MM')), 0)::bigint AS filled_12m,
       (SELECT string_agg(DISTINCT s.b, ', ') FROM so s
         WHERE s.k = x.k AND s.ym > coalesce(x.last_fill, '') AND s.ym <= x.ym) AS sold_batches,
       (SELECT string_agg(DISTINCT t.b, ', ') FROM tr t
         WHERE t.k = x.k AND t.ym <= x.ym
           AND t.ym > to_char((x.ym || '-01')::date - interval '12 months', 'YYYY-MM')) AS filled_batches,
       (SELECT string_agg(s.dn || ' ' || s.ym || ' ' || s.q::bigint || ' (batch ' || s.b || ')', '; ' ORDER BY s.ym, s.dn) FROM so s
         WHERE s.k = x.k AND s.ym > coalesce(x.last_fill, '') AND s.ym <= x.ym) AS delivery_orders
FROM   calc x
WHERE  x.cum > x.cap
ORDER  BY x.k, x.ym;
