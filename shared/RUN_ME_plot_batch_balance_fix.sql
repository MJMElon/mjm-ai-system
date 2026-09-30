-- ════════════════════════════════════════════════════════════════════════
-- THE FC PORTAL'S BATCH LIST *IS* THE MOVEMENT REPORT
--
-- One rule, so there is nothing to keep in step by hand: the plots, the
-- batches and the quantities a Field Conductor sees are the Movement
-- Report's own, both of its sections, arithmetic for arithmetic. If the
-- phone and the report ever disagree again, one of them has a bug.
--
--   MAIN NURSERY   + transplanted from PN  + transfer in  - transfer out
--                  - 3rd culled (ONLY ONCE EVIDENCED - MapQty: keyed)
--                  - sold  + stock adjustment (approved only)
--
--   PRE-NURSERY    + planted  + transfer in (a Premium Care / Double Tone
--                  tray filling up)  - 1st culled
--                  - transplanted out (the SOURCE tray's own loss)
--
--   THE 2ND CULLING NEVER DEDUCTS, in either section. Seed damage counts at
--   zero. Seeds_Received is not a movement column.
--
-- Four things were wrong and all four are fixed here:
--   1. the 2nd culling was deducted - U1's batch 252 read 4,191 against the
--      report's 4,201, exactly its 2nd culling of 10;
--   2. an unflown 3rd culling was deducted - U1's batch 250 vanished off the
--      phone while the report showed it standing at 447;
--   3. a transplant was never deducted from its SOURCE TRAY, so trays went
--      on offering seedlings they had sent to the field months earlier;
--   4. "232 (B13)" was filed under batch 13.
--
-- After this U1 offers 250 at 447 and 252 at 4,201 - 4,648 for the plot,
-- which is the report's own Balance column.
--
-- IT CHANGES NO DATA. The view holds none; every figure is recomputed from
-- the ledger the moment it is asked. Safe to run twice.
-- ════════════════════════════════════════════════════════════════════════


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
  /* ══ MAIN NURSERY ══ MOVE_COLS.main in operation_reports.html:
     transplanted from PN + transfer in - sold - 3rd culled - transfer out
     + stock adjustment. Sold is joined on further down. */

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

  UNION ALL

  /* ══ PRE-NURSERY ══ MOVE_COLS.pre: transfer in + planted - 1st culled
     - transplanted out. Seed Damage is shown there but counted at zero -
     it never entered a tray - so it takes no part here either.

     This section is what gives a PN plot (P01-P52) and the PREMIUM CARE /
     DOUBLE-TONE holding trays their batches. Leaving it out would empty
     PN's batch list on every phone. */

  -- Planted into a tray.
  SELECT id, plot_name, batch_name, abs(coalesce(quantity_change, 0))
  FROM   shared_inventory_logs WHERE transaction_type = 'Planted'

  UNION ALL

  -- A Premium Care / Double Tone tray filling up reads as ordinary
  -- transfer in: the row names the RECEIVING tray.
  SELECT id, plot_name, batch_name, abs(coalesce(quantity_change, 0))
  FROM   shared_inventory_logs
  WHERE  transaction_type IN ('Transplanted_Premium', 'Transplanted_DoubleTone')

  UNION ALL

  -- 1st culled, in the tray.
  SELECT id, plot_name, batch_name, -abs(coalesce(quantity_change, 0))
  FROM   shared_inventory_logs WHERE transaction_type = '1st_Culling'

  UNION ALL

  -- Transplanted out: the SOURCE TRAY's own loss, read from the remark.
  -- Without this a tray goes on showing seedlings it sent to the field
  -- months ago, and the holding trays never net out.
  SELECT l.id, s.src, l.batch_name, -abs(coalesce(l.quantity_change, 0))
  FROM   shared_inventory_logs l
  CROSS  JOIN LATERAL (SELECT (regexp_match(l.remark, 'from tray \[([^\]]+)\]', 'i'))[1] AS src) s
  WHERE  l.transaction_type IN ('Transplanted', 'Transplanted_Premium',
                                'Transplanted_DoubleTone')
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
-- A GOOD RESULT is five rows. The first two must read "yes".
--
-- Then open the Nursery Report for any plot and compare: the batches and
-- quantities should agree row for row. That is the only check that matters
-- and this file cannot do it for you - the report lives in the browser.
SELECT 'view rebuilt' AS check,
       CASE WHEN to_regclass('public.shared_plot_batch_balance') IS NULL
            THEN 'NO' ELSE 'yes' END AS result
UNION ALL
SELECT 'batch key ignores a note',
       CASE WHEN mjm_batch_key('232 (B13)') = '232' AND mjm_batch_key('250 (U1)') = '250'
            THEN 'yes' ELSE 'NO - still reading the note' END
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
