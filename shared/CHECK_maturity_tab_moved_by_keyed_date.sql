-- CHECK — which maturity rows move tab now that the keyed date decides
--
-- The Monthly Maturity Allocation page buckets each (batch, plot) transplant
-- group under first transplant date plus nine months. The batch report saves
-- most Transplanted rows with NO transaction_date -- the date the user keyed
-- sits inside the remark ("... Date: 2026-07-22") -- and the page used to
-- fall back to created_at, the SAVE day. A row keyed promptly dates the same
-- either way, so the fault only showed on work keyed late: batch 264 went
-- out to U12 and U13 on 22 Jul 2026, was keyed in mid September, and both
-- plots matured onto the Jun 2027 tab while the Transplanting Report said
-- Apr 2027.
--
-- The page now reads the date the way the reports do: transaction_date,
-- else the date written in the remark, else created_at. This file is the
-- size of that change -- every (batch, plot) group whose month tab MOVES,
-- with the save day it was filed under and the keyed day it belongs to.
--
-- Good result: the SUMMARY line counts the moved groups, and each row under
-- it is a batch and plot the office could not find on the tab every other
-- page pointed at. Batch 264 / U12 and U13 should be among them, moving
-- from Jun 2027 to Apr 2027. A second run after the deploy reads the same
-- -- this file only reports, it changes nothing.

WITH tx AS (
  SELECT batch_name, plot_name,
         COALESCE(quantity_change, 0) AS qty,
         left(COALESCE(transaction_date::text, created_at::text), 10) AS save_dated,
         COALESCE(
           transaction_date::text,
           CASE WHEN position('Date: ' IN COALESCE(remark, '')) > 0
                 AND substr(remark, position('Date: ' IN remark) + 10, 1) = '-'
                 AND substr(remark, position('Date: ' IN remark) + 13, 1) = '-'
                THEN substr(remark, position('Date: ' IN remark) + 6, 10)
                ELSE NULL END,
           left(created_at::text, 10)
         ) AS keyed_dated
  FROM shared_inventory_logs
  WHERE transaction_type = 'Transplanted'
    AND COALESCE(trim(plot_name), '') <> ''
),
grp AS (
  SELECT batch_name, plot_name,
         SUM(qty) AS qty,
         MIN(save_dated) AS save_first,
         MIN(keyed_dated) AS keyed_first
  FROM tx
  GROUP BY batch_name, plot_name
),
tabs AS (
  SELECT batch_name, plot_name, qty, save_first, keyed_first,
         to_char(save_first::date + interval '9 months', 'Mon YYYY') AS old_tab,
         to_char(keyed_first::date + interval '9 months', 'Mon YYYY') AS new_tab
  FROM grp
  WHERE save_first IS NOT NULL AND keyed_first IS NOT NULL
)
SELECT 0 AS sort_first,
       '== SUMMARY =='                                   AS batch,
       ''                                                AS plot,
       count(*) FILTER (WHERE old_tab <> new_tab)
         || ' of ' || count(*) || ' groups move tab'     AS keyed_date,
       ''                                                AS save_day,
       ''                                                AS was_on_tab,
       ''                                                AS now_on_tab,
       SUM(qty) FILTER (WHERE old_tab <> new_tab)        AS qty
FROM tabs
UNION ALL
SELECT 1, batch_name, plot_name, keyed_first, save_first, old_tab, new_tab, qty
FROM tabs
WHERE old_tab <> new_tab
ORDER BY sort_first, keyed_date, batch, plot;
