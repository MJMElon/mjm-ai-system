-- =====================================================================
--  TRANSFERS AND P-R CULLING COMING UP EMPTY — EVERY BATCH
--  Paste into the Supabase SQL Editor and press Run. Read-only: it
--  changes nothing, so it is safe to run as often as you like.
--
--  THE COMPLAINT
--  Batch 242's Transfer Data said "No transfer record" and P-R Culling
--  was empty, on a batch that plainly had both. One batch is the example,
--  never the scope: this asks the same of EVERY batch.
--
--  HOW A TRANSFER IS STORED
--  One Cull3_Transfer row per movement. Where the seedlings WENT is the
--  row's plot_name; where they LEFT is in the remark, as
--
--      3rd Culling transfer. From: [<PLOT>|main] To: [<PLOT>] Qty: N.
--
--  The report builds its list by hanging each movement on the plot the
--  remark says it left. A remark that does not say, or that names a plot
--  the batch has no row for, had nowhere to hang — and the movement was
--  dropped at load without a word.
--
--  WHY THAT EMPTIED THE TAB
--  3rd Culling saves its transfers BY REPLACEMENT: every Cull3_Transfer
--  row on the batch is deleted and whatever the form is holding is
--  written back. A movement dropped at load was therefore DELETED by the
--  next save of the tab — and the "-R" rows it had built disappeared with
--  it, which is why both tabs went empty together.
--
--  The page no longer does either: it keeps what it cannot place, shows
--  it in a card with a box to say which plot it left, and writes it back
--  untouched. This query says which batches were hit and whether their
--  records are still there to be recovered.
-- =====================================================================
WITH

/* Every movement, with the plot its remark says it left. The format is
   written by saveTab6() in operation/operation_batch_detail.html —
   change one, change the other. */
moves AS (
  SELECT l.batch_name,
         l.plot_name                                                   AS went_to,
         l.quantity_change                                             AS qty,
         SUBSTRING(l.remark FROM 'From:\s*\[([^\]|]+)\|')              AS left_from,
         l.remark
  FROM shared_inventory_logs l
  WHERE l.transaction_type = 'Cull3_Transfer'
),

/* Every plot the report builds a row for on that batch. */
rowsrc AS (
  SELECT l.batch_name,
         REGEXP_REPLACE(UPPER(TRIM(l.plot_name)), '\s+', ' ', 'g')     AS pkey
  FROM shared_inventory_logs l
  WHERE l.transaction_type IN ('Transplanted', 'Transplanted_DoubleTone', 'Cull3_Transfer')
    AND COALESCE(TRIM(l.plot_name), '') <> ''
  GROUP BY 1, 2
),

judged AS (
  SELECT m.batch_name,
         count(*)                                                      AS transfers,
         count(*) FILTER (WHERE m.left_from IS NOT NULL
                            AND EXISTS (SELECT 1 FROM rowsrc r
                                         WHERE r.batch_name = m.batch_name
                                           AND r.pkey = REGEXP_REPLACE(UPPER(TRIM(m.left_from)), '\s+', ' ', 'g')))
                                                                       AS placeable,
         count(*) FILTER (WHERE m.left_from IS NULL)                   AS no_source_in_remark,
         count(*) FILTER (WHERE m.left_from IS NOT NULL
                            AND NOT EXISTS (SELECT 1 FROM rowsrc r
                                             WHERE r.batch_name = m.batch_name
                                               AND r.pkey = REGEXP_REPLACE(UPPER(TRIM(m.left_from)), '\s+', ' ', 'g')))
                                                                       AS source_not_a_plot_here
  FROM moves m
  GROUP BY m.batch_name
),

/* THE OTHER HALF: a destination whose movement is GONE.

   A "-R" plot exists only because something was transferred into it, so a
   batch that has 3rd Culling records on a "-R" plot and no Cull3_Transfer
   pointing at it is a batch whose movements were deleted. That is the case
   where the records cannot be recovered from the database and have to be
   keyed again. */
orphan_dests AS (
  SELECT c.batch_name,
         STRING_AGG(DISTINCT TRIM(c.plot_name), ', ' ORDER BY TRIM(c.plot_name)) AS dests,
         count(DISTINCT TRIM(c.plot_name))                             AS n
  FROM shared_inventory_logs c
  WHERE c.transaction_type = '3rd_Culling'
    AND TRIM(UPPER(c.plot_name)) LIKE '%-R'
    AND NOT EXISTS (
      SELECT 1 FROM shared_inventory_logs t
       WHERE t.batch_name = c.batch_name
         AND t.transaction_type = 'Cull3_Transfer'
         AND REGEXP_REPLACE(UPPER(TRIM(t.plot_name)), '\s+', ' ', 'g')
           = REGEXP_REPLACE(UPPER(TRIM(c.plot_name)), '\s+', ' ', 'g'))
  GROUP BY c.batch_name
),

