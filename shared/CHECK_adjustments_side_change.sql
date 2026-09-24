-- =====================================================================
--  ADJUSTMENTS THAT WOULD CHANGE MEANING WHEN "WHICH COUNT WAS WRONG"
--  BECOMES SOMETHING THE REPORT DECIDES
--
--  Paste into the Supabase SQL Editor and press Run. READ-ONLY — it
--  changes nothing. Nothing in the app has been changed yet either;
--  this is the list to read before it is.
--
--  WHAT IS ABOUT TO CHANGE
--  Today the person raising an adjustment answers two questions: which
--  report they were on, and which count was wrong. The second one is
--  being removed, because the first already answers it:
--
--      Seeds Received · Planting · Seed Audit   → INITIAL
--          there were never that many. The batch total changes.
--      Transplanting · 1st · 2nd · 3rd Culling  → AFTER THE FACT
--          there were, and they left. The total does not change; what is
--          standing in that plot does.
--
--  And where an "after the fact" adjustment is taken off changes with it:
--
--      raised on Transplanting  → comes off 2nd AND 3rd Culling
--      raised on 1st Culling    → comes off 1st Culling only
--      raised on 2nd Culling    → comes off 2nd AND 3rd Culling
--      raised on 3rd Culling    → comes off 3rd Culling only
--
--  WHY THIS LIST EXISTS
--  Every adjustment already saved carries the answer the person chose, in
--  its remark. Most will agree with the new rule and nothing happens to
--  them. The ones that DISAGREE are listed here — each one is a figure
--  that will move on somebody's report the day this ships, and they are
--  the only rows worth looking at before it does.
--
--  Read the verdict on each. FIXES A MIS-FILE is the good kind. CHANGES
--  WHAT IT MEANT is the kind to check.
-- =====================================================================
WITH

adj AS (
  SELECT l.id,
         l.batch_name,
         l.quantity_change                                              AS qty,
         l.created_at,
         COALESCE(NULLIF(TRIM(SUBSTRING(l.remark FROM 'Report:\s*([^.]+?)\s*\.')), ''), '— none —') AS report,
         COALESCE(NULLIF(TRIM(SUBSTRING(l.remark FROM 'Plot:\s*([^.]+?)\s*\.')), ''), '— none —')   AS plot,
         /* Absent means "seed": every row written before the question was
            asked meant the batch total, because that is the only thing an
            adjustment could move then. Same reading as _parseCalibration
            in operation/operation_batch_detail.html. */
         LOWER(COALESCE(SUBSTRING(l.remark FROM 'Side:\s*(seed|plot)\s*\.'), 'seed'))               AS side_now,
         (l.remark ~ '\[APPROVED by')                                   AS approved,
         SUBSTRING(l.remark FROM '\[APPROVED by ([^\]]+?) on ')          AS approved_by,
         TRIM(REGEXP_REPLACE(
           REGEXP_REPLACE(
             REGEXP_REPLACE(
               REGEXP_REPLACE(COALESCE(l.remark, ''), '\s*\[APPROVED by [^\]]+\]', '', 'g'),
             'Report:\s*[^.]+?\s*\.\s*', '', 'g'),
           'Plot:\s*[^.]+?\s*\.\s*', '', 'g'),
         'Side:\s*(seed|plot)\s*\.\s*', '', 'g'))                        AS reason
  FROM shared_inventory_logs l
  WHERE l.transaction_type = 'Stock_Calibration'
),

judged AS (
  SELECT a.*,
         CASE WHEN LOWER(a.report) IN ('seeds received', 'planting', 'seed audit')
              THEN 'seed' ELSE 'plot' END                               AS side_after,
         /* Where it is taken off TODAY: a plot-side row raised on a
            culling report belongs to that report alone, anything else
            comes off both cullings. */
         CASE WHEN LOWER(a.report) IN ('seeds received', 'planting', 'seed audit')
                   AND a.side_now = 'seed'                THEN 'the batch total'
              WHEN a.side_now = 'seed'                    THEN 'the batch total'
              WHEN LOWER(a.report) = '2nd culling'        THEN '2nd Culling'
              WHEN LOWER(a.report) = '3rd culling'        THEN '3rd Culling'
              ELSE '2nd + 3rd Culling'
         END                                                            AS deducts_now,
         CASE WHEN LOWER(a.report) IN ('seeds received', 'planting', 'seed audit')
                                                          THEN 'the batch total'
              WHEN LOWER(a.report) = 'transplanting'      THEN '2nd + 3rd Culling'
              WHEN LOWER(a.report) = '1st culling'        THEN '1st Culling'
              WHEN LOWER(a.report) = '2nd culling'        THEN '2nd + 3rd Culling'
              WHEN LOWER(a.report) = '3rd culling'        THEN '3rd Culling'
              ELSE 'the batch total'
         END                                                            AS deducts_after
  FROM adj a
),

