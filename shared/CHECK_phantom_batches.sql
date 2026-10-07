-- ════════════════════════════════════════════════════════════════════════
-- WHICH BATCHES ARE ON THE REPORT WITH NOTHING BEHIND THEM?
-- shared/CHECK_phantom_batches.sql
--
-- Read-only. Nothing is created, changed or deleted, and it is safe to run
-- as many times as you like.
--
-- Set the batch on the line marked below, or leave it as  for the sweep
-- alone, then run the whole file.
--
-- A batch becomes a row on Life of Seedling because some ledger line carries
-- its name. Most lines also carry a quantity, so the row has something in it.
-- A few do not:
--
--   * a Stock_Calibration nobody has approved, which is counted nowhere
--   * a line keyed and then zeroed
--   * a Cull3_Transfer of nought
--
-- The batch then showed as a row of dashes and noughts — no date, no breed,
-- no supplier, nothing received. That is not a batch, it is one stray line,
-- and the report no longer draws a row for it.
--
-- This names them so the ledger itself can be tidied. Section 1 is the batch
-- you asked about, line by line, with whether each line counts for anything.
-- Section 3 is every batch in the same position, which is the one that
-- matters: a stray line is never on its own for long.
--
-- A good result is section 3 empty. Anything listed there is a ledger line to
-- look at in Batch Detail and either complete or remove.
-- ════════════════════════════════════════════════════════════════════════

WITH params AS (
  SELECT '211'::text AS look_for          -- the batch you are asking about
),

-- Every ledger line, with whether it puts anything on the report.
mv AS (
  SELECT l.batch_name,
         l.transaction_type AS kind,
         COALESCE(l.transaction_date, l.created_at::date) AS whn,
         COALESCE(l.quantity_change, 0) AS qty,
         COALESCE(l.plot_name, '-') AS plot,
         CASE
           -- A receipt puts the batch on the report even at nought, because a
           -- quantity keyed wrong is a real thing somebody has to see.
           WHEN l.transaction_type = 'Seeds_Received' THEN true
           -- An adjustment counts only once approved, the same as everywhere.
           WHEN l.transaction_type = 'Stock_Calibration'
             THEN position('[APPROVED' in COALESCE(l.remark, '')) > 0
                  AND COALESCE(l.quantity_change, 0) <> 0
           ELSE COALESCE(l.quantity_change, 0) <> 0
         END AS counts
    FROM shared_inventory_logs l
   WHERE l.batch_name IS NOT NULL AND btrim(l.batch_name) <> ''
),

-- Deliveries count too, so a batch that only ever sold is not called empty.
sold AS (
  SELECT btrim(b.batch_name) AS batch_name, SUM(COALESCE(b.qty, 0)) AS qty
    FROM shared_do_records d
    CROSS JOIN LATERAL (VALUES (d.batch_1, d.qty_1), (d.batch_2, d.qty_2),
                               (d.batch_3, d.qty_3), (d.batch_4, d.qty_4),
                               (d.batch_5, d.qty_5)) AS b(batch_name, qty)
   WHERE COALESCE(d.status, '') <> 'Cancelled'
     AND position('[CANCELLED]' in COALESCE(d.remark, '')) = 0
     AND b.batch_name IS NOT NULL AND btrim(b.batch_name) <> ''
   GROUP BY 1
),

per AS (
  SELECT m.batch_name,
         COUNT(*) AS lines_total,
         COUNT(*) FILTER (WHERE m.counts) AS lines_counting,
         MIN(m.whn) AS first_seen,
         MAX(m.whn) AS last_seen
    FROM mv m GROUP BY 1
),

phantom AS (
  SELECT p.*
    FROM per p
    LEFT JOIN sold s ON btrim(s.batch_name) = btrim(p.batch_name)
   WHERE p.lines_counting = 0 AND COALESCE(s.qty, 0) = 0
)

SELECT * FROM (

  -- 1 ── The batch asked about, line by line.
  SELECT 1 AS ord, ('batch ' || m.batch_name)::text AS what,
         to_char(m.whn, 'YYYY-MM-DD')::text AS whn,
         (m.kind || '  qty ' || m.qty::text || '  on ' || m.plot)::text AS detail,
         (CASE WHEN m.counts THEN 'counts'
               WHEN m.kind = 'Stock_Calibration' THEN 'NOT APPROVED, so it is counted nowhere'
               ELSE 'quantity is nought, so it adds nothing' END)::text AS note
    FROM mv m, params p
   WHERE p.look_for <> '' AND btrim(m.batch_name) = btrim(p.look_for)

  UNION ALL
  SELECT 2, ('batch ' || (SELECT look_for FROM params))::text, '-',
         'no ledger line carries this batch name',
         'it is not on the report from this table'
   WHERE (SELECT look_for FROM params) <> ''
     AND NOT EXISTS (SELECT 1 FROM mv m, params p
                      WHERE btrim(m.batch_name) = btrim(p.look_for))

  -- 3 ── Every batch with nothing behind it. The sweep.
  UNION ALL
  SELECT 3, 'nothing behind it'::text,
         to_char(ph.last_seen, 'YYYY-MM-DD')::text,
         ('batch ' || ph.batch_name || '  ' || ph.lines_total::text
          || ' ledger line' || CASE WHEN ph.lines_total = 1 THEN '' ELSE 's' END
          || ', none of them counting')::text,
         'open it in Batch Detail and either complete the line or remove it'
    FROM phantom ph

  -- 9 ── How many, so an empty sweep still says so.
  UNION ALL
  SELECT 9, 'VERDICT'::text, '-',
         ((SELECT COUNT(*) FROM phantom)::text || ' batch'
          || CASE WHEN (SELECT COUNT(*) FROM phantom) = 1 THEN '' ELSE 'es' END
          || ' with nothing behind them')::text,
         CASE WHEN (SELECT COUNT(*) FROM phantom) = 0
              THEN 'the ledger is clean'
              ELSE 'they no longer draw a row, but the stray lines are still there' END

) x
ORDER BY ord, whn, detail;
