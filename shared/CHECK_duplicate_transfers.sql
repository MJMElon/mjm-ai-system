-- =====================================================================
--  A MOVEMENT KEYED TWICE — EVERY BATCH, AND WHICH MECHANISM MADE IT
--  Paste into the Supabase SQL Editor and press Run. Read-only: it
--  changes nothing, so it is safe to run as often as you like.
--
--  THE COMPLAINT
--  Batch 242's U17 shows two identical movements — 21 Aug 2026, U17-R,
--  71 seedlings, twice — and Total Transferred reads 142 for 71 that
--  moved. They were deleted once and came back.
--
--  The app now flags a repeated movement on the line and asks before
--  saving one. What it cannot do is say how the existing ones got there.
--  This can, and the answer is in created_at:
--
--    SAME SECOND      → one save inserted both. The form was holding two
--                       lines: somebody keyed it twice, or a stale tab
--                       was saved over a corrected one.
--
--    DIFFERENT TIMES  → two separate saves, and the earlier row was NOT
--                       cleared when the later one was written. 3rd
--                       Culling replaces its transfers by inserting the
--                       new set and then deleting the old ids; a delete
--                       that is refused leaves both. That is the one that
--                       comes BACK after you remove it, because every
--                       later save adds another copy.
--
--  One batch is the example, never the scope — this asks it of all of
--  them.
-- =====================================================================
WITH

moves AS (
  SELECT l.id,
         l.batch_name,
         l.plot_name                                                  AS went_to,
         COALESCE(SUBSTRING(l.remark FROM 'From:\s*\[([^\]|]+)\|'), '— not recorded —') AS left_from,
         l.quantity_change                                            AS qty,
         COALESCE(l.transaction_date::text,
                  SUBSTRING(l.remark FROM 'Date:\s*(\d{4}-\d{2}-\d{2})'), '') AS moved_on,
         l.created_at
  FROM shared_inventory_logs l
  WHERE l.transaction_type = 'Cull3_Transfer'
),

/* The same movement written more than once: same batch, same plots, same
   quantity, same day. Anything short of all four is two movements. */
grouped AS (
  SELECT batch_name,
         left_from,
         REGEXP_REPLACE(UPPER(TRIM(went_to)), '\s+', ' ', 'g')        AS went_to,
         qty,
         moved_on,
         count(*)                                                     AS copies,
         min(created_at)                                              AS first_written,
         max(created_at)                                              AS last_written,
         count(DISTINCT date_trunc('second', created_at))             AS distinct_seconds,
         STRING_AGG(id::text, ', ' ORDER BY created_at)               AS row_ids
  FROM moves
  GROUP BY 1, 2, 3, 4, 5
  HAVING count(*) > 1
)

/* ONE result set — the SQL Editor only shows the last statement's. The
   summary is the first row; everything under it is a movement to look at. */
SELECT 0                                              AS sort,
       '— ALL BATCHES —'                              AS batch,
       NULL                                           AS movement,
       NULL::bigint                                   AS copies,
       NULL::text                                     AS row_ids,
       NULL::timestamptz                              AS first_written,
       NULL::timestamptz                              AS last_written,
       CASE WHEN (SELECT count(*) FROM grouped) = 0
            THEN 'Nothing to do. No movement on any batch is recorded more than once.'
            ELSE (SELECT count(*) FROM grouped)::text || ' movement(s) written more than once, on '
                 || (SELECT count(DISTINCT batch_name) FROM grouped)::text || ' batch(es): '
                 || (SELECT STRING_AGG(DISTINCT batch_name, ', ') FROM grouped)
                 || '. Read the verdict on each row, then run '
                 || 'shared/RUN_ME_clear_duplicate_transfers.sql to remove the extra copies.'
       END                                            AS verdict
UNION ALL
SELECT 1,
       g.batch_name,
       g.left_from || ' → ' || g.went_to || ', ' || g.qty || ' on ' || COALESCE(NULLIF(g.moved_on, ''), 'no date'),
       g.copies,
       g.row_ids,
       g.first_written,
       g.last_written,
       CASE
         WHEN g.distinct_seconds = 1
           THEN 'ONE SAVE WROTE BOTH. The form was holding two identical lines when it was '
                || 'saved — keyed twice, or a stale tab saved over a corrected one. Deleting '
                || 'the extra copy fixes it and it will not come back on its own.'
         ELSE 'SEPARATE SAVES, ' || ROUND(EXTRACT(EPOCH FROM (g.last_written - g.first_written)) / 3600)::text
                || 'h apart — and the earlier copy was not cleared when the later one was '
                || 'written. THIS is the one that comes back after you delete it: every save '
                || 'adds another copy because the delete is not taking. Send this row back.'
       END                                            AS verdict
FROM grouped g
ORDER BY sort, batch, movement;

-- WHAT A GOOD RESULT LOOKS LIKE
--   The first row is the summary. "Nothing to do" with no rows under it
--   means no movement anywhere is recorded twice.
--
--   ONE SAVE WROTE BOTH is the ordinary case: somebody keyed it twice.
--   Clearing the extra copy is the end of it, and the app now asks before
--   saving a repeat.
--
--   SEPARATE SAVES is the one worth sending back. It means a delete is
--   being refused, so the report doubles a little more every time it is
--   saved — clearing the copies helps for a day and then they return.
--   The app now refuses to call such a save successful, so it will say so
--   on screen from the next deploy; the figure here says how long it has
--   been happening.
--
--   row_ids are the actual rows, oldest first, so the repair can keep the
--   first and drop the rest.