report AS (
  SELECT COALESCE(j.batch_name, o.batch_name)                          AS batch,
         COALESCE(j.transfers, 0)                                      AS transfers,
         COALESCE(j.placeable, 0)                                      AS shown_before,
         COALESCE(j.no_source_in_remark, 0)                            AS no_source_in_remark,
         COALESCE(j.source_not_a_plot_here, 0)                         AS source_not_a_plot_here,
         COALESCE(o.n, 0)                                              AS dests_with_no_movement,
         o.dests                                                       AS which_dests,
         CASE
           WHEN COALESCE(o.n, 0) > 0 AND COALESCE(j.transfers, 0) = 0
             THEN 'GONE. This batch has 3rd Culling records on ' || COALESCE(o.n, 0)
                  || ' transferred-into plot(s) (' || COALESCE(o.dests, '')
                  || ') and NO transfer records at all — a save deleted them. The '
                  || 'movements have to be keyed again on Transfer Data; the figures '
                  || 'already culled on those plots are untouched.'
           WHEN COALESCE(o.n, 0) > 0
             THEN 'PART GONE. ' || COALESCE(j.transfers, 0) || ' movement(s) survive, but '
                  || o.n || ' transferred-into plot(s) (' || COALESCE(o.dests, '')
                  || ') have no movement pointing at them any more. Those have to be '
                  || 'keyed again; the rest come back on their own.'
           WHEN COALESCE(j.no_source_in_remark, 0) + COALESCE(j.source_not_a_plot_here, 0) > 0
             THEN 'RECOVERABLE. ' || (COALESCE(j.no_source_in_remark, 0) + COALESCE(j.source_not_a_plot_here, 0))
                  || ' movement(s) are in the database but the report could not place them, '
                  || 'so it used to hide them and the next save would have deleted them. '
                  || 'They now show on Transfer Data under "Source not recorded" — open the '
                  || 'batch, say which plot each one left, and save. Nothing is lost.'
           ELSE NULL
         END                                                           AS verdict
  FROM judged j
  FULL OUTER JOIN orphan_dests o ON o.batch_name = j.batch_name
)

/* ONE result set — the SQL Editor only shows the last statement's. The
   summary is the first row; everything under it is a batch to open. */
SELECT 0                                                     AS sort,
       '— ALL BATCHES —'                                     AS batch,
       (SELECT COALESCE(sum(transfers), 0) FROM report)      AS transfers,
       NULL::bigint                                          AS shown_before,
       NULL::bigint                                          AS no_source_in_remark,
       NULL::bigint                                          AS source_not_a_plot_here,
       NULL::bigint                                          AS dests_with_no_movement,
       NULL::text                                            AS which_dests,
       CASE WHEN (SELECT count(*) FROM report WHERE verdict IS NOT NULL) = 0
            THEN 'Nothing to do. Every saved transfer on every batch can be placed, and no '
                 || 'transferred-into plot is missing the movement that made it.'
            ELSE (SELECT count(*) FROM report WHERE verdict IS NOT NULL)::text
                 || ' batch(es) to look at: '
                 || (SELECT STRING_AGG(batch, ', ' ORDER BY batch) FROM report WHERE verdict IS NOT NULL)
                 || '. One row each below — read the verdict, it says whether the records '
                 || 'are still there.'
       END                                                   AS verdict
UNION ALL
SELECT 1, r.batch, r.transfers, r.shown_before, r.no_source_in_remark,
       r.source_not_a_plot_here, r.dests_with_no_movement, r.which_dests, r.verdict
FROM report r
WHERE r.verdict IS NOT NULL
ORDER BY sort, batch;

-- WHAT A GOOD RESULT LOOKS LIKE
--   The first row is the summary. If it says "Nothing to do" and there are
--   no rows under it, every batch's transfers are intact and showing.
--
--   RECOVERABLE is the good outcome: the records are in the database, the
--   page no longer hides them, and no save will delete them. Open the
--   batch, go to Transfer Data, and the card at the top asks which plot
--   each one left. Answer it and save.
--
--   GONE and PART GONE mean an earlier save already deleted those
--   movements — they are not in the database to recover, and the named
--   plots have to be keyed again on Transfer Data. The culled quantities
--   and dates on those plots are NOT affected; only the movement that put
--   the seedlings there is missing.
--
--   shown_before is how many of that batch's movements the report could
--   always place. transfers less shown_before is what was at risk.
