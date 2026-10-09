-- WHAT ARE THE STOCK_CALIBRATION ROWS THAT NAME NO REPORT
--
-- 206 rows out of 218 carry no "Report: X. Plot: Y." at the front of the
-- remark. Every row the Adjustments tab has ever written carries one, so
-- these were not raised there. They are all negative, nearly all dated
-- within two days of each other, and many are exact triplicates.
--
-- This reads them. Nothing is changed by running it.
--
-- WHAT A GOOD RESULT LOOKS LIKE
--
-- The first lines are the summary, one per distinct remark SHAPE: the first
-- forty characters of the remark, how many rows share it, what they come to
-- and the days they were written on. That is what says where they came from:
-- one shape with two hundred rows under it is one thing that ran, and the
-- wording of it usually names itself.
--
-- After the summary come twenty of the rows in full, newest first, so the
-- whole remark can be read rather than its first line.
--
-- The last thing to look at is the triplicates line in the summary: where a
-- batch, a plot and a quantity appear three times on the same day, something
-- ran three times, and two of each three are duplicates to be removed.
--
-- Send the result back before anything is deleted.

WITH cal AS (
  SELECT id,
         coalesce(batch_name, '-') AS batch,
         coalesce(plot_name, '-')  AS plot,
         coalesce(quantity_change, 0) AS qty,
         coalesce(transaction_date, created_at::date) AS happened,
         created_at,
         coalesce(remark, '') AS remark
  FROM   shared_inventory_logs
  WHERE  transaction_type = 'Stock_Calibration'
),
noreport AS (
  SELECT * FROM cal WHERE position('Report:' in remark) = 0
),
shapes AS (
  SELECT left(remark, 40) AS shape,
         count(*)         AS rows_here,
         sum(qty)         AS net_here,
         min(happened)    AS first_day,
         max(happened)    AS last_day
  FROM   noreport
  GROUP  BY left(remark, 40)
),
dupes AS (
  SELECT batch, plot, qty, happened, count(*) AS times
  FROM   noreport
  GROUP  BY batch, plot, qty, happened
  HAVING count(*) > 1
)
SELECT 0 AS sort_key,
       'SUMMARY'                                   AS shape,
       (SELECT count(*) FROM noreport)::text       AS rows_here,
       coalesce((SELECT sum(qty) FROM noreport), 0)::text AS net_here,
       (SELECT count(*) FROM dupes)::text || ' groups repeated' AS first_day,
       coalesce((SELECT sum(times - 1) FROM dupes), 0)::text || ' rows are repeats' AS last_day
UNION ALL
SELECT 1, shape, rows_here::text, net_here::text, first_day::text, last_day::text
FROM   shapes
UNION ALL
SELECT 2,
       remark,
       batch,
       plot,
       qty::text,
       happened::text
FROM   (SELECT * FROM noreport ORDER BY created_at DESC, id DESC LIMIT 20) AS sample
ORDER  BY sort_key, shape;
