-- =====================================================================
--  DELIVERY ORDER LINES THAT REACH NO PLOT — EVERY BATCH AT ONCE
--  Paste into the Supabase SQL Editor and press Run. Read-only: it
--  changes nothing, so it is safe to run as often as you like.
--
--  A DO's Nursery Collection Details lines say which plot, which batch
--  and how many. Those lines are what a plot's Sales figure is made of,
--  and Sales is what its Balance and 3rd Culled are worked out from — so
--  a line the report cannot match is a sale that never happened as far
--  as the whole 3rd Culling tab is concerned.
--
--  The app reads the names forgivingly: a batch keyed "232 (B13)" is
--  batch 232, a plot keyed "B14-R (UPB PREMIER HYBRID)" is B14-R. This
--  applies the same rules and lists the lines that STILL match nothing,
--  so a Sales figure that looks short can be traced to the line behind
--  it rather than guessed at.
-- =====================================================================
WITH

/* The same two normalisers the app uses. A batch key is the batch number
   and stops at the first space or bracket; so does a plot key, after a
   "Plot " prefix is dropped. Change these only alongside
   operation/operation_batch_detail.html and operation_stock_sales.js. */
do_lines AS (
  SELECT d.do_number,
         d.delivery_date,
         d.status,
         i AS line_no,
         NULLIF(TRIM((ARRAY[d.plot_1, d.plot_2, d.plot_3, d.plot_4, d.plot_5])[i]), '') AS raw_plot,
         NULLIF(TRIM((ARRAY[d.batch_1, d.batch_2, d.batch_3, d.batch_4, d.batch_5])[i]), '') AS raw_batch,
         COALESCE((ARRAY[d.qty_1, d.qty_2, d.qty_3, d.qty_4, d.qty_5])[i], 0) AS raw_qty,
         d.total_qty
  FROM shared_do_records d,
       LATERAL generate_series(1, 5) AS i
  WHERE COALESCE(d.status, '') <> 'Cancelled'
    AND COALESCE(d.remark, '') NOT LIKE '%[CANCELLED]%'
),

keyed AS (
  SELECT do_number, delivery_date, line_no, raw_plot, raw_batch, raw_qty, total_qty,
         REGEXP_REPLACE(
           SPLIT_PART(REGEXP_REPLACE(UPPER(TRIM(raw_plot)), '^PLOT\s*:?\s*', ''), ' ', 1),
           '[^0-9A-Z-]', '', 'g')                                  AS plot_key,
         REGEXP_REPLACE(
           SPLIT_PART(REGEXP_REPLACE(UPPER(TRIM(raw_batch)), '^BATCH\s*:?\s*', ''), ' ', 1),
           '[^0-9A-Z]', '', 'g')                                   AS batch_key
  FROM do_lines
  WHERE raw_plot IS NOT NULL
),

/* Every plot each batch actually has: transplanted into, or transferred
   into. A line naming anything else has nowhere to land. */
plots AS (
  SELECT REGEXP_REPLACE(UPPER(TRIM(batch_name)), '[^0-9A-Z]', '', 'g') AS batch_key,
         UPPER(TRIM(plot_name)) AS plot_key
  FROM shared_inventory_logs
  WHERE transaction_type IN ('Transplanted', 'Transplanted_DoubleTone', 'Cull3_Transfer')
    AND COALESCE(TRIM(plot_name), '') <> ''
  GROUP BY 1, 2
),

unmatched AS (
  SELECT k.*,
         EXISTS (SELECT 1 FROM plots p WHERE p.batch_key = k.batch_key) AS batch_exists,
         EXISTS (SELECT 1 FROM plots p WHERE p.plot_key  = k.plot_key)  AS plot_exists
  FROM keyed k
  WHERE NOT EXISTS (
    SELECT 1 FROM plots p
    WHERE p.batch_key = k.batch_key AND p.plot_key = k.plot_key
  )
)

/* ONE result set — the SQL Editor only shows the last statement's. */
SELECT do_number                                   AS do,
       delivery_date                               AS delivered,
       line_no                                     AS line,
       raw_batch                                   AS batch_as_keyed,
       raw_plot                                    AS plot_as_keyed,
       CASE WHEN raw_qty > 0 THEN raw_qty ELSE total_qty END AS qty,
       CASE
         WHEN NOT batch_exists
           THEN 'no batch ' || batch_key || ' has any plot on record — check the batch number'
         WHEN NOT plot_exists
           THEN 'no batch has a plot ' || plot_key || ' — check the plot name'
         ELSE 'batch ' || batch_key || ' has no plot ' || plot_key
              || ' — the seedlings came from somewhere else, or the plot was '
              || 'never transplanted into or transferred into on this batch'
       END                                         AS why
FROM unmatched
ORDER BY delivery_date DESC NULLS LAST, do_number, line_no;

-- WHAT A GOOD RESULT LOOKS LIKE
--   NO ROWS. Every collection line on every live DO reaches a plot the
--   batch actually has, so every sale is inside the Sales figure it
--   belongs to.
--
--   A row here is a sale the 3rd Culling tab cannot see. Its Balance and
--   3rd Culled for that plot are higher than the field by that quantity.
--   The why column says which half is wrong — the batch, the plot, or
--   the pairing — so it can be corrected on the DO in Customer Order
--   Monitoring.
