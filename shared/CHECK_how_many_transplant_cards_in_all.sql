-- ═══════════════════════════════════════════════════════════════
-- HOW MANY TRANSPLANTING CARDS THERE ARE, ON EVERY BATCH EVER
--
-- The census rule starts at batch 271, which owes exactly one sheet.
-- The office asked what it would cost to ask it of EVERY batch instead,
-- so this is the whole ledger counted the same way.
--
-- A CARD is one plot on one day, which is the unit the new screen groups
-- by and is ONE census. Several trays into the same plot on the same day
-- are one card and one sheet.
--
-- READ THE TOTAL AS A CEILING, NOT A BILL. The rule only refuses a SAVE,
-- so a record nobody ever reopens never meets it. What the total really
-- counts is how many cards would carry a NO CENSUS mark on screen, and
-- how many would be stuck the day somebody goes to correct one.
--
-- Nothing is changed. Read only.
--
-- WHAT A GOOD RESULT LOOKS LIKE
--
-- Row 0 is the whole ledger: every card, every row behind them, every
-- batch. That is the ceiling.
--
-- Row 1 is what the batch 271 line asks for, for comparison.
--
-- Under them, ONE ROW PER MONTH, newest first, so the shape is visible:
-- a run of months with a handful of cards each is a different decision
-- from one month carrying hundreds. The oldest months are the ones whose
-- paper is least likely to still exist.
-- ═══════════════════════════════════════════════════════════════

WITH tx AS (
  SELECT l.batch_name,
         l.plot_name,
         CASE
           WHEN position('Date:' in coalesce(l.remark, '')) > 0
             THEN left(trim(substr(l.remark, position('Date:' in l.remark) + 5, 12)), 10)
           ELSE left(l.created_at::text, 10)
         END AS day
    FROM public.shared_inventory_logs l
   WHERE l.transaction_type IN ('Transplanted', 'Transplanted_Premium', 'Transplanted_DoubleTone')
),
cards AS (
  SELECT t.batch_name,
         t.plot_name || '|' || t.day AS card,
         CASE WHEN length(coalesce(t.day, '')) = 10 THEN left(t.day, 7) ELSE 'no date' END AS month,
         CASE
           WHEN trim(coalesce(t.batch_name, '')) <> ''
            AND translate(trim(t.batch_name), '0123456789', '') = ''
             THEN trim(t.batch_name)::bigint
           ELSE NULL
         END AS batch_no
    FROM tx t
)
SELECT 0 AS n,
       'EVERY BATCH -- the ceiling' AS month,
       (SELECT count(DISTINCT card) FROM cards)::text       AS cards,
       (SELECT count(*) FROM cards)::text                   AS rows_behind,
       (SELECT count(DISTINCT batch_name) FROM cards)::text AS batches
UNION ALL
SELECT 1,
       'BATCH 271 ONWARD -- what was agreed',
       (SELECT count(DISTINCT card) FROM cards WHERE batch_no IS NOT NULL AND batch_no >= 271)::text,
       (SELECT count(*) FROM cards WHERE batch_no IS NOT NULL AND batch_no >= 271)::text,
       (SELECT count(DISTINCT batch_name) FROM cards WHERE batch_no IS NOT NULL AND batch_no >= 271)::text
UNION ALL
SELECT 9,
       c.month,
       count(DISTINCT c.card)::text,
       count(*)::text,
       count(DISTINCT c.batch_name)::text
  FROM cards c
 GROUP BY c.month
 ORDER BY n, month DESC;
