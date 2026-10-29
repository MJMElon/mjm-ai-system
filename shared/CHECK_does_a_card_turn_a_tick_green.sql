-- ═══════════════════════════════════════════════════════════════
-- WOULD THE CARD TURN A TICK GREEN THAT WAS NOT GREEN BEFORE
--
-- Tab 3 was one row per TRAY, and a sign-off was keyed on the tray. A
-- plot filled from four trays therefore carried FOUR signatures, and the
-- tab tick only went green when every one of them was signed.
--
-- A card is one plot on one day. It reads a sign-off keyed on any of its
-- trays as its own, which is what Life of Seedlings has always concluded
-- from the same rows. So a plot signed on three trays out of four was NOT
-- fully signed before and IS signed now -- and a tick that was not green
-- could go green.
--
-- The office asked for the opposite in plain words: a tick that was green
-- must still be green, and nothing else may move. This counts the cards
-- that would move the other way. A nought is the answer that says the
-- change is only in the eyes.
--
-- Nothing is changed. Read only.
--
-- HOW A SIGNATURE IS MATCHED TO A CARD
--
-- The stored key is the stage, then two colons, then PLOT, then more, and
-- the last ten characters are the day. Only the plot and the day are
-- read: the rest names the tray, and a card is not a tray. A signature
-- whose tray row has since been deleted or re-dated still counts here,
-- which can only make the count of signed trays LOOK higher -- so a
-- nought in row 0 is a safe nought.
--
-- A batch whose whole Transplanting tab is signed in one go is left out:
-- every row on it already counted as signed, and nothing about it moves.
--
-- WHAT A GOOD RESULT LOOKS LIKE
--
-- Row 0 is the answer: how many cards were PART signed, which is how many
-- ticks could turn green. A nought and there is nothing to look at.
--
-- Under it, one row per card that moves: the batch, the plot, the day,
-- how many trays filled it and how many of them were signed.
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
trays AS (
  SELECT batch_name, plot_name, day, count(*) AS tray_rows
    FROM tx
   GROUP BY batch_name, plot_name, day
),
stage_signed AS (
  SELECT DISTINCT v.batch_name
    FROM public.operation_batch_verifications v
   WHERE v.stage = 'transplanting'
),
sigs AS (
  SELECT DISTINCT
         r.batch_name,
         r.plot_name AS stored_key,
         substr(r.plot_name, 16) AS rest
    FROM public.shared_inventory_logs r
   WHERE r.transaction_type = 'Row_Verification'
     AND position('transplanting::' in coalesce(r.plot_name, '')) = 1
),
sig_cards AS (
  SELECT s.batch_name,
         CASE WHEN position('|' in s.rest) > 0
              THEN substr(s.rest, 1, position('|' in s.rest) - 1)
              ELSE s.rest END AS plot_name,
         right(s.rest, 10) AS day,
         s.stored_key
    FROM sigs s
   WHERE position('|' in s.rest) > 0
),
signed AS (
  SELECT batch_name, plot_name, day, count(DISTINCT stored_key) AS signed_trays
    FROM sig_cards
   GROUP BY batch_name, plot_name, day
),
joined AS (
  SELECT t.batch_name, t.plot_name, t.day, t.tray_rows,
         coalesce(s.signed_trays, 0) AS signed_trays
    FROM trays t
    LEFT JOIN signed s
           ON s.batch_name = t.batch_name
          AND s.plot_name  = t.plot_name
          AND s.day        = t.day
   WHERE t.batch_name NOT IN (SELECT batch_name FROM stage_signed)
),
moves AS (
  SELECT * FROM joined WHERE signed_trays > 0 AND signed_trays < tray_rows
)
SELECT 0 AS n,
       'SUMMARY' AS batch,
       (SELECT count(*) FROM moves)::text  AS plot,
       (SELECT count(*) FROM joined)::text AS day,
       'cards part signed, of this many cards in all' AS tray_rows,
       ''::text AS signed_trays
UNION ALL
SELECT 1,
       m.batch_name,
       m.plot_name,
       m.day,
       m.tray_rows::text,
       m.signed_trays::text
  FROM moves m
 ORDER BY n, batch DESC, plot;
