-- WHICH TRANSPLANTING ADJUSTMENTS NAME A TRAY, AND WHOSE PENDING THEY MOVE
--
-- A Transplanting adjustment that NAMES A TRAY says the count of what left
-- that tray was wrong: the seedlings are still in the nursery, so the batch
-- total does not change and the Transplanting tab stops looking for them.
-- One that names NO tray says they reached the plot and then went, so the
-- total comes down with them and Pending is unchanged.
--
-- Only the tray-named ones move a Pending figure. This names them, batch by
-- batch, so the office can see which batches read differently now.
--
-- Nothing is changed by running it.
--
-- WHAT A GOOD RESULT LOOKS LIKE
--
-- The first line is the summary: how many adjustments name a tray, what they
-- come to, and how many batches they sit on. If it reads 0 rows, no batch
-- Pending moves and there is nothing to look at.
--
-- Then one line per BATCH: the net of its tray-named adjustments, which is
-- how much the Pending of that batch changes, and the net of the ones naming no
-- tray, which changes nothing. A batch whose Pending was stuck at exactly
-- its tray-named net is the one this was built for.
--
-- Then the rows themselves, newest first.
--
-- Only APPROVED adjustments are counted, because only those move a figure.

WITH cal AS (
  SELECT id,
         coalesce(batch_name, '-') AS batch,
         coalesce(plot_name, '-')  AS plot,
         coalesce(quantity_change, 0) AS qty,
         coalesce(transaction_date, created_at::date) AS happened,
         created_at,
         coalesce(remark, '') AS remark
  FROM   shared_inventory_logs
  WHERE  transaction_type = 'Stock_Calibration'
    AND  position('[APPROVED by' in coalesce(remark, '')) > 0
    AND  lower(btrim(split_part(split_part(coalesce(remark, ''), 'Report: ', 2), '.', 1)))
         = 'transplanting'
),
marked AS (
  SELECT *,
         (position('Tray:' in remark) > 0 OR position('TxTray:' in remark) > 0) AS names_tray
  FROM   cal
),
per_batch AS (
  SELECT batch,
         sum(CASE WHEN names_tray THEN qty ELSE 0 END) AS tray_net,
         sum(CASE WHEN names_tray THEN 0 ELSE qty END) AS gone_net,
         count(*) FILTER (WHERE names_tray)     AS tray_rows,
         count(*) FILTER (WHERE NOT names_tray) AS gone_rows
  FROM   marked
  GROUP  BY batch
)
SELECT 0 AS sort_key,
       'SUMMARY'                                                      AS batch,
       (SELECT count(*) FROM marked WHERE names_tray)::text || ' name a tray'   AS plot,
       coalesce((SELECT sum(qty) FROM marked WHERE names_tray), 0)::text        AS qty,
       (SELECT count(*) FROM per_batch WHERE tray_net <> 0)::text
         || ' batches move'                                           AS happened,
       (SELECT count(*) FROM marked WHERE NOT names_tray)::text
         || ' name none and move no Pending'                          AS note
UNION ALL
SELECT 1,
       batch,
       tray_rows::text || ' tray-named, ' || gone_rows::text || ' not',
       CASE WHEN tray_net > 0 THEN '+' || tray_net::text ELSE tray_net::text END,
       CASE WHEN gone_net > 0 THEN '+' || gone_net::text ELSE gone_net::text END,
       CASE WHEN tray_rows = 0
              THEN 'nothing names a tray, so Pending does not move'
            WHEN tray_net = 0
              THEN 'the tray-named ones cancel out, so Pending does not move'
            WHEN tray_net > 0
              THEN 'Pending comes DOWN by ' || tray_net::text
                   || ' -- that many more left the trays than the rows said'
            ELSE 'Pending goes UP by ' || abs(tray_net)::text
                 || ' -- that many are treated as still sitting in the trays'
       END
FROM   per_batch
UNION ALL
SELECT 2,
       batch,
       plot,
       CASE WHEN qty > 0 THEN '+' || qty::text ELSE qty::text END,
       happened::text,
       CASE WHEN names_tray
            THEN 'names a tray, so it moves this batch Pending'
            ELSE 'names no tray, so it moves the total and not Pending'
       END
FROM   marked
ORDER  BY sort_key, batch, happened DESC;
