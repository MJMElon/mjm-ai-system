-- ============================================================================
-- CHECK_what_the_3rd_culling_rule_moves.sql
--
-- The office, over an Interrow Spraying row on B14 still linking batches 234
-- and 262: 已经结束了3rd culling了的batch就不要再link了 除了plot-R
-- 3rd culling后 main plot不会有那个batch了 最多只会去p-R
--
-- WHAT CHANGED. A work record with no quantity keyed into it reads the
-- Summary Report balance of the plot, batch by batch. A batch whose 3rd
-- culling has been keyed AND FLOWN has left the main plot -- the good
-- seedlings went to the -R plot and the rest were culled -- so there is
-- nothing of it standing there to spray, and the capacity stops counting
-- it. That capacity is the piece-rate money, so this file is what says how
-- much of it moves, and on which rows, BEFORE anybody reloads the page.
--
-- RUN THIS FIRST and read row 0.
--
-- WHAT IS NOT TOUCHED, and it is most of what a settled month is made of:
--   a row somebody KEYED a figure into          -- that was always their own answer
--   a row that is CHECKED                       -- its figure was written down the day it was agreed
--   a batch with a transfer out and NO 3rd culling keyed -- still near culling,
--       and still the per-row Include or Exclude balance choice
--   a 3rd culling nobody has flown              -- a claim, and it was never a deduction either
--   a -R plot                                   -- the batch arrived there, it did not leave
--
-- THE -R EXCEPTION IS NOT A RULE OF ITS OWN. The question is asked of one
-- PLOT AND BATCH, so a batch sitting on a -R plot carries the transfer IN
-- and no 3rd culling of its own. Section 3 names any -R plot that does
-- appear, which means that plot has itself been 3rd culled and really is
-- empty.
--
-- Read only. Nothing is changed. Safe to run twice.
--
-- ONE THING IT CANNOT DO AS EXACTLY AS THE PAGE: a ledger row with no keyed
-- transaction_date is dated here by the day somebody pressed Save, where the
-- page reads a Date in the remark first. The SQL Editor cannot be handed a
-- regular expression, so those rows are NAMED in section 4 instead of being
-- parsed. A culling in that list, close to a work date, is worth opening the
-- batch report for before trusting the figure beside it.
--
-- WHAT A GOOD RESULT LOOKS LIKE, one result set:
--   section 0  SUMMARY. how many rows move and by how much in total. Nought
--              rows moving is a real answer and means no plot in the system
--              is carrying a batch it has already 3rd culled.
--   section 1  every work record that moves, biggest first: the month, the
--              day, the plot, the job, what it reads now and what it will
--              read. A row here in a month that is signed off is the one to
--              look at twice.
--   section 2  the plot and batch behind them: when it was culled, and what
--              the ledger still shows for it. A LARGE figure here is worth
--              a second look on its own account -- it is seedlings the
--              report says are standing on a plot the office says is empty,
--              which is usually a transfer row that was never keyed.
--   section 3  rows that do NOT move, and why. This is where a checked or
--              keyed month shows itself as untouched.
--   section 4  ledger rows carrying no keyed date -- see above.
-- ============================================================================

