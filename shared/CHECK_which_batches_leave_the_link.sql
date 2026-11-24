-- WHICH BATCH NAMES LEAVE THE LINK, AND WHAT IT COSTS.
--
-- The office put two screens side by side. The Work Record row for B6-R on
-- 6 Nov linked ten batches. The Summary Report for the same plot and the
-- same day lists five. The five extra had movement on that plot at some
-- point and NOTHING LEFT standing by the work date.
--
-- A batch was named for having an EVENT, not for having seedlings. It is
-- now named only where something is STANDING, which the office settled as
-- nought or below: 小过负数也不要出现 只要过了3rd cull统统不要出现.
--
-- READ SECTION 0 FIRST, and read the second figure on it. A batch closing at
-- NOUGHT adds nought, so those records only lose a name. A batch closing
-- BELOW nought was SUBTRACTING, so dropping it RAISES the capacity by that
-- much -- and capacity is what somebody is paid off. That figure is the whole
-- cost of this change. Section 3 names every record it moves.
--
-- Section 1 is every work record that loses a name, with the names.
-- Section 2 is the plot and batch behind them.
-- Section 2b is the half worth reading beside it: a batch 2nd culled to
--   nought is gone for every job EXCEPT Interrow Spraying, which sprays the
--   ground between the rows and keeps the culling standing. The same plot
--   and batch therefore answers differently on two rows of one day, and
--   that is the interrow rule working rather than a disagreement.
-- Section 3 is every record whose FIGURE moves, what it read and what it
--   reads now. Nought here is the answer to hope for and means no plot in
--   the system carries a negative balance.
-- Section 4 is the ONE way a batch can still be named after a 3rd culling:
--   one keyed with NO drone map. The system never counts such a culling at
--   all, so it takes nothing off and the batch goes on standing. Those are
--   not dropped here, because it is the map that says the culling happened
--   and the figure is somebody pay -- they are NAMED so the office can say.
-- Section 5 is what is left alone.

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
     AND NOT (transaction_type = '3rd_Culling'
              AND position('MapQty:' in coalesce(remark, '')) = 0)
     AND NOT (transaction_type = 'Stock_Calibration'
              AND position('[APPROVED' in coalesce(remark, '')) = 0)
  UNION ALL
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
rec AS (
  SELECT coalesce(r ->> 'id', '?') AS rid,
         coalesce(r ->> '_month', 'no month') AS mth,
         coalesce(r ->> 'tarikh', '-') AS tarikh,
         coalesce(r ->> 'plot', '') AS plot,
         coalesce(r ->> 'jenis', '-') AS jenis,
         upper(translate(coalesce(r ->> 'plot', ''), ' -_./()', '')) AS pk,
         btrim(coalesce(r ->> 'batch', '')) = '' AS no_batch,
         (r ->> 'qty') IS NOT NULL AS keyed,
         coalesce(r ->> 'checked', '0') NOT IN ('0', 'false', '') AS checked
    FROM nops_maint_records m,
         jsonb_array_elements(CASE WHEN jsonb_typeof(m.records) = 'array'
                                   THEN m.records ELSE '[]'::jsonb END) r
),
rec_day AS (
  SELECT rec.*,
         rec.jenis = 'Meracun rumput secara selingan' AS interrow,
         CASE WHEN length(btrim(tarikh)) = 10
               AND substr(btrim(tarikh), 5, 1) = '-'
               AND substr(btrim(tarikh), 8, 1) = '-'
              THEN btrim(tarikh)::date ELSE date '4000-01-01' END AS work_day
    FROM rec
),
-- Every plot and batch a record could name, with the two figures the rule
-- needs: the balance with the 2nd culling taken off, and the one that keeps
-- it in, which is what Interrow Spraying reads.
pb AS (
  SELECT d.rid, d.mth, d.plot AS rplot, d.jenis, d.tarikh, d.interrow,
         d.keyed, d.checked, a.batch,
         sum(CASE WHEN a.t = '2nd_Culling' THEN 0
                  WHEN a.t IN ('Transplanted', 'Cull3_Transfer_In') THEN abs(a.q)
                  WHEN a.t = 'Stock_Calibration' THEN a.q
                  ELSE -abs(a.q) END) AS base,
         sum(CASE WHEN a.t = '2nd_Culling' THEN abs(a.q) ELSE 0 END) AS c2,
         max(CASE WHEN a.t = '3rd_Culling' AND abs(a.q) > 0 THEN 1 ELSE 0 END) AS culled
    FROM rec_day d
    JOIN all_ev a ON a.pk = d.pk AND a.on_day <= d.work_day
   WHERE d.no_batch AND NOT d.keyed AND NOT d.checked
   GROUP BY d.rid, d.mth, d.plot, d.jenis, d.tarikh, d.interrow, d.keyed, d.checked, a.batch
),
scored AS (
  SELECT pb.*, CASE WHEN interrow THEN base ELSE base - c2 END AS closing FROM pb
),
leaving AS (SELECT * FROM scored WHERE culled = 0 AND closing <= 0),
-- A batch nought only because the 2nd culling came off: standing on interrow.
kept AS (SELECT * FROM scored WHERE culled = 0 AND interrow AND base > 0 AND base - c2 = 0),
moved AS (
  SELECT rid, mth, rplot, jenis, tarikh,
         string_agg(batch, ', ' ORDER BY batch) AS names,
         count(*) AS n
    FROM leaving GROUP BY rid, mth, rplot, jenis, tarikh
),
-- What each record read before the rule and reads after it. Only a bucket
-- BELOW nought can move this, a nought adding nought either way.
figs AS (
  SELECT rid, mth, rplot, jenis, tarikh,
         coalesce(sum(closing) FILTER (WHERE culled = 0), 0) AS was,
         coalesce(sum(closing) FILTER (WHERE culled = 0 AND closing > 0), 0) AS now_q
    FROM scored GROUP BY rid, mth, rplot, jenis, tarikh
),
movers AS (SELECT * FROM figs WHERE was <> now_q),
-- A 3rd culling keyed with no drone map is not an event at all, so it takes
-- nothing off and cannot empty its batch. The one case left.
unflown AS (
  SELECT DISTINCT d.mth, d.plot AS rplot, d.tarikh, l.batch_name AS batch,
         abs(coalesce(l.quantity_change, 0)) AS culled_qty, s.closing
    FROM rec_day d
    JOIN shared_inventory_logs l
      ON upper(translate(coalesce(l.plot_name, ''), ' -_./()', '')) = d.pk
     AND l.transaction_type = '3rd_Culling'
     AND position('MapQty:' in coalesce(l.remark, '')) = 0
     AND coalesce(l.transaction_date, l.created_at::date) <= d.work_day
    JOIN scored s ON s.rid = d.rid
     AND upper(translate(s.batch, ' -_./()', ''))
       = upper(translate(coalesce(l.batch_name, ''), ' -_./()', ''))
   WHERE s.culled = 0 AND s.closing > 0
),
held AS (
  SELECT count(*) FILTER (WHERE keyed)   AS n_keyed,
         count(*) FILTER (WHERE checked) AS n_checked
    FROM rec_day
)

