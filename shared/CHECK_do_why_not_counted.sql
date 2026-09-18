-- =====================================================================
--  WHY DIDN'T THIS DO GO IN? — ONE DO AT A TIME
--  Paste into the Supabase SQL Editor and press Run. Read-only: it
--  changes nothing, so it is safe to run as often as you like.
--
--  CHECK_do_lines_unmatched.sql sweeps every delivery note and lists the
--  lines that reach no plot. This is the drill-down beside it: name the
--  DOs and it prints, line by line, exactly what the app sees — the
--  batch key, the plot key, the quantity — and which half of the pair is
--  the one that matches nothing.
--
--  TO USE IT: put the DO numbers in the list on the next line. They are
--  matched forgivingly, so 03423 and "DO 03423" both find the same note.
-- =====================================================================
WITH

wanted(do_number) AS (
  VALUES ('03423'), ('03376')          -- ← the DOs to explain
),

/* The app reads the names forgivingly and so does this: a batch keyed
   "232 (B13)" is batch 232, a plot "U15 (UPB PREMIER HYBRID)" is U15,
   and punctuation is not part of a plot name ("U15R" is "U15-R"). Change
   these only alongside operation/operation_batch_detail.html and
   operation_stock_sales.js. */
lines AS (
  SELECT d.do_number,
         d.status,
         d.delivery_date,
         d.total_qty,
         d.remark,
         i AS line_no,
         NULLIF(TRIM((ARRAY[d.plot_1, d.plot_2, d.plot_3, d.plot_4, d.plot_5])[i]), '')     AS raw_plot,
         NULLIF(TRIM((ARRAY[d.batch_1, d.batch_2, d.batch_3, d.batch_4, d.batch_5])[i]), '') AS raw_batch,
         COALESCE((ARRAY[d.qty_1, d.qty_2, d.qty_3, d.qty_4, d.qty_5])[i], 0)               AS raw_qty,
         REGEXP_REPLACE(
           SPLIT_PART(REGEXP_REPLACE(UPPER(TRIM(COALESCE((ARRAY[d.plot_1, d.plot_2, d.plot_3, d.plot_4, d.plot_5])[i], ''))),
                                     '^PLOT\s*:?\s*', ''), ' ', 1),
           '[^0-9A-Z]', '', 'g')                                                            AS plot_key,
         REGEXP_REPLACE(
           SPLIT_PART(REGEXP_REPLACE(UPPER(TRIM(COALESCE((ARRAY[d.batch_1, d.batch_2, d.batch_3, d.batch_4, d.batch_5])[i], ''))),
                                     '^BATCH\s*:?\s*', ''), ' ', 1),
           '[^0-9A-Z]', '', 'g')                                                            AS batch_key
  FROM shared_do_records d,
       LATERAL generate_series(1, 5) AS i
  WHERE EXISTS (
    SELECT 1 FROM wanted w
    WHERE REGEXP_REPLACE(UPPER(COALESCE(d.do_number, '')), '[^0-9A-Z]', '', 'g')
        = REGEXP_REPLACE(UPPER(w.do_number),               '[^0-9A-Z]', '', 'g'))
),

/* Every plot each batch actually has — transplanted into, or transferred
   into. A line naming anything else has nowhere to land. */
plots AS (
  SELECT REGEXP_REPLACE(UPPER(TRIM(batch_name)), '[^0-9A-Z]', '', 'g') AS batch_key,
         REGEXP_REPLACE(UPPER(TRIM(plot_name)),  '[^0-9A-Z]', '', 'g') AS plot_key,
         MAX(UPPER(TRIM(plot_name)))                                   AS plot_as_recorded
  FROM shared_inventory_logs
  WHERE transaction_type IN ('Transplanted', 'Transplanted_DoubleTone', 'Cull3_Transfer')
    AND COALESCE(TRIM(plot_name), '') <> ''
  GROUP BY 1, 2
),

/* …and every batch the system has heard of at all, however it was keyed,
   so "no such batch" can be told from "that batch has no such plot". */
