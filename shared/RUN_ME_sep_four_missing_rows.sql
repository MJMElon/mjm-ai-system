-- ════════════════════════════════════════════════════════════════════════
-- THE FOUR ROWS SEPTEMBER WAS SHORT OF
-- shared/RUN_ME_sep_four_missing_rows.sql
--
-- Paste the WHOLE file into the Supabase SQL Editor and press Run.
-- ONE statement. Safe to run twice: the second run changes nothing.
-- No regular expressions, no backslashes, no table created.
--
-- NO APOSTROPHE APPEARS IN ANY COMMENT IN THIS FILE, ON PURPOSE.
-- The first version of it failed with
--     ERROR: 42601: syntax error at end of input   LINE 0:
-- pointing at nothing. psql strips a dash-dash comment before parsing, so it
-- ran here. The SQL Editor counts quotes FIRST, so one apostrophe in a word
-- like Septembers possessive form opened a string literal that never closed,
-- swallowed the rest of the file, and left a statement with no statement in
-- it. An EVEN number happens to survive, which is worse, because it makes
-- the rule look like it does not exist. So: none at all, in any comment.
--
-- THIS FILE NAMES ITS ROWS. It is a one-time repair for four rows found by
-- shared/CHECK_sep_missing_four_rows.sql, not a rule. Do not re-point it at
-- another month.
--
-- WHAT THE CHECK FOUND, AND WHY THEY ARE NOT ALL THE SAME REPAIR
--
-- UNN 2  N2  Merumput -- the Round 1 row of September is SITTING IN OCTOBER.
--   Slot wd|R1|N2, id 1791256452854, carrying the date 2026-10-02 and
--   nothing else: no quantity, no tick. The signed sheet puts that round on
--   04 Sep at 4,962. So it is MOVED, not re-created, which keeps its id and
--   so keeps any tick already hung on it. The date is set at the same time,
--   because the restore pairs rows by day and a row still reading October
--   would sort last and take the wrong line of the sheet.
--   October keeps its own wd|R3|N2 blank, and the next sync rebuilds an
--   October R1 blank by itself.
--
-- BNN B1 Membaja, BNN B3 interrow, UNN 2 N3 P & D -- these are NOWHERE.
--   The five October rows on N3 are the new blanks of October, not the row
--   that September lost: every one of them is undated, unkeyed and
--   unticked. So that row is gone and has to be written from the sheet.
--
-- THE CREATED ROWS CARRY NO SLOT, AND THAT IS DELIBERATE
--
--   const kept = mine.filter(r => not claimed.has(r) and no r._src)
--
-- A row WITH a slot that the schedule of the month does not claim is
-- DELETED by the next sync. A row without one is kept. September already
-- generates every slot it knows about, which is why these three are extra,
-- so giving them a slot would invent one the schedule will not claim and the
-- next person to open September would silently lose them again.
--
-- WHAT IS GUESSED, AND WHAT IS NOT
--
-- The date, the quantity and the plot come from the signed sheet and are not
-- guessed. The CHEMICAL is: B1 and B3 take the wording already on the other
-- rows of that same plot, and the one on N3 is left EMPTY rather than
-- invented. None of it affects a figure, because the job is the jenis and
-- never the chemical, and each row carries a remark saying where it came
-- from.
--
-- AFTER THIS, RUN shared/RUN_ME_restore_sep_2026_from_sheet.sql AGAIN.
-- The counts then agree, so it will stop skipping those four plots and will
-- write their dates, their figures and -- the part this file does not do --
-- their WORKER TICKS.
--
-- WHAT TO LOOK FOR
--   1 MOVED    should be 1 on the first run, 0 after
--   2 ADDED    should be 3 on the first run, 0 after
--   3 COUNT    each pair must read "Sep now has N, sheet N" with N equal
-- ════════════════════════════════════════════════════════════════════════

WITH moved_id(rec_id, to_month, to_date, to_qty) AS (VALUES
  ('1791256452854', 'Sep 2026', '2026-09-04', '4962')
),

-- Fixed ids, far above anything Date.now() will produce for the next two
-- centuries, so re-running cannot make a second copy and a new row keyed on
-- the page can never collide with one of these.
new_rows(j) AS (VALUES
  ('{"id":8000000000001,"_month":"Sep 2026","plot":"B1","jenis":"Membaja",
     "tarikh":"2026-09-06","qty":"","qtyFrozen":"599","checked":"1","batch":"",
     "racun":"Round 1: Organic Matter 180gm",
     "remark":"Restored from the signed sheet of 05 Oct 2026"}'::jsonb),
  ('{"id":8000000000002,"_month":"Sep 2026","plot":"B3","jenis":"Meracun rumput secara selingan",
     "tarikh":"2026-09-24","qty":"","qtyFrozen":"5196","checked":"1","batch":"",
     "racun":"Round 3: Monex 200mL + Activator 15mL",
     "remark":"Restored from the signed sheet of 05 Oct 2026"}'::jsonb),
  ('{"id":8000000000003,"_month":"Sep 2026","plot":"N3","jenis":"Penyemburan racun kulat dan serangga",
     "tarikh":"2026-09-27","qty":"","qtyFrozen":"6685","checked":"1","batch":"",
     "racun":"",
     "remark":"Restored from the signed sheet of 05 Oct 2026"}'::jsonb)
),

