-- WHICH SALES THE WORK MAINTENANCE LINK COULD NOT COUNT, AND WHAT IT MOVES.
--
-- The office, over the batch report Sales tile for B14-R -- two delivery
-- notes, 30 on DO 03357 and 5 on DO 03364, total 35 -- beside a linked row
-- still reading 30 standing: B14-R卖出去了不是吗？？
--
-- They were right. DO 03357 had "232 (B13)" typed into its batch field, the
-- origin plot in brackets. The Summary Report reads a batch by its trailing
-- digits and places that on batch 232. shared_plot_movement.js, which is
-- what the Work Maintenance link, the Worker Record capacity totals and the
-- salary claim all read, only dropped punctuation -- so it read batch
-- "232B13", matched nothing, and the sale reached no plot. The plot went on
-- reading 30 standing after the lorry had emptied it, and 30 of CAPACITY was
-- being paid on ground with nothing in it.
--
-- The link now keys a plot and a batch exactly as the report does. THIS FILE
-- IS WHAT SAYS HOW MUCH THAT MOVES, and it moves the piece-rate money, so
-- read section 0 before anything else.
--
-- Section 0 is the size of it: how many live delivery lines the old rule
--   could not place and the new one can, how many seedlings, and how many
--   plot-and-batch pairs are affected.
-- Section 1 is every one of those lines, with the delivery note number so it
--   can be opened, and both keys side by side so the spelling is visible.
-- Section 2 is per plot and batch: how much that plot stops reading as
--   standing. THAT IS THE CAPACITY THAT MOVES. A row here whose figure is
--   large is a plot whose linked quantity drops by exactly that much on
--   every unchecked work record of that plot.
-- Section 3 is every live line NEITHER rule can place. Those are not fixed
--   by this change and need a person -- CHECK_do_lines_unmatched.sql is the
--   file for them.
--
-- A CHECKED ROW DOES NOT MOVE. Checked froze its own figure the day it was
-- agreed, so nothing here reaches a settled month, and a verified claim
-- holds its own snapshot.
--
-- "nothing to report" is a real answer on every section and means no
-- delivery line in the system carries a batch or plot spelling the old rule
-- could not read.
--
-- Nothing is changed by this file. Safe to run as often as you like.