moved AS (
  SELECT * FROM judged
   WHERE side_now <> side_after OR deducts_now <> deducts_after
)

/* ONE result set — the SQL Editor only shows the last statement's. */
SELECT 0                                                AS sort,
       '— ALL BATCHES —'                                AS batch,
       NULL AS plot, NULL::bigint AS qty, NULL AS report,
       NULL AS from_, NULL AS to_, NULL::boolean AS approved, NULL AS reason,
       (SELECT count(*) FROM adj)::text || ' adjustment(s) on the system. '
         || (SELECT count(*) FROM moved)::text || ' would change, on '
         || (SELECT count(DISTINCT batch_name) FROM moved)::text || ' batch(es)'
         || CASE WHEN (SELECT count(*) FROM moved) = 0
                 THEN ' — nothing to look at. Every adjustment already agrees with the new rule.'
                 ELSE ': ' || COALESCE((SELECT STRING_AGG(DISTINCT batch_name, ', ') FROM moved), '')
                      || '. One row each below — only the APPROVED ones actually move a figure.'
            END                                         AS verdict
UNION ALL
SELECT 1,
       m.batch_name,
       m.plot,
       m.qty,
       m.report,
       CASE WHEN m.side_now = 'seed' THEN 'initial' ELSE 'after the fact' END || ' · ' || m.deducts_now,
       CASE WHEN m.side_after = 'seed' THEN 'initial' ELSE 'after the fact' END || ' · ' || m.deducts_after,
       m.approved,
       LEFT(m.reason, 90),
       CASE
         WHEN NOT m.approved
           THEN 'NOT APPROVED — moves no figure either way. It will simply be filed the new way '
                || 'when somebody approves it. Nothing to check.'
         WHEN m.side_now = 'seed' AND m.side_after = 'plot'
           THEN 'FIXES A MIS-FILE. It was taken off the batch total while the transplant record '
                || 'still counted these into the plot — the over-allocation that made batch 234 '
                || 'read short. It comes off the plot instead now, which is where they went.'
         WHEN m.side_now = 'plot' AND m.side_after = 'seed'
           THEN 'CHANGES WHAT IT MEANT. Somebody filed this against the PLOT on a report that is '
                || 'now read as the seed count. Check it: if these seedlings really did reach a '
                || 'plot and then leave it, this row should name a culling or transplanting '
                || 'report, not ' || m.report || '.'
         ELSE 'SAME KIND, DIFFERENT REPORTS. It stays "after the fact"; only where it is taken '
              || 'off moves — from ' || m.deducts_now || ' to ' || m.deducts_after || '. Check the '
              || 'plot on those tabs after the change and the figure should be the one you expect.'
       END                                              AS verdict
FROM moved m
ORDER BY sort, batch, report, plot;

-- WHAT A GOOD RESULT LOOKS LIKE
--   The first row is the summary. "Nothing to look at" with no rows under
--   it means every adjustment already agrees and the change is invisible.
--
--   from_ and to_ read "initial · the batch total" or "after the fact ·
--   2nd + 3rd Culling" — what the row does today, and what it would do.
--
--   NOT APPROVED rows need no thought: an adjustment nobody has ruled on
--   moves no figure.
--
--   FIXES A MIS-FILE is the reason for doing this at all.
--
--   CHANGES WHAT IT MEANT is the one to read properly. There should be
--   very few, and each is somebody's sentence in the reason column — it
--   usually says plainly whether the seedlings reached a plot.
--
--   SAME KIND, DIFFERENT REPORTS is a 1st or 2nd Culling row whose
--   deduction moves. Worth knowing which plots, not worth arguing about.
--
--   Send the whole thing back and the change can be made around it.
