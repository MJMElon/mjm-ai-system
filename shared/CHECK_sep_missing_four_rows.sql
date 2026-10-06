-- ════════════════════════════════════════════════════════════════════════
-- THE FOUR ROWS SEPTEMBER IS SHORT OF: WHERE ARE THEY?
-- shared/CHECK_sep_missing_four_rows.sql
--
-- Read-only. Nothing is created, changed or deleted. Run the whole file.
--
-- WHY
--
-- RUN_ME_restore_sep_2026_from_sheet.sql put 290 rows back but left four
-- plots alone, because the signed sheet has more rows for them than the
-- month does and there the Nth of one list is not the Nth of the other:
--
--   BNN  B1  Membaja                             sheet 2, month 1
--   BNN  B3  Meracun rumput secara selingan      sheet 3, month 2
--   UNN2 N2  Merumput                            sheet 2, month 1
--   UNN2 N3  Penyemburan racun kulat dan serangga sheet 1, month 0
--
-- A missing row is one of two things, and they need opposite repairs:
--   it is stamped ANOTHER MONTH -- then it is put back, nothing is created
--   it is nowhere at all        -- then it has to be written from the sheet
--
-- So this looks at EVERY row of those four plot-and-job pairs in the whole
-- store, whatever month it carries, and shows what each one holds.
--
-- WHAT TO LOOK FOR
--
-- Section 1 is one line per row found. Read the month column: a row stamped
-- anything but Sep 2026 is the missing one and can simply be put back.
--
-- "generated" in the last column means the row carries a schedule slot
-- (_src). A row with no slot was ADDED BY HAND, which matters: the sync
-- rebuilds a missing generated row by itself but never re-creates a
-- hand-added one. BNN B1s two manuring entries are 599 and 1,754, which
-- add to 2,353 -- B1s whole capacity split in two -- so one of that pair
-- is almost certainly hand-added.
--
-- Section 2 counts what each pair has in Sep 2026 against what the sheet
-- expects, so the shortfall is in front of you.
-- ════════════════════════════════════════════════════════════════════════

WITH want(nursery, plot, jenis, on_sheet) AS (VALUES
  ('BNN',  'B1', 'Membaja',                              2),
  ('BNN',  'B3', 'Meracun rumput secara selingan',       3),
  ('UNN2', 'N2', 'Merumput',                             2),
  ('UNN2', 'N3', 'Penyemburan racun kulat dan serangga', 1)
),

raw AS (
  SELECT e.ord, e.rec
    FROM nops_maint_records m
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.records, '[]'::jsonb))
         WITH ORDINALITY AS e(rec, ord)
   WHERE m.id = 1
),

hit AS (
  SELECT r.ord,
         w.nursery, w.plot, w.jenis, w.on_sheet,
         btrim(COALESCE(r.rec->>'_month', ''))    AS stamp,
         btrim(COALESCE(r.rec->>'tarikh', ''))    AS tarikh,
         btrim(COALESCE(r.rec->>'qty', ''))       AS qty_keyed,
         btrim(COALESCE(r.rec->>'qtyFrozen', '')) AS qty_frozen,
         btrim(COALESCE(r.rec->>'_src', ''))      AS slot,
         btrim(COALESCE(r.rec->>'id', ''))        AS rec_id,
         btrim(COALESCE(r.rec->>'batch', ''))     AS batch,
         btrim(COALESCE(r.rec->>'racun', ''))     AS racun,
         CASE WHEN COALESCE(r.rec->>'checked', '0') IN ('1', 'true') THEN 1 ELSE 0 END AS checked
    FROM raw r
    JOIN want w
      ON btrim(COALESCE(r.rec->>'plot', ''))  = w.plot
     AND btrim(COALESCE(r.rec->>'jenis', '')) = w.jenis
)

SELECT * FROM (
  SELECT 1 AS ord,
         (h.nursery || '  ' || h.plot || '  ' || h.jenis)::text AS pair,
         (CASE WHEN h.stamp = '' THEN 'NO MONTH' ELSE h.stamp END)::text AS month,
         (CASE WHEN h.tarikh = '' OR h.tarikh = '-' THEN 'no date'
               ELSE h.tarikh END
          || '   qty '
          || CASE WHEN h.qty_keyed <> '' THEN h.qty_keyed || ' keyed'
                  WHEN h.qty_frozen <> '' THEN h.qty_frozen || ' frozen'
                  ELSE 'none' END
          || CASE WHEN h.checked = 1 THEN '   ticked' ELSE '   not ticked' END)::text AS holds,
         (CASE WHEN h.slot <> '' THEN 'generated  ' || h.slot
               ELSE 'ADDED BY HAND (no slot)' END
          || CASE WHEN h.racun <> '' THEN '   ' || h.racun ELSE '' END
          || '   id ' || h.rec_id)::text AS note
    FROM hit h

  UNION ALL
  SELECT 2,
         (w.nursery || '  ' || w.plot || '  ' || w.jenis)::text,
         'COUNT',
         ('sheet ' || w.on_sheet::text || ', Sep 2026 has '
          || (SELECT count(*)::text FROM hit h
               WHERE h.plot = w.plot AND h.jenis = w.jenis AND h.stamp = 'Sep 2026'))::text,
         ('short by ' || (w.on_sheet
              - (SELECT count(*) FROM hit h
                  WHERE h.plot = w.plot AND h.jenis = w.jenis AND h.stamp = 'Sep 2026'))::text
          || ', and ' || (SELECT count(*)::text FROM hit h
                           WHERE h.plot = w.plot AND h.jenis = w.jenis AND h.stamp <> 'Sep 2026')
          || ' row(s) of this pair sit in another month')::text
    FROM want w
) x
ORDER BY ord, pair, month, holds;