WITH live AS (
  SELECT do_number, delivery_date AS d, 1 AS i, plot_1 AS p, qty_1 AS n, batch_1 AS b
    FROM shared_do_records
   WHERE coalesce(status, '') <> 'Cancelled' AND position('[CANCELLED]' in coalesce(remark, '')) = 0
  UNION ALL SELECT do_number, delivery_date, 2, plot_2, qty_2, batch_2 FROM shared_do_records
   WHERE coalesce(status, '') <> 'Cancelled' AND position('[CANCELLED]' in coalesce(remark, '')) = 0
  UNION ALL SELECT do_number, delivery_date, 3, plot_3, qty_3, batch_3 FROM shared_do_records
   WHERE coalesce(status, '') <> 'Cancelled' AND position('[CANCELLED]' in coalesce(remark, '')) = 0
  UNION ALL SELECT do_number, delivery_date, 4, plot_4, qty_4, batch_4 FROM shared_do_records
   WHERE coalesce(status, '') <> 'Cancelled' AND position('[CANCELLED]' in coalesce(remark, '')) = 0
  UNION ALL SELECT do_number, delivery_date, 5, plot_5, qty_5, batch_5 FROM shared_do_records
   WHERE coalesce(status, '') <> 'Cancelled' AND position('[CANCELLED]' in coalesce(remark, '')) = 0
),
led AS (
  SELECT plot_name AS p, batch_name AS b
    FROM shared_inventory_logs
   WHERE transaction_type IN ('Transplanted', '2nd_Culling', '3rd_Culling',
                              'Cull3_Transfer', 'Stock_Calibration')
     AND NOT (transaction_type = '3rd_Culling'
              AND position('MapQty:' in coalesce(remark, '')) = 0)
     AND NOT (transaction_type = 'Stock_Calibration'
              AND position('[APPROVED' in coalesce(remark, '')) = 0)
  UNION ALL
  SELECT btrim(split_part(split_part(coalesce(remark, ''), 'From: [', 2), '|', 1)), batch_name
    FROM shared_inventory_logs
   WHERE transaction_type = 'Cull3_Transfer'
     AND position('From: [' in coalesce(remark, '')) > 0
),
-- Both sides go through ONE copy of the key machinery, or the ledger and
-- the delivery line could be read by two rules that have drifted apart.
src AS (
  SELECT 'do'::text AS kind, do_number, d, i, coalesce(n, 0) AS n,
         coalesce(p, '') AS p, coalesce(b, '') AS b
    FROM live WHERE d IS NOT NULL AND coalesce(n, 0) <> 0
  UNION ALL
  SELECT 'led', NULL, NULL, 0, 0, coalesce(p, ''), coalesce(b, '') FROM led
),
-- A leading Plot: comes off BEFORE the note is split, the order the report
-- uses, or PLOT: U15 reads as plot PLOT.
s1 AS (
  SELECT src.*, btrim(b) AS bt,
         CASE WHEN upper(btrim(p)) LIKE 'PLOT%'
              THEN btrim(ltrim(substr(btrim(p), 5), ' :')) ELSE btrim(p) END AS pt
    FROM src
),
s2 AS (
  SELECT s1.*,
         split_part(split_part(split_part(split_part(bt, ' ', 1), '(', 1), ',', 1), '[', 1) AS nb,
         split_part(split_part(split_part(split_part(pt, ' ', 1), '(', 1), ',', 1), '[', 1) AS np
    FROM s1
),
-- The last letter or digit, so the trailing punctuation can come off: 225.
-- is still batch 225.
s3 AS (
  SELECT s2.*,
         (SELECT coalesce(max(g.i), 0) FROM generate_series(1, length(nb)) g(i)
           WHERE position(upper(substr(nb, g.i, 1))
                 in '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ') > 0) AS last_alnum
    FROM s2
),
s4 AS (SELECT s3.*, left(nb, last_alnum) AS cl FROM s3),
-- The last character that is NOT a digit, so everything after it is the
-- trailing digit run the report reads as the batch.
s5 AS (
  SELECT s4.*,
         (SELECT coalesce(max(g.i), 0) FROM generate_series(1, length(cl)) g(i)
           WHERE position(substr(cl, g.i, 1) in '0123456789') = 0) AS last_nondigit
    FROM s4
),
keyed AS (
  SELECT s5.*,
         (SELECT coalesce(string_agg(upper(substr(bt, g.i, 1)), '' ORDER BY g.i), '')
            FROM generate_series(1, length(bt)) g(i)
           WHERE position(upper(substr(bt, g.i, 1))
                 in '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ') > 0) AS old_b,
         (SELECT coalesce(string_agg(upper(substr(pt, g.i, 1)), '' ORDER BY g.i), '')
            FROM generate_series(1, length(pt)) g(i)
           WHERE position(upper(substr(pt, g.i, 1))
                 in '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ') > 0) AS old_p_raw,
         (SELECT coalesce(string_agg(upper(substr(np, g.i, 1)), '' ORDER BY g.i), '')
            FROM generate_series(1, length(np)) g(i)
           WHERE position(upper(substr(np, g.i, 1))
                 in '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ') > 0) AS new_p,
         CASE WHEN length(cl) = 0 OR last_nondigit >= length(cl) THEN ''
              ELSE coalesce(nullif(ltrim(substr(cl, last_nondigit + 1), '0'), ''), '0')
         END AS new_digits
    FROM s5
),
-- The old plot key read the WHOLE string, note and all. The old batch key
-- did too. The new ones read the report answer, falling back to the old
-- batch key where the report can place no batch at all, so a name with no
-- trailing digits keeps the plot it always matched.
k AS (
  SELECT keyed.*, old_p_raw AS old_p,
         CASE WHEN new_digits = '' THEN old_b ELSE new_digits END AS new_b
    FROM keyed
),
real_old AS (SELECT DISTINCT old_p AS p, old_b AS b FROM k
              WHERE kind = 'led' AND old_p <> '' AND old_b <> ''),
real_new AS (SELECT DISTINCT new_p AS p, new_b AS b FROM k
              WHERE kind = 'led' AND new_p <> '' AND new_b <> ''),
