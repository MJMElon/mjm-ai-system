-- ════════════════════════════════════════════════════════════════════════
-- WHAT IS STILL IN THE WORK RECORD FOR ONE NURSERY AND MONTH
-- shared/CHECK_bnn_sep_what_survived.sql
--
-- Read-only. Nothing is created, changed or deleted.
--
-- Set the nursery and the month on the two lines marked below, then run the
-- whole file.
--
-- WHY THIS EXISTS
--
-- Work records live as one JSONB list, and each row carries the month it
-- belongs to. The stamping used to take a NURSERY's majority month and put
-- every row under it, dated rows included — so a month's rows could end up
-- stamped under another month. A sync of the real month then matched nothing,
-- and built FRESH BLANK ROWS beside them: no date, no keyed quantity, no
-- Checked.
--
-- The originals were not deleted. They are in the list under the other
-- month's stamp, with their dates, their hand-keyed quantities and their
-- Checked still on them. That is what this finds.
--
-- WHAT THE RESULT MEANS
--
--   carries data   the original — a date, or a keyed quantity, or Checked
--   BLANK          a row with none of those: what a sync built
--   stamp wrong    its date says this month, its stamp says another one
--
-- A plot and job showing one of each is the pair: keep the one carrying
-- data, the blank is the duplicate. The last line counts them.
--
-- Nothing is repaired here. Send the result back and the repair is written
-- against what is actually there rather than against a guess.
-- ════════════════════════════════════════════════════════════════════════

WITH params AS (
  SELECT 'BNN'::text      AS nursery,      -- the nursery, as shared_plots spells it
         '2026-09'::text  AS ym,           -- the month the work was done in
         'Sep 2026'::text AS month_label   -- the same month as the rows stamp it
),

-- Each row of the list, with its position, so a repair can name it later.
raw AS (
  SELECT e.ord, e.rec
    FROM nops_maint_records m
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.records, '[]'::jsonb))
         WITH ORDINALITY AS e(rec, ord)
   WHERE m.id = 1
),

-- Which plots belong to the nursery. Matched on letters and digits, because
-- the two sides spell a nursery differently.
plots AS (
  SELECT upper(replace(replace(replace(btrim(p.plot_name), ' ', ''), '-', ''), '_', '')) AS pk,
         btrim(p.plot_name) AS plot_name
    FROM shared_plots p, params pa
   WHERE upper(replace(replace(replace(COALESCE(p.nursery_name, ''), ' ', ''), '-', ''), '_', ''))
       = upper(replace(replace(replace(pa.nursery, ' ', ''), '-', ''), '_', ''))
),

rows_r AS (
  SELECT r.ord,
         btrim(COALESCE(r.rec->>'plot', ''))   AS plot,
         btrim(COALESCE(r.rec->>'jenis', ''))  AS jenis,
         btrim(COALESCE(r.rec->>'tarikh', '')) AS tarikh,
         btrim(COALESCE(r.rec->>'qty', ''))        AS qty_keyed,
         btrim(COALESCE(r.rec->>'qtyFrozen', ''))  AS qty_frozen,
         btrim(COALESCE(r.rec->>'_month', ''))     AS stamp,
         CASE WHEN COALESCE(r.rec->>'checked', '0') IN ('1', 'true') THEN 1 ELSE 0 END AS checked
    FROM raw r
),

mine AS (
  SELECT x.*,
         CASE WHEN length(x.tarikh) >= 10 THEN left(x.tarikh, 10) ELSE '' END AS iso
    FROM rows_r x
    JOIN plots pl
      ON pl.pk = upper(replace(replace(replace(x.plot, ' ', ''), '-', ''), '_', ''))
),

-- Everything that belongs to this month by its DATE, plus everything the
-- stamp currently puts here. Either one is in play.
scope AS (
  SELECT m.*,
         (m.iso <> '' AND left(m.iso, 7) = (SELECT ym FROM params)) AS dates_here,
         (m.stamp = (SELECT month_label FROM params))               AS stamped_here,
         (m.tarikh <> '' OR m.qty_keyed <> '' OR m.qty_frozen <> '' OR m.checked = 1) AS has_data
    FROM mine m
),

here AS (SELECT * FROM scope WHERE dates_here OR stamped_here),

pairs AS (
  SELECT plot, jenis,
         count(*) FILTER (WHERE has_data)     AS n_data,
         count(*) FILTER (WHERE NOT has_data) AS n_blank
    FROM here GROUP BY plot, jenis
)

SELECT * FROM (
  SELECT 1 AS ord, h.ord::text AS row_no,
         (h.plot || '  ' || h.jenis)::text AS what,
         (CASE WHEN h.tarikh = '' THEN 'no date' ELSE h.tarikh END)::text AS dated,
         (CASE WHEN h.qty_keyed <> ''  THEN 'keyed ' || h.qty_keyed
               WHEN h.qty_frozen <> '' THEN 'held ' || h.qty_frozen
               ELSE 'live' END
          || CASE WHEN h.checked = 1 THEN ' · CHECKED' ELSE '' END)::text AS figure,
         (CASE WHEN NOT h.has_data THEN 'BLANK — a sync built this'
               WHEN NOT h.stamped_here THEN 'carries data · stamp wrong (' || h.stamp || ')'
               ELSE 'carries data' END)::text AS verdict
    FROM here h

  UNION ALL
  SELECT 9, '-', 'VERDICT',
         (SELECT count(*)::text FROM here WHERE has_data) || ' carry data',
         (SELECT count(*)::text FROM here WHERE NOT has_data) || ' blank',
         ((SELECT count(*)::text FROM pairs WHERE n_data > 0 AND n_blank > 0)
          || ' plot+job pairs have both, so the blank is a duplicate to drop')::text
) x
ORDER BY ord, what, dated, row_no;
