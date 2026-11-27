-- =====================================================================
--  WHICH TRANSPLANTS ARE WAITING FOR YOUR VERIFY
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  READ-ONLY. It changes nothing.
--  No regular expressions and no backslashes, so it survives a paste.
--
--  WHY
--  The FC Portal shows a transplanted plot only once the office has
--  verified it on the batch report Tab 3 (Transplanting): the whole tab,
--  or that plot row. This lists every Transplanted row that is NOT yet
--  verified, so verifying it is what sends it to the FC Portal.
--
--  The rule is the FC Portal own (loadTransplantingSince):
--    the day is transaction_date, else the Date in the remark, else the
--    day it was saved. A row counts as verified when the batch has a
--    whole-tab sign-off (operation_batch_verifications, stage
--    transplanting) or a Row_Verification log for that plot.
--
-- WHAT TO LOOK FOR
--
--   1 this month   one row per plot and batch transplanted THIS month
--                  and not yet verified: nursery, plot, batch, the day(s)
--                  and the quantity. Open that batch, Tab 3, and verify.
--   2 earlier      the same for earlier months since 25 Aug 2026 (the day
--                  the FC Portal starts counting). These were showing on
--                  the FC board before and are hidden until verified.
--   3 summary      how many plots and seedlings wait, per nursery.
--
--   A line reading "nothing to report" means that part is empty, which
--   is a real answer: everything is verified.
-- =====================================================================
WITH t AS (
  SELECT
    l.plot_name,
    trim(coalesce(l.batch_name, '')) AS batch,
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
  FROM operation_batch_verifications
  WHERE stage = 'transplanting'
),
row_ok AS (
  SELECT DISTINCT
    trim(coalesce(batch_name, '')) AS batch,
    upper(translate(split_part(substr(plot_name, 16), '|', 1), ' -_./()|,', '')) AS pkey
  FROM shared_inventory_logs
  WHERE transaction_type = 'Row_Verification' AND plot_name LIKE 'transplanting::%'
),
plots AS (
  SELECT upper(translate(coalesce(plot_name, ''), ' -_./()|,', '')) AS pkey, max(nursery_name) AS nursery
  FROM shared_plots GROUP BY 1
),
waiting AS (
  SELECT t.*, coalesce(p.nursery, '(no nursery list)') AS nursery,
         t.day >= date_trunc('month', (now() AT TIME ZONE 'Asia/Kuala_Lumpur'))::date AS this_month
  FROM t
  LEFT JOIN plots p ON p.pkey = t.pkey
  WHERE t.qty > 0
    AND t.day >= DATE '2026-08-25'
    AND NOT EXISTS (SELECT 1 FROM stage_ok s WHERE s.batch = t.batch)
    AND NOT EXISTS (SELECT 1 FROM row_ok r WHERE r.batch = t.batch AND r.pkey = t.pkey)
),
grouped AS (
  SELECT this_month, nursery, plot_name, batch,
         string_agg(DISTINCT to_char(day, 'DD Mon YYYY'), ', ') AS days,
         min(day) AS first_day, sum(qty) AS qty
  FROM waiting
  GROUP BY this_month, nursery, plot_name, batch
),
out AS (
  SELECT 1 AS s, 'this month' AS section, nursery, plot_name AS plot, batch,
         days, qty::text AS qty, 'verify on Tab 3 and it flows to the FC Portal' AS note,
         first_day AS ord
  FROM grouped WHERE this_month
  UNION ALL
  SELECT 1, 'this month', '', '', '', '', '', 'nothing to report: every transplant this month is verified', NULL
  WHERE NOT EXISTS (SELECT 1 FROM grouped WHERE this_month)
  UNION ALL
  SELECT 2, 'earlier', nursery, plot_name, batch, days, qty::text,
         'hidden from the FC Portal until verified', first_day
  FROM grouped WHERE NOT this_month
  UNION ALL
  SELECT 2, 'earlier', '', '', '', '', '', 'nothing to report: every earlier transplant is verified', NULL
  WHERE NOT EXISTS (SELECT 1 FROM grouped WHERE NOT this_month)
  UNION ALL
  SELECT 3, 'summary', nursery, count(DISTINCT plot_name)::text || ' plot(s)', '',
         CASE WHEN bool_or(this_month) THEN 'this month' ELSE 'earlier only' END,
         sum(qty)::text, 'waiting for verify', NULL
  FROM grouped GROUP BY nursery
)
SELECT section, nursery, plot, batch, days, qty, note
FROM out
ORDER BY s, nursery, ord NULLS LAST, plot, batch;
