-- WHAT IS STANDING ON A REPLANT PLOT, AND WHY ITS BATCH IS STILL LINKED.
--
-- The office, over five B14-R rows each reading 232 and 30: 232 怎么还在?
--
-- A -R plot is MADE BY a 3rd-culling transfer, so the batch standing on it
-- has already been 3rd culled -- on the PARENT plot. That culling is what
-- sent the seedlings here, and leaving them named is the exception the
-- office asked for in their own words: 已经结束了3rd culling了的batch就不要
-- 再link了 除了plot-R. The rule is asked of one PLOT AND BATCH, so a
-- culling keyed against B14 says nothing about B14-R.
--
-- A batch leaves a -R plot by exactly three doors and there is no fourth:
--   1. a 3rd culling of THAT plot and batch, with a drone map keyed,
--   2. the balance reaching nought or below, which the link reads as
--      nothing standing, or
--   3. the per-row Exclude balance choice, which is the office own.
--
-- Section 0 is the answer: every -R plot and batch, what is standing, and
--   which of the three doors is open. READ THE LAST COLUMN.
-- Section 1 is the working: every movement of every -R plot and batch in
--   date order with a running balance, so a figure can be followed to the
--   row that made it. A movement counting for NOTHING is shown and MARKED
--   -- a 3rd culling with no drone map, a calibration nobody approved --
--   because those are the rows that look like an answer and are not.
-- Section 2 is the Interrow figure where it differs, which is not a
--   disagreement: Interrow Spraying sprays the ground between the rows and
--   keeps the 2nd culling standing, so one plot and batch can read two
--   figures on two rows of one day.
--
-- Nothing is changed by this file. Safe to run as often as you like.

