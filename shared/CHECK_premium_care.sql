-- =====================================================================
--  WHERE DID THIS BATCH'S SEEDLINGS GO, AND IS PREMIUM CARE AMONG THEM?
--  Paste into the Supabase SQL Editor and press Run. Read-only: it
--  changes nothing, so it is safe to run as often as you like.
--
--  1st Culling shows a Premium Care row when the batch has a
--  Transplanted_Premium log with a quantity above nought. If the row is
--  not on the screen, this says why: the log is missing, or it was saved
--  under another transaction type, or its quantity is nought.
--
--  Change the batch number on the next line if you want a different one.
-- =====================================================================
WITH params AS (SELECT '232'::TEXT AS batch),

/* Every movement out of the trays, by the type it was saved under. The
   type is what decides which figure on 1st Culling a quantity lands in:
     Transplanted             -> Transplanted (accounted)
     Transplanted_Premium     -> Pending, and a Premium Care culling row
     Transplanted_DoubleTone  -> Pending, and a D-Tone culling row        */
moves AS (
  SELECT l.transaction_type AS kind,
         COUNT(*)                          AS records,
         SUM(COALESCE(l.quantity_change, 0)) AS qty,
         LEFT(STRING_AGG(DISTINCT COALESCE(NULLIF(TRIM(l.plot_name), ''), '(no plot)'), ', '), 90) AS plots
  FROM shared_inventory_logs l, params p
  WHERE l.batch_name = p.batch
    AND l.transaction_type IN ('Planted', 'Transplanted',
                               'Transplanted_Premium', 'Transplanted_DoubleTone',
                               '1st_Culling')
  GROUP BY 1
),

/* A plot named PREMIUM CARE saved under some OTHER type is the mistake
   worth catching by name: the seedlings are in the nursery, the report
   cannot see them there, and nothing on the screen says so. */
misfiled AS (
  SELECT l.transaction_type AS kind,
         COUNT(*)                          AS records,
         SUM(COALESCE(l.quantity_change, 0)) AS qty
  FROM shared_inventory_logs l, params p
  WHERE l.batch_name = p.batch
    AND UPPER(TRIM(l.plot_name)) IN ('PREMIUM CARE', 'PREMIUM-CARE', 'PREMIUMCARE')
    AND l.transaction_type <> 'Transplanted_Premium'
  GROUP BY 1
)

/* ONE result set — the SQL Editor only shows the last statement's. */
SELECT * FROM (
  SELECT 0 AS sort_order,
         '-- VERDICT --'::TEXT AS line,
         CASE
           WHEN (SELECT COALESCE(SUM(qty), 0) FROM moves WHERE kind = 'Transplanted_Premium') > 0
             THEN 'Premium Care HAS ' ||
                  (SELECT SUM(qty) FROM moves WHERE kind = 'Transplanted_Premium')::TEXT ||
                  ' seedlings on record. 1st Culling should be showing a PREMIUM CARE row ' ||
                  'with that quantity — if it is not, the page is stale: reload it hard.'
           WHEN (SELECT COUNT(*) FROM misfiled) > 0
             THEN 'A PREMIUM CARE plot is saved under the WRONG transaction type (see the ' ||
                  'misfiled line below), so the report cannot see it as Premium Care. ' ||
                  'Re-save that movement on the Transplanting tab with Premium Care PN ' ||
                  'as its destination.'
           ELSE 'This batch has NO Premium Care transplant on record at all. Nothing was ' ||
                'ever moved to that nursery, so there is no row for 1st Culling to show. ' ||
                'Key it on the Transplanting tab first.'
         END AS detail,
         NULL::BIGINT AS records, NULL::BIGINT AS qty, NULL::TEXT AS plots
  UNION ALL
  SELECT 1, kind, 'saved movements of this kind', records, qty, plots FROM moves
  UNION ALL
  SELECT 2, 'misfiled: ' || kind,
            'a PREMIUM CARE plot saved under this type instead', records, qty, NULL
  FROM misfiled
) x
ORDER BY sort_order, line;

-- WHAT A GOOD RESULT LOOKS LIKE
--   Row 1 is the verdict, in plain words. Below it, one line per kind of
--   movement the batch has, with how many records and how many seedlings.
--
--   Transplanted_Premium with a quantity above nought is what puts the
--   Premium Care row on 1st Culling. Its quantity is what that row's
--   tray figure shows, and what you cull against.
--
--   Any "misfiled:" line means a movement into Premium Care was saved
--   under the wrong type — those seedlings are counted somewhere else.
