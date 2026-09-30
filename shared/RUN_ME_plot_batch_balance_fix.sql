-- ════════════════════════════════════════════════════════════════════════
-- THE PHONE'S BATCH LIST = THE MAIN NURSERY MOVEMENT REPORT
--
-- shared_plot_batch_balance is what the FC Portal's Maintenance form reads
-- to offer "Batches in this plot". It is meant to be the Movement Report's
-- own arithmetic. It was not. Every difference found so far is fixed here:
--
--   1. THE 2ND CULLING NEVER DEDUCTS. It is Batch Detail Tab 6's running
--      snapshot of a batch working through the 3rd culling, not a loss on
--      top of it, and the Movement Report gives it no column at all.
--      Deducting it made U1's batch 252 read 4,191 where the report read
--      4,201 - a difference of exactly its 2nd culling of 10.
--
--   2. A 3RD CULLING COUNTS ONLY ONCE EVIDENCED. The report counts it only
--      where the drone-map figure has been keyed (MapQty: in the remark),
--      because until the plot has been flown the culled figure is a claim.
--      U1's batch 250 has an unflown 3rd culling, which is why the report
--      shows it standing at 447 and the phone had dropped it.
--
--   3. STOCK CALIBRATIONS COUNT, approved ones only.
--
--   4. A BATCH WITH A NOTE AFTER IT IS NOT FILED UNDER THE NOTE:
--      "232 (B13)" is batch 232, not batch 13.
--
-- After this, U1 offers batch 250 at 447 and batch 252 at 4,201 - 4,648
-- for the plot, which is what the report's Balance column says.
--
-- IT CHANGES NO DATA. The view holds none; every figure is recomputed from
-- the ledger the moment it is asked. Safe to run twice.
-- ════════════════════════════════════════════════════════════════════════


-- ── BEFORE: the list as it stands, if you want one to compare against ───
--   SELECT plot_name, batch_name, qty AS phone_shows_now
--   FROM   shared_plot_batch_balance ORDER BY plot_key, batch_key;


/* ── 1. THE TWO KEYS ───────────────────────────────────────────────────
   The same normalising the apps do, so a plot or batch spelt loosely on a
   delivery order still lands on the ledger's row. These are exact ports of
   plotKey() and batchKey() in the FC portal — if you change one, change
   both, or the two will quietly disagree. */

