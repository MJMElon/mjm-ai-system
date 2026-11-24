-- A DO TOTAL IS ITS LINES ADDED UP.
--
-- DO-B1PXG701 was saved reading 109 at the top (total_qty) and 200 on its
-- one line (qty_1). The dashboard Order and Collection chart reads total_qty
-- and the Sales Listing report reads the lines, so November 2026 read
-- 25,928 on one and 26,019 on the other: the 91 between them is that DO.
-- 109 is the real figure. 109 seals were scanned onto it, and the next DO
-- of the same order (DO-B1PXG702) is the other 91 of the 200.
--
-- The office Delivery Order screen now refuses a save whose lines do not
-- add up to its total, which is how this one was made. This file repairs
-- what is already stored, on EVERY DO, by one rule:
--
--   a DO with exactly ONE line carrying a quantity, whose line differs
--   from total_qty, AND whose scanned seals (seal_qty) equal total_qty,
--   has its line set to the total. The scan is the count of what went on
--   the lorry, so it decides.
--
-- Anything else that disagrees (several lines, or no scan to decide it) is
-- NOT touched and is listed below for somebody to open, because which of
-- the two figures is right cannot be told from here.
--
-- Safe to run twice: a second run repairs 0.
--
-- WHAT A GOOD RESULT LOOKS LIKE:
--   repaired             DO-B1PXG701 on the first run, nothing on the second
--   still disagree       nought rows, or the DOs to open by hand
--   November 2026        dashboard and Sales Listing figures EQUAL (25,928)

DO $$
DECLARE
  done TEXT;
BEGIN
  WITH d AS (
    SELECT id, do_number, total_qty, seal_qty,
           (CASE WHEN COALESCE(qty_1, 0) <> 0 THEN 1 ELSE 0 END
          + CASE WHEN COALESCE(qty_2, 0) <> 0 THEN 1 ELSE 0 END
          + CASE WHEN COALESCE(qty_3, 0) <> 0 THEN 1 ELSE 0 END
          + CASE WHEN COALESCE(qty_4, 0) <> 0 THEN 1 ELSE 0 END
          + CASE WHEN COALESCE(qty_5, 0) <> 0 THEN 1 ELSE 0 END) AS keyed,
           COALESCE(qty_1, 0) + COALESCE(qty_2, 0) + COALESCE(qty_3, 0)
         + COALESCE(qty_4, 0) + COALESCE(qty_5, 0) AS line_sum
      FROM public.shared_do_records
     WHERE COALESCE(status, '') <> 'Cancelled'
       AND do_number NOT ILIKE 'CAL-%'
  ), fix AS (
    UPDATE public.shared_do_records r
       SET qty_1 = CASE WHEN COALESCE(r.qty_1, 0) <> 0 THEN r.total_qty ELSE r.qty_1 END,
           qty_2 = CASE WHEN COALESCE(r.qty_2, 0) <> 0 THEN r.total_qty ELSE r.qty_2 END,
           qty_3 = CASE WHEN COALESCE(r.qty_3, 0) <> 0 THEN r.total_qty ELSE r.qty_3 END,
           qty_4 = CASE WHEN COALESCE(r.qty_4, 0) <> 0 THEN r.total_qty ELSE r.qty_4 END,
           qty_5 = CASE WHEN COALESCE(r.qty_5, 0) <> 0 THEN r.total_qty ELSE r.qty_5 END
      FROM d
     WHERE r.id = d.id
       AND d.keyed = 1
       AND d.line_sum <> COALESCE(d.total_qty, 0)
       AND d.seal_qty IS NOT NULL
       AND d.seal_qty = d.total_qty
    RETURNING r.do_number || ' line ' || d.line_sum || ' to ' || r.total_qty AS what
  )
  SELECT string_agg(what, ', ') INTO done FROM fix;
  PERFORM set_config('do_lines.repaired', COALESCE(done, ''), false);
END $$;

WITH d AS (
  SELECT do_number, delivery_date, total_qty, seal_qty,
         COALESCE(qty_1, 0) + COALESCE(qty_2, 0) + COALESCE(qty_3, 0)
       + COALESCE(qty_4, 0) + COALESCE(qty_5, 0) AS line_sum,
         (COALESCE(qty_1, 0) + COALESCE(qty_2, 0) + COALESCE(qty_3, 0)
       + COALESCE(qty_4, 0) + COALESCE(qty_5, 0)) <> 0 AS has_lines
    FROM public.shared_do_records
   WHERE COALESCE(status, '') <> 'Cancelled'
     AND do_number NOT ILIKE 'CAL-%'
), nov AS (
  SELECT sum(total_qty) AS by_total,
         sum(CASE WHEN has_lines THEN line_sum ELSE total_qty END) AS by_lines
    FROM d
   WHERE delivery_date >= DATE '2026-11-01' AND delivery_date < DATE '2026-12-01'
)
SELECT 1 AS n, 'repaired this run' AS what,
       COALESCE(NULLIF(current_setting('do_lines.repaired', true), ''), 'nothing') AS detail
UNION ALL
SELECT 2, 'still disagree, open by hand: ' || do_number,
       'delivered ' || delivery_date || ', total ' || total_qty || ', lines ' || line_sum
       || ', seals ' || COALESCE(seal_qty::text, 'none')
  FROM d WHERE has_lines AND line_sum <> COALESCE(total_qty, 0)
UNION ALL
SELECT 3, 'every DO now agrees with its lines', 'yes'
 WHERE NOT EXISTS (SELECT 1 FROM d WHERE has_lines AND line_sum <> COALESCE(total_qty, 0))
UNION ALL
SELECT 4, 'November 2026: dashboard (total) and Sales Listing (lines)',
       by_total || ' and ' || by_lines || CASE WHEN by_total = by_lines THEN ' -- EQUAL' ELSE ' -- DIFFER' END
  FROM nov
ORDER BY 1, 2;
