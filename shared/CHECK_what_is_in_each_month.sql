-- ════════════════════════════════════════════════════════════════════════
-- WHAT IS IN EACH MONTH, AND WHICH ROWS ARE IN TWO AT ONCE
-- shared/CHECK_what_is_in_each_month.sql
--
-- Read-only. Nothing is created, changed or deleted. Run the whole file.
--
-- WHY THIS AND NOT THE OTHER CHECK
--
-- shared/CHECK_rows_dragged_out_of_month.sql resolved a row's nursery by
-- joining shared_plots. That table is Seedling Stock and does NOT hold UNN
-- 2's N1-N20 -- the plot list those pages really use is the hardcoded BASE in
-- shared/shared_maint_plots.js, merged with nops_maint_custom_plots AND
-- shared_plots. So for UNN 2 that join matched nothing and the query
-- truthfully answered 0 about an empty set, which reads exactly like good
-- news. Do not trust it for a nursery whose plots Seedling Stock has never
-- heard of.
--
-- This file joins nothing. A slot already carries its plot inside it --
-- "pd|W4|P|N19" -- so every nursery is swept at once and no spelling of a
-- nursery name can hide a row.
--
-- WHAT EACH SECTION ANSWERS
--
-- 1 MONTH    one line per month stamp: how many rows, how many dated, how
--            many undated, how many ticked, and the capacity standing in it.
--            This is the figure the claim totals, so a month that has lost
--            rows shows it here.
-- 2 TWO      a schedule slot stamped two different months at once. That is
--            the drag fingerprint: the dated row went to the later month and
--            the next sync built a blank for the earlier one.
-- 3 TWICE    the same slot twice in the SAME month -- the undated duplicate
--            on screen. Says which of the two carries the figures.
-- 4 NOSTAMP  rows with no month at all. These answer no month and show
--            nowhere until something stamps them.
-- 5 LATE     every row whose own date falls in a different month from its
--            stamp. A September row worked on the 2nd of October is SUPPOSED
--            to look like this and must be left alone -- it is here so the
--            office can see which rows those are, not to be repaired.
--
-- WHAT A GOOD RESULT LOOKS LIKE: sections 2, 3 and 4 empty, and section 1
-- agreeing with the capacity on each month's verified claim.
-- ════════════════════════════════════════════════════════════════════════

WITH raw AS (
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

-- A figure the office can total: keyed first, then frozen, and only when the
-- string is nothing but digits, so a dash or a stray letter counts as none.
figured AS (
  SELECT m.*,
         CASE WHEN m.qty_keyed <> '' AND translate(m.qty_keyed, '0123456789', '') = ''
                THEN m.qty_keyed::numeric
              WHEN m.qty_frozen <> '' AND translate(m.qty_frozen, '0123456789', '') = ''
                THEN m.qty_frozen::numeric
              ELSE 0 END AS cap,
         CASE WHEN m.tarikh <> '' AND length(m.tarikh) >= 7
                THEN left(m.tarikh, 7) ELSE '' END AS date_ym
    FROM mine m
),

two_months AS (
  SELECT slot,
         string_agg(DISTINCT stamp, ' and ' ORDER BY stamp) AS which,
         count(*) AS n
    FROM figured
   WHERE slot <> '' AND stamp <> ''
   GROUP BY slot
  HAVING count(DISTINCT stamp) > 1
),

twice_same AS (
  SELECT slot, stamp, count(*) AS n,
         sum(CASE WHEN tarikh <> '' OR cap > 0 OR checked = 1 THEN 1 ELSE 0 END) AS with_data
    FROM figured
   WHERE slot <> ''
   GROUP BY slot, stamp
  HAVING count(*) > 1
),

-- The month a date falls in, spelt the way a stamp is, so the two compare.
dated AS (
  SELECT f.*,
         CASE substr(f.date_ym, 6, 2)
           WHEN '01' THEN 'Jan' WHEN '02' THEN 'Feb' WHEN '03' THEN 'Mar'
           WHEN '04' THEN 'Apr' WHEN '05' THEN 'May' WHEN '06' THEN 'Jun'
           WHEN '07' THEN 'Jul' WHEN '08' THEN 'Aug' WHEN '09' THEN 'Sep'
           WHEN '10' THEN 'Oct' WHEN '11' THEN 'Nov' WHEN '12' THEN 'Dec'
           ELSE '' END || ' ' || left(f.date_ym, 4) AS date_month
    FROM figured f
   WHERE f.date_ym <> ''
)

SELECT * FROM (
  SELECT 1 AS ord, '1 MONTH'::text AS section,
         (CASE WHEN f.stamp = '' THEN 'no month' ELSE f.stamp END)::text AS item,
         count(*)::text AS n,
         (sum(f.checked)::text || ' ticked, '
          || sum(CASE WHEN f.tarikh = '' THEN 1 ELSE 0 END)::text || ' with no date, capacity '
          || to_char(sum(f.cap), 'FM999G999G999'))::text AS detail
    FROM figured f
   GROUP BY f.stamp

  UNION ALL
  SELECT 2, '2 TWO', t.slot::text, t.n::text,
         ('stamped ' || t.which || ' -- one slot, two months')::text
    FROM two_months t

  UNION ALL
  SELECT 3, '3 TWICE', (t.slot || '  ' || t.stamp)::text, t.n::text,
         (t.with_data::text || ' of them carry a date, a figure or a tick')::text
    FROM twice_same t

  UNION ALL
  SELECT 4, '4 NOSTAMP', (f.plot || '  ' || f.jenis)::text, '1',
         (CASE WHEN f.tarikh = '' THEN 'no date' ELSE 'dated ' || f.tarikh END
          || ', capacity ' || to_char(f.cap, 'FM999G999G999'))::text
    FROM figured f
   WHERE f.stamp = ''

  UNION ALL
  SELECT 5, '5 LATE', (d.plot || '  ' || d.jenis)::text, '1',
         ('stamped ' || d.stamp || ' but dated ' || d.tarikh || ' which is '
          || d.date_month || ', capacity ' || to_char(d.cap, 'FM999G999G999')
          || CASE WHEN d.checked = 1 THEN ', ticked' ELSE '' END)::text
    FROM dated d
   WHERE d.stamp <> '' AND d.date_month <> '' AND d.date_month <> d.stamp

  UNION ALL
  SELECT 9, '9 VERDICT', 'slots in two months',
         (SELECT count(*)::text FROM two_months),
         'each one is a row that left its month'
  UNION ALL
  SELECT 9, '9 VERDICT', 'slots twice in one month',
         (SELECT count(*)::text FROM twice_same),
         'each one is a duplicate on screen'
  UNION ALL
  SELECT 9, '9 VERDICT', 'rows with no month',
         (SELECT count(*)::text FROM figured WHERE stamp = ''),
         'these show in no month at all'
) x
ORDER BY ord, item, detail;
