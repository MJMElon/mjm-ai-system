-- ════════════════════════════════════════════════════════════════════════
-- THE FC PORTALS BATCH LIST IS THE MAIN NURSERY MOVEMENT REPORT
--
-- One rule and no exceptions. The batches a Field Conductor is offered for
-- a plot, and the quantity beside each, are that reports own:
--
--   Balance = transplanted from PN + transfer in
--           - sold - 3rd culled - transfer out + stock adjustment
--
-- Two carry the reports own condition: a 3rd culling counts only once the
-- drone map has been keyed (MapQty:), and a stock calibration only once
-- [APPROVED ...]. Everything else takes no part because the report has no
-- column for it - the 1st and 2nd cullings, Planted, Seeds_Received and
-- Seed Damage.
--
-- U1 is the worked example: the report prints batch 250 at 447 and batch
-- 252 at 4,201, 4,648 for the plot. After this, so does the phone.
--
-- IT CHANGES NO DATA. Safe to run twice.
--
-- ONE THING TO KNOW: a PN plot (P01-P52) has no main-nursery movement, so
-- it will offer no batches. If Field Conductors record maintenance on PN
-- plots, say so and the reports Pre-Nursery section goes back in.
-- ════════════════════════════════════════════════════════════════════════


/* ── 1. THE TWO KEYS ───────────────────────────────────────────────────
   The same normalising the apps do, so a plot or batch spelt loosely on a
   delivery order still lands on the ledgers row. These are exact ports of
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
   , so it can never be matched to one.

   A PARENTHETICAL NOTE GOES FIRST. "232 (B13)" is batch 232, not batch 13 —
   left in, the trailing-digits rule below reads the "13" inside the note and
   files the row under a batch nobody meant. That is not hypothetical: it is
   the bug _mvBatchKey() in operation_reports.html records having hit, on a
   delivery order whose batch field read "232 (B13)". This is the same split
   mjm_plot_key already does for its own notes.
   SHARED RULE - _mvBatchKey() in operation_reports.html and batchKey() in
   the FC portals plotBatches.js. Change one, change the others. */
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
  /* THE MAIN NURSERY MOVEMENT REPORT, AND NOTHING ELSE.
     MOVE_COLS.main in operation_reports.html, column for column:

       Balance = transplanted from PN + transfer in
               - sold - 3rd culled - transfer out + stock adjustment

     Sold is joined on further down; the rest is here. Every other
     transaction type has no column on that report and takes no part: the
     1st and 2nd cullings and Planted are pre-nursery, Seeds_Received is not
     a movement, and Seed Damage never entered a tray to be lost from one. */

  -- Transplanted from PN: arrives at the main plot named on the row.
  SELECT id, plot_name AS plot, batch_name AS batch,
         abs(coalesce(quantity_change, 0)) AS qty
  FROM   shared_inventory_logs WHERE transaction_type = 'Transplanted'

  UNION ALL

  -- 3rd culled, ONLY ONCE EVIDENCED. Until the plot has been flown and the
  -- drone-map figure keyed, the culled figure is a claim and the report
  -- leaves the batch standing.
  SELECT id, plot_name, batch_name, -abs(coalesce(quantity_change, 0))
  FROM   shared_inventory_logs
  WHERE  transaction_type = '3rd_Culling'
    AND  coalesce(remark, '') ~ 'MapQty:\s*\d+'

  UNION ALL

  -- Transfer in: one log, and this is the side that arrived.
  SELECT id, plot_name, batch_name, abs(coalesce(quantity_change, 0))
  FROM   shared_inventory_logs WHERE transaction_type = 'Cull3_Transfer'

  UNION ALL

  -- Transfer out: the same log, leaving the plot its remark names.
  SELECT l.id, s.src, l.batch_name, -abs(coalesce(l.quantity_change, 0))
  FROM   shared_inventory_logs l
  CROSS  JOIN LATERAL (SELECT (regexp_match(l.remark, 'From:\s*\[([^\]|]+)\|'))[1] AS src) s
  WHERE  l.transaction_type = 'Cull3_Transfer' AND s.src IS NOT NULL

  UNION ALL

  -- Stock adjustment, approved only, with its own sign kept.
  SELECT id, plot_name, batch_name, coalesce(quantity_change, 0)
  FROM   shared_inventory_logs
  WHERE  transaction_type = 'Stock_Calibration'
    AND  coalesce(remark, '') ~ '\[APPROVED by [^\]]+ on [^\]]+\]'

),
bal AS (
  SELECT mjm_plot_key(plot)   AS plot_key,
         mjm_batch_key(batch) AS batch_key,
         -- Spell them the way the ledger first spelt them, so the phone shows
         -- the offices own wording rather than a normalised key.
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
   security_invoker means the underlying tables own policies still decide;
   this only opens the view itself. */
GRANT SELECT ON shared_plot_batch_balance TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ── WHAT SHOULD HAVE HAPPENED ──────────────────────────────────────────
-- Then open the Nursery Report for any plot and compare. The batches and
-- quantities should agree row for row - that is the check that matters and
-- this file cannot do it for you.
SELECT 'view rebuilt' AS check,
       CASE WHEN to_regclass('public.shared_plot_batch_balance') IS NULL
            THEN 'NO' ELSE 'yes' END AS result
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
