-- ===================================================================
-- A SIGNATURE OVER A REPORT THAT HOLDS NOTHING
-- ===================================================================
-- Why this exists. Verifying a batch tab wrote the verification row and
-- nothing else: it ran no save. So keying a figure and then pressing
-- Verify signed the report off WITHOUT the figure, and the lock that
-- followed then refused the save that would have stored it. The office
-- met it on batch 257 and said it in one line, that pressing Save did
-- not save.
--
-- NOTHING IN THE DATA RECORDS THAT FAULT. The verification row is
-- ordinary and the report simply holds the older figures, so a report
-- signed over a lost amendment cannot be told from one signed over
-- figures that were correct. What IS decidable is the worst outcome of
-- it: a stage signed off on a batch that carries NO ledger row for that
-- stage at all. That is what you get when the only keying there ever
-- was never reached the database.
--
-- Read only. It changes nothing and is safe to run as often as you like.
--
-- WHAT A GOOD RESULT LOOKS LIKE: the two SIGNED OVER NOTHING sections
-- read "nothing to report". Every line under them is a report somebody
-- signed with no rows behind it, which is a report to open and key
-- again. The last line is the tally.
-- ===================================================================

WITH stage_types(stage, ttype) AS (
    VALUES ('seeds_in',      'Seeds_Received'),
           ('planting',      'Planted'),
           ('transplanting', 'Transplanted'),
           ('transplanting', 'Transplanted_DoubleTone'),
           ('transplanting', 'Transplanted_Premium'),
           ('cull_1',        '1st_Culling'),
           ('cull_2',        '2nd_Culling'),
           ('cull_3',        '3rd_Culling'),
           ('cull_3',        'Cull3_Transfer'),
           ('seed_audit',    'Seed_Audit')
),
stage_name(stage, label) AS (
    VALUES ('seeds_in',      'Seeds Received'),
           ('planting',      'Seed Planting'),
           ('transplanting', 'Transplanting'),
           ('cull_1',        '1st Culling'),
           ('cull_2',        '2nd Culling'),
           ('cull_3',        '3rd Culling'),
           ('seed_audit',    'Seed Audit')
),
-- Every tab signature the office has made.
sigs AS (
    SELECT v.batch_name,
           v.stage,
           v.verified_at,
           COALESCE(NULLIF(TRIM(COALESCE(v.verifier_name, '')), ''),
                    NULLIF(TRIM(COALESCE(v.verifier_email, '')), ''),
                    'name not stored') AS signer
      FROM public.operation_batch_verifications v
     WHERE v.stage IN (SELECT stage FROM stage_name)
),
-- Every per-row signature, which is a log row keyed stage::rowkey.
rowsigs AS (
    SELECT l.batch_name,
           split_part(COALESCE(l.plot_name, ''), '::', 1) AS stage,
           MIN(l.created_at)                              AS first_at,
           COUNT(*)                                       AS rows_signed
      FROM public.shared_inventory_logs l
     WHERE l.transaction_type = 'Row_Verification'
       AND position('::' IN COALESCE(l.plot_name, '')) > 0
     GROUP BY 1, 2
),
-- How many ledger rows each batch carries for each stage.
held AS (
    SELECT st.stage, l.batch_name, COUNT(*) AS n
      FROM public.shared_inventory_logs l
      JOIN stage_types st ON st.ttype = l.transaction_type
     GROUP BY 1, 2
),
empty_tab AS (
    SELECT s.*, n.label
      FROM sigs s
      JOIN stage_name n ON n.stage = s.stage
     WHERE NOT EXISTS (SELECT 1 FROM held h
                        WHERE h.stage = s.stage
                          AND h.batch_name = s.batch_name
                          AND h.n > 0)
),
empty_row AS (
    SELECT r.*, n.label
      FROM rowsigs r
      JOIN stage_name n ON n.stage = r.stage
     WHERE NOT EXISTS (SELECT 1 FROM held h
                        WHERE h.stage = r.stage
                          AND h.batch_name = r.batch_name
                          AND h.n > 0)
)
SELECT line FROM (
    SELECT 0 AS ord, 0 AS ord2, '' AS ord3,
           'Tab signatures: ' || (SELECT COUNT(*) FROM sigs)
             || ' -- row signatures: ' || (SELECT COUNT(*) FROM rowsigs)
             || ' -- batches with any ledger row: '
             || (SELECT COUNT(DISTINCT batch_name) FROM held) AS line

    UNION ALL SELECT 1, 0, '', '--- SIGNED OVER NOTHING: a whole tab ---'
    UNION ALL
    SELECT 1, 1, e.batch_name || e.stage,
           'Batch ' || e.batch_name || ' -- ' || e.label
             || ' signed by ' || e.signer
             || ' on ' || COALESCE(to_char(e.verified_at, 'DD Mon YYYY'), 'no date')
             || ' -- the batch has NO ' || e.label || ' row at all'
      FROM empty_tab e
    UNION ALL
    SELECT 1, 2, '', 'nothing to report -- every signed tab has rows behind it'
     WHERE NOT EXISTS (SELECT 1 FROM empty_tab)

    UNION ALL SELECT 2, 0, '', '--- SIGNED OVER NOTHING: rows on a tab ---'
    UNION ALL
    SELECT 2, 1, r.batch_name || r.stage,
           'Batch ' || r.batch_name || ' -- ' || r.label
             || ' -- ' || r.rows_signed || ' row signature(s) from '
             || COALESCE(to_char(r.first_at, 'DD Mon YYYY'), 'no date')
             || ' -- the batch has NO ' || r.label || ' row at all'
      FROM empty_row r
    UNION ALL
    SELECT 2, 2, '', 'nothing to report -- every signed row has a report behind it'
     WHERE NOT EXISTS (SELECT 1 FROM empty_row)

    UNION ALL
    SELECT 3, 0, '',
           'TOTAL: ' || (SELECT COUNT(*) FROM empty_tab) || ' tab signature(s) and '
             || (SELECT COUNT(*) FROM empty_row)
             || ' row-signature set(s) stand over a report with nothing in it'
) q
ORDER BY ord, ord2, ord3;
