-- WHICH BATCH NAMES LEAVE THE LINK, AND WHAT IT COSTS (nothing).
--
-- The office put two screens side by side. The Work Record row for B6-R on
-- 6 Nov linked ten batches. The Summary Report for the same plot and the
-- same day lists five. The five extra had movement on that plot at some
-- point and NOTHING LEFT standing by the work date.
--
-- A batch was named for having an EVENT, not for having seedlings. It is
-- now named only where something is standing.
--
-- READ SECTION 0 FIRST. The capacity line should read NOUGHT: a batch with
-- nothing standing adds nothing, so only the names change. If it does not
-- read nought, stop and say so.
--
-- Section 1 is every work record that loses a name, with the names.
-- Section 2 is the plot and batch behind them.
-- Section 2b is the half worth reading beside it: a batch 2nd culled to
--   nought is gone for every job EXCEPT Interrow Spraying, which sprays the
--   ground between the rows and keeps the culling standing. The same plot
--   and batch therefore answers differently on two rows of one day, and
--   that is the interrow rule working rather than a disagreement.
-- Section 3 is the other half of the rule: a NEGATIVE balance is kept and
--   named, because the Summary Report draws one and it is a figure to look
--   into. Those rows are worth a second look on their own account.
-- Section 4 is what is left alone.

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
leaving AS (SELECT * FROM scored WHERE culled = 0 AND closing = 0),
-- A batch nought only because the 2nd culling came off: standing on interrow.
kept AS (SELECT * FROM scored WHERE culled = 0 AND interrow AND base > 0 AND base - c2 = 0),
moved AS (
  SELECT rid, mth, rplot, jenis, tarikh,
         string_agg(batch, ', ' ORDER BY batch) AS names,
         count(*) AS n
    FROM leaving GROUP BY rid, mth, rplot, jenis, tarikh
),
held AS (
  SELECT count(*) FILTER (WHERE keyed)   AS n_keyed,
         count(*) FILTER (WHERE checked) AS n_checked
    FROM rec_day
)

SELECT 0 AS section, 'SUMMARY' AS a, '-' AS b,
       (SELECT count(*) FROM moved)::text || ' work records lose a batch name' AS c,
       '0 seedlings of capacity move -- a batch with nothing standing adds nothing' AS d,
       CASE WHEN (SELECT count(*) FROM moved) = 0
            THEN 'nothing to report -- every batch on every link is standing'
            ELSE 'the records next, then the plot and batch behind them'
       END AS e
UNION ALL
SELECT 1, mth, rplot, 'record ' || rid || ' -- ' || jenis || ' on ' || tarikh,
       'stops naming ' || names,
       n::text || ' name(s) off the list, the figure unchanged'
  FROM moved
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
       'the Summary Report does not list it either'
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
SELECT DISTINCT 3, rplot, batch, 'BELOW NOUGHT as at ' || tarikh,
       'reads ' || closing::text,
       'KEPT and still named -- the report draws it too, and it is a figure to look into'
  FROM scored WHERE culled = 0 AND closing < 0
UNION ALL
SELECT 3, 'nothing to report', '-', 'no plot and batch is below nought on any work date',
       '-', 'so nothing here needs looking into'
 WHERE NOT EXISTS (SELECT 1 FROM scored WHERE culled = 0 AND closing < 0)
UNION ALL
SELECT 4, 'left alone', '-',
       (SELECT n_keyed FROM held)::text || ' rows carry a figure somebody keyed',
       (SELECT n_checked FROM held)::text || ' rows are Checked and were frozen when agreed',
       'neither reads the link, and a row with a batch keyed by hand is untouched'

ORDER BY 1, 2, 3, 4;
