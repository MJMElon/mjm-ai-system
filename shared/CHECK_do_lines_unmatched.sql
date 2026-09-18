-- =====================================================================
--  SALES THAT REACH NO PLOT — EVERY BATCH AT ONCE
--  Paste into the Supabase SQL Editor and press Run. Read-only: it
--  changes nothing, so it is safe to run as often as you like.
--
--  A delivery note's Nursery Collection Details lines say which plot,
--  which batch and how many. Those lines are what a plot's Sales figure
--  is made of, and Sales is what its Balance and 3rd Culled are worked
--  out from — so a line the report cannot place is a sale that never
--  happened as far as the whole 3rd Culling tab is concerned. The plot
--  reads as still holding seedlings the lorry took weeks ago, and they
--  come round again as something to cull.
--
--  The app reads the names forgivingly, and so does this:
--    batch "232 (B13)" is batch 232       (the origin plot in brackets)
--    plot  "U15 (UPB PREMIER HYBRID)" is U15
--    plot  "U15R" is the plot Settings calls "U15-R"  (punctuation is
--          not part of the name; the R still is)
--
--  What is left after all that forgiveness is a line that genuinely
--  needs a person. This lists every one, on every batch, and says which
--  half is wrong.
-- =====================================================================
WITH

/* Every live collection line, one row each. A cancelled note is not a
   sale and is not expected to reach anything. */
do_lines AS (
  SELECT d.do_number,
         d.delivery_date,
         d.status,
         i AS line_no,
         NULLIF(TRIM((ARRAY[d.plot_1, d.plot_2, d.plot_3, d.plot_4, d.plot_5])[i]), '')  AS raw_plot,
         NULLIF(TRIM((ARRAY[d.batch_1, d.batch_2, d.batch_3, d.batch_4, d.batch_5])[i]), '') AS raw_batch,
         COALESCE((ARRAY[d.qty_1, d.qty_2, d.qty_3, d.qty_4, d.qty_5])[i], 0)            AS raw_qty,
         d.total_qty,
         /* How many lines the note actually carries. The app reads a
            blank quantity as the note's total ONLY when there is one
            line to read it into; with two, it cannot guess, and skips. */
         (SELECT COUNT(*) FROM generate_series(1, 5) j
           WHERE NULLIF(TRIM((ARRAY[d.plot_1, d.plot_2, d.plot_3, d.plot_4, d.plot_5])[j]), '') IS NOT NULL) AS filled_lines
  FROM shared_do_records d,
       LATERAL generate_series(1, 5) AS i
  WHERE COALESCE(d.status, '') <> 'Cancelled'
    AND COALESCE(d.remark, '') NOT LIKE '%[CANCELLED]%'
),

keyed AS (
  SELECT do_number, delivery_date, line_no, raw_plot, raw_batch, raw_qty,
         total_qty, filled_lines,
         REGEXP_REPLACE(
           SPLIT_PART(REGEXP_REPLACE(UPPER(TRIM(raw_plot)), '^PLOT\s*:?\s*', ''), ' ', 1),
           '[^0-9A-Z]', '', 'g')                                  AS plot_key,
         REGEXP_REPLACE(
           SPLIT_PART(REGEXP_REPLACE(UPPER(TRIM(COALESCE(raw_batch, ''))), '^BATCH\s*:?\s*', ''), ' ', 1),
           '[^0-9A-Z]', '', 'g')                                  AS batch_key,
         CASE WHEN raw_qty > 0 THEN raw_qty
              WHEN filled_lines = 1 THEN COALESCE(total_qty, 0)
              ELSE 0 END                                          AS qty
  FROM do_lines
  WHERE raw_plot IS NOT NULL
),

/* Every plot each batch actually has: transplanted into, or transferred
   into. A line naming anything else has nowhere to land. Keyed the same
   punctuation-free way as the lines above. */
plots AS (
  SELECT REGEXP_REPLACE(UPPER(TRIM(batch_name)), '[^0-9A-Z]', '', 'g') AS batch_key,
         REGEXP_REPLACE(UPPER(TRIM(plot_name)),  '[^0-9A-Z]', '', 'g') AS plot_key
  FROM shared_inventory_logs
  WHERE transaction_type IN ('Transplanted', 'Transplanted_DoubleTone', 'Cull3_Transfer')
    AND COALESCE(TRIM(plot_name), '') <> ''
  GROUP BY 1, 2
),

unmatched AS (
  SELECT k.*,
         EXISTS (SELECT 1 FROM plots p WHERE p.batch_key = k.batch_key) AS batch_exists,
         EXISTS (SELECT 1 FROM plots p WHERE p.plot_key  = k.plot_key)  AS plot_exists,
         (SELECT STRING_AGG(DISTINCT p.batch_key, ', ')
            FROM plots p WHERE p.plot_key = k.plot_key)                AS batches_with_that_plot
  FROM keyed k
  WHERE k.qty = 0                           -- nothing to read, so nothing lands
     OR k.batch_key = ''                    -- no batch keyed: reaches none of them
     OR NOT EXISTS (
          SELECT 1 FROM plots p
          WHERE p.batch_key = k.batch_key AND p.plot_key = k.plot_key)
)

/* ONE result set — the SQL Editor only shows the last statement's. */
SELECT do_number                                   AS do,
       delivery_date                               AS delivered,
       line_no                                     AS line,
       COALESCE(raw_batch, '— none —')             AS batch_as_keyed,
       raw_plot                                    AS plot_as_keyed,
       qty                                         AS seedlings_lost_to_the_report,
       CASE
         WHEN qty = 0
           THEN 'no quantity on this line, and the note carries ' || filled_lines
                || ' lines — so there is no total to read it from. Key the quantity.'
         WHEN batch_key = ''
           THEN 'no batch number on this line, so it reaches no batch at all'
                || CASE WHEN batches_with_that_plot IS NOT NULL
                        THEN ' — plot ' || plot_key || ' belongs to batch ' || batches_with_that_plot
                        ELSE '' END
         WHEN NOT batch_exists
           THEN 'no batch ' || batch_key || ' has any plot on record — check the batch number'
         WHEN NOT plot_exists
           THEN 'no batch has a plot ' || plot_key || ' — check the plot name'
         ELSE 'batch ' || batch_key || ' has no plot ' || plot_key
              || COALESCE(' — that plot belongs to batch ' || batches_with_that_plot, '')
              || '. The seedlings came from somewhere else, or the plot was never '
              || 'transplanted into or transferred into on this batch.'
       END                                         AS why
FROM unmatched
ORDER BY delivery_date DESC NULLS LAST, do_number, line_no;

-- WHAT A GOOD RESULT LOOKS LIKE
--   NO ROWS. Every collection line on every live delivery note reaches a
--   plot the batch actually has, so every sale is inside the Sales
--   figure it belongs to.
--
--   A row here is a sale the 3rd Culling tab cannot see. That plot's
--   Balance and 3rd Culled are HIGHER than the field by the quantity in
--   seedlings_lost_to_the_report — the seedlings are sold and the report
--   still expects somebody to go and cull them.
--
--   Fix it on the line, in Customer Order Monitoring: the why column
--   says which half is wrong, and where a plot belongs to exactly one
--   batch it names that batch for you. Nothing here needs a database
--   change; every one of them is a delivery note somebody can correct.
--
--   The same lines now show on the batch itself — 3rd Culling has a
--   "Sales on this batch that reached no plot" panel — but only for the
--   lines that name that batch. A line with NO batch number can only be
--   found from here, which is why this file still earns its place.
