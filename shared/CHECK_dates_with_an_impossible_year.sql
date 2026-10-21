-- EVERY LEDGER LINE WHOSE YEAR CANNOT BE RIGHT
--
-- A date box takes four digits for the year and somebody keys two, so a 3rd
-- Culling comes out dated 0026-02-21 instead of 2026-02-21. It reads as a
-- year two thousand years ago, which means:
--
--   the Month Lock Calendar locks the row, because every month of year 26 is
--   long past its auto-lock date, and the lock disables the very box the
--   wrong year is in
--   the row sorts to the top or the bottom of anything ordered by date
--   any report cut by a month or a year misses it entirely
--
-- The screen no longer locks a row over a year like that, so one found here
-- can be put right on the batch page. This names every one of them, on every
-- batch, rather than the one somebody happened to be looking at.
--
-- TWO PLACES CARRY A DATE and both are checked:
--
--   transaction_date, the column
--   the remark, which carries CullDate and Date for the tabs that keep their
--   own working date beside the figure
--
-- A row can be wrong in one and right in the other, so each is reported on
-- its own line and says which.
--
-- Nothing is changed by running it.
--
-- WHAT A GOOD RESULT LOOKS LIKE
--
-- SUMMARY first: how many lines carry a year outside 2000 to 2100. If it
-- says 0, every date in the ledger is in a year somebody could have meant.
--
-- Then one line per fault: the batch, the plot, which field it is in, what it
-- says, and what it most likely should say. A two-digit year is the only
-- pattern that can be guessed at safely, so a year under 100 is shown with
-- 2000 added; anything else is named and left for somebody to decide.
--
-- The suggestion is NOT applied by anything. Open the batch, correct the date
-- on the tab and save, which is the only route that rewrites the rest of the
-- remark correctly at the same time.

WITH tx AS (
  SELECT id,
         coalesce(batch_name, '-') AS batch,
         transaction_type AS t,
         coalesce(plot_name, '-')  AS plot,
         transaction_date,
         coalesce(remark, '') AS remark
  FROM   shared_inventory_logs
),
-- The dates a row carries, one per line, with the field each came from.
dated AS (
  SELECT id, batch, t, plot, 'transaction_date' AS field,
         to_char(transaction_date, 'YYYY-MM-DD') AS value,
         extract(year FROM transaction_date)::int AS yr
  FROM   tx
  WHERE  transaction_date IS NOT NULL
  UNION ALL
  SELECT id, batch, t, plot, 'CullDate in the remark',
         left(btrim(split_part(remark, 'CullDate:', 2)), 10),
         -- Four characters that are ALL digits, or no year at all. translate
         -- rubs the digits out, so an empty result is what proves it: a cast
         -- that meets a letter aborts the whole query, and this file has to
         -- survive whatever is in the oldest remark in the ledger.
         CASE WHEN translate(left(btrim(split_part(remark, 'CullDate:', 2)), 4),
                             '0123456789', '') = ''
               AND length(left(btrim(split_part(remark, 'CullDate:', 2)), 4)) = 4
                THEN left(btrim(split_part(remark, 'CullDate:', 2)), 4)::int
         END
  FROM   tx
  WHERE  position('CullDate:' in remark) > 0
  UNION ALL
  SELECT id, batch, t, plot, 'Date in the remark',
         left(btrim(split_part(remark, 'Date: ', 2)), 10),
         CASE WHEN translate(left(btrim(split_part(remark, 'Date: ', 2)), 4),
                             '0123456789', '') = ''
               AND length(left(btrim(split_part(remark, 'Date: ', 2)), 4)) = 4
                THEN left(btrim(split_part(remark, 'Date: ', 2)), 4)::int
         END
  FROM   tx
  WHERE  position('Date: ' in remark) > 0
),
bad AS (
  SELECT * FROM dated
  WHERE  yr IS NOT NULL AND (yr < 2000 OR yr > 2100)
)
SELECT 0 AS sort_key,
       'SUMMARY'                                                      AS batch,
       (SELECT count(*) FROM bad)::text || ' dates with a year outside 2000 to 2100' AS a,
       (SELECT count(DISTINCT batch) FROM bad)::text || ' batches'     AS b,
       (SELECT count(*) FROM bad WHERE yr < 100)::text
         || ' of them look like a two digit year'                     AS c,
       'correct each one on its own tab and save -- the suggestion below is applied by nothing'
                                                                      AS note
UNION ALL
SELECT 1,
       batch,
       t || ' on ' || plot,
       field,
       value,
       CASE WHEN yr < 100
              THEN 'probably ' || to_char(yr + 2000, 'FM0000') || substr(value, 5)
            ELSE 'year ' || yr::text || ' -- somebody has to say what was meant'
       END
FROM   bad
ORDER  BY sort_key, batch, a, c;
