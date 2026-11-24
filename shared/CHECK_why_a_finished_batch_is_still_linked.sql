-- WHY A BATCH WHOSE 3RD CULLING IS FINISHED IS STILL ON THE LINK.
--
-- The office, over a B4 row for 4 Nov still linking 233, 259, 261, 264 and
-- 270: 到底为什么已经结束了的batch一直在? 不要我讲一个改一个.
--
-- They are right that it had been answered one row at a time, so this file
-- answers it for EVERY record in the system at once. A batch is named on a
-- linked row when three things are all true of that plot and batch, and
-- there is no fourth, so the list of reasons below is closed:
--
--   1. no 3rd culling of it is keyed on or before the work day,
--   2. something is still standing on that day, nought or below being
--      nothing, and
--   3. the row has not been excluded by the per-row Exclude balance choice.
--
-- So a batch the office knows is finished can only still be named for one
-- of the reasons in sections 1 to 3, and the first of them is the one the
-- office can put right today.
--
-- Section 0 is the summary. READ THE LAST COLUMN OF IT FIRST.
-- Section 1 is THE ONE TO ACT ON: a 3rd culling that exists for this plot
--   and batch and lands AFTER the work day, so the rule correctly leaves
--   the batch standing. The commonest cause is no Cull Date keyed on Tab 6,
--   which drops the row onto the day somebody pressed Save -- often weeks
--   after the work. Key the date and the batch leaves by itself. The rows
--   whose day came from the SAVE DAY sort first, because those are the only
--   ones sitting on a day nobody chose.
-- Section 2 is a batch with NO 3rd culling row at all on that plot, split
--   into one already transferred out, which is the per-row Exclude balance
--   choice and nobody else can answer it, and one with nothing keyed, which
--   is a batch genuinely still standing there.
-- Section 3 is a 3rd culling row carrying NEITHER a drone map NOR a culled
--   figure. Nothing in it says any culling happened, so nothing acts on it.
-- Section 4 is A CULLING KEYED AND NOT FLOWN -- the figure is keyed, the
--   drone map is not, so the system counts no culling at all and the whole
--   pre-culling balance goes on being read as capacity. THIS IS WHERE THE
--   WORK IS: key the map on Tab 6 and the batch leaves by itself. It is
--   also the section that stopped a rule: making an unflown culling take
--   the batch off was built and reversed by this very query, which found
--   85 records and about 72,900 seedlings moving, 44 of them to NOUGHT.
--   The last column is what each record WOULD have read, so the size of
--   that decision stays visible rather than being a sentence in a note.
-- Section 5 is what is deliberately left alone.
--
-- Scope: the linked rows, which are the ones with no batch keyed by hand
-- and not yet Checked. A Checked row froze its own figure and its own
-- batch names the day it was agreed and nothing here reaches it.

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
-- EVERY 3RD CULLING ROW AS IT STANDS, flown or not, with the day it counts
-- on and which of the three things the day came from. A remark date counts
-- only where it is a plain YYYY-MM-DD, checked by SHAPE rather than by a
-- pattern, because the SQL Editor has choked on a regular expression and
-- this file has to survive a paste.
c3_raw AS (
  SELECT upper(translate(coalesce(plot_name, ''),  ' -_./()', '')) AS pk,
         upper(translate(coalesce(batch_name, ''), ' -_./()', '')) AS bk,
         coalesce(plot_name, '-')  AS plot,
         coalesce(batch_name, '-') AS batch,
         abs(coalesce(quantity_change, 0)) AS culled,
         position('MapQty:' in coalesce(remark, '')) > 0 AS flown,
         transaction_date,
         created_at::date AS saved_on,
         CASE WHEN position('CullDate:' in coalesce(remark, '')) > 0
              THEN btrim(substring(coalesce(remark, '')
                                   from position('CullDate:' in coalesce(remark, '')) + 9
                                   for 11))
              ELSE '' END AS d_remark_raw
    FROM shared_inventory_logs
   WHERE transaction_type = '3rd_Culling'
),
c3 AS (
  SELECT c3_raw.*,
         CASE WHEN length(d_remark_raw) >= 10
                   AND substring(d_remark_raw from 5 for 1) = '-'
                   AND substring(d_remark_raw from 8 for 1) = '-'
              THEN left(d_remark_raw, 10) ELSE '' END AS d_remark
    FROM c3_raw
),
c3_day AS (
  SELECT c3.*,
         CASE WHEN transaction_date IS NOT NULL THEN transaction_date
              WHEN d_remark <> ''               THEN d_remark::date
              ELSE saved_on END AS on_day,
         CASE WHEN transaction_date IS NOT NULL THEN 'the Cull Date keyed on Tab 6'
              WHEN d_remark <> ''               THEN 'a CullDate in the remark'
              ELSE 'THE DAY SOMEBODY PRESSED SAVE -- nobody chose it'
         END AS day_from,
         CASE WHEN transaction_date IS NOT NULL THEN 2
              WHEN d_remark <> ''               THEN 1
              ELSE 0 END AS day_rank
    FROM c3
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
         coalesce(r ->> 'checked', '0') NOT IN ('0', 'false', '') AS checked,
         coalesce(r ->> 'exclBal', '0') NOT IN ('0', 'false', '') AS excl
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
   WHERE no_batch AND NOT checked
),
-- Every plot and batch a linked row names, with the balance the rule reads
-- and the two 3rd-culling facts the app now asks: one flown by the work day,
-- and one keyed by the work day with a figure on it but not flown.
pb AS (
  SELECT d.rid, d.mth, d.plot AS rplot, d.jenis, d.tarikh, d.interrow,
         d.keyed, d.excl, d.work_day, d.pk, a.bk, a.batch,
         sum(CASE WHEN a.t = '2nd_Culling' THEN 0
                  WHEN a.t IN ('Transplanted', 'Cull3_Transfer_In') THEN abs(a.q)
                  WHEN a.t = 'Stock_Calibration' THEN a.q
                  ELSE -abs(a.q) END) AS base,
         sum(CASE WHEN a.t = '2nd_Culling' THEN abs(a.q) ELSE 0 END) AS c2,
         max(CASE WHEN a.t = '3rd_Culling' AND abs(a.q) > 0 THEN 1 ELSE 0 END) AS flown_by_day,
         max(CASE WHEN a.t = 'Cull3_Transfer_Out' THEN 1 ELSE 0 END) AS left_by_day
    FROM rec_day d
    JOIN all_ev a ON a.pk = d.pk AND a.on_day <= d.work_day
   GROUP BY d.rid, d.mth, d.plot, d.jenis, d.tarikh, d.interrow,
            d.keyed, d.excl, d.work_day, d.pk, a.bk, a.batch
),
scored AS (
  SELECT pb.*,
         CASE WHEN interrow THEN base ELSE base - c2 END AS closing,
         -- A 3rd culling keyed by the work day with a figure and no map.
         -- This is what the new rule acts on.
         (SELECT count(*) FROM c3_day k
           WHERE k.pk = pb.pk AND k.bk = pb.bk
             AND NOT k.flown AND k.culled > 0 AND k.on_day <= pb.work_day) AS claim_by_day,
         -- A 3rd culling of this plot and batch that lands AFTER the work day.
         (SELECT count(*) FROM c3_day k
           WHERE k.pk = pb.pk AND k.bk = pb.bk
             AND k.culled > 0 AND k.on_day > pb.work_day) AS c3_later,
         -- A row with neither a map nor a figure on it, any day.
         (SELECT count(*) FROM c3_day k
           WHERE k.pk = pb.pk AND k.bk = pb.bk
             AND NOT k.flown AND k.culled = 0) AS c3_shell,
         (SELECT count(*) FROM c3_day k
           WHERE k.pk = pb.pk AND k.bk = pb.bk AND k.culled > 0) AS c3_any
    FROM pb
),
-- WHAT IS STILL NAMED once the shipped rules have had their say.
named AS (
  SELECT * FROM scored
   WHERE flown_by_day = 0 AND closing > 0
     AND NOT (excl AND left_by_day = 1)
),
-- And why, one reason per named batch, in the order the office can act on.
-- Reason 0 is the one with a repair: the culling is keyed and the map is
-- not, so the whole balance is still capacity. It is listed per RECORD in
-- section 4 rather than here, because that is the row somebody opens.
why AS (
  SELECT named.*,
         CASE WHEN claim_by_day > 0 THEN 0
              WHEN c3_later > 0  THEN 1
              WHEN left_by_day = 1 THEN 2
              WHEN c3_shell > 0  THEN 3
              ELSE 4 END AS reason
    FROM named
),
-- THE EARLIEST CULLING LEFT OUT, with ITS OWN day source. Taken as one row
-- rather than as min(day) beside min(rank): on a plot and batch with two
-- cullings after the work day, those two aggregates can come off different
-- rows and the result would name a day and blame the wrong thing for it.
later_on AS (
  SELECT DISTINCT ON (w.rid, w.batch)
         w.rid, w.mth, w.rplot, w.jenis, w.tarikh, w.batch, w.closing,
         k.on_day AS lands_on, k.day_rank, k.day_from, k.culled
    FROM why w
    JOIN c3_day k ON k.pk = w.pk AND k.bk = w.bk
                 AND k.culled > 0 AND k.on_day > w.work_day
   WHERE w.reason = 1
   ORDER BY w.rid, w.batch, k.on_day, k.day_rank
),
-- One row per thing each section PRINTS, so the summary cannot quote a
-- figure the list under it disagrees with.
left_out AS (SELECT DISTINCT rplot, batch, jenis, tarikh, closing FROM why WHERE reason = 2),
no_cull  AS (SELECT DISTINCT rplot, batch, jenis, tarikh, closing, c3_any FROM why WHERE reason = 4),
-- WHAT AN UNFLOWN CULLING WOULD COST IF IT TOOK THE BATCH OFF. It does
-- NOT, and this is the measurement that settled that. Scoped to a row
-- whose figure is actually the link: no batch keyed, no quantity keyed,
-- not Checked.
figs AS (
  SELECT rid, mth, rplot, jenis, tarikh,
         coalesce(sum(closing) FILTER (WHERE flown_by_day = 0 AND closing > 0), 0) AS was,
         coalesce(sum(closing) FILTER (WHERE flown_by_day = 0 AND claim_by_day = 0 AND closing > 0), 0) AS now_q,
         coalesce(string_agg(batch, ', ' ORDER BY batch)
                  FILTER (WHERE flown_by_day = 0 AND claim_by_day > 0 AND closing > 0), '') AS leaving
    FROM scored
   WHERE NOT keyed
   GROUP BY rid, mth, rplot, jenis, tarikh
),
movers AS (SELECT * FROM figs WHERE was <> now_q),
shells AS (
  SELECT DISTINCT plot, batch, saved_on FROM c3_day WHERE NOT flown AND culled = 0
)

