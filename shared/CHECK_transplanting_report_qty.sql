-- WHY THE TRANSPLANTING REPORT READS ONE LESS THAN THE BATCH PAGE
--
-- The Transplanting Report prints the LEDGER quantity of the Transplanted
-- rows, summed by date, plot and batch. An approved adjustment filed against
-- the Transplanting report is NOT added to that figure. The report only MARKS
-- the cell: a dotted underline you can hover for the date, the amount and the
-- reason. The figure that has the adjustment IN it is the Final Qty column on
-- Tab 3 of the batch, and the Movement Report keeps it in a Stock Adjustment
-- column of its own.
--
-- So a cell with NO dotted underline means the report found no adjustment to
-- mark it with. Three things can make that true while the batch page reads one
-- higher, and this tells them apart:
--
--   there is no adjustment at all   -- the difference comes from elsewhere
--   it has not been approved        -- then it counts nowhere, by design
--   the plot name does not match    -- the report compares the Plot: text of
--                                      the remark against the plot on the
--                                      transplant row, letter for letter
--
-- Every batch is swept, not only the one somebody was looking at. A plot name
-- that fails to match on one batch fails the same way on every other.
--
-- Nothing is changed by running it.
--
-- WHAT A GOOD RESULT LOOKS LIKE
--
-- SUMMARY first: how many plot and batch pairs carry an approved Transplanting
-- adjustment, and how many of those the report cannot mark.
--
-- Then one PAIR line per such pair: what the report prints, what Tab 3 prints,
-- and whether the report managed to mark the cell. A pair reading MARKED is
-- working as designed and the two figures differ on purpose.
--
-- Then the adjustments naming a plot that NO transplant row of that batch
-- carries. Those are invisible on this report and are worth re-keying.
--
-- Last, every ledger line of the one pair being looked at, in date order, so
-- the figure on screen can be read straight off them. Change the batch and the
-- plot in the look CTE to drill into a different one.

WITH look AS (
  SELECT '241' AS batch, 'N3' AS plot
),
tx AS (
  SELECT coalesce(batch_name, '-') AS batch,
         transaction_type AS t,
         coalesce(plot_name, '-')  AS plot,
         coalesce(quantity_change, 0) AS qty,
         coalesce(remark, '') AS remark,
         coalesce(transaction_date, created_at::date) AS happened
  FROM   shared_inventory_logs
),
-- What the report prints: the Transplanted rows, summed per batch and plot.
-- It splits them by date as well, so a pair transplanted on two days is two
-- lines on screen. The adjustment belongs to the pair, so the pair is what is
-- compared here and the date count says how many lines it is spread over.
moved AS (
  SELECT batch, plot,
         sum(qty)                 AS recorded,
         count(DISTINCT happened) AS on_days
  FROM   tx
  WHERE  t = 'Transplanted'
  GROUP  BY batch, plot
),
-- Approved adjustments filed against the Transplanting report. The plot is
-- taken out of the remark, which is what the report itself matches on.
cal AS (
  SELECT batch, plot AS logged_plot, qty, remark, happened,
         btrim(split_part(split_part(remark, 'Plot:', 2), '.', 1)) AS named_plot
  FROM   tx
  WHERE  t = 'Stock_Calibration'
    AND  position('[APPROVED by' in remark) > 0
    AND  lower(btrim(split_part(split_part(remark, 'Report:', 2), '.', 1)))
         = 'transplanting'
),
per_pair AS (
  SELECT batch, named_plot AS plot, sum(qty) AS net, count(*) AS adj_rows
  FROM   cal
  WHERE  named_plot <> ''
  GROUP  BY batch, named_plot
),
pair AS (
  SELECT c.batch, c.plot, c.net, c.adj_rows,
         m.recorded, m.on_days,
         (m.recorded IS NOT NULL) AS marked
  FROM   per_pair c
  LEFT   JOIN moved m ON m.batch = c.batch AND m.plot = c.plot
),
orphan AS (
  SELECT batch, plot, net, adj_rows FROM pair WHERE NOT marked
)
SELECT 0 AS sort_key,
       'SUMMARY'                                                  AS batch,
       (SELECT count(*) FROM pair)::text || ' pairs adjusted'      AS a,
       (SELECT count(*) FROM orphan)::text
         || ' the report cannot mark'                             AS b,
       coalesce((SELECT sum(net) FROM pair), 0)::text
         || ' seedlings between them'                             AS c,
       'the report prints the recorded figure, Tab 3 prints the adjusted one'
                                                                  AS note
UNION ALL
SELECT 1,
       batch,
       'plot ' || plot,
       'report prints ' || coalesce(recorded::text, 'no transplant row'),
       'Tab 3 prints ' || coalesce((recorded + net)::text, '-'),
       CASE WHEN NOT marked
              THEN 'NOT MARKED -- no transplant row of this batch carries that plot name'
            WHEN on_days > 1
              THEN 'marked, and split over ' || on_days::text
                   || ' dates on screen, so the mark sits on each of them'
            ELSE 'marked -- hover the dotted figure to see the '
                 || CASE WHEN net > 0 THEN '+' || net::text ELSE net::text END
       END
FROM   pair
UNION ALL
SELECT 2,
       batch,
       'PLOT NAME MATCHES NO TRANSPLANT ROW',
       'named ' || plot,
       CASE WHEN net > 0 THEN '+' || net::text ELSE net::text END,
       'invisible on this report -- re-key it to the plot the seedlings went to'
FROM   orphan
UNION ALL
SELECT 3,
       t.batch,
       '   ' || t.t,
       t.happened::text,
       CASE WHEN t.qty > 0 THEN '+' || t.qty::text ELSE t.qty::text END,
       left(t.remark, 90)
FROM   tx t
JOIN   look k ON k.batch = t.batch
WHERE  t.plot = k.plot
    OR btrim(split_part(split_part(t.remark, 'Plot:', 2), '.', 1)) = k.plot
ORDER  BY sort_key, batch, a, b;
