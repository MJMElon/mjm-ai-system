-- =====================================================================
--  DRONE MAPS THAT DON'T TALLY — AND THE ADJUSTMENT THAT EXPLAINS THEM
--  EVERY BATCH AT ONCE. Paste into the Supabase SQL Editor and press Run.
--  Read-only: it changes nothing, so it is safe to run as often as you
--  like.
--
--  A plot's 3rd Culling record carries what was culled and what the drone
--  map counted. When they disagree the batch sits in Amendment Needed
--  until somebody writes a reason against the plot.
--
--  Very often the reason is already on the system: an adjustment against
--  that same plot, for exactly that many seedlings. It only moves the
--  plot's figures when it is BOTH approved AND filed as PLOT STOCK —
--  "these reached the plot and then left it", which is what stolen, dead
--  or miscounted means. Filed against the SEED COUNT it says something
--  else entirely: that the batch never had them to plant, so it corrects
--  the allocation and leaves the plot alone.
--
--  This lists every plot that does not tally, on every batch, and says
--  which of those two things is in the way.
-- =====================================================================
WITH

cull3 AS (
  SELECT l.batch_name,
         UPPER(TRIM(l.plot_name))                                        AS plot,
         COALESCE(l.quantity_change, 0)                                  AS culled,
         COALESCE((REGEXP_MATCH(COALESCE(l.remark, ''), 'MapQty:\s*(\d+)'))[1]::INT, 0) AS map_qty,
         COALESCE(l.remark, '') LIKE '%MismatchNote:%'                   AS has_reason,
         COALESCE(l.remark, '') AS remark
  FROM shared_inventory_logs l
  WHERE l.transaction_type = '3rd_Culling'
),

/* Only the rows that were actually counted. A plot with no map keyed is
   not a plot that disagrees with its map — it is one nobody has counted
   yet, and it belongs to the report's own progress, not here. */
mismatch AS (
  SELECT *, map_qty - culled AS difference
  FROM cull3
  WHERE remark LIKE '%MapQty:%'
    AND map_qty <> culled
),

/* Every adjustment, parsed the way the page parses it. A row with no
   "Side:" predates the question and means the seed count — that was the
   only thing an adjustment could move when it was written. */
adj AS (
  SELECT l.batch_name,
         COALESCE(l.quantity_change, 0) AS qty,
         UPPER(TRIM(COALESCE((REGEXP_MATCH(COALESCE(l.remark, ''), 'Plot:\s*([^.]+?)\s*\.'))[1],
                             l.plot_name, ''))) AS plot,
         LOWER(COALESCE((REGEXP_MATCH(COALESCE(l.remark, ''), 'Side:\s*(seed|plot)\s*\.', 'i'))[1],
                        'seed'))                AS side,
         COALESCE(l.remark, '') LIKE '%[APPROVED by %' AS approved,
         /* The reason is what is left once the markers and the approval
            stamp are taken out — the same three deletions _parseCalibration
            makes. Matching up to "[APPROVED" instead would keep the stamp:
            Postgres takes its greediness from the FIRST quantifier in the
            expression, so a non-greedy one later in it changes nothing. */
         TRIM(REGEXP_REPLACE(
           REGEXP_REPLACE(
             REGEXP_REPLACE(
               REGEXP_REPLACE(COALESCE(l.remark, ''), '\[APPROVED by[^\]]*\]', '', 'g'),
               'Report:\s*[^.]*\.\s*', '', 'i'),
             'Plot:\s*[^.]*\.\s*', '', 'i'),
           'Side:\s*(?:seed|plot)\s*\.\s*', '', 'i'))                    AS reason
  FROM shared_inventory_logs l
  WHERE l.transaction_type = 'Stock_Calibration'
),

/* What that plot's adjustments come to, split by whether they are already
   inside the plot's figures. */
