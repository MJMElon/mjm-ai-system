-- ═══════════════════════════════════════════════════════════════
-- WHICH TRANSPLANTING CARDS CARRY A SIGNATURE, AND IN WHICH SHAPE
--
-- Tab 3 used to be one row per TRAY, and a row sign-off was keyed on the
-- tray that filled the plot:
--
--     transplanting::N15|main|P24|2026-10-17
--
-- It is one card per plot per day now, and a card is keyed
--
--     transplanting::N15|2026-10-17
--
-- The page reads an OLD key under its card as well, so a row somebody
-- signed before the cards existed still reads signed. This is the list to
-- check that against: open the batch at the top, go to Transplanting, and
-- the card for that plot and that day should still carry its green
-- Verified chip. If one of them does not, say so.
--
-- Nothing is changed. Read only.
--
-- WHAT A GOOD RESULT LOOKS LIKE
--
-- Row 0 counts them: how many cards are signed, how many of those were
-- keyed on the tray (the ones this rule is about) and how many were keyed
-- on the card. A nought in the middle column means nothing was ever signed
-- under the old shape and there is nothing to check.
--
-- Under it, ONE ROW PER SIGNATURE, newest first: the batch to open, the
-- plot and day to look at, which shape the key is in, and who signed it.
-- A batch whose whole Transplanting tab was signed in one go does not
-- appear here at all -- that signature is on the stage, not on a row, and
-- the cards never read it row by row.
-- ═══════════════════════════════════════════════════════════════

WITH sigs AS (
  SELECT l.id,
         l.batch_name,
         l.plot_name AS stored_key,
         substr(l.plot_name, 16) AS rest,
         coalesce(l.last_edited_by, '')  AS signed_by,
         coalesce(l.last_edited_at, l.created_at) AS signed_at
    FROM public.shared_inventory_logs l
   WHERE l.transaction_type = 'Row_Verification'
     AND position('transplanting::' in coalesce(l.plot_name, '')) = 1
),
shaped AS (
  SELECT s.*,
         -- The plot is everything up to the first bar.
         CASE WHEN position('|' in s.rest) > 0
              THEN substr(s.rest, 1, position('|' in s.rest) - 1)
              ELSE s.rest END AS plot,
         -- The day is the last ten characters, on both shapes of key.
         right(s.rest, 10) AS day,
         -- Count the bars without a regular expression: how many characters
         -- vanish when they are all removed.
         length(s.rest) - length(replace(s.rest, '|', '')) AS bars
    FROM sigs s
)
SELECT 0 AS n,
       'SUMMARY' AS batch,
       (SELECT count(*) FROM shaped)::text                      AS plot,
       (SELECT count(*) FROM shaped WHERE bars >= 2)::text      AS day,
       (SELECT count(*) FROM shaped WHERE bars = 1)::text       AS key_shape,
       'signed, of which keyed on the tray, and on the card'    AS signed_by,
       ''::text                                                 AS signed_at
UNION ALL
SELECT 1,
       h.batch_name,
       h.plot,
       h.day,
       CASE WHEN h.bars >= 2 THEN 'TRAY -- the shape this rule is about'
            ELSE 'card' END,
       h.signed_by,
       left(h.signed_at::text, 16)
  FROM shaped h
 ORDER BY n, signed_at DESC;
