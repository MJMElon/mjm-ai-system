-- Pusingan Jualan: does any plot still read OVER 100 percent?
--
-- The page (Life of Plot and the Nursery Dashboard Site Audit) shows, per
-- plot and month, what the CURRENT ROUND has sold so far over the capacity
-- keyed on Work Maintenance Setting. The round at a month is the batches
-- transplanted into the plot from the same month a year before up to it; a
-- sale of an older batch is the round before and is not counted. Replant
-- plots (ending -R) are on neither screen and are left out here.
--
-- This lists every plot and month where that still comes to more than the
-- capacity:
--   capacity          what the page divides by (nops_maint_plot_qty)
--   round_sold        what the page adds up
--   round_batches     the batches of the round
--   round_filled      what those batches put into the plot
--   delivery_orders   the lines counted
-- round_filled at or below capacity with round_sold above it means a delivery
-- order line names this plot for seedlings of another plot, or a sale was
-- keyed twice. round_filled above capacity means the capacity keyed on Work
-- Maintenance Setting is out of date.
-- No rows at all means nothing reads over 100 percent.
WITH tr AS (
  SELECT translate(upper(coalesce(l.plot_name, '')), ' -_.,()/[]', '') AS k,
         translate(split_part(split_part(upper(trim(coalesce(l.batch_name, ''))), ' ', 1), '(', 1), '.,-_/[]', '') AS b,
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
         translate(split_part(split_part(upper(trim(coalesce(v.b::text, ''))), ' ', 1), '(', 1), '.,-_/[]', '') AS b,
         coalesce(d.do_number::text, '') AS dn
  FROM   shared_do_records d
  CROSS  JOIN LATERAL (VALUES (d.plot_1, d.qty_1, d.batch_1), (d.plot_2, d.qty_2, d.batch_2),
                              (d.plot_3, d.qty_3, d.batch_3), (d.plot_4, d.qty_4, d.batch_4),
                              (d.plot_5, d.qty_5, d.batch_5)) AS v(p, q, b)
  WHERE  coalesce(d.status, '') <> 'Cancelled'
    AND  position('[CANCELLED]' in coalesce(d.remark, '')) = 0
    AND  coalesce(v.p, '') <> '' AND coalesce(v.q, 0) <> 0
    AND  d.delivery_date IS NOT NULL
    AND  right(upper(trim(v.p)), 2) <> '-R'
),
sold_m AS (SELECT k, ym, sum(q) AS sold FROM so GROUP BY k, ym),
cap AS (
  SELECT translate(upper(coalesce(plot, '')), ' -_.,()/[]', '') AS k, max(qty)::numeric AS cap
  FROM   nops_maint_plot_qty WHERE coalesce(qty, 0) > 0 GROUP BY 1
),
rb AS (
  SELECT s.k, s.ym, t.b, sum(t.q) AS filled
  FROM   sold_m s JOIN tr t ON t.k = s.k AND t.ym <= s.ym
    AND  t.ym > to_char((s.ym || '-01')::date - interval '13 months', 'YYYY-MM')
  GROUP  BY s.k, s.ym, t.b
),
calc AS (
  SELECT r.k, r.ym, c.cap,
         (SELECT sum(x.q) FROM so x WHERE x.k = r.k AND x.ym <= r.ym AND x.b IN (SELECT b FROM rb r2 WHERE r2.k = r.k AND r2.ym = r.ym)) AS sold,
         string_agg(r.b, ', ' ORDER BY r.b) AS batches,
         sum(r.filled) AS filled
  FROM   rb r JOIN cap c ON c.k = r.k
  GROUP  BY r.k, r.ym, c.cap
)
SELECT x.k AS plot,
       x.ym AS month,
       x.cap::bigint AS capacity,
       x.sold::bigint AS round_sold,
       round(x.sold * 100 / x.cap) AS pct,
       x.batches AS round_batches,
       x.filled::bigint AS round_filled,
       (SELECT string_agg(s.dn || ' ' || s.ym || ' ' || s.q::bigint || ' (batch ' || s.b || ')', '; ' ORDER BY s.ym, s.dn) FROM so s
         WHERE s.k = x.k AND s.ym <= x.ym AND s.b IN (SELECT b FROM rb r2 WHERE r2.k = x.k AND r2.ym = x.ym)) AS delivery_orders
FROM   calc x
WHERE  x.sold > x.cap
ORDER  BY x.k, x.ym;
