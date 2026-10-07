-- WHOSE PENDING MOVES, FROM WHAT TO WHAT, AND WHETHER THE STORY HOLDS
--
-- A Transplanting adjustment that NAMES A TRAY now says the count of what
-- LEFT that tray was wrong: the seedlings are still in the nursery, so the
-- batch total does not move and the Transplanting Pending closes by that
-- much. One that names no tray says they reached the plot and then went, and
-- Pending is unchanged.
--
-- Rows keyed before that rule existed named a tray for a different reason --
-- to record which tray the share came from -- so some of them may be plot
-- losses wearing a tray name. This says which batches read differently now,
-- and gives the evidence for deciding whether each one is right.
--
-- Nothing is changed by running it.
--
-- WHAT A GOOD RESULT LOOKS LIKE
--
-- SUMMARY, then three kinds of line.
--
-- BATCH lines: Pending before this rule and Pending after it. A batch whose
-- Pending was stuck at exactly its tray-named net now reads 0, which is the
-- whole point. A batch whose Pending GOES UP is the one to look at: those
-- seedlings are now being treated as still sitting in a tray.
--
-- TRAY lines, for every tray an adjustment names: what that tray still has
-- left after everything planted into it went out or was culled. THIS IS THE
-- EVIDENCE. If a tray still holds at least what its adjustment says, the
-- seedlings really can be in it and the tray name is right. If the tray is
-- empty, they cannot be, and that adjustment is a plot loss that happens to
-- name a tray -- it wants its tray cleared on the Adjustments tab.
--
-- Only APPROVED adjustments are counted, because only those move a figure.

WITH tx AS (
  SELECT coalesce(batch_name, '-') AS batch,
         transaction_type AS t,
         coalesce(plot_name, '-')  AS plot,
         coalesce(quantity_change, 0) AS qty,
         coalesce(remark, '') AS remark
  FROM   shared_inventory_logs
),
cal AS (
  SELECT batch, plot, qty, remark,
         lower(btrim(split_part(split_part(remark, 'Report: ', 2), '.', 1))) AS report,
         (position('Tray:' in remark) > 0 OR position('TxTray:' in remark) > 0) AS names_tray,
         /* THE TRAY NAME, out of either label. TxTray has no space after
            its colon -- "TxTray:P4." -- so splitting on "Tray: " with the
            space finds nothing in it, and a row that plainly names a tray
            came back with an empty label. The longer label is taken first
            because "Tray:" is a substring of "TxTray:". The page gets this
            right already; only this file had it wrong. */
         CASE WHEN position('TxTray:' in remark) > 0
                THEN btrim(split_part(split_part(remark, 'TxTray:', 2), '.', 1))
              WHEN position('Tray:' in remark) > 0
                THEN btrim(split_part(split_part(remark, 'Tray:', 2), '.', 1))
              ELSE '' END AS tray_label
  FROM   tx
  WHERE  t = 'Stock_Calibration'
    AND  position('[APPROVED by' in remark) > 0
),
per_batch AS (
  SELECT b.batch,
         sum(CASE WHEN b.t = 'Planted'            THEN b.qty ELSE 0 END) AS planted,
         sum(CASE WHEN b.t = 'DTone_Nursery_Qty'  THEN b.qty ELSE 0 END) AS dtone,
         sum(CASE WHEN b.t = 'Transplanted'       THEN b.qty ELSE 0 END) AS to_main,
         sum(CASE WHEN b.t = '1st_Culling'        THEN b.qty ELSE 0 END) AS culled1
  FROM   tx b
  GROUP  BY b.batch
),
adj AS (
  SELECT batch,
         sum(CASE WHEN report IN ('seeds received', 'planting', 'seed audit')
                  THEN qty ELSE 0 END)                               AS seed_net,
         sum(CASE WHEN report = 'transplanting' AND names_tray
                  THEN qty ELSE 0 END)                               AS tray_net
  FROM   cal
  GROUP  BY batch
),
pend AS (
  SELECT p.batch,
         greatest(0, p.planted + p.dtone + coalesce(a.seed_net, 0) - p.to_main - p.culled1) AS before_rule,
         greatest(0, p.planted + p.dtone + coalesce(a.seed_net, 0) - p.to_main - p.culled1
                     - coalesce(a.tray_net, 0))                                            AS after_rule,
         coalesce(a.tray_net, 0) AS tray_net
  FROM   per_batch p
  LEFT   JOIN adj a ON a.batch = p.batch
  WHERE  coalesce(a.tray_net, 0) <> 0
),
-- Every tray an adjustment names, with what that tray has left in it.
named_trays AS (
  SELECT DISTINCT batch, tray_label AS tray
  FROM   cal
  WHERE  report = 'transplanting' AND names_tray AND tray_label <> ''
),
tray_balance AS (
  SELECT n.batch, n.tray,
         coalesce((SELECT sum(x.qty) FROM tx x
                   WHERE x.batch = n.batch AND x.t = 'Planted' AND x.plot = n.tray), 0)
       - coalesce((SELECT sum(x.qty) FROM tx x
                   WHERE x.batch = n.batch AND x.t IN ('Transplanted', 'Transplanted_Premium', 'Transplanted_DoubleTone')
                     AND btrim(split_part(split_part(x.remark, 'from tray [', 2), ']', 1)) = n.tray), 0)
       - coalesce((SELECT sum(x.qty) FROM tx x
                   WHERE x.batch = n.batch AND x.t = '1st_Culling' AND x.plot = n.tray), 0)
         AS left_in_tray,
         coalesce((SELECT sum(c.qty) FROM cal c
                   WHERE c.batch = n.batch AND c.report = 'transplanting'
                     AND c.tray_label = n.tray), 0) AS adj_on_tray
  FROM   named_trays n
)
SELECT 0 AS sort_key,
       'SUMMARY'                                            AS batch,
       (SELECT count(*) FROM pend)::text || ' batches move'  AS a,
       (SELECT count(*) FROM pend WHERE after_rule < before_rule)::text
         || ' read lower'                                   AS b,
       (SELECT count(*) FROM pend WHERE after_rule > before_rule)::text
         || ' read HIGHER, look at those'                   AS c,
       'tray lines below carry the evidence'                AS note
UNION ALL
SELECT 1,
       batch,
       'Pending was ' || before_rule::text,
       'now ' || after_rule::text,
       'tray-named net ' || CASE WHEN tray_net > 0 THEN '+' || tray_net::text ELSE tray_net::text END,
       CASE WHEN after_rule < before_rule
              THEN 'closes by ' || (before_rule - after_rule)::text || ', which is what the rule is for'
            WHEN after_rule > before_rule
              THEN 'GOES UP by ' || (after_rule - before_rule)::text
                   || ' -- check the tray lines for this batch'
            ELSE 'unchanged'
       END
FROM   pend
UNION ALL
SELECT 2,
       batch,
       'tray ' || tray,
       'has ' || left_in_tray::text || ' left',
       'adjusted ' || CASE WHEN adj_on_tray > 0 THEN '+' || adj_on_tray::text ELSE adj_on_tray::text END,
       CASE WHEN adj_on_tray > 0
              THEN 'more went out than the row said, so the tray name is right'
            WHEN left_in_tray >= abs(adj_on_tray)
              THEN 'the tray can hold them, so the tray name is right'
            ELSE 'the tray does NOT have them -- this looks like a plot loss, clear its tray'
       END
FROM   tray_balance
ORDER  BY sort_key, batch, a;
