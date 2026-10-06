-- ════════════════════════════════════════════════════════════════════════
-- ROWS DRAGGED OUT OF THEIR MONTH, AND THE BLANKS LEFT IN THEIR PLACE
-- shared/CHECK_rows_dragged_out_of_month.sql
--
-- Read-only. Nothing is created, changed or deleted.
--
-- Set the two months on the lines marked below, then run the whole file.
-- EVERY NURSERY IS SWEPT AT ONCE -- there is no nursery to set.
--
-- WHAT WENT WRONG
--
-- A build of stampRecordMonths() put every dated row under the month of its
-- own date. A job done late -- a September schedule row worked on the 2nd of
-- October -- was therefore stamped October and left September. The next sync
-- found that slot missing and built a fresh row for it: no date, no keyed
-- quantity, not checked, and a live quantity that moves with the ledger.
--
-- So September lost a row and gained a blank, and its total capacity fell by
-- the difference. The claim verified before that still holds the right
-- figure, which is why the two now disagree.
--
--
-- A BLANK DATE IS '-', NOT AN EMPTY STRING
--
-- The sync writes a generated row with tarikh:'-' and the page tests
-- (!r.tarikh || r.tarikh === '-'). The first version of this file asked for
-- tarikh = '' and so matched NO blank row anywhere: it reported 0 pairs on a
-- nursery full of them. That is the same class of mistake as the shared_plots
-- join below -- a test that measures nothing reads exactly like good news.
--
-- THE FINGERPRINT
--
-- One schedule slot in two places at once: a DATED row in the later month,
-- and an UNDATED blank of the same slot in the earlier one. A genuine row of
-- the later month has no such twin, which is what makes this safe to act on.
--
-- WHY THERE IS NO NURSERY HERE ANY MORE
--
-- The first version of this file resolved each row's nursery by joining
-- shared_plots. That table is Seedling Stock and does NOT hold UNN 2's
-- N1-N20: the plot list those pages really use is the hardcoded BASE in
-- shared/shared_maint_plots.js, merged with nops_maint_custom_plots AND
-- shared_plots. So for UNN 2 the join matched nothing and the file answered
-- 0 about an empty set, which reads exactly like good news.
--
-- A slot already carries its plot inside it -- "pd|W4|P|N19" -- so the join
-- bought nothing and cost a nursery. It is gone, and with it the chance that
-- a nursery spelt one way in one table hides a row.
--
-- WHAT TO LOOK FOR
--
-- Each line is one slot and names both halves. "dragged out" is the row to
-- put back, and "blank left behind" is the row to remove. The last line
-- counts the pairs. VERDICT 0 now means there is genuinely nothing of this
-- shape anywhere, not that a join came up empty.
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

-- The row that left: dated, stamped the later month.
dragged AS (
  SELECT m.* FROM mine m, params p
   WHERE m.stamp = p.got_month AND m.tarikh <> '' AND m.tarikh <> '-'
),

-- The blank the sync built: same slot, earlier month, no date and nothing on it.
blanks AS (
  SELECT m.* FROM mine m, params p
   WHERE m.stamp = p.lost_month
     AND (m.tarikh = '' OR m.tarikh = '-')
     AND m.qty_keyed = '' AND m.qty_frozen = '' AND m.checked = 0
),

pairs AS (
  SELECT d.ord AS drag_ord, d.plot, d.jenis, d.tarikh, d.slot,
         (d.qty_keyed <> '' OR d.qty_frozen <> '' OR d.checked = 1) AS drag_has_data,
         b.ord AS blank_ord
    FROM dragged d
    JOIN blanks b ON b.slot = d.slot AND b.plot = d.plot AND b.jenis = d.jenis
)

SELECT * FROM (
  SELECT 1 AS ord,
         (p.plot || '  ' || p.jenis)::text AS what,
         ('row ' || p.drag_ord::text || '  dated ' || p.tarikh)::text AS dragged_out,
         ('row ' || p.blank_ord::text || '  no date')::text AS blank_left_behind,
         (CASE WHEN p.drag_has_data THEN 'the dragged row carries a figure or a tick'
               ELSE 'the dragged row carries only its date' END)::text AS note
    FROM pairs p

  UNION ALL
  SELECT 9, 'VERDICT',
         (SELECT count(*)::text FROM pairs) || ' slot(s) in two months at once',
         (SELECT count(*)::text FROM pairs WHERE drag_has_data) || ' carrying a figure or a tick',
         'each pair is one row to put back and one blank to remove'
) x
ORDER BY ord, what, dragged_out;