SELECT 0 AS section, 'SUMMARY' AS a, '-' AS b,
       (SELECT count(*) FROM why)::text || ' batch names are still on a linked row, over '
         || (SELECT count(DISTINCT rplot || batch) FROM why)::text || ' plot-and-batch pairs' AS c,
       -- NOT A SUM, and it says so: section 1 counts a row per record because
       -- that is the row somebody opens, and sections 2 and 3 count a pair,
       -- because the same batch standing on twenty work rows is one batch and
       -- a list of twenty is a wall nobody works down.
       'section 4, ' || (SELECT count(*) FROM movers)::text || ' record row(s) whose culling is keyed with no drone map. '
         || 'section 1, ' || (SELECT count(*) FROM later_on)::text || ' record row(s) dated after the work day. '
         || 'section 2, ' || (SELECT count(*) FROM left_out)::text || ' pair(s) transferred out and awaiting the Exclude choice and '
         || (SELECT count(*) FROM no_cull)::text || ' with no culling keyed. '
         || 'section 3, ' || (SELECT count(*) FROM shells)::text || ' pair(s) with an empty culling row' AS d,
       CASE WHEN (SELECT count(*) FROM movers) > 0
            THEN 'START AT SECTION 4 -- a keyed culling with no drone map, which is where the work is'
            WHEN (SELECT count(*) FROM later_on WHERE day_rank = 0) > 0
            THEN 'START AT SECTION 1 -- keying the Cull Date on Tab 6 takes those off by itself'
            WHEN (SELECT count(*) FROM later_on) > 0
            THEN 'read section 1 -- those cullings are dated after the work, which is a fact and not a fault'
            WHEN (SELECT count(*) FROM why) = 0
            THEN 'nothing to report -- every batch on every linked row is standing'
            ELSE 'no culling is mis-dated: every name left is a batch genuinely standing'
       END AS e