WITH raw AS (
  SELECT coalesce(plot_name, '-')     AS plot,
         coalesce(batch_name, '-')    AS batch,
         transaction_type             AS tt,
         coalesce(quantity_change, 0) AS q,
         coalesce(remark, '')         AS rm,
         transaction_date             AS td,
         created_at                   AS ca
    FROM shared_inventory_logs
   WHERE transaction_type IN ('Transplanted', '2nd_Culling', '3rd_Culling',
                              'Cull3_Transfer', 'Stock_Calibration')
),
ev AS (
  SELECT upper(translate(plot,  ' -_./()', '')) AS pk,
         upper(translate(batch, ' -_./()', '')) AS bk,
         plot, batch,
         CASE WHEN tt = 'Cull3_Transfer' THEN 'Cull3_Transfer_In' ELSE tt END AS t,
         q,
         coalesce(td, ca::date) AS on_day,
         CASE WHEN td IS NULL THEN ' (save day)' ELSE '' END AS day_note,
         CASE WHEN tt = '3rd_Culling' AND position('MapQty:' in rm) = 0
                THEN 'NO DRONE MAP -- counts for nothing'
              WHEN tt = 'Stock_Calibration' AND position('[APPROVED' in rm) = 0
                THEN 'NOT APPROVED -- counts for nothing'
              ELSE '' END AS inert,
         CASE WHEN tt = 'Cull3_Transfer'
                THEN btrim(split_part(split_part(rm, 'From: [', 2), '|', 1))
              ELSE '' END AS from_plot
    FROM raw
  UNION ALL
  SELECT upper(translate(btrim(split_part(split_part(rm, 'From: [', 2), '|', 1)), ' -_./()', '')),
         upper(translate(batch, ' -_./()', '')),
         btrim(split_part(split_part(rm, 'From: [', 2), '|', 1)),
         batch,
         'Cull3_Transfer_Out', abs(q),
         coalesce(td, ca::date),
         CASE WHEN td IS NULL THEN ' (save day)' ELSE '' END,
         '',
         ''
    FROM raw
   WHERE tt = 'Cull3_Transfer' AND position('From: [' in rm) > 0
),
real_pb AS (SELECT DISTINCT pk, bk FROM ev WHERE pk <> '' AND bk <> ''),
do_lines AS (
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
),
sold AS (
  SELECT s.pk, s.bk, s.plot, s.batch, 'Sold' AS t, s.q, s.on_day,
         '' AS day_note, '' AS inert, '' AS from_plot
    FROM (SELECT upper(translate(coalesce(p, ''), ' -_./()', '')) AS pk,
                 upper(translate(coalesce(b, ''), ' -_./()', '')) AS bk,
                 coalesce(p, '-') AS plot, coalesce(b, '-') AS batch,
                 abs(coalesce(n, 0)) AS q, d AS on_day
            FROM do_lines
           WHERE d IS NOT NULL AND coalesce(n, 0) <> 0) s
    JOIN real_pb r ON r.pk = s.pk AND r.bk = s.bk
),
mv AS (
  SELECT pk, bk, plot, batch, t, q, on_day, day_note, inert, from_plot FROM ev WHERE pk <> ''
  UNION ALL
  SELECT pk, bk, plot, batch, t, q, on_day, day_note, inert, from_plot FROM sold
),
-- Every 3rd culling anywhere, so the PARENT plot can be asked about too.
c3_all AS (
  SELECT pk, bk, bool_or(inert = '' AND abs(q) > 0) AS flown
    FROM mv WHERE t = '3rd_Culling' GROUP BY pk, bk
),
rp AS (SELECT DISTINCT pk FROM mv WHERE position('-R' in upper(plot)) > 0),
m AS (
  SELECT mv.pk, mv.bk, mv.plot, mv.batch, mv.t, mv.q, mv.on_day, mv.day_note,
         mv.inert, mv.from_plot,
         CASE WHEN mv.inert <> '' THEN 0
              WHEN mv.t IN ('Transplanted', 'Cull3_Transfer_In')  THEN abs(mv.q)
              WHEN mv.t IN ('3rd_Culling', '2nd_Culling', 'Sold',
                            'Cull3_Transfer_Out')                 THEN -abs(mv.q)
              WHEN mv.t = 'Stock_Calibration'                     THEN mv.q
              ELSE 0 END AS sgn
    FROM mv JOIN rp ON rp.pk = mv.pk
),
pb AS (
  SELECT pk, bk, max(plot) AS plot, max(batch) AS batch,
         bool_or(t = '3rd_Culling' AND inert = '' AND abs(q) > 0) AS c3_flown,
         bool_or(t = '3rd_Culling' AND inert <> '')               AS c3_claim,
         max(CASE WHEN t = 'Cull3_Transfer_In' THEN from_plot ELSE '' END) AS came_from,
         min(CASE WHEN t = 'Cull3_Transfer_In' THEN on_day END)            AS came_on
    FROM m GROUP BY pk, bk
),
bal AS (
  SELECT p.pk, p.bk, p.plot, p.batch, p.c3_flown, p.c3_claim, p.came_from, p.came_on,
         coalesce(pc.flown, false) AS parent_flown,
         sum(CASE WHEN p.c3_flown AND m.t = '2nd_Culling' THEN 0 ELSE m.sgn END) AS closing,
         sum(CASE WHEN m.t = '2nd_Culling' THEN 0 ELSE m.sgn END)                AS closing_ir
    FROM pb p
    JOIN m ON m.pk = p.pk AND m.bk = p.bk
    LEFT JOIN c3_all pc
           ON pc.pk = upper(translate(p.came_from, ' -_./()', '')) AND pc.bk = p.bk
   GROUP BY p.pk, p.bk, p.plot, p.batch, p.c3_flown, p.c3_claim,
            p.came_from, p.came_on, pc.flown
),
run AS (
  SELECT m.plot, m.batch, m.on_day, m.day_note, m.t, m.sgn, m.q, m.inert,
         sum(CASE WHEN b.c3_flown AND m.t = '2nd_Culling' THEN 0 ELSE m.sgn END)
             OVER (PARTITION BY m.pk, m.bk
                   ORDER BY m.on_day, m.t, m.q
                   ROWS UNBOUNDED PRECEDING) AS running
    FROM m JOIN bal b ON b.pk = m.pk AND b.bk = m.bk
),
out0 AS (
  SELECT 0 AS sec, 0 AS sub, b.plot AS k1, b.batch AS k2,
         b.plot AS c_plot, b.batch AS c_batch,
         b.closing::text AS c_qty,
         CASE WHEN b.c3_flown THEN 'YES, flown'
              WHEN b.c3_claim THEN 'keyed but NO drone map, so it counts for nothing'
              ELSE 'none keyed' END AS c_own,
         CASE WHEN coalesce(b.came_from, '') = '' THEN 'not a transfer'
              ELSE 'from ' || b.came_from || ' on ' || coalesce(b.came_on::text, '-')
                   || CASE WHEN b.parent_flown
                           THEN ', which WAS 3rd culled -- that is what sent them here'
                           ELSE ', which has NO flown 3rd culling' END
         END AS c_came,
         CASE WHEN b.c3_flown  THEN 'already OFF the link -- 3rd culled here'
              WHEN b.closing <= 0 THEN 'already OFF the link -- nothing standing'
              ELSE 'STILL LINKED -- ' || b.closing::text
                   || ' standing and nothing says they left ' || b.plot
         END AS c_why
    FROM bal b
),
out1 AS (
  SELECT 1 AS sec, 0 AS sub, r.plot AS k1, r.batch AS k2,
         r.plot, r.batch,
         r.on_day::text || r.day_note AS c_qty,
         r.t AS c_own,
         CASE WHEN r.sgn >= 0 THEN '+' ELSE '' END || r.sgn::text
           || CASE WHEN r.inert <> '' THEN '   (' || r.inert || ', keyed ' || abs(r.q)::text || ')' ELSE '' END AS c_came,
         'balance after: ' || r.running::text AS c_why
    FROM run r
),
out2 AS (
  SELECT 2 AS sec, 0 AS sub, b.plot AS k1, b.batch AS k2,
         b.plot, b.batch, b.closing::text,
         b.closing_ir::text,
         (b.closing_ir - b.closing)::text,
         'Interrow keeps the 2nd culling standing, so it reads higher'
    FROM bal b WHERE b.closing_ir <> b.closing
),
hdr AS (
  SELECT 0 AS sec, -1 AS sub, '' AS k1, '' AS k2,
         '== SECTION 0 ==' AS c_plot, 'every -R plot and batch' AS c_batch,
         'standing' AS c_qty, '3rd culling ON THIS PLOT' AS c_own,
         'how the batch got here' AS c_came, 'WHY IT IS STILL LINKED' AS c_why
  UNION ALL
  SELECT 1, -1, '', '', '== SECTION 1 ==', 'every movement, in date order',
         'day', 'what', 'counts as', 'running balance'
  UNION ALL
  SELECT 2, -1, '', '', '== SECTION 2 ==', 'where Interrow differs',
         'other jobs', 'Interrow', 'difference', 'and that is not a disagreement'
),
nil AS (
  SELECT 0 AS sec, 1 AS sub, 'zzz' AS k1, 'zzz' AS k2,
         'nothing to report' AS c_plot, 'no -R plot has any movement at all' AS c_batch,
         '-' AS c_qty, '-' AS c_own, '-' AS c_came, '-' AS c_why
   WHERE NOT EXISTS (SELECT 1 FROM bal)
  UNION ALL
  SELECT 1, 1, 'zzz', 'zzz', 'nothing to report',
         'no -R plot has any movement at all', '-', '-', '-', '-'
   WHERE NOT EXISTS (SELECT 1 FROM run)
  UNION ALL
  SELECT 2, 1, 'zzz', 'zzz', 'nothing to report',
         'no -R plot reads differently for Interrow', '-', '-', '-', '-'
   WHERE NOT EXISTS (SELECT 1 FROM bal WHERE closing_ir <> closing)
)
SELECT c_plot AS "Plot", c_batch AS "Batch", c_qty AS "Qty",
       c_own AS "3rd culling here", c_came AS "Came from", c_why AS "Reading"
  FROM (
    SELECT * FROM hdr
    UNION ALL SELECT * FROM out0
    UNION ALL SELECT * FROM out1
    UNION ALL SELECT * FROM out2
    UNION ALL SELECT * FROM nil
  ) z
 ORDER BY sec, sub, k1, k2, c_qty;
