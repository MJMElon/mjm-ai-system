-- ════════════════════════════════════════════════════════════════════════
-- PUT BACK THE ROWS DRAGGED OUT OF THEIR MONTH
-- shared/RUN_ME_put_dragged_rows_back.sql
--
-- Paste the WHOLE file into the Supabase SQL Editor and press Run.
-- Safe to run twice: the second run finds no pairs and changes nothing.
-- ONE statement. No regular expressions and no backslashes.
--
-- Set the two months on the lines marked below. EVERY NURSERY IS REPAIRED
-- AT ONCE — there is no nursery to set. Run
-- shared/CHECK_rows_dragged_out_of_month.sql first and read what it names —
-- this acts on exactly those rows and no others.
--
-- WHAT IT REPAIRS
--
-- A build of stampRecordMonths() put every dated row under the month of its
-- own date, so a September schedule row worked in early October was stamped
-- October and left September. The next sync found the slot missing and built
-- a fresh blank for it. September therefore lost a row and gained a blank,
-- and its capacity fell by the difference.
--
-- WHAT IT TOUCHES
--   the _month of the dragged row, put back to the month it belongs to
--   the blank row of the same slot, removed
--
-- WHAT IT DOES NOT TOUCH
--   the date, the batch, the quantity, Checked, the worker ticks (those live
--   in nops_maint_payroll, which this file never names), any other month, and
--   any October row that has no blank twin — a genuine October row is left
--   exactly as it is.
--
-- WHY THERE IS NO NURSERY HERE ANY MORE
--   The first version resolved a row's nursery by joining shared_plots. That
--   table is Seedling Stock and does NOT hold UNN 2's N1-N20 — the list
--   those pages really use is the hardcoded BASE in
--   shared/shared_maint_plots.js, merged with nops_maint_custom_plots AND
--   shared_plots. So for UNN 2 the join matched nothing and the file
--   reported 0 about an empty set, which reads exactly like good news. A
--   slot carries its plot inside it, so the join bought nothing and cost a
--   nursery.
--
-- HOW A ROW IS FOUND
--   One schedule slot in two places at once: a DATED row stamped the later
--   month, and an UNDATED, unkeyed, unchecked row of the SAME slot stamped
--   the earlier one. A genuine row of the later month has no such twin.
--
-- WHAT TO LOOK FOR
--   The table says how many rows were put back and how many blanks removed.
--   The two "was in" lines are the counts BEFORE this run, because a CTE
--   reads the snapshot its statement began with — so the proof is RUNNING IT
--   AGAIN: the second run must say 0, which means no slot is in two months.
-- ════════════════════════════════════════════════════════════════════════

WITH params AS (
  SELECT 'Sep 2026'::text AS lost_month, -- the month that lost rows
         'Oct 2026'::text AS got_month   -- the month they were dragged into
),
raw AS (
  SELECT e.ord, e.rec
    FROM nops_maint_records m
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.records, '[]'::jsonb))
         WITH ORDINALITY AS e(rec, ord)
   WHERE m.id = 1
),
mine AS (
  SELECT r.ord,
         COALESCE(r.rec->>'_src', '')          AS slot,
         btrim(COALESCE(r.rec->>'plot', ''))   AS plot,
         btrim(COALESCE(r.rec->>'jenis', ''))  AS jenis,
         btrim(COALESCE(r.rec->>'tarikh', '')) AS tarikh,
         btrim(COALESCE(r.rec->>'_month', '')) AS stamp,
         btrim(COALESCE(r.rec->>'qty', ''))       AS qty_keyed,
         btrim(COALESCE(r.rec->>'qtyFrozen', '')) AS qty_frozen,
         CASE WHEN COALESCE(r.rec->>'checked', '0') IN ('1', 'true') THEN 1 ELSE 0 END AS checked
    FROM raw r
   WHERE COALESCE(r.rec->>'_src', '') <> ''
),
dragged AS (
  SELECT m.* FROM mine m, params p
   WHERE m.stamp = p.got_month AND m.tarikh <> ''
),
blanks AS (
  SELECT m.* FROM mine m, params p
   WHERE m.stamp = p.lost_month
     AND m.tarikh = '' AND m.qty_keyed = '' AND m.qty_frozen = '' AND m.checked = 0
),
pairs AS (
  SELECT DISTINCT d.ord AS drag_ord, b.ord AS blank_ord
    FROM dragged d
    JOIN blanks b ON b.slot = d.slot AND b.plot = d.plot AND b.jenis = d.jenis
),
rebuilt AS (
  SELECT jsonb_agg(
           CASE WHEN r.ord IN (SELECT drag_ord FROM pairs)
                THEN jsonb_set(r.rec, '{_month}', to_jsonb((SELECT lost_month FROM params)))
                ELSE r.rec END
           ORDER BY r.ord) AS arr
    FROM raw r
   WHERE r.ord NOT IN (SELECT blank_ord FROM pairs)
),
done AS (
  UPDATE nops_maint_records
     SET records = COALESCE((SELECT arr FROM rebuilt), records),
         updated_at = now()
   WHERE id = 1
     AND (SELECT count(*) FROM pairs) > 0
  RETURNING 1
),
after AS (
  SELECT btrim(COALESCE(e.rec->>'_month', '')) AS stamp, count(*) AS n
    FROM nops_maint_records m
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.records, '[]'::jsonb)) AS e(rec)
   WHERE m.id = 1
   GROUP BY 1
)
SELECT * FROM (
  SELECT 1 AS ord, 'put back'::text AS what,
         (SELECT count(*)::text FROM pairs) AS n,
         'rows stamped back to the month their schedule asked for'::text AS detail
  UNION ALL
  SELECT 2, 'blanks removed', (SELECT count(*)::text FROM pairs),
         'the undated rows the sync built in their place'
  UNION ALL
  SELECT 3, 'was in ' || (SELECT lost_month FROM params),
         COALESCE((SELECT n::text FROM after WHERE stamp = (SELECT lost_month FROM params)), '0'),
         'the count BEFORE this run — a CTE reads the snapshot it began with'
  UNION ALL
  SELECT 4, 'was in ' || (SELECT got_month FROM params),
         COALESCE((SELECT n::text FROM after WHERE stamp = (SELECT got_month FROM params)), '0'),
         'the count BEFORE this run — a CTE reads the snapshot it began with'
  UNION ALL
  SELECT 9, 'VERDICT', (SELECT count(*)::text FROM pairs),
         CASE WHEN (SELECT count(*) FROM pairs) = 0
              THEN 'nothing to do — no slot is in two months at once'
              ELSE 'run it again and this should read 0' END
) x
ORDER BY ord;