SELECT 0 AS section, 'SUMMARY' AS a, '-' AS b,
       (SELECT count(*) FROM moved)::text || ' work records lose a batch name' AS c,
       CASE WHEN (SELECT count(*) FROM movers) = 0
            THEN 'NOUGHT of capacity moves -- no plot carries a negative balance'
            ELSE (SELECT count(*) FROM movers)::text || ' of them read a DIFFERENT figure, by '
              || (SELECT coalesce(sum(now_q - was), 0) FROM movers)::text
              || ' seedlings in all -- every one a negative that was subtracting'
       END AS d,
       CASE WHEN (SELECT count(*) FROM moved) = 0
            THEN 'nothing to report -- every batch on every link is standing'
            WHEN (SELECT count(*) FROM movers) = 0
            THEN 'only names move: no plot in the system carries a negative balance'
            ELSE 'read section 3 -- those figures are capacity somebody is paid off'
       END AS e
UNION ALL
SELECT 1, m.mth, m.rplot, 'record ' || m.rid || ' -- ' || m.jenis || ' on ' || m.tarikh,
       'stops naming ' || m.names,
       m.n::text || ' name(s) off the list, '
         || CASE WHEN f.rid IS NULL THEN 'the figure unchanged'
                 ELSE 'AND the figure moves -- section 3' END
  FROM moved m LEFT JOIN movers f ON f.rid = m.rid
UNION ALL
SELECT 1, 'nothing to report', '-', 'no link names a batch with nothing standing',
       '-', 'the list and the Summary Report already agree'
 WHERE NOT EXISTS (SELECT 1 FROM moved)
UNION ALL
SELECT DISTINCT 2, rplot, batch, 'nothing standing as at ' || tarikh,
       CASE WHEN c2 = 0 THEN 'balance ' || base::text
            WHEN interrow THEN 'balance ' || base::text
                 || ', and interrow keeps its 2nd culling of ' || c2::text || ' in'
            ELSE 'balance ' || base::text || ' less a 2nd culling of ' || c2::text END,
       CASE WHEN closing < 0
            THEN 'BELOW nought -- the report DOES draw this row, and that gap is worth opening'
            ELSE 'the Summary Report does not list it either' END
  FROM leaving
UNION ALL
SELECT 2, 'nothing to report', '-', 'no plot and batch is empty on any work date',
       '-', 'so no name is taken off anywhere'
 WHERE NOT EXISTS (SELECT 1 FROM leaving)
UNION ALL
SELECT DISTINCT 2, rplot, batch, 'STILL STANDING on ' || jenis || ' as at ' || tarikh,
       'balance ' || base::text || ', its 2nd culling of ' || c2::text || ' kept in',
       'same plot and batch, gone on every other job -- the interrow rule, not a disagreement'
  FROM kept
UNION ALL
SELECT 3, mth, rplot, 'record ' || rid || ' -- ' || jenis || ' on ' || tarikh,
       'read ' || was::text || ', now reads ' || now_q::text,
       'the capacity RISES by ' || (now_q - was)::text
         || ' -- a negative balance was being subtracted and is no longer counted'
  FROM movers
UNION ALL
SELECT 3, 'nothing to report', '-', 'no work record reads a different figure',
       '-', 'no plot and batch in the system closes below nought, so only names moved'
 WHERE NOT EXISTS (SELECT 1 FROM movers)
UNION ALL
SELECT DISTINCT 4, rplot, batch, 'a 3rd culling of ' || culled_qty::text
         || ' with NO drone map, as at ' || tarikh,
       'still standing at ' || closing::text || ', so it is still named',
       'the map is what evidences a culling -- key it on Tab 6 and the batch leaves by itself'
  FROM unflown
UNION ALL
SELECT 4, 'nothing to report', '-', 'every 3rd culling on every named batch carries its drone map',
       '-', 'so no batch is named after a culling the system can see'
 WHERE NOT EXISTS (SELECT 1 FROM unflown)
UNION ALL
SELECT 5, 'left alone', '-',
       (SELECT n_keyed FROM held)::text || ' rows carry a figure somebody keyed',
       (SELECT n_checked FROM held)::text || ' rows are Checked and were frozen when agreed',
       'neither reads the link, and a row with a batch keyed by hand is untouched'

ORDER BY 1, 2, 3, 4;