WITH ev AS (
  SELECT upper(translate(coalesce(plot_name, ''),  ' -_./()', '')) AS pk,
         upper(translate(coalesce(batch_name, ''), ' -_./()', '')) AS bk,
         coalesce(plot_name, '-')  AS plot,
         coalesce(batch_name, '-') AS batch,
         CASE WHEN transaction_type = 'Cull3_Transfer'
              THEN 'Cull3_Transfer_In' ELSE transaction_type END AS t,
         coalesce(quantity_change, 0) AS q,
         coalesce(transaction_date, created_at::date) AS on_day
    FROM shared_inventory_logs
   WHERE transaction_type IN ('Transplanted', '2nd_Culling', '3rd_Culling',
                              'Cull3_Transfer', 'Stock_Calibration')
     -- A 3rd culling nobody has flown is a claim and never becomes an event,
     -- and an adjustment nobody has approved moves no figure anywhere.
     AND NOT (transaction_type = '3rd_Culling'
              AND position('MapQty:' in coalesce(remark, '')) = 0)
     AND NOT (transaction_type = 'Stock_Calibration'
              AND position('[APPROVED' in coalesce(remark, '')) = 0)
  UNION ALL
  -- The other side of a transfer: plot_name is where they landed, the remark
  -- says which plot they left.
  SELECT upper(translate(split_part(split_part(coalesce(remark, ''), 'From: [', 2), '|', 1), ' -_./()', '')),
         upper(translate(coalesce(batch_name, ''), ' -_./()', '')),
         btrim(split_part(split_part(coalesce(remark, ''), 'From: [', 2), '|', 1)),
         coalesce(batch_name, '-'),
         'Cull3_Transfer_Out', abs(coalesce(quantity_change, 0)),
         coalesce(transaction_date, created_at::date)
    FROM shared_inventory_logs
   WHERE transaction_type = 'Cull3_Transfer'
     AND position('From: [' in coalesce(remark, '')) > 0
),
-- Which plot and batch pairs the ledger really has. A delivery order only
-- counts against one of these, exactly as the movement report counts it.
real_pb AS (SELECT DISTINCT pk, bk FROM ev WHERE pk <> '' AND bk <> ''),
sales AS (
  SELECT upper(translate(coalesce(p, ''), ' -_./()', '')) AS pk,
         upper(translate(coalesce(b, ''), ' -_./()', '')) AS bk,
         coalesce(p, '-') AS plot, coalesce(b, '-') AS batch,
         'Sold' AS t, abs(coalesce(n, 0)) AS q, d AS on_day
    FROM (
      SELECT delivery_date AS d, plot_1 AS p, qty_1 AS n, batch_1 AS b FROM shared_do_records
       WHERE coalesce(status, '') <> 'Cancelled' AND position('[CANCELLED]' in coalesce(remark, '')) = 0
      UNION ALL SELECT delivery_date, plot_2, qty_2, batch_2 FROM shared_do_records
       WHERE coalesce(status, '') <> 'Cancelled' AND position('[CANCELLED]' in coalesce(remark, '')) = 0
      UNION ALL SELECT delivery_date, plot_3, qty_3, batch_3 FROM shared_do_records
       WHERE coalesce(status, '') <> 'Cancelled' AND position('[CANCELLED]' in coalesce(remark, '')) = 0
      UNION ALL SELECT delivery_date, plot_4, qty_4, batch_4 FROM shared_do_records
       WHERE coalesce(status, '') <> 'Cancelled' AND position('[CANCELLED]' in coalesce(remark, '')) = 0
      UNION ALL SELECT delivery_date, plot_5, qty_5, batch_5 FROM shared_do_records
       WHERE coalesce(status, '') <> 'Cancelled' AND position('[CANCELLED]' in coalesce(remark, '')) = 0
    ) x
   WHERE coalesce(n, 0) <> 0 AND d IS NOT NULL
),
all_ev AS (
  SELECT pk, bk, plot, batch, t, q, on_day FROM ev
  UNION ALL
  SELECT s.pk, s.bk, s.plot, s.batch, s.t, s.q, s.on_day FROM sales s
   WHERE EXISTS (SELECT 1 FROM real_pb r WHERE r.pk = s.pk AND r.bk = s.bk)
),
-- Every plot and batch whose 3rd culling is keyed and flown. These are the
-- ones that stop being counted, from the day they were culled.
culled AS (
  SELECT pk, bk, min(plot) AS plot, min(batch) AS batch, min(on_day) AS culled_on
    FROM all_ev
   WHERE t = '3rd_Culling' AND abs(q) > 0
   GROUP BY pk, bk
),
-- The work records. Each element of the one JSONB list is a row.
rec AS (
  SELECT coalesce(r ->> 'id', '?') AS rid,
         coalesce(r ->> '_month', 'no month') AS mth,
         coalesce(r ->> 'tarikh', '-') AS tarikh,
         coalesce(r ->> 'plot', '') AS plot,
         coalesce(r ->> 'batch', '') AS batch,
         coalesce(r ->> 'jenis', '-') AS jenis,
         upper(translate(coalesce(r ->> 'plot', ''), ' -_./()', '')) AS pk,
         (r ->> 'qty') IS NOT NULL AS keyed,
         coalesce(r ->> 'checked', '0') NOT IN ('0', 'false', '') AS checked
    -- Guarded both ways: a NULL list, or a row holding something that is not
    -- an array, would take the whole paste down with a type error rather
    -- than answering about the rows that ARE there.
    FROM nops_maint_records m,
         jsonb_array_elements(CASE WHEN jsonb_typeof(m.records) = 'array'
                                   THEN m.records ELSE '[]'::jsonb END) r
),
-- A tarikh is stored as YYYY-MM-DD. Anything else, a dash included, means no
-- day has been keyed yet, and the page then stands at everything that has
-- happened -- so a far day stands in for that here.
rec_day AS (
  SELECT rec.*,
         CASE WHEN length(btrim(tarikh)) = 10
               AND substr(btrim(tarikh), 5, 1) = '-'
               AND substr(btrim(tarikh), 8, 1) = '-'
              THEN btrim(tarikh)::date ELSE date '4000-01-01' END AS work_day
    FROM rec
),
-- Which culled buckets each record was counting. An empty batch cell means
-- every batch standing on the plot, which is what it has always meant.
hit AS (
  SELECT d.rid, d.mth, d.tarikh, d.plot, d.jenis, d.keyed, d.checked,
         c.pk, c.bk, c.batch AS bname, c.culled_on,
         (SELECT coalesce(sum(CASE WHEN a.t = '2nd_Culling' THEN 0
                                   WHEN a.t IN ('Transplanted', 'Cull3_Transfer_In') THEN abs(a.q)
                                   WHEN a.t = 'Stock_Calibration' THEN a.q
                                   ELSE -abs(a.q) END), 0)
            FROM all_ev a
           WHERE a.pk = c.pk AND a.bk = c.bk AND a.on_day <= d.work_day) AS was
    FROM rec_day d
    JOIN culled c ON c.pk = d.pk AND c.culled_on <= d.work_day
   WHERE btrim(d.batch) = ''
      OR c.bk = ANY (SELECT upper(translate(x, ' -_./()', ''))
                       FROM unnest(string_to_array(translate(d.batch, ';/|', ',,,'), ',')) x)
),
moved AS (
  SELECT rid, mth, tarikh, plot, jenis,
         string_agg(bname, ', ' ORDER BY bname) AS batches,
         sum(was) AS comes_off
    FROM hit
   WHERE NOT keyed AND NOT checked
   GROUP BY rid, mth, tarikh, plot, jenis
),
held AS (
  SELECT count(*) FILTER (WHERE keyed)   AS n_keyed,
         count(*) FILTER (WHERE checked) AS n_checked
    FROM (SELECT DISTINCT rid, keyed, checked FROM hit) h
)

