-- A TRAY THAT GAVE OUT MORE THAN WAS EVER PUT IN IT
--
-- A pre-nursery tray holds what was planted into it, and loses seedlings two
-- ways: they are transplanted out, or they are first-culled. What is left
-- cannot be less than nought, so a tray reading below nought means one of
-- those three figures is wrong on this batch:
--
--   the PLANTED figure is too low      -- more went in than the row says
--   a TRANSPLANT quantity is too high  -- fewer went out than the row says
--   a transplant NAMES THE WRONG TRAY  -- it came out of a different one
--   the 1st CULLING is too high        -- fewer were culled than the row says
--
-- Batch 227 tray P4 is what prompted this. Every batch is swept, not that
-- one, because a tray over-drawn on one batch is over-drawn the same way on
-- the others and a file naming 227 would have found 227 and nothing else.
--
-- Nothing is changed by running it.
--
-- WHAT A GOOD RESULT LOOKS LIKE
--
-- SUMMARY first: how many tray-and-batch pairs read below nought, and how
-- far below between them. If it reads 0 pairs, every tray adds up and there
-- is nothing to look at.
--
-- Then one TRAY line per over-drawn tray: what was planted into it, what
-- went out, what was culled, and what that leaves. The last figure is how
-- many seedlings the ledger says came out of nowhere.
--
-- Then every LINE of those trays, so the wrong one can be picked out: each
-- planting, each transplant with the plot it went to, each culling. Read
-- down a tray and the figure that does not belong is usually plain -- a
-- transplant larger than the planting above it, or a plot that batch never
-- used.
--
-- A tray is reused by other batches, so this counts only the rows of the
-- batch being looked at. A tray that is fine on one batch and over-drawn on
-- another is still over-drawn on that one.

WITH tx AS (
  SELECT coalesce(batch_name, '-') AS batch,
         transaction_type AS t,
         coalesce(plot_name, '-')  AS plot,
         coalesce(quantity_change, 0) AS qty,
         coalesce(remark, '') AS remark,
         coalesce(transaction_date, created_at::date) AS happened
  FROM   shared_inventory_logs
),
-- Every movement of a tray, as one list: what went in, what came out.
tray_lines AS (
  SELECT batch, plot AS tray, happened,
         'planted in' AS kind,
         qty AS delta
  FROM   tx
  WHERE  t = 'Planted'
  UNION ALL
  SELECT batch,
         btrim(split_part(split_part(remark, 'from tray [', 2), ']', 1)) AS tray,
         happened,
         'went out to ' || plot,
         -qty
  FROM   tx
  WHERE  t IN ('Transplanted', 'Transplanted_Premium', 'Transplanted_DoubleTone')
    AND  position('from tray [' in remark) > 0
  UNION ALL
  SELECT batch, plot, happened, '1st culled', -qty
  FROM   tx
  WHERE  t = '1st_Culling'
),
bal AS (
  SELECT batch, tray,
         sum(CASE WHEN kind = 'planted in' THEN delta ELSE 0 END)  AS planted_in,
         sum(CASE WHEN kind = '1st culled' THEN delta ELSE 0 END)  AS culled_out,
         sum(CASE WHEN kind NOT IN ('planted in', '1st culled') THEN delta ELSE 0 END) AS moved_out,
         sum(delta) AS left_in_tray
  FROM   tray_lines
  WHERE  tray <> ''
  GROUP  BY batch, tray
),
bad AS (
  SELECT * FROM bal WHERE left_in_tray < 0
)
SELECT 0 AS sort_key,
       'SUMMARY'                                                   AS batch,
       (SELECT count(*) FROM bad)::text || ' trays below nought'    AS a,
       coalesce((SELECT sum(left_in_tray) FROM bad), 0)::text
         || ' seedlings out of nowhere'                            AS b,
       (SELECT count(DISTINCT batch) FROM bad)::text || ' batches'  AS c,
       'tray lines next, then every movement of those trays'        AS note
UNION ALL
SELECT 1,
       batch,
       'tray ' || tray,
       'planted ' || planted_in::text,
       'out ' || abs(moved_out)::text || ', culled ' || abs(culled_out)::text,
       'leaves ' || left_in_tray::text || ' -- that many came from nowhere'
FROM   bad
UNION ALL
SELECT 2,
       l.batch,
       '   tray ' || l.tray,
       l.happened::text,
       CASE WHEN l.delta > 0 THEN '+' || l.delta::text ELSE l.delta::text END,
       l.kind
FROM   tray_lines l
JOIN   bad b ON b.batch = l.batch AND b.tray = l.tray
-- The movement lines carry the date in b, so ordering on it puts a tray in
-- the order it actually happened rather than in the order of its figures.
ORDER  BY sort_key, batch, a, b, c;
