-- ════════════════════════════════════════════════════════════════════════
-- WHAT IS IN EACH MONTH, AND WHICH HALF OF A SLOT CARRIES THE WORK
-- shared/CHECK_what_is_in_each_month.sql
--
-- Read-only. Nothing is created, changed or deleted. Run the whole file.
-- It joins nothing and sweeps every nursery at once.
--
-- A BLANK DATE IS '-', NOT AN EMPTY STRING
--
-- The sync writes a generated row with tarikh:'-' and the page tests
-- (!r.tarikh || r.tarikh === '-'). The first version of this file asked for
-- tarikh = '' and so found NO blank rows anywhere -- it reported "0 with no
-- date" for every month, and the repair that used the same test found no
-- pairs to put back. Both were measuring nothing. The rule is here, once, in
-- has_date.
--
-- A SLOT IN TWO MONTHS IS NORMAL. WHICH HALF IS DATED IS THE QUESTION.
--
-- A generated slot is the SAME string in every month -- "pd|W1|P|N15" is
-- September's row and October's row alike. So a slot appearing in two months
-- is the ordinary state and counting those tells you nothing. What matters is
-- which half carries the work:
--
--   earlier dated, later blank  the ordinary case: done in September, October
--                               not worked yet. Leave alone.
--   both dated                  both months were worked. Leave alone.
--   both blank                  neither worked yet. Leave alone.
--   EARLIER BLANK, LATER DATED  this is the drag. A September row was stamped
--                               October because that is when it was worked,
--                               and the next sync built a blank in its place.
--                               September lost the figure and the tick.
--
-- WHAT TO LOOK FOR
--
-- 1 MONTH  per month: rows, how many are blank, how many ticked, and the
--          capacity. Compare each month against its verified claim.
-- 2 SHAPE  the four classes above, counted. Only the last one is a fault.
-- 3 DRAG   every slot of that last class, named, with what the later row
--          carries. These are the rows to put back.
-- 4 ODD    a slot in two months where neither month is the pair being asked
--          about, and rows with no month at all.
--
-- Set the two months below. A good result is 3 DRAG empty.
-- ════════════════════════════════════════════════════════════════════════

WITH params AS (
  SELECT 'Sep 2026'::text AS lost_month, -- the earlier month
         'Oct 2026'::text AS got_month   -- the later month
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
         replace(btrim(COALESCE(r.rec->>'qty', '')), ',', '')       AS qty_keyed,
         replace(btrim(COALESCE(r.rec->>'qtyFrozen', '')), ',', '') AS qty_frozen,
         CASE WHEN COALESCE(r.rec->>'checked', '0') IN ('1', 'true') THEN 1 ELSE 0 END AS checked
    FROM raw r
),

-- The page's own rule: a date is a date unless it is missing or a dash.
-- A figure counts only when the string is nothing but digits, so a dash or a
-- stray letter is none.
graded AS (
  SELECT m.*,
         (m.tarikh <> '' AND m.tarikh <> '-') AS has_date,
         CASE WHEN m.qty_keyed <> '' AND translate(m.qty_keyed, '0123456789', '') = ''
                THEN m.qty_keyed::numeric
              WHEN m.qty_frozen <> '' AND translate(m.qty_frozen, '0123456789', '') = ''
                THEN m.qty_frozen::numeric
              ELSE 0 END AS cap
    FROM mine m
),

-- One line per slot per month, so a month that holds the slot twice does not
-- make two pairs of it.
per_slot_month AS (
  SELECT slot, stamp,
         max(CASE WHEN has_date THEN 1 ELSE 0 END) AS dated,
         max(CASE WHEN qty_keyed <> '' OR qty_frozen <> '' THEN 1 ELSE 0 END) AS figured,
         max(checked) AS ticked,
         max(CASE WHEN has_date THEN tarikh ELSE '' END) AS a_date,
         max(cap) AS cap,
         count(*) AS rows_here
    FROM graded
   WHERE slot <> '' AND stamp <> ''
   GROUP BY slot, stamp
),

pairs AS (
  SELECT l.slot,
         l.dated AS lost_dated, g.dated AS got_dated,
         g.figured AS got_figured, g.ticked AS got_ticked,
         g.a_date AS got_date, g.cap AS got_cap,
         l.figured AS lost_figured, l.ticked AS lost_ticked
    FROM per_slot_month l
    JOIN per_slot_month g ON g.slot = l.slot
   WHERE l.stamp = (SELECT lost_month FROM params)
     AND g.stamp = (SELECT got_month  FROM params)
),

shaped AS (
  SELECT p.*,
         CASE WHEN p.lost_dated = 1 AND p.got_dated = 0 THEN 'a  earlier dated, later blank  (ordinary)'
              WHEN p.lost_dated = 1 AND p.got_dated = 1 THEN 'b  both dated  (both months worked)'
              WHEN p.lost_dated = 0 AND p.got_dated = 0 THEN 'c  both blank  (neither worked yet)'
              ELSE 'd  EARLIER BLANK, LATER DATED  (the drag)' END AS shape
    FROM pairs p
)

SELECT * FROM (
  SELECT 1 AS ord, '1 MONTH'::text AS section,
         (CASE WHEN g.stamp = '' THEN 'no month' ELSE g.stamp END)::text AS item,
         count(*)::text AS n,
         (sum(CASE WHEN g.has_date THEN 0 ELSE 1 END)::text || ' blank, '
          || sum(g.checked)::text || ' ticked, capacity '
          || to_char(sum(g.cap), 'FM999G999G999'))::text AS detail
    FROM graded g
   GROUP BY g.stamp

  UNION ALL
  SELECT 2, '2 SHAPE', s.shape::text, count(*)::text,
         (sum(s.got_ticked)::text || ' of the later rows are ticked, '
          || sum(s.got_figured)::text || ' carry a figure')::text
    FROM shaped s
   GROUP BY s.shape

  UNION ALL
  SELECT 3, '3 DRAG', s.slot::text, '1',
         ('later row dated ' || s.got_date
          || CASE WHEN s.got_ticked = 1 THEN ', ticked' ELSE ', not ticked' END
          || CASE WHEN s.got_figured = 1 THEN ', carries a figure' ELSE ', no keyed figure' END
          || ', capacity ' || to_char(s.got_cap, 'FM999G999G999'))::text
    FROM shaped s
   WHERE s.lost_dated = 0 AND s.got_dated = 1

  UNION ALL
  SELECT 4, '4 ODD', ('slot in ' || x.stamp || ' only')::text, count(*)::text,
         'a month outside the pair being asked about'::text
    FROM per_slot_month x
   WHERE x.stamp <> (SELECT lost_month FROM params)
     AND x.stamp <> (SELECT got_month  FROM params)
   GROUP BY x.stamp

  UNION ALL
  SELECT 4, '4 ODD', 'rows with no month', (SELECT count(*)::text FROM graded WHERE stamp = ''),
         'these show in no month at all'

  UNION ALL
  SELECT 9, '9 VERDICT', 'dragged out of ' || (SELECT lost_month FROM params),
         (SELECT count(*)::text FROM shaped WHERE lost_dated = 0 AND got_dated = 1),
         'each one is a row to put back'
  UNION ALL
  SELECT 9, '9 VERDICT', 'ordinary slots left alone',
         (SELECT count(*)::text FROM shaped WHERE NOT (lost_dated = 0 AND got_dated = 1)),
         'a slot in two months is normal -- the schedule repeats it'
) x
ORDER BY ord, item, detail;
