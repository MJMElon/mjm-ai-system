-- ════════════════════════════════════════════════════════════════════════
-- THE ROWS WITH NO DATE, AND WHAT THE FIELD RECORDED FOR THEM
-- shared/CHECK_undated_rows_vs_field.sql
--
-- Read-only. Nothing is created, changed or deleted.
--
-- Set the nursery and the month on the two lines marked below, then run the
-- whole file.
--
-- A work-record row with no date was never dated by the office. The one place
-- a date for it can honestly come from is the field: a Field Conductor who
-- recorded that job on that plot wrote down the day he did it, and
-- nops_maint_field_records keeps it.
--
-- So this pairs every undated row against the VERIFIED field records for the
-- same plot and job in the same month, and says what the field has:
--
--   one record       an unambiguous date, safe to fill in
--   more than one    the plot was worked more than once that month, so which
--                    row takes which date is the office's to say
--   nothing          nobody recorded it. No date exists to recover, and only
--                    the office or the paper knows what it should be
--
-- Nothing is filled here. The answer decides whether a fill can be written at
-- all, and for which rows.
-- ════════════════════════════════════════════════════════════════════════

WITH params AS (
  SELECT 'BNN'::text     AS nursery,   -- the nursery, as shared_plots spells it
         '2026-09'::text AS ym         -- the month the work was done in
),

raw AS (
  SELECT e.ord, e.rec
    FROM nops_maint_records m
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.records, '[]'::jsonb))
         WITH ORDINALITY AS e(rec, ord)
   WHERE m.id = 1
),

plots AS (
  SELECT upper(replace(replace(replace(btrim(p.plot_name), ' ', ''), '-', ''), '_', '')) AS pk
    FROM shared_plots p, params pa
   WHERE upper(replace(replace(replace(COALESCE(p.nursery_name, ''), ' ', ''), '-', ''), '_', ''))
       = upper(replace(replace(replace(pa.nursery, ' ', ''), '-', ''), '_', ''))
),

-- Undated rows of this nursery, in the month they are stamped under.
undated AS (
  SELECT r.ord,
         btrim(COALESCE(r.rec->>'plot', ''))  AS plot,
         btrim(COALESCE(r.rec->>'jenis', '')) AS jenis
    FROM raw r
    JOIN plots pl
      ON pl.pk = upper(replace(replace(replace(btrim(COALESCE(r.rec->>'plot', '')), ' ', ''), '-', ''), '_', ''))
   WHERE btrim(COALESCE(r.rec->>'tarikh', '')) = ''
),

-- What the field recorded, verified only: an unchecked field record is not
-- an answer the office has accepted.
field AS (
  SELECT btrim(f.plot_name) AS plot,
         btrim(COALESCE(f.jenis, '')) AS jenis,
         f.work_date,
         f.qty,
         COALESCE(f.worked_by, '-') AS worked_by
    FROM nops_maint_field_records f, params pa
   WHERE f.verified_at IS NOT NULL
     AND f.work_date IS NOT NULL
     AND to_char(f.work_date, 'YYYY-MM') = pa.ym
),

paired AS (
  SELECT u.ord, u.plot, u.jenis,
         count(fl.work_date) AS n,
         min(fl.work_date)   AS first_day,
         string_agg(DISTINCT to_char(fl.work_date, 'YYYY-MM-DD'), ', '
                    ORDER BY to_char(fl.work_date, 'YYYY-MM-DD')) AS days
    FROM undated u
    LEFT JOIN field fl
      ON upper(replace(replace(replace(fl.plot, ' ', ''), '-', ''), '_', ''))
       = upper(replace(replace(replace(u.plot, ' ', ''), '-', ''), '_', ''))
     AND lower(fl.jenis) = lower(u.jenis)
   GROUP BY u.ord, u.plot, u.jenis
)

SELECT * FROM (
  SELECT 1 AS ord, p.ord::text AS row_no,
         (p.plot || '  ' || p.jenis)::text AS what,
         (CASE WHEN p.n = 0 THEN 'nothing' ELSE p.days END)::text AS field_says,
         (CASE
            WHEN p.n = 0 THEN 'NOTHING RECORDED — no date exists to recover'
            WHEN p.n = 1 THEN 'one record, so this date is unambiguous'
            ELSE p.n::text || ' records — the office decides which row takes which'
          END)::text AS verdict
    FROM paired p

  UNION ALL
  SELECT 9, '-', 'VERDICT',
         (SELECT count(*)::text FROM paired) || ' undated row(s)',
         ((SELECT count(*)::text FROM paired WHERE n = 1) || ' fillable from the field, '
          || (SELECT count(*)::text FROM paired WHERE n = 0) || ' with nothing behind them')::text
) x
ORDER BY ord, what, row_no;