want(plot, jenis, on_sheet) AS (VALUES
  ('B1', 'Membaja',                              2),
  ('B3', 'Meracun rumput secara selingan',       3),
  ('N2', 'Merumput',                             2),
  ('N3', 'Penyemburan racun kulat dan serangga', 1)
),

raw AS (
  SELECT e.ord, e.rec
    FROM nops_maint_records m
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.records, '[]'::jsonb))
         WITH ORDINALITY AS e(rec, ord)
   WHERE m.id = 1
),

to_move AS (
  SELECT r.ord, m.to_month, m.to_date, m.to_qty
    FROM raw r JOIN moved_id m ON m.rec_id = btrim(COALESCE(r.rec->>'id', ''))
   WHERE btrim(COALESCE(r.rec->>'_month', '')) <> m.to_month
),

to_add AS (
  SELECT n.j FROM new_rows n
   WHERE NOT EXISTS (
     SELECT 1 FROM raw r
      WHERE btrim(COALESCE(r.rec->>'id', '')) = btrim(n.j->>'id'))
),

rebuilt AS (
  SELECT jsonb_agg(
           CASE WHEN t.ord IS NULL THEN r.rec
                ELSE jsonb_set(jsonb_set(jsonb_set(jsonb_set(
                       r.rec,
                       '{_month}',    to_jsonb(t.to_month)),
                       '{tarikh}',    to_jsonb(t.to_date)),
                       '{qtyFrozen}', to_jsonb(t.to_qty)),
                       '{checked}',   to_jsonb('1'::text))
           END ORDER BY r.ord) AS arr
    FROM raw r LEFT JOIN to_move t ON t.ord = r.ord
),

final AS (
  SELECT COALESCE((SELECT arr FROM rebuilt), '[]'::jsonb)
         || COALESCE((SELECT jsonb_agg(j) FROM to_add), '[]'::jsonb) AS arr
),

wrote AS (
  UPDATE nops_maint_records
     SET records = (SELECT arr FROM final), updated_at = now()
   WHERE id = 1
     AND ((SELECT count(*) FROM to_move) > 0 OR (SELECT count(*) FROM to_add) > 0)
  RETURNING 1
),

-- Counted from the snapshot this statement began with, then corrected by
-- what it is about to do, so section 3 reads as the month WILL be.
after AS (
  SELECT w.plot, w.jenis, w.on_sheet,
         (SELECT count(*) FROM raw r
           WHERE btrim(COALESCE(r.rec->>'plot', ''))   = w.plot
             AND btrim(COALESCE(r.rec->>'jenis', ''))  = w.jenis
             AND btrim(COALESCE(r.rec->>'_month', '')) = 'Sep 2026')
       + (SELECT count(*) FROM to_move t JOIN raw r ON r.ord = t.ord
           WHERE btrim(COALESCE(r.rec->>'plot', ''))  = w.plot
             AND btrim(COALESCE(r.rec->>'jenis', '')) = w.jenis)
       + (SELECT count(*) FROM to_add a
           WHERE btrim(a.j->>'plot')  = w.plot
             AND btrim(a.j->>'jenis') = w.jenis) AS in_sep
    FROM want w
)

SELECT * FROM (
  SELECT 1 AS ord, '1 MOVED'::text AS section,
         'rows brought back from another month'::text AS item,
         (SELECT count(*)::text FROM to_move) AS n,
         'UNN 2 N2 Merumput round 1, put on 04 Sep at 4,962'::text AS detail

  UNION ALL
  SELECT 2, '2 ADDED', 'rows written from the sheet',
         (SELECT count(*)::text FROM to_add),
         'B1 Membaja 599, B3 interrow 5,196, N3 P & D 6,685 -- no slot, so a sync keeps them'

  UNION ALL
  SELECT 3, '3 COUNT', (a.plot || '  ' || a.jenis)::text,
         a.in_sep::text,
         ('Sep now has ' || a.in_sep::text || ', sheet ' || a.on_sheet::text
          || CASE WHEN a.in_sep = a.on_sheet THEN '  -- agrees'
                  ELSE '  -- STILL SHORT' END)::text
    FROM after a

  UNION ALL
  SELECT 9, '9 VERDICT', 'pairs that now agree',
         (SELECT count(*)::text FROM after WHERE in_sep = on_sheet),
         CASE WHEN (SELECT count(*) FROM after WHERE in_sep <> on_sheet) = 0
              THEN 'all four agree -- now run RUN_ME_restore_sep_2026_from_sheet.sql again'
              ELSE 'one or more is still short -- do not run the restore yet' END
) z
ORDER BY ord, item, detail;
