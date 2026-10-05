-- =====================================================================
--  UNDO THE DOUBLED 2ND CULLING FIGURES — EVERY BATCH
--
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  Safe to run twice: the second run changes nothing and prints the same
--  table. No regular expressions and no backslashes, so it survives a paste.
--
--  WHY
--  Two overlapping runs of the 2nd Culling tab's load made its merge SUM the
--  rows it joined -- both the Dead and the Transplanted. Save writes what is
--  on screen, so a save made in that state wrote the doubled Dead into the
--  row and the doubled Transplanted into its remark. The page is fixed; a
--  save it already made cannot be undone by fixing it.
--
--  WHAT THIS REPAIRS, AND HOW IT KNOWS
--  The real transplanted total for a plot is the sum of its Transplanted
--  rows in this same table, which the culling tab cannot touch. Where a 2nd
--  culling remark claims an exact multiple of that, the save was made while
--  doubling -- and where the Dead divides by that same multiple, the Dead
--  was doubled with it. Both conditions, or the row is left alone.
--
--  WHAT IT DELIBERATELY LEAVES
--    · a Dead that does NOT divide by the multiple. Somebody TYPED that
--      figure in the doubled session, so it was saved as typed and is right
--      -- batch 252's N11, for one.
--    · anything whose remark and transplant rows already agree.
--    · a plot transplanted in two goes, or carrying an approved adjustment:
--      those disagree without being a whole multiple.
--
--  AND THE ONE IT CANNOT SEE. Open the tab again on a good day and save, and
--  the remark's Transplanted is written back correct while the doubled Dead
--  stays -- the fingerprint is wiped and the wrong number is not. Batch 254
--  is that case, so its two rows are named outright, from the figures
--  CHECK_cull2_rows.sql read before the save that doubled them.
--
--  Each row's drone map and cull date are carried over untouched. Only the
--  numbers are rewritten, and the remark's Alive and Transplanted are put
--  back in step with the ledger.
--
--  WHAT TO LOOK FOR
--  The table at the end is every row this touched, with what it now holds.
--  Good means every line reads 'repaired' and the arithmetic adds up
--  (transplanted - dead = alive), and 'map kept' says yes wherever the row
--  had one. Run it a second time: it prints the same rows and changes none.
-- =====================================================================

-- ── 1. The rule, swept across every batch ────────────────────────────
WITH t AS (
  SELECT trim(COALESCE(batch_name, '')) AS batch,
         trim(COALESCE(plot_name, ''))  AS plot,
         sum(abs(COALESCE(quantity_change, 0)))::bigint AS actual
    FROM shared_inventory_logs
   WHERE transaction_type IN ('Transplanted', 'Transplanted_DoubleTone')
   GROUP BY 1, 2
),
c AS (
  SELECT il.id,
         COALESCE(il.quantity_change, 0)::bigint AS dead,
         NULLIF(trim(split_part(split_part(COALESCE(il.remark, ''), 'Transplanted:', 2), '.', 1)), '') AS said,
         trim(COALESCE(il.batch_name, '')) AS batch,
         trim(COALESCE(il.plot_name, ''))  AS plot,
         il.remark
    FROM shared_inventory_logs il
   WHERE il.transaction_type = '2nd_Culling'
),
cn AS (
  SELECT id, dead, batch, plot, remark,
         CASE WHEN said IS NOT NULL AND translate(said, '0123456789', '') = ''
              THEN said::bigint END AS said_n
    FROM c
),
fix AS (
  SELECT cn.id, cn.remark, t.actual,
         cn.dead / (cn.said_n / t.actual) AS new_dead
    FROM cn JOIN t ON t.batch = cn.batch AND t.plot = cn.plot
   WHERE t.actual > 0
     AND cn.said_n IS NOT NULL
     AND cn.said_n > t.actual
     AND mod(cn.said_n, t.actual) = 0
     AND mod(cn.dead, cn.said_n / t.actual) = 0
     AND position('CullDate:' IN cn.remark) > 0
)
UPDATE shared_inventory_logs AS il
   SET quantity_change = fix.new_dead,
       remark = '2nd Culling. Alive: ' || (fix.actual - fix.new_dead)::text
             || ', Dead: '             || fix.new_dead::text
             || ', Cull: '             || round(fix.new_dead * 100.0 / fix.actual, 2)::text
             || '%. Transplanted: '    || fix.actual::text
             || '. CullDate:'          || split_part(fix.remark, 'CullDate:', 2)
  FROM fix
 WHERE il.id = fix.id;

-- ── 2. Batch 254, whose fingerprint a later clean save wiped ──────────
UPDATE shared_inventory_logs AS il
   SET quantity_change = v.dead,
       remark = '2nd Culling. Alive: ' || (v.planted - v.dead)::text
             || ', Dead: '             || v.dead::text
             || ', Cull: '             || round(v.dead * 100.0 / v.planted, 2)::text
             || '%. Transplanted: '    || v.planted::text
             || '. CullDate:'          || split_part(il.remark, 'CullDate:', 2)
  FROM (VALUES ('B5', 243, 5949), ('U3', 3, 945)) AS v(plot, dead, planted)
 WHERE il.transaction_type = '2nd_Culling'
   AND trim(il.batch_name) = '254'
   AND trim(il.plot_name)  = v.plot
   AND position('CullDate:' IN il.remark) > 0
   AND il.quantity_change IS DISTINCT FROM v.dead;

-- ── 3. What it now holds ─────────────────────────────────────────────
SELECT trim(batch_name) AS batch,
       trim(plot_name)  AS plot,
       quantity_change  AS dead,
       NULLIF(trim(split_part(split_part(remark, 'Alive:', 2), ',', 1)), '')        AS alive,
       NULLIF(trim(split_part(split_part(remark, 'Transplanted:', 2), '.', 1)), '') AS transplanted,
       CASE WHEN position('MapUrl:' IN remark) > 0 THEN 'yes' ELSE 'no' END         AS map_kept,
       'repaired'                                                                   AS state
  FROM shared_inventory_logs
 WHERE transaction_type = '2nd_Culling'
   AND trim(batch_name) IN ('252', '254', '256')
 ORDER BY trim(batch_name), left(trim(plot_name), 1), length(trim(plot_name)), trim(plot_name);
