-- =====================================================================
--  WHICH PLOTS THE FC STILL HAS TO FILL IN (TRANSPLANTING JOBS)
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  READ-ONLY. It changes nothing.
--  No regular expressions and no backslashes, so it survives a paste.
--
--  WHY
--  The FC Portal raises a plot on its Pending Verification board while
--  any of the four transplanting jobs is unrecorded for the batches that
--  arrived there: Blanket Spray, Lining, Polybag Filling, Transplanting.
--  This is that board for EVERY nursery at once, by the FC Portal own
--  rule (loadTransplantingSince and missingJobs):
--    - a Transplanted row since 25 Aug 2026 that the office has VERIFIED
--      on Tab 3 (the whole tab, or that plot row)
--    - a job is owed when no record of that job on that plot names the
--      batch. A record with no batch on it covers every batch, and a
--      job answered as not done counts as answered.
--
-- WHAT TO LOOK FOR
--
--   1 owed      one row per plot: its nursery, the batches still owed,
--               the seedlings in them, and which of the four jobs are
--               missing. This is what the FC has to fill in.
--   2 summary   plots owed per nursery.
--
--   "nothing to report" means the FC has nothing outstanding.
-- =====================================================================
WITH t AS (
  SELECT
    trim(l.plot_name) AS plot,
    trim(coalesce(l.batch_name, '')) AS batch,
    upper(translate(coalesce(l.batch_name, ''), ' -_./()|,', '')) AS bkey,
    abs(coalesce(l.quantity_change, 0)) AS qty,
    coalesce(
      l.transaction_date::date,
      CASE WHEN position('Date:' in coalesce(l.remark, '')) > 0
            AND trim(substring(l.remark from position('Date:' in l.remark) + 5 for 11)) LIKE '____-__-__'
           THEN trim(substring(l.remark from position('Date:' in l.remark) + 5 for 11))::date END,
      (l.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date
    ) AS day,
    upper(translate(coalesce(l.plot_name, ''), ' -_./()|,', '')) AS pkey
  FROM shared_inventory_logs l
  WHERE l.transaction_type = 'Transplanted'
),
stage_ok AS (
  SELECT DISTINCT trim(coalesce(batch_name, '')) AS batch
  FROM operation_batch_verifications WHERE stage = 'transplanting'
),
row_ok AS (
  SELECT DISTINCT trim(coalesce(batch_name, '')) AS batch,
         upper(translate(split_part(substr(plot_name, 16), '|', 1), ' -_./()|,', '')) AS pkey
  FROM shared_inventory_logs
  WHERE transaction_type = 'Row_Verification' AND plot_name LIKE 'transplanting::%'
),
arrived AS (
  SELECT t.plot, t.pkey, t.batch, t.bkey, sum(t.qty) AS qty
  FROM t
  WHERE t.qty > 0 AND t.day >= DATE '2026-08-25'
    AND (EXISTS (SELECT 1 FROM stage_ok s WHERE s.batch = t.batch)
         OR EXISTS (SELECT 1 FROM row_ok r WHERE r.batch = t.batch AND r.pkey = t.pkey))
  GROUP BY t.plot, t.pkey, t.batch, t.bkey
),
jobs AS (
  SELECT * FROM (VALUES (1, 'blanket_spray', 'Blanket Spray'), (2, 'lining', 'Lining'),
                        (3, 'polybag_fill', 'Polybag Filling'), (4, 'transplanting', 'Transplanting')) j(n, key, label)
),
recs AS (
  SELECT trim(r.plot_name) AS plot, r.work_type, r.batch_name
  FROM nops_transplant_field_records r
  WHERE r.work_date >= DATE '2026-08-25'
),
covered AS (
  SELECT plot, work_type,
         bool_or(coalesce(trim(batch_name), '') = '') AS blank,
         array_agg(DISTINCT upper(translate(trim(b), ' -_./()|,', ''))) AS keys
  FROM recs
  LEFT JOIN LATERAL unnest(string_to_array(coalesce(recs.batch_name, ''), ',')) AS b ON true
  GROUP BY plot, work_type
),
owed AS (
  SELECT a.plot, a.pkey, a.batch, a.qty, j.n, j.label
  FROM arrived a
  CROSS JOIN jobs j
  LEFT JOIN covered c ON c.plot = a.plot AND c.work_type = j.key
  WHERE c.plot IS NULL
     OR (NOT c.blank AND NOT (a.bkey = ANY (c.keys)))
),
plots AS (
  SELECT upper(translate(coalesce(plot_name, ''), ' -_./()|,', '')) AS pkey, max(nursery_name) AS nursery
  FROM shared_plots GROUP BY 1
),
per_plot AS (
  SELECT coalesce(p.nursery, '(no nursery list)') AS nursery, o.plot,
         string_agg(DISTINCT o.batch, ', ') AS batches,
         (SELECT sum(a.qty) FROM arrived a WHERE a.plot = o.plot
            AND a.batch IN (SELECT o2.batch FROM owed o2 WHERE o2.plot = o.plot)) AS qty,
         (SELECT string_agg(j.label, ', ' ORDER BY j.n) FROM jobs j
            WHERE j.label IN (SELECT o3.label FROM owed o3 WHERE o3.plot = o.plot)) AS missing
  FROM owed o
  LEFT JOIN plots p ON p.pkey = o.pkey
  GROUP BY coalesce(p.nursery, '(no nursery list)'), o.plot
),
out AS (
  SELECT 1 AS s, 'owed' AS section, nursery, plot, batches, qty::text AS qty, missing
  FROM per_plot
  UNION ALL
  SELECT 1, 'owed', '', '', '', '', 'nothing to report: the FC has nothing to fill in'
  WHERE NOT EXISTS (SELECT 1 FROM per_plot)
  UNION ALL
  SELECT 2, 'summary', nursery, count(*)::text || ' plot(s)', '', sum(qty)::text, 'plots the FC still has to fill in'
  FROM per_plot GROUP BY nursery
)
SELECT section, nursery, plot, batches, qty, missing
FROM out
ORDER BY s, nursery, plot;