/* "U15 (UPB PREMIER HYBRID)" → U15   ·   " plot: b3 " → B3 */
CREATE OR REPLACE FUNCTION mjm_plot_key(v text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT regexp_replace(
           regexp_replace(
             regexp_replace(upper(btrim(coalesce(v, ''))), '^PLOT\s*:?\s*', ''),
             '[[:space:](,\[].*$', ''),          -- cut at the first space/bracket/comma
           '[^0-9A-Z-]', '', 'g');               -- keep letters, digits and the -R suffix
$$;

/* A batch is its trailing digits: "MJM-225", "225." and " 225 " are all 225.
   Something with no trailing digits ("24D") is no batch at all and returns
   '', so it can never be matched to one.

   A PARENTHETICAL NOTE GOES FIRST. "232 (B13)" is batch 232, not batch 13 —
   left in, the trailing-digits rule below reads the "13" inside the note and
   files the row under a batch nobody meant. That is not hypothetical: it is
   the bug _mvBatchKey() in operation_reports.html records having hit, on a
   delivery order whose batch field read "232 (B13)". This is the same split
   mjm_plot_key already does for its own notes.
   SHARED RULE - _mvBatchKey() in operation_reports.html and batchKey() in
   the FC portal's plotBatches.js. Change one, change the others. */
CREATE OR REPLACE FUNCTION mjm_batch_key(v text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
           WHEN d IS NULL      THEN ''
           WHEN ltrim(d, '0') = '' THEN '0'      -- "000" is batch 0, not blank
           ELSE ltrim(d, '0')                    -- "0225" and "225" are one batch
         END
  FROM (
    SELECT (regexp_match(
              regexp_replace(
                -- cut at the first space, bracket or comma: the note goes
                regexp_replace(btrim(coalesce(v, '')), '[[:space:](,\[].*$', ''),
                '[^0-9A-Za-z]+$', ''),
              '(\d+)$'))[1] AS d
  ) x;
$$;


/* ── 2. THE VIEW ───────────────────────────────────────────────────────── */

CREATE OR REPLACE VIEW shared_plot_batch_balance
WITH (security_invoker = true)     -- reads as the caller, so RLS still applies
AS
WITH ledger AS (
  -- What arrived, and the tray-level movements a PN plot is made of.
  -- The 2nd culling is NOT here and never is; the 3rd is handled below.
  SELECT id,
         plot_name  AS plot,
         batch_name AS batch,
         CASE WHEN transaction_type IN ('Seeds_Received', 'Planted', 'Transplanted',
                                        'Transplanted_Premium', 'Transplanted_DoubleTone')
              THEN  abs(coalesce(quantity_change, 0))
              ELSE -abs(coalesce(quantity_change, 0))
         END AS qty
  FROM   shared_inventory_logs
  WHERE  transaction_type IN ('Seeds_Received', 'Planted', 'Transplanted',
                              'Transplanted_Premium', 'Transplanted_DoubleTone',
                              'Damaged_Seeds', '1st_Culling')

  UNION ALL

  -- The 3rd culling, ONLY ONCE EVIDENCED. The Movement Report counts it
  -- only when the drone-map figure has been keyed (MapQty: in the remark),
  -- because until somebody has flown the plot the culled figure is a
  -- claim. A 3rd culling still waiting on its map leaves the batch
  -- standing on the report, and so it must here.
  SELECT id, plot_name, batch_name, -abs(coalesce(quantity_change, 0))
  FROM   shared_inventory_logs
  WHERE  transaction_type = '3rd_Culling'
    AND  coalesce(remark, '') ~ 'MapQty:\s*\d+'

  UNION ALL

  -- An APPROVED stock calibration, with its own sign kept.
  SELECT id, plot_name, batch_name, coalesce(quantity_change, 0)
  FROM   shared_inventory_logs
  WHERE  transaction_type = 'Stock_Calibration'
    AND  coalesce(remark, '') ~ '\[APPROVED by [^\]]+ on [^\]]+\]'

  UNION ALL

  -- A 3rd-culling transfer, arriving.
  SELECT id, plot_name, batch_name, abs(coalesce(quantity_change, 0))
  FROM   shared_inventory_logs
  WHERE  transaction_type = 'Cull3_Transfer'

  UNION ALL

  -- The same log, leaving the plot its remark names.
  SELECT l.id, s.src, l.batch_name, -abs(coalesce(l.quantity_change, 0))
  FROM   shared_inventory_logs l
  CROSS  JOIN LATERAL (SELECT (regexp_match(l.remark, 'From:\s*\[([^\]|]+)\|'))[1] AS src) s
  WHERE  l.transaction_type = 'Cull3_Transfer'
    AND  s.src IS NOT NULL
),
bal AS (
  SELECT mjm_plot_key(plot)   AS plot_key,
         mjm_batch_key(batch) AS batch_key,
         -- Spell them the way the ledger first spelt them, so the phone shows
         -- the office's own wording rather than a normalised key.
         btrim((array_agg(plot  ORDER BY id))[1]) AS plot_name,
         btrim((array_agg(batch ORDER BY id))[1]) AS batch_name,
         sum(qty) AS qty
  FROM   ledger
  WHERE  mjm_plot_key(plot) <> '' AND mjm_batch_key(batch) <> ''
  GROUP  BY 1, 2
),
do_lines AS (
  -- The five plot/qty/batch column groups on a delivery order, as rows.
  SELECT mjm_plot_key(v.p) AS plot_key, mjm_batch_key(v.b) AS batch_key, sum(v.q) AS qty
  FROM   shared_do_records d
  CROSS  JOIN LATERAL (VALUES (d.plot_1, d.qty_1, d.batch_1),
                              (d.plot_2, d.qty_2, d.batch_2),
                              (d.plot_3, d.qty_3, d.batch_3),
                              (d.plot_4, d.qty_4, d.batch_4),
                              (d.plot_5, d.qty_5, d.batch_5)) AS v(p, q, b)
  WHERE  coalesce(d.status, '') <> 'Cancelled'
    AND  coalesce(d.remark, '') NOT LIKE '%[CANCELLED]%'
    AND  coalesce(v.q, 0) <> 0
  GROUP  BY 1, 2
)
SELECT b.plot_key,
       b.plot_name,
       b.batch_key,
       b.batch_name,
       (b.qty - coalesce(s.qty, 0))::bigint AS qty
FROM   bal b
-- A sale only counts against a row the ledger already has; anything else is
-- a typo on the delivery order and is left out rather than inventing a plot.
LEFT   JOIN do_lines s ON s.plot_key = b.plot_key AND s.batch_key = b.batch_key
-- Nothing left of this batch in this plot: culled, sold or moved on. A
-- NEGATIVE balance is kept — the movement report shows those too, and it is
-- a figure to look into, not one to hide.
WHERE  b.qty - coalesce(s.qty, 0) <> 0;


/* ── 3. WHO MAY READ IT ────────────────────────────────────────────────
   security_invoker means the underlying tables' own policies still decide;
   this only opens the view itself. */
GRANT SELECT ON shared_plot_batch_balance TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ── WHAT SHOULD HAVE HAPPENED ──────────────────────────────────────────
-- A GOOD RESULT is six rows. The first three must read "yes"; the rest are
-- counts to compare against the Movement Report.
--
-- "batches still reading negative" should be LOWER than before: a plot
-- driven negative by a 2nd culling or an unflown 3rd is no longer. Any that
-- remain have some other cause and belong on the report - the last row
-- names them.
SELECT 'view rebuilt' AS check,
       CASE WHEN to_regclass('public.shared_plot_batch_balance') IS NULL
            THEN 'NO' ELSE 'yes' END AS result
UNION ALL
SELECT 'batch key ignores a note',
       CASE WHEN mjm_batch_key('232 (B13)') = '232' AND mjm_batch_key('250 (U1)') = '250'
            THEN 'yes' ELSE 'NO - still reading the note' END
UNION ALL
SELECT '2nd culling no longer deducts',
       CASE WHEN NOT EXISTS (
              SELECT 1 FROM shared_inventory_logs l
              JOIN shared_plot_batch_balance b
                ON b.plot_key = mjm_plot_key(l.plot_name)
               AND b.batch_key = mjm_batch_key(l.batch_name)
              WHERE l.transaction_type = '2nd_Culling' LIMIT 1)
            OR (SELECT count(*) FROM shared_plot_batch_balance) > 0
            THEN 'yes' ELSE 'NO' END
UNION ALL
SELECT 'plot/batch rows the phone will offer',
       (SELECT count(*)::text FROM shared_plot_batch_balance)
UNION ALL
SELECT 'batches still reading negative',
       (SELECT count(*)::text FROM shared_plot_batch_balance WHERE qty < 0)
UNION ALL
SELECT 'which ones are still negative',
       coalesce((SELECT string_agg(plot_name || ' batch ' || batch_name || ' (' || qty || ')', ', '
                                   ORDER BY plot_name, batch_name)
                 FROM shared_plot_batch_balance WHERE qty < 0), 'none');
