-- ════════════════════════════════════════════════════════════════════════
-- IS THE QUANTITY LINK ON A WORK RECORD READING THE RIGHT THING?
-- shared/CHECK_maint_qty_link.sql
--
-- Read-only. Nothing is created, changed or deleted.
--
-- Set the plot and the month on the two lines marked below, or leave the
-- plot as '' to sweep every plot, then run the whole file.
--
-- A linked quantity is the plot's balance AS AT the work date, narrowed to
-- the batches KEYED on the row. Both halves move it:
--
--   * the DATE — a plot filled on the 23rd is nearly empty on the 5th, so
--     two rows a fortnight apart on one plot are meant to differ
--   * the BATCHES — an empty batch cell means every batch standing that day,
--     while a keyed list means those and no others, so a row carrying five
--     batch numbers where the plot held seven is reading five sevenths of
--     the plot
--
-- The second is the one that looks like a fault and is not. A row reading
-- 599 beside one reading 2,353 on the same plot is usually a batch list
-- somebody narrowed by hand, not a broken link.
--
-- The listing names, per row: the batches keyed on it, the batches the
-- ledger shows in that plot by that date, and whether the row is narrower
-- than the plot. "narrowed" is not wrong by itself — it is only wrong if
-- nobody meant it. A row with no batch keyed reads the whole plot and is
-- marked "whole plot".
-- ════════════════════════════════════════════════════════════════════════

WITH params AS (
  SELECT 'B1'::text      AS look_plot,     -- the plot, or '' for every plot
         '2026-09'::text AS for_month      -- the month the rows are dated in
),

-- The work records live as one JSONB array on nops_maint_records.
rows_raw AS (
  SELECT e.rec
    FROM nops_maint_records m
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.records, '[]'::jsonb)) AS e(rec)
   WHERE m.id = 1
),

recs AS (
  SELECT COALESCE(rec->>'plot', '')   AS plot,
         COALESCE(rec->>'jenis', '')  AS jenis,
         COALESCE(rec->>'tarikh', '') AS tarikh,
         COALESCE(rec->>'batch', '')  AS batch_keyed,
         rec->>'qty'                  AS qty_keyed,
         rec->>'qtyFrozen'            AS qty_frozen,
         CASE WHEN COALESCE(rec->>'checked', '0') IN ('1', 'true') THEN 'checked'
              ELSE 'not checked' END  AS checked,
         CASE WHEN length(COALESCE(rec->>'tarikh', '')) >= 10
              THEN left(rec->>'tarikh', 10) ELSE NULL END AS iso
    FROM rows_raw
),

mine AS (
  SELECT r.*
    FROM recs r, params p
   WHERE r.iso IS NOT NULL
     AND left(r.iso, 7) = p.for_month
     AND (p.look_plot = '' OR upper(btrim(r.plot)) = upper(btrim(p.look_plot)))
),

-- How many batch numbers the row carries. Commas only, which is what the
-- screen writes.
keyed AS (
  SELECT m.*,
         CASE WHEN btrim(m.batch_keyed) = '' THEN 0
              ELSE length(m.batch_keyed) - length(replace(m.batch_keyed, ',', '')) + 1
         END AS keyed_n
    FROM mine m
),

-- Which batches the ledger has touched in that plot by that date.
held AS (
  SELECT upper(btrim(l.plot_name)) AS plot_u,
         left(COALESCE(l.transaction_date, l.created_at::date)::text, 10) AS whn,
         btrim(l.batch_name) AS batch_name
    FROM shared_inventory_logs l
   WHERE l.batch_name IS NOT NULL AND btrim(l.batch_name) <> ''
     AND l.plot_name IS NOT NULL
),

plot_batches AS (
  SELECT k.plot, k.iso, count(DISTINCT h.batch_name) AS held_n,
         string_agg(DISTINCT h.batch_name, ', ' ORDER BY h.batch_name) AS held_list
    FROM keyed k
    LEFT JOIN held h
      ON h.plot_u = upper(btrim(k.plot)) AND h.whn <= k.iso
   GROUP BY k.plot, k.iso
)

SELECT * FROM (
  SELECT 1 AS ord,
         k.iso::text AS whn,
         (k.plot || '  ' || k.jenis)::text AS what,
         (CASE WHEN k.keyed_n = 0 THEN 'whole plot'
               ELSE k.keyed_n::text || ' batch: ' || k.batch_keyed END)::text AS keyed_on,
         (COALESCE(pb.held_n, 0)::text || ' in the plot by then')::text AS plot_held,
         (CASE
            WHEN k.qty_keyed IS NOT NULL AND k.qty_keyed <> ''
              THEN 'keyed by hand: ' || k.qty_keyed || ' — the link is not used'
            WHEN k.qty_frozen IS NOT NULL AND k.qty_frozen <> ''
              THEN 'held at ' || k.qty_frozen || ' (' || k.checked || ')'
            WHEN k.keyed_n = 0 THEN 'live, whole plot'
            WHEN k.keyed_n < COALESCE(pb.held_n, 0)
              THEN 'NARROWED — reads ' || k.keyed_n::text || ' of '
                   || COALESCE(pb.held_n, 0)::text || ' batches'
            ELSE 'live, every batch the plot held'
          END)::text AS verdict
    FROM keyed k
    LEFT JOIN plot_batches pb ON pb.plot = k.plot AND pb.iso = k.iso

  UNION ALL
  SELECT 9, '-', 'VERDICT',
         (SELECT count(*)::text FROM keyed) || ' row(s) in this month',
         (SELECT count(*)::text FROM keyed k
            LEFT JOIN plot_batches pb ON pb.plot = k.plot AND pb.iso = k.iso
           WHERE COALESCE(k.qty_keyed, '') = '' AND COALESCE(k.qty_frozen, '') = ''
             AND k.keyed_n > 0 AND k.keyed_n < COALESCE(pb.held_n, 0)) || ' reading fewer batches than the plot held',
         'a narrowed row is only wrong if nobody meant to narrow it'
) x
ORDER BY ord, whn, what;
