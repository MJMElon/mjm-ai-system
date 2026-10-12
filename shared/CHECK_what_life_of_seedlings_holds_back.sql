-- =====================================================================
--  WHAT LIFE OF SEEDLINGS WILL NOT SHOW UNTIL IT IS SIGNED OFF
--  Paste into the Supabase SQL Editor and press Run. Read-only: it
--  changes nothing, so it is safe to run as often as you like.
--
--  Life of Seedlings now shows ONLY verified figures. A stage nobody
--  has signed off reads as a dash on the report and is left out of
--  the column total, instead of being shown with a marker beside it.
--
--  This is the size of that. One row per batch, saying which of its
--  stages are signed and which are not, so the office can see how
--  much of the report goes blank before opening it, and which tabs
--  somebody has to go and verify.
--
--  A stage counts as signed either way the system allows:
--
--    the WHOLE TAB      a row in operation_batch_verifications for
--                       that batch and stage
--    ROW BY ROW         a Row_Verification log per line, keyed
--                       <stage>::<rowKey>. Only the part of the key
--                       before the first pipe is matched, except a
--                       3rd-culling TRANSFER card, which keeps its
--                       own suffix.
--
--  Seed In and Planting are signed as a whole tab only. Transplanting
--  and the three cullings may be signed either way.
--
--  WHAT A GOOD RESULT LOOKS LIKE
--    The ALL row first with the counts, then one row per batch that
--    has anything outstanding. A batch with everything signed is not
--    listed.
--
--    lines / signed   how many ledger lines that stage has, and how
--                     many of them carry a signature.
--    waiting          the stages whose figures will NOT be on the
--                     report. This is the list somebody has to work
--                     through.
--
--    A batch reading "transplanting, cull_3" under waiting shows a
--    dash in Transplant Qty, 3rd Culled, Total Culled and Balance,
--    and is out of those four totals.
-- =====================================================================
WITH lines AS (
  SELECT btrim(l.batch_name) AS batch_name,
         CASE
           WHEN l.transaction_type = 'Seeds_Received' THEN 'seeds_in'
           WHEN l.transaction_type IN ('Damaged_Seeds', 'Planted') THEN 'planting'
           WHEN l.transaction_type IN ('Transplanted', 'Transplanted_Premium',
                                       'Transplanted_DoubleTone', 'DTone_Nursery_Qty')
             THEN 'transplanting'
           WHEN l.transaction_type = '1st_Culling' THEN 'cull_1'
           WHEN l.transaction_type = '2nd_Culling' THEN 'cull_2'
           WHEN l.transaction_type IN ('3rd_Culling', 'Cull3_Transfer') THEN 'cull_3'
           ELSE ''
         END AS stage,
         CASE
           WHEN l.transaction_type = 'DTone_Nursery_Qty' THEN 'DTONE-NURSERY-QTY'
           WHEN l.transaction_type = 'Cull3_Transfer'
             THEN upper(btrim(split_part(split_part(COALESCE(l.remark, ''), 'From: [', 2), '|', 1)))
                  || '|TRANSFER'
           ELSE upper(btrim(COALESCE(l.plot_name, '')))
         END AS row_key
  FROM shared_inventory_logs l
  WHERE COALESCE(btrim(l.batch_name), '') <> ''
    AND l.transaction_type IN ('Seeds_Received', 'Damaged_Seeds', 'Planted',
          'Transplanted', 'Transplanted_Premium', 'Transplanted_DoubleTone',
          'DTone_Nursery_Qty', '1st_Culling', '2nd_Culling', '3rd_Culling',
          'Cull3_Transfer')
),
stage_signed AS (
  SELECT DISTINCT btrim(batch_name) AS batch_name, stage
  FROM operation_batch_verifications
),
row_signed AS (
  SELECT DISTINCT btrim(l.batch_name) AS batch_name,
         split_part(COALESCE(l.plot_name, ''), '::', 1) AS stage,
         CASE
           WHEN upper(COALESCE(l.plot_name, '')) LIKE '%|TRANSFER'
             THEN upper(btrim(split_part(COALESCE(l.plot_name, ''), '::', 2)))
           ELSE upper(btrim(split_part(split_part(COALESCE(l.plot_name, ''), '::', 2), '|', 1)))
         END AS row_key
  FROM shared_inventory_logs l
  WHERE l.transaction_type = 'Row_Verification'
    AND position('::' in COALESCE(l.plot_name, '')) > 0
),
tally AS (
  SELECT n.batch_name,
         n.stage,
         count(*) AS lines,
         count(*) FILTER (
           WHERE s.batch_name IS NOT NULL
              OR (n.stage IN ('transplanting', 'cull_1', 'cull_2', 'cull_3')
                  AND v.batch_name IS NOT NULL)
         ) AS signed
  FROM lines n
  LEFT JOIN stage_signed s
         ON s.batch_name = n.batch_name AND s.stage = n.stage
  LEFT JOIN row_signed v
         ON v.batch_name = n.batch_name AND v.stage = n.stage AND v.row_key = n.row_key
  WHERE n.stage <> ''
  GROUP BY n.batch_name, n.stage
),
per_batch AS (
  SELECT batch_name,
         sum(lines)  AS lines,
         sum(signed) AS signed,
         string_agg(stage || ' ' || signed || '/' || lines, ', '
                    ORDER BY stage) FILTER (WHERE signed < lines) AS waiting,
         count(*) FILTER (WHERE signed < lines) AS stages_waiting
  FROM tally
  GROUP BY batch_name
)
SELECT batch, lines, signed, waiting
FROM (
  SELECT 0 AS sort_first,
         0 AS sort_size,
         'ALL — ' || count(*) || ' batches, '
           || count(*) FILTER (WHERE stages_waiting > 0)
           || ' with something unsigned, '
           || count(*) FILTER (WHERE signed = 0)
           || ' with nothing signed at all' AS batch,
         sum(lines)  AS lines,
         sum(signed) AS signed,
         '' AS waiting
  FROM per_batch
  UNION ALL
  SELECT 1, stages_waiting, batch_name, lines, signed, COALESCE(waiting, '')
  FROM per_batch
  WHERE stages_waiting > 0
) q
ORDER BY sort_first, sort_size DESC, batch;
