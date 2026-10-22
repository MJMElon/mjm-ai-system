-- CHECK — which ledger plots the Seedling Stock list can not place
--
-- The report pages (Transplanting Report, Culling Report, Sales Listing,
-- Summary Report) label every row with a nursery by looking its plot up in
-- shared_plots, the Seedling Stock list. A plot that is not there, or is
-- there with no nursery filled in, used to be DROPPED from the report
-- silently whenever the Locations chips were ticked, which is the default --
-- batch 256 transplanted into N11 in July 2026 and the July Transplanting
-- Report did not show it while the batch report did.
--
-- The pages now show such a row with its Location reading Unassigned and a
-- warning naming the plot. The CURE is in the data, and this file is the
-- list of it: every plot the main-nursery ledger rows stand on that
-- Seedling Stock does not place, with how much is riding on it.
--
-- status means:
--   NO NURSERY IN SEEDLING STOCK  the plot row exists, nursery_name is empty
--                                 -- fill the nursery in on Seedling Stock
--   SPELLED DIFFERENTLY           no exact row, but one matches once case
--                                 and spaces are ignored -- the stock_says
--                                 column shows that spelling and nursery
--   NOT IN SEEDLING STOCK         no row at all -- add the plot under its
--                                 nursery on Seedling Stock
--
-- Good result: the SUMMARY line on top reads 0 unplaced of however many
-- plots the ledger uses. Each fix made on Seedling Stock removes its row
-- here on the next run, and the warning on the report goes with it.

WITH led AS (
  SELECT trim(plot_name) AS plot,
         COUNT(*) AS ledger_rows,
         SUM(COALESCE(quantity_change, 0)) AS total_qty,
         COUNT(DISTINCT batch_name) AS batches,
         MIN(COALESCE(transaction_date::text, left(created_at::text, 10))) AS first_seen,
         MAX(COALESCE(transaction_date::text, left(created_at::text, 10))) AS last_seen
  FROM shared_inventory_logs
  WHERE transaction_type IN ('Transplanted', '2nd_Culling', '3rd_Culling', 'Cull3_Transfer')
    AND COALESCE(trim(plot_name), '') <> ''
    AND trim(plot_name) NOT IN ('Pre-Nursery', 'DOUBLE-TONE', 'PREMIUM CARE')
  GROUP BY trim(plot_name)
),
sp AS (
  SELECT trim(plot_name) AS plot,
         COALESCE(trim(nursery_name), '') AS nursery
  FROM shared_plots
  WHERE COALESCE(trim(plot_name), '') <> ''
),
spk AS (
  SELECT translate(upper(plot), ' -./_', '') AS k,
         MAX(plot) AS spelled,
         MAX(nursery) AS nursery
  FROM sp
  WHERE nursery <> ''
  GROUP BY translate(upper(plot), ' -./_', '')
),
graded AS (
  SELECT l.*,
         CASE
           WHEN EXISTS (SELECT 1 FROM sp WHERE sp.plot = l.plot AND sp.nursery <> '')
             THEN 'ok'
           WHEN EXISTS (SELECT 1 FROM sp WHERE sp.plot = l.plot)
             THEN 'NO NURSERY IN SEEDLING STOCK'
           WHEN EXISTS (SELECT 1 FROM spk WHERE spk.k = translate(upper(l.plot), ' -./_', ''))
             THEN 'SPELLED DIFFERENTLY'
           ELSE 'NOT IN SEEDLING STOCK'
         END AS status,
         (SELECT spk.spelled || ' (' || spk.nursery || ')'
            FROM spk
           WHERE spk.k = translate(upper(l.plot), ' -./_', '')
           LIMIT 1) AS stock_says
  FROM led l
)
SELECT 0 AS sort_first,
       '== SUMMARY =='                                           AS plot,
       count(*) FILTER (WHERE status <> 'ok') || ' unplaced of '
         || count(*) || ' ledger plots'                          AS status,
       ''                                                        AS stock_says,
       SUM(ledger_rows) FILTER (WHERE status <> 'ok')            AS ledger_rows,
       SUM(total_qty) FILTER (WHERE status <> 'ok')              AS total_qty,
       SUM(batches) FILTER (WHERE status <> 'ok')                AS batches,
       MIN(first_seen) FILTER (WHERE status <> 'ok')             AS first_seen,
       MAX(last_seen) FILTER (WHERE status <> 'ok')              AS last_seen
FROM graded
UNION ALL
SELECT 1, plot, status, COALESCE(stock_says, ''),
       ledger_rows, total_qty, batches, first_seen, last_seen
FROM graded
WHERE status <> 'ok'
ORDER BY sort_first, total_qty DESC, plot;