batches AS (
  SELECT REGEXP_REPLACE(UPPER(TRIM(batch_name)), '[^0-9A-Z]', '', 'g') AS batch_key,
         MAX(TRIM(batch_name))                                         AS batch_as_recorded
  FROM shared_inventory_logs
  WHERE COALESCE(TRIM(batch_name), '') <> ''
  GROUP BY 1
)

/* ONE result set — the SQL Editor only shows the last statement's. */
SELECT l.do_number                                   AS do,
       l.line_no                                     AS line,
       COALESCE(l.status, '')                        AS do_status,
       COALESCE(l.raw_batch, '— none —')             AS batch_as_keyed,
       COALESCE(l.raw_plot,  '— none —')             AS plot_as_keyed,
       CASE WHEN l.raw_qty > 0 THEN l.raw_qty ELSE COALESCE(l.total_qty, 0) END AS qty_read,
       (SELECT batch_as_recorded FROM batches b WHERE b.batch_key = l.batch_key) AS batch_found,
       (SELECT STRING_AGG(p.plot_as_recorded, ', ' ORDER BY p.plot_as_recorded)
          FROM plots p WHERE p.batch_key = l.batch_key)                          AS plots_that_batch_has,
       (SELECT STRING_AGG(DISTINCT p.batch_key, ', ')
          FROM plots p WHERE p.plot_key = l.plot_key)                            AS batches_with_that_plot,
       CASE
         WHEN l.raw_plot IS NULL
           THEN 'empty line — nothing keyed here, which is fine if the note has fewer lines'
         WHEN COALESCE(l.status, '') = 'Cancelled' OR COALESCE(l.remark, '') LIKE '%[CANCELLED]%'
           THEN 'CANCELLED — a cancelled note is not a sale, so nothing counts it. Correct.'
         WHEN l.raw_qty = 0 AND (SELECT COUNT(*) FROM lines x
                                  WHERE x.do_number = l.do_number AND x.raw_plot IS NOT NULL) > 1
           THEN 'NO QUANTITY on this line, and the note has more than one line — so there is '
                || 'no total to read it from and the line is skipped. Key the quantity.'
         WHEN l.batch_key = ''
           THEN 'NO BATCH on this line, so it belongs to no batch and no batch''s report can '
                || 'find it. Key the batch number on the line.'
         WHEN NOT EXISTS (SELECT 1 FROM batches b WHERE b.batch_key = l.batch_key)
           THEN 'THE BATCH DOES NOT EXIST. Nothing in the system was ever recorded against '
                || 'batch ' || l.batch_key || ' — check the batch number on the line.'
         WHEN NOT EXISTS (SELECT 1 FROM plots p WHERE p.batch_key = l.batch_key)
           THEN 'THAT BATCH HAS NO PLOTS. Batch ' || l.batch_key || ' exists but nothing was '
                || 'ever transplanted or transferred into a plot on it, so it has no plot for '
                || 'this sale to come out of.'
         WHEN NOT EXISTS (SELECT 1 FROM plots p
                           WHERE p.batch_key = l.batch_key AND p.plot_key = l.plot_key)
           THEN 'WRONG PAIR. Batch ' || l.batch_key || ' has no plot ' || l.plot_key
                || '. Look at plots_that_batch_has and batches_with_that_plot beside this row: '
                || 'one of the two is keyed wrongly, and the other column names what it should be.'
         ELSE 'MATCHES — this line reaches batch ' || l.batch_key || '''s plot ' || l.plot_key
              || '. If the figure still looks short, the Sales figure it feeds is on the 3rd '
              || 'Culling tab of that batch, not on this note.'
       END                                           AS why
FROM lines l
ORDER BY l.do_number, l.line_no;

-- WHAT A GOOD RESULT LOOKS LIKE
--   One row per line of each named note, and the why column says which
--   half is wrong in words you can act on.
--
--   WRONG PAIR is the common one, and the two columns beside it are the
--   answer: plots_that_batch_has lists what that batch actually has, and
--   batches_with_that_plot lists which batches that plot belongs to. One
--   of them is what the line should have said.
--
--   MATCHES means the line is fine and the shortfall is somewhere else —
--   send back the batch and plot and it can be followed from there.
--
--   NO ROWS AT ALL means no delivery note with that number exists. Check
--   the number, or that the note was saved rather than left on screen.
