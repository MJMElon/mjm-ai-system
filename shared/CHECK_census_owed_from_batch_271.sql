-- ═══════════════════════════════════════════════════════════════
-- HOW MANY CENSUS SHEETS WOULD BE OWED, IF THE RULE STARTS AT 271
--
-- The office asked for a census on every transplanting record, keyed by
-- the person who records the work, and for the rule to run FROM BATCH 271.
--
-- Every transplanting record that already exists has no census. So the
-- rule has a cost that nothing on any screen says: each record from 271
-- onward would need somebody to go and find the sheet it was keyed off
-- and attach it. This counts them, before the rule is written.
--
-- A CARD is one plot on one day — that is the unit the new screen groups
-- by, and it is one census. Several trays into the same plot on the same
-- day are ONE card and ONE sheet, which is why the card count is the
-- number that matters and the row count is not.
--
-- Nothing is changed. Read only.
--
-- WHAT A GOOD RESULT LOOKS LIKE
--
-- Row 0 is the size of it: how many cards would be owed a census, how
-- many ledger rows sit behind them, and across how many batches. That
-- card number is the number of sheets somebody has to go and find.
--
-- Under it, ONE ROW PER BATCH, newest first: its cards, its rows, its
-- plots, and the first and last day it transplanted. A batch with a lot
-- of cards is where the work is.
--
-- The last column of row 0 counts transplanting rows whose batch name is
-- not a plain number — those cannot be placed on either side of the 271
-- line, so they are counted rather than silently dropped. A nought there
-- means every record could be placed.
-- ═══════════════════════════════════════════════════════════════

WITH tx AS (
  SELECT l.batch_name,
         l.plot_name,
         -- The day is keyed into the remark by the save. A row without one
         -- falls back to the day the row was inserted, the same order the
         -- page reads them in.
         CASE
           WHEN position('Date:' in coalesce(l.remark, '')) > 0
             THEN left(trim(substr(l.remark, position('Date:' in l.remark) + 5, 12)), 10)
           ELSE left(l.created_at::text, 10)
         END AS day
    FROM public.shared_inventory_logs l
   WHERE l.transaction_type IN ('Transplanted', 'Transplanted_Premium', 'Transplanted_DoubleTone')
),
-- A batch name made only of digits can be placed against 271. Anything
-- else cannot, and is counted on its own rather than guessed at.
numbered AS (
  SELECT t.*,
         CASE
           WHEN trim(coalesce(t.batch_name, '')) <> ''
            AND translate(trim(t.batch_name), '0123456789', '') = ''
             THEN trim(t.batch_name)::bigint
           ELSE NULL
         END AS batch_no
    FROM tx t
),
owed AS (
  SELECT * FROM numbered WHERE batch_no IS NOT NULL AND batch_no >= 271
),
per_batch AS (
  SELECT o.batch_no,
         count(DISTINCT o.plot_name || '|' || o.day) AS cards,
         count(*)                                   AS rows_behind,
         count(DISTINCT o.plot_name)                AS plots,
         min(o.day)                                 AS first_day,
         max(o.day)                                 AS last_day
    FROM owed o
   GROUP BY o.batch_no
)
SELECT 0 AS n,
       'SUMMARY' AS batch,
       (SELECT coalesce(sum(cards), 0) FROM per_batch)::text        AS cards,
       (SELECT coalesce(sum(rows_behind), 0) FROM per_batch)::text  AS rows_behind,
       (SELECT count(*) FROM per_batch)::text                       AS plots,
       'census sheets owed'                                         AS first_day,
       'rows, batches'                                              AS last_day,
       (SELECT count(*) FROM numbered WHERE batch_no IS NULL)::text AS batch_name_not_a_number
UNION ALL
SELECT 1,
       b.batch_no::text,
       b.cards::text,
       b.rows_behind::text,
       b.plots::text,
       b.first_day,
       b.last_day,
       ''
  FROM per_batch b
 ORDER BY n, batch DESC;
