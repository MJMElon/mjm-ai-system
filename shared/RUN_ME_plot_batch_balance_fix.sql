-- ════════════════════════════════════════════════════════════════════════
-- THE PHONE'S BATCH LIST DISAGREED WITH THE MOVEMENT REPORT
--
-- shared_plot_batch_balance is what the FC Portal's Maintenance form reads
-- to offer "Batches in this plot". It was supposed to do the Movement
-- Report's arithmetic. It did not, in two ways:
--
--   1. IT TOOK THE 2ND CULLING OFF ON TOP OF THE 3RD. The 3rd culling is
--      keyed against the ORIGINAL transplanted figure, so it already
--      contains the 2nd — deducting both takes the same seedlings off
--      twice. The tell is a batch that should have netted to nought
--      reading as a small negative instead. This is the same fault already
--      found and fixed in shared/shared_plot_movement.js, where the note
--      names B1's batch 237 reading -2; it was never carried across to
--      here. The Movement Report gives 2nd Culled no column at all.
--
--   2. IT IGNORED STOCK CALIBRATIONS. The Movement Report counts approved
--      ones as a Stock Adjustment. A plot whose count was corrected read
--      short on the phone by exactly the correction.
--
-- Worked example, from U1: the office showed batch 250 standing at 447 and
-- 252 at 4,201, while the phone offered 250 at -2 and 252 at 4,191, and
-- offered batch 230 at -2 when the office had finished with it entirely.
--
-- This replaces the view with one that applies both rules. IT CHANGES NO
-- DATA — the view holds none. Every figure it reports is recomputed from
-- the ledger the moment it is asked.
--
-- Safe to run twice: CREATE OR REPLACE throughout.
-- ════════════════════════════════════════════════════════════════════════


-- ── BEFORE: every plot and batch this will move, not just U1 ────────────
-- Run this FIRST, on its own, if you want the list to compare against.
-- It is commented out so the file has one result set; uncomment to use.
--
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
   '', so it can never be matched to one. */
CREATE OR REPLACE FUNCTION mjm_batch_key(v text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
           WHEN d IS NULL      THEN ''
           WHEN ltrim(d, '0') = '' THEN '0'      -- "000" is batch 0, not blank
           ELSE ltrim(d, '0')                    -- "0225" and "225" are one batch
         END
  FROM (
    SELECT (regexp_match(
              regexp_replace(btrim(coalesce(v, '')), '[^0-9A-Za-z]+$', ''),
              '(\d+)$'))[1] AS d
  ) x;
$$;


/* ── 2. THE VIEW ───────────────────────────────────────────────────────── */

CREATE OR REPLACE VIEW shared_plot_batch_balance
WITH (security_invoker = true)     -- reads as the caller, so RLS still applies
AS
WITH ledger AS (
  -- Straight movements: in and out of the plot named on the row. The 2nd
  -- culling is NOT here; it is added back conditionally further down.
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
                              'Damaged_Seeds', '1st_Culling', '3rd_Culling')

  UNION ALL

  -- The 2nd culling, but only for a plot and batch with no 3rd culling
  -- against it. See the header: after a 3rd, the 2nd is already inside the
  -- figure that replaced it, and deducting both is how a finished batch ends
  -- up reading -2 on a Field Conductor's phone.
  SELECT c.id, c.plot_name, c.batch_name, -abs(coalesce(c.quantity_change, 0))
  FROM   shared_inventory_logs c
  WHERE  c.transaction_type = '2nd_Culling'
    AND  NOT EXISTS (
           SELECT 1 FROM shared_inventory_logs t
           WHERE  t.transaction_type = '3rd_Culling'
             AND  mjm_plot_key(t.plot_name)   = mjm_plot_key(c.plot_name)
             AND  mjm_batch_key(t.batch_name) = mjm_batch_key(c.batch_name))

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

-- ── PostgREST has to be told the shape changed ──────────────────────────
NOTIFY pgrst, 'reload schema';


-- ── WHAT SHOULD HAVE HAPPENED ──────────────────────────────────────────
-- One result set, because the SQL Editor only shows the last statement's.
--
-- A GOOD RESULT is the view rebuilt and NO negative balances left that are
-- caused by a doubled 2nd culling:
--
--   view rebuilt                      yes
--   batches still reading negative    <a count, and 0 is the hoped-for one>
--   plots the phone will now offer    <a count>
--
-- A non-zero "batches still reading negative" is NOT a failure of this
-- file — a plot really can be over-allocated, and the Movement Report
-- shows those too. It means those ones have some other cause and are
-- worth looking into on the report. The second row of the drill-down
-- below names them so you are not opening plots one at a time.
SELECT 'view rebuilt' AS check,
       CASE WHEN to_regclass('public.shared_plot_batch_balance') IS NULL
            THEN 'NO' ELSE 'yes' END AS result
UNION ALL
SELECT 'batches still reading negative',
       (SELECT count(*)::text FROM shared_plot_batch_balance WHERE qty < 0)
UNION ALL
SELECT 'plot/batch rows the phone will offer',
       (SELECT count(*)::text FROM shared_plot_batch_balance)
UNION ALL
SELECT 'which ones are still negative',
       coalesce((SELECT string_agg(plot_name || ' batch ' || batch_name || ' (' || qty || ')', ', '
                                   ORDER BY plot_name, batch_name)
                 FROM shared_plot_batch_balance WHERE qty < 0), 'none');