per_plot AS (
  SELECT m.batch_name, m.plot,
         SUM(a.qty)                                                          AS all_qty,
         SUM(a.qty) FILTER (WHERE a.approved AND a.side = 'plot')            AS applied_qty,
         SUM(a.qty) FILTER (WHERE NOT (a.approved AND a.side = 'plot'))      AS waiting_qty,
         COUNT(*)   FILTER (WHERE NOT a.approved)                            AS pending_n,
         COUNT(*)   FILTER (WHERE a.approved AND a.side = 'seed')            AS seed_n,
         COUNT(*)   FILTER (WHERE a.approved AND a.side = 'plot')            AS plot_n,
         LEFT(STRING_AGG(a.reason, '; ') FILTER (WHERE a.reason <> ''), 80)  AS reasons
  FROM mismatch m
  JOIN adj a ON a.batch_name = m.batch_name AND a.plot = m.plot
  GROUP BY 1, 2
)

/* ONE result set — the SQL Editor only shows the last statement's.
   The ones somebody can settle in two clicks sort to the top. */
SELECT m.batch_name                                  AS batch,
       m.plot,
       m.culled                                      AS culled_qty,
       m.map_qty                                     AS drone_map_qty,
       m.difference,
       COALESCE(p.waiting_qty, 0)                    AS adjustment_not_applied,
       COALESCE(p.reasons, '')                       AS adjustment_says,
       CASE WHEN m.has_reason THEN 'yes' ELSE 'NO' END AS reason_written,
       CASE
         WHEN COALESCE(p.waiting_qty, 0) = m.difference AND COALESCE(p.pending_n, 0) > 0
                                 AND COALESCE(p.seed_n, 0) = 0
           THEN 'SETTLE IT: an adjustment of ' || p.waiting_qty || ' on this plot is waiting for '
                || 'approval. Approve it on the batch''s Adjustments tab and this plot tallies.'
         WHEN COALESCE(p.waiting_qty, 0) = m.difference AND COALESCE(p.seed_n, 0) > 0
                                 AND COALESCE(p.pending_n, 0) = 0
           THEN 'SETTLE IT: an adjustment of ' || p.waiting_qty || ' on this plot is approved but '
                || 'filed against the SEED COUNT. Seedlings lost after they reached the plot are '
                || 'PLOT STOCK — change it on the Adjustments tab and this plot tallies.'
         WHEN COALESCE(p.waiting_qty, 0) = m.difference
           THEN 'SETTLE IT: adjustments on this plot come to ' || p.waiting_qty || ', part waiting '
                || 'for approval and part filed against the seed count. Settle both and it tallies.'
         WHEN COALESCE(p.plot_n, 0) > 0 AND COALESCE(p.applied_qty, 0) = m.difference
           THEN 'RE-SAVE IT: the adjustment is approved as plot stock, so the SCREEN already shows '
                || 'this plot tallying — but the saved record still carries the old figure. Open '
                || 'the batch, go to 3rd Culling and press Save.'
         WHEN m.has_reason
           THEN 'explained — a reason is written against this plot, which is all this needs'
         ELSE 'NEEDS A PERSON: nothing on this plot accounts for the difference. Write the reason '
              || 'on the 3rd Culling report, or raise an adjustment for it.'
       END                                           AS what_to_do
FROM mismatch m
LEFT JOIN per_plot p ON p.batch_name = m.batch_name AND p.plot = m.plot
ORDER BY (COALESCE(p.waiting_qty, 0) = m.difference) DESC,
         m.has_reason,
         m.batch_name DESC, m.plot;

-- WHAT A GOOD RESULT LOOKS LIKE
--   NO ROWS at all is the ideal: every plot's cull agrees with its map.
--
--   Rows saying SETTLE IT are the easy ones, and they sort to the top —
--   the explanation already exists, it is just not in a form the report
--   can act on. Two clicks each on the batch's Adjustments tab.
--
--   RE-SAVE IT means the screen and the saved record disagree: somebody
--   approved the adjustment after the 3rd Culling report was saved, so
--   the report is carrying the figure it was saved with. Opening 3rd
--   Culling and pressing Save writes the corrected one, and the batch
--   leaves Amendment Needed.
--
--   NEEDS A PERSON is the honest remainder: a difference nobody has
--   accounted for. Those are the ones worth walking the plot for.