UNION ALL
-- The ones on a day NOBODY CHOSE sort first, and the label is what sorts
-- them -- those are the only rows anybody can put right.
SELECT 1, CASE WHEN l.day_rank = 0 THEN 'AFTER THE WORK DAY -- ON A DAY NOBODY CHOSE'
               ELSE 'AFTER THE WORK DAY -- ON ITS KEYED DATE' END, l.rplot,
       'batch ' || l.batch || ' -- ' || l.jenis || ' on ' || l.tarikh || ' (' || l.mth || ')',
       'its 3rd culling of ' || l.culled::text || ' counts on ' || l.lands_on::text
         || ', which is AFTER the work day, so ' || l.closing::text || ' is still linked',
       'that day came from ' || l.day_from
  FROM later_on l
UNION ALL
SELECT 1, 'nothing to report', '-', 'no linked batch has a 3rd culling dated after its work day',
       '-', 'every culling in the system lands on or before the work it is being compared with'
 WHERE NOT EXISTS (SELECT 1 FROM later_on)
UNION ALL
SELECT 2, 'TRANSFERRED OUT, NOT YET CULLED', rplot,
       'batch ' || batch || ' -- ' || jenis || ' on ' || tarikh,
       'balance ' || closing::text || ' left behind by a transfer, no 3rd culling keyed',
       'NOT a fault -- only the office knows if the round was walked before the culling or after, so the row carries Exclude balance'
  FROM left_out