dol AS (
  SELECT k.*,
         EXISTS (SELECT 1 FROM real_old r WHERE r.p = k.old_p AND r.b = k.old_b) AS was_counted,
         EXISTS (SELECT 1 FROM real_new r WHERE r.p = k.new_p AND r.b = k.new_b) AS is_counted
    FROM k WHERE kind = 'do'
),
moved AS (SELECT * FROM dol WHERE NOT was_counted AND is_counted),
lost  AS (SELECT * FROM dol WHERE NOT was_counted AND NOT is_counted),
per_pb AS (
  SELECT new_p AS p, new_b AS b, sum(n) AS qty, count(*) AS lines
    FROM moved GROUP BY new_p, new_b
),
out0 AS (
  SELECT 0 AS sec, 0 AS sub, '' AS k1, '' AS k2,
         'DELIVERY LINES THAT NOW COUNT' AS c1,
         (SELECT count(*)::text FROM moved) AS c2,
         (SELECT coalesce(sum(n), 0)::text FROM moved) AS c3,
         (SELECT count(*)::text FROM per_pb) AS c4,
         (SELECT count(*)::text FROM lost) AS c5
),
out1 AS (
  SELECT 1 AS sec, 0 AS sub, coalesce(m.do_number, '-') AS k1, m.new_p || m.new_b AS k2,
         coalesce(m.do_number, '-') || '  ' || coalesce(m.d::text, '-') AS c1,
         'plot [' || m.p || ']' AS c2,
         'batch [' || m.b || ']' AS c3,
         m.n::text AS c4,
         'was read as ' || m.old_p || ' / ' || m.old_b
           || ', now ' || m.new_p || ' / ' || m.new_b AS c5
    FROM moved m
),
out2 AS (
  SELECT 2 AS sec, 0 AS sub, p AS k1, b AS k2,
         p AS c1, b AS c2, qty::text AS c3, lines::text AS c4,
         'this plot and batch stops reading ' || qty::text || ' as standing' AS c5
    FROM per_pb
),
out3 AS (
  SELECT 3 AS sec, 0 AS sub, coalesce(l.do_number, '-') AS k1, l.p || l.b AS k2,
         coalesce(l.do_number, '-') || '  ' || coalesce(l.d::text, '-') AS c1,
         'plot [' || l.p || ']' AS c2,
         'batch [' || l.b || ']' AS c3,
         l.n::text AS c4,
         'NEITHER rule can place this -- see CHECK_do_lines_unmatched.sql' AS c5
    FROM lost l
),
hdr AS (
  SELECT 0 AS sec, -1 AS sub, '' AS k1, '' AS k2,
         '== SECTION 0 == what this moves' AS c1, 'lines' AS c2,
         'seedlings' AS c3, 'plot and batch pairs' AS c4,
         'lines nothing can place (section 3)' AS c5
  UNION ALL SELECT 1, -1, '', '', '== SECTION 1 ==  every line that now counts',
         'plot as typed', 'batch as typed', 'qty', 'the two keys'
  UNION ALL SELECT 2, -1, '', '', '== SECTION 2 ==  THE CAPACITY THAT MOVES',
         'batch', 'seedlings', 'lines', 'what it means'
  UNION ALL SELECT 3, -1, '', '', '== SECTION 3 ==  still needs a person',
         'plot as typed', 'batch as typed', 'qty', 'why'
),
nil AS (
  SELECT 1 AS sec, 1 AS sub, 'zzz' AS k1, 'zzz' AS k2,
         'nothing to report' AS c1, 'no delivery line was being dropped' AS c2,
         '-' AS c3, '-' AS c4, '-' AS c5
   WHERE NOT EXISTS (SELECT 1 FROM moved)
  UNION ALL SELECT 2, 1, 'zzz', 'zzz', 'nothing to report',
         'no plot and batch changes what it reads', '-', '-', '-'
   WHERE NOT EXISTS (SELECT 1 FROM per_pb)
  UNION ALL SELECT 3, 1, 'zzz', 'zzz', 'nothing to report',
         'every live delivery line reaches a plot and a batch', '-', '-', '-'
   WHERE NOT EXISTS (SELECT 1 FROM lost)
)
SELECT c1 AS "Delivery note", c2 AS "Plot", c3 AS "Batch",
       c4 AS "Qty", c5 AS "Reading"
  FROM (
    SELECT * FROM hdr
    UNION ALL SELECT * FROM out0
    UNION ALL SELECT * FROM out1
    UNION ALL SELECT * FROM out2
    UNION ALL SELECT * FROM out3
    UNION ALL SELECT * FROM nil
  ) z
 ORDER BY sec, sub, k1, k2, c1;