SELECT 0 AS section, 'SUMMARY' AS a, '-' AS b,
       (SELECT count(*) FROM moved)::text || ' work records move' AS c,
       coalesce((SELECT sum(comes_off) FROM moved), 0)::text || ' of capacity stops being counted' AS d,
       CASE WHEN (SELECT count(*) FROM moved) = 0
            THEN 'nothing to report -- no row is counting a batch its plot has already 3rd culled'
            ELSE 'the rows next, then the plot and batch behind them'
       END AS e
UNION ALL
SELECT 1, mth, plot, 'record ' || rid || ' -- ' || jenis || ' on ' || tarikh,
       'batch ' || batches || ' is off this plot',
       'reads ' || comes_off::text || ' less than it did'
  FROM moved
UNION ALL
SELECT 1, 'nothing to report', '-', 'no unchecked, unkeyed row is counting a culled batch',
       '-', 'so no capacity moves anywhere'
 WHERE NOT EXISTS (SELECT 1 FROM moved)
UNION ALL
SELECT 2, c.plot, c.batch,
       '3rd culled on ' || to_char(c.culled_on, 'DD Mon YYYY'),
       'the ledger still shows ' || (
         SELECT coalesce(sum(CASE WHEN a.t = '2nd_Culling' THEN 0
                                  WHEN a.t IN ('Transplanted', 'Cull3_Transfer_In') THEN abs(a.q)
                                  WHEN a.t = 'Stock_Calibration' THEN a.q
                                  ELSE -abs(a.q) END), 0)
           FROM all_ev a WHERE a.pk = c.pk AND a.bk = c.bk)::text || ' standing',
       CASE WHEN position('R' in right(c.pk, 1)) > 0
            THEN 'a -R plot that has itself been 3rd culled, so it really is empty'
            ELSE 'after a 3rd culling the main plot does not hold this batch'
       END
  FROM culled c
UNION ALL
SELECT 2, 'nothing to report', '-', 'no plot and batch in the ledger carries a flown 3rd culling',
       '-', 'so there is nothing for the rule to take off'
 WHERE NOT EXISTS (SELECT 1 FROM culled)
UNION ALL
SELECT 3, 'left alone', '-',
       (SELECT n_keyed FROM held)::text || ' rows carry a figure somebody keyed',
       (SELECT n_checked FROM held)::text || ' rows are Checked and were frozen when they were agreed',
       'neither reads the link at all, so neither moves'
UNION ALL
SELECT 4, coalesce(plot_name, '-'), coalesce(batch_name, '-'),
       transaction_type || ' of ' || abs(coalesce(quantity_change, 0))::text,
       'no keyed date -- counted here on ' || created_at::date::text,
       'the page reads a Date in the remark first, so open the batch report before trusting a figure near this day'
  FROM shared_inventory_logs
 WHERE transaction_date IS NULL
   AND transaction_type IN ('3rd_Culling', 'Cull3_Transfer')
UNION ALL
SELECT 4, 'nothing to report', '-', 'every 3rd culling and transfer carries a keyed date',
       '-', 'so this check dates them exactly as the page does'
 WHERE NOT EXISTS (
   SELECT 1 FROM shared_inventory_logs
    WHERE transaction_date IS NULL
      AND transaction_type IN ('3rd_Culling', 'Cull3_Transfer'))

ORDER BY 1, 2, 3, 4;