UNION ALL
SELECT 2, 'NO 3RD CULLING KEYED AT ALL', rplot,
       'batch ' || batch || ' -- ' || jenis || ' on ' || tarikh,
       'balance ' || closing::text || ', and the ledger has no 3rd culling row for this plot and batch',
       CASE WHEN c3_any > 0
            THEN 'the batch HAS been culled on another plot -- this one has no row'
            ELSE 'so far as the ledger says, this batch is still standing here' END
  FROM no_cull
UNION ALL
SELECT 2, 'nothing to report', '-', 'no linked batch is standing without a culling',
       '-', 'every name left is explained by section 1 or section 3'
 WHERE NOT EXISTS (SELECT 1 FROM left_out) AND NOT EXISTS (SELECT 1 FROM no_cull)
UNION ALL
SELECT 3, 'AN EMPTY 3RD CULLING ROW', s.plot,
       'batch ' || s.batch,
       'a 3rd culling row with NO drone map and NO culled figure, saved ' || s.saved_on::text,
       'nothing in it says a culling happened, so nothing acts on it -- fill it in or take it off Tab 6'
  FROM shells s
UNION ALL
SELECT 3, 'nothing to report', '-', 'no empty 3rd culling row anywhere in the ledger',
       '-', 'every 3rd culling row carries a map or a figure'
 WHERE NOT EXISTS (SELECT 1 FROM shells)
UNION ALL
SELECT 4, 'A CULLING KEYED AND NOT FLOWN', m.rplot,
       'record ' || m.rid || ' -- ' || m.jenis || ' on ' || m.tarikh || ' (' || m.mth || ')',
       'batch ' || m.leaving || ' carries a keyed 3rd culling with NO drone map, so the whole '
         || m.was::text || ' is still read as capacity',
       'key the map on Tab 6 and it leaves by itself -- dropping it here instead would have taken this row to '
         || m.now_q::text || ', and that rule was reversed by this section'
  FROM movers m
UNION ALL
SELECT 4, 'nothing to report', '-', 'no 3rd culling is keyed without its drone map',
       '-', 'so no linked row counts a batch somebody has already culled on paper'
 WHERE NOT EXISTS (SELECT 1 FROM movers)
UNION ALL
SELECT 5, 'LEFT ALONE', '-',
       'a Checked row, and a row with a batch keyed by hand',
       'a Checked row froze its figure and its batch names the day it was agreed',
       'and a keyed batch is the office own answer, which this rule never overrules'
ORDER BY 1, 2, 3, 4;
