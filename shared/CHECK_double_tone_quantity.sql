-- =====================================================================
--  THE DOUBLE TONE FIGURE, PER BATCH
--  Paste into the Supabase SQL Editor and press Run. Read-only: it
--  changes nothing, so it is safe to run as often as you like.
--
--  Two different numbers wear the name Double Tone, and Life of
--  Seedlings was showing the wrong one in that column.
--
--    DTone_Nursery_Qty        the box on the Transplanting tab headed
--                             "Double Tone Quantity in Nursery". An
--                             admin counts the double-tone seedlings
--                             standing in the nursery and keys the
--                             number. One row per batch, newest wins.
--                             THIS is the Double Tone column.
--
--    Transplanted_DoubleTone  the batch pushing its own seedlings into
--                             the d-tone tray. A different number, and
--                             nought on most batches. This is what the
--                             column used to show, which is why it read
--                             0 against batches that had a figure
--                             keyed.
--
--  EVERY BATCH that has either is listed, so the two can be compared
--  side by side.
--
--  WHAT A GOOD RESULT LOOKS LIKE
--    The ALL row first with the totals, then one row per batch.
--
--    double_tone        what the column shows now: the newest keyed
--                       Quantity in Nursery.
--    was_showing        what it showed before: the transplant into the
--                       d-tone tray.
--    keyings            how many times the figure has been keyed. More
--                       than one is a correction, not a second lot, and
--                       the newest is the one taken.
--    last_keyed         the date on the newest keying.
--
--    A batch where double_tone is above nought and was_showing is
--    nought is one the report used to show nothing for. That is the
--    whole of the complaint, and the count of them is in the ALL row.
-- =====================================================================
WITH keyed AS (
  SELECT l.batch_name,
         l.quantity_change,
         l.transaction_date,
         l.created_at,
         count(*) OVER (PARTITION BY l.batch_name) AS keyings,
         row_number() OVER (PARTITION BY l.batch_name
                            ORDER BY l.created_at DESC, l.id DESC) AS newest_first
  FROM shared_inventory_logs l
  WHERE l.transaction_type = 'DTone_Nursery_Qty'
    AND COALESCE(btrim(l.batch_name), '') <> ''
),
newest AS (
  SELECT batch_name,
         COALESCE(quantity_change, 0) AS double_tone,
         keyings,
         COALESCE(transaction_date::text,
                  COALESCE(left(created_at::text, 10), '')) AS last_keyed
  FROM keyed
  WHERE newest_first = 1
),
tray AS (
  SELECT l.batch_name,
         sum(abs(COALESCE(l.quantity_change, 0))) AS was_showing
  FROM shared_inventory_logs l
  WHERE l.transaction_type = 'Transplanted_DoubleTone'
    AND COALESCE(btrim(l.batch_name), '') <> ''
  GROUP BY l.batch_name
),
paired AS (
  SELECT COALESCE(n.batch_name, t.batch_name)   AS batch_name,
         COALESCE(n.double_tone, 0)             AS double_tone,
         COALESCE(t.was_showing, 0)             AS was_showing,
         COALESCE(n.keyings, 0)                 AS keyings,
         COALESCE(n.last_keyed, '')             AS last_keyed
  FROM newest n
  FULL JOIN tray t ON t.batch_name = n.batch_name
)
SELECT batch, double_tone, was_showing, keyings, last_keyed
FROM (
  SELECT 0                                                        AS sort_first,
         'ALL — ' || count(*) || ' batch'
           || CASE WHEN count(*) = 1 THEN '' ELSE 'es' END
           || ', ' || count(*) FILTER (WHERE double_tone > 0 AND was_showing = 0)
           || ' were reading nought'                              AS batch,
         COALESCE(sum(double_tone), 0)                            AS double_tone,
         COALESCE(sum(was_showing), 0)                            AS was_showing,
         COALESCE(sum(keyings), 0)                                AS keyings,
         ''                                                       AS last_keyed
  FROM paired
  UNION ALL
  SELECT 1, batch_name, double_tone, was_showing, keyings, last_keyed
  FROM paired
) q
ORDER BY sort_first, double_tone DESC, batch;
