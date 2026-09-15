-- =====================================================================
--  PREMIUM CARE ACROSS EVERY BATCH
--  Paste into the Supabase SQL Editor and press Run. Read-only: it
--  changes nothing, so it is safe to run as often as you like.
--
--  1st Culling shows a Premium Care row when a batch has a
--  Transplanted_Premium log with a quantity above nought. That row is
--  where the cull is keyed, and keying it is what balances the report.
--
--  This lists EVERY batch that has anything to do with Premium Care —
--  the ones that are fine, and the ones where the seedlings are in the
--  nursery but filed under a transaction type the report cannot read,
--  which is the one case that needs a person.
-- =====================================================================
WITH

premium AS (
  SELECT batch_name,
         SUM(COALESCE(quantity_change, 0)) AS qty,
         COUNT(*)                          AS records
  FROM shared_inventory_logs
  WHERE transaction_type = 'Transplanted_Premium'
  GROUP BY 1
),

/* A plot named PREMIUM CARE saved under some OTHER type. The seedlings
   are in the nursery, the report cannot see them there, and nothing on
   the screen says so — the one mistake worth catching by name.

   Movements OUT of Premium Care are not this: those are saved as an
   ordinary Transplanted with a real plot as their destination, and the
   tray is named in the remark, not in plot_name.

   The 1st Culling record against the Premium Care row is not this
   either — it is the whole point of the row, and it is saved with
   PREMIUM CARE as its plot. Counting it as misfiled turned every batch
   that had finished the job into one that needed fixing. */
misfiled AS (
  SELECT batch_name,
         SUM(COALESCE(quantity_change, 0)) AS qty,
         COUNT(*)                          AS records,
         LEFT(STRING_AGG(DISTINCT transaction_type, ', '), 60) AS kinds
  FROM shared_inventory_logs
  WHERE UPPER(TRIM(plot_name)) IN ('PREMIUM CARE', 'PREMIUM-CARE', 'PREMIUMCARE')
    AND transaction_type NOT IN ('Transplanted_Premium', '1st_Culling')
  GROUP BY 1
),

/* What each batch has already culled against the Premium Care row, so a
   batch that is finished with it can be told from one that has not
   started. */
culled AS (
  SELECT batch_name, SUM(COALESCE(quantity_change, 0)) AS qty
  FROM shared_inventory_logs
  WHERE transaction_type = '1st_Culling'
    AND UPPER(TRIM(plot_name)) = 'PREMIUM CARE'
  GROUP BY 1
),

every_batch AS (
  SELECT batch_name FROM premium
  UNION
  SELECT batch_name FROM misfiled
)

/* ONE result set — the SQL Editor only shows the last statement's.
   The batches that need a person sort to the top. */
SELECT b.batch_name                        AS batch,
       COALESCE(p.qty, 0)                  AS in_premium_care,
       COALESCE(c.qty, 0)                  AS culled_against_it,
       COALESCE(m.qty, 0)                  AS misfiled_qty,
       COALESCE(m.kinds, '')               AS misfiled_as,
       CASE
         WHEN m.batch_name IS NOT NULL
           THEN 'NEEDS FIXING - a PREMIUM CARE plot is saved under ' || m.kinds
                || ', so 1st Culling cannot see those seedlings as Premium Care. '
                || 'Open the batch -> Transplanting -> edit that movement and set '
                || 'its destination to Premium Care PN, then save.'
         WHEN COALESCE(p.qty, 0) <= 0
           THEN 'nothing in Premium Care on this batch'
         WHEN COALESCE(c.qty, 0) > 0
           THEN 'ok - ' || p.qty || ' in the nursery, ' || c.qty || ' already culled against it'
         ELSE 'ok - ' || p.qty || ' in the nursery; 1st Culling shows a PREMIUM CARE '
              || 'row with that quantity, waiting for its cull to be keyed'
       END                                 AS status
FROM every_batch b
LEFT JOIN premium  p ON p.batch_name = b.batch_name
LEFT JOIN misfiled m ON m.batch_name = b.batch_name
LEFT JOIN culled   c ON c.batch_name = b.batch_name
ORDER BY (m.batch_name IS NOT NULL) DESC, b.batch_name DESC;

-- WHAT A GOOD RESULT LOOKS LIKE
--   Every row says "ok". Anything starting NEEDS FIXING is at the top,
--   and its text says which batch and what to do about it.
--
--   in_premium_care is what the 1st Culling PREMIUM CARE row shows as its
--   tray quantity. culled_against_it is what has been keyed there so far.
--
--   A batch with no Premium Care at all does not appear here, and has no
--   Premium Care row on 1st Culling — which is correct, not a fault.
