-- =====================================================================
--  A SAVED 3RD CULLING THAT COMES BACK EMPTY — EVERY BATCH
--  Paste into the Supabase SQL Editor and press Run. Read-only: it
--  changes nothing, so it is safe to run as often as you like.
--
--  THE COMPLAINT
--  Batch 242 read "0 / 4 Done" with the Drone Map and Date boxes empty
--  on every plot, over a report somebody had saved. One batch is the
--  example, never the scope: this asks the same question of EVERY batch
--  and names the ones it is true of.
--
--  The report builds its rows out of the TRANSPLANT records, then looks
--  the saved culling record up by that plot's name. So a plot keyed one
--  way when it was transplanted and another way when it was culled —
--  "U17" and "u17 " are the same plot in the field and two different
--  strings here — matched nothing, and the row came back with empty
--  boxes over figures that were in the database all along.
--
--  The page now matches those forgivingly (trimmed, case ignored), so
--  anything this prints as SPELLING is already reading correctly again
--  in the app. It is still worth seeing: it says which batches were
--  affected, and tidying the names stops the next reader being confused
--  by two spellings of one plot.
--
--  The other two verdicts are NOT fixed by the app and need somebody:
--  a record naming a plot the batch has no row for is invisible in the
--  report, and a record saved with no drone-map count or no culled date
--  never had one to show.
-- =====================================================================
WITH

/* Every saved 3rd Culling record, with what its remark actually carries.
   The remark format is written by saveTab6() in
   operation/operation_batch_detail.html — change one, change the other. */
cull AS (
  SELECT l.batch_name,
         l.plot_name,
         REGEXP_REPLACE(UPPER(TRIM(COALESCE(l.plot_name, ''))), '\s+', ' ', 'g') AS pkey,
         l.quantity_change                                          AS culled,
         (l.remark ~ 'MapQty:\s*\d+')                               AS has_map,
         (l.remark ~ 'CullDate:\d{4}-\d{2}-\d{2}')                  AS has_date,
         (l.remark ~ 'CullSessions:')                               AS split_over_days,
         l.created_at
  FROM shared_inventory_logs l
  WHERE l.transaction_type = '3rd_Culling'
    AND COALESCE(TRIM(l.plot_name), '') <> ''
),

/* The plots the report actually BUILDS A ROW FOR: the ones transplanted
   into, plus the ones seedlings were transferred into. A culling record
   naming anything else has nowhere on the page to appear. */
rowsrc AS (
  SELECT l.batch_name,
         REGEXP_REPLACE(UPPER(TRIM(l.plot_name)), '\s+', ' ', 'g')  AS pkey,
         MAX(TRIM(l.plot_name))                                     AS as_keyed
  FROM shared_inventory_logs l
  WHERE l.transaction_type IN ('Transplanted', 'Transplanted_DoubleTone', 'Cull3_Transfer')
    AND COALESCE(TRIM(l.plot_name), '') <> ''
  GROUP BY 1, 2
),

judged AS (
  SELECT c.batch_name,
         c.plot_name,
         c.culled,
         c.has_map,
         c.has_date,
         c.split_over_days,
         r.as_keyed                                                 AS row_is_keyed,
         /* Does the plot match at all, and does it match EXACTLY? The
            second is what the page used to require. */
         (r.pkey IS NOT NULL)                                       AS plot_found,
         EXISTS (SELECT 1 FROM shared_inventory_logs t
                  WHERE t.batch_name = c.batch_name
                    AND t.transaction_type IN ('Transplanted', 'Transplanted_DoubleTone', 'Cull3_Transfer')
                    AND t.plot_name = c.plot_name)                  AS exact_match
  FROM cull c
  LEFT JOIN rowsrc r
         ON r.batch_name = c.batch_name AND r.pkey = c.pkey
),

problems AS (
  SELECT j.*,
         CASE
           WHEN NOT j.plot_found
             THEN 'NO ROW FOR THIS PLOT. The batch was never transplanted into it and '
                  || 'nothing was ever transferred into it, so the report has no row to '
                  || 'put this record on and it cannot be seen at all. Check the plot name '
                  || 'on this record against what the batch actually has.'
           WHEN NOT j.exact_match
             THEN 'SPELLING. Same plot, keyed differently here than on the transplant '
                  || '(the transplant says "' || COALESCE(j.row_is_keyed, '?') || '"). This is '
                  || 'what made the boxes come back empty; the app now matches the two, so '
                  || 'the figures are showing again. Tidy the name when convenient.'
           WHEN NOT j.has_map AND NOT j.has_date
             THEN 'NOTHING WAS KEYED. The record saved a culled quantity but neither a '
                  || 'drone-map count nor a culled date, so there is nothing for those two '
                  || 'boxes to show. Key them on the tab and save.'
           WHEN NOT j.has_map
             THEN 'NO DRONE-MAP COUNT on this record. The date is there; the map count was '
                  || 'never saved. Key it and save.'
           WHEN NOT j.has_date
             THEN 'NO CULLED DATE on this record. The map count is there; the date was never '
                  || 'saved. Key it and save.'
           ELSE NULL
         END AS verdict
  FROM judged j
)

/* ONE result set — the SQL Editor only shows the last statement's. The
   summary is the first row; everything under it is a plot to look at. */
SELECT 0                                                      AS sort,
       '— ALL BATCHES —'                                      AS batch,
       NULL                                                   AS plot_on_the_cull_record,
       NULL::bigint                                           AS culled,
       NULL::boolean                                          AS has_drone_map,
       NULL::boolean                                          AS has_culled_date,
       (SELECT count(*) FROM cull)::text || ' saved 3rd Culling record(s) across '
         || (SELECT count(DISTINCT batch_name) FROM cull)::text || ' batch(es). '
         || (SELECT count(*) FROM problems WHERE verdict IS NOT NULL)::text
         || ' need looking at, on '
         || (SELECT count(DISTINCT batch_name) FROM problems WHERE verdict IS NOT NULL)::text
         || ' batch(es)'
         || CASE WHEN (SELECT count(*) FROM problems WHERE verdict IS NOT NULL) = 0
                 THEN ' — nothing to do. Every saved report reads back in full.'
                 ELSE ': ' || COALESCE((SELECT STRING_AGG(DISTINCT batch_name, ', ')
                                          FROM problems WHERE verdict IS NOT NULL), '')
                      || '. One row each below.' END          AS verdict
UNION ALL
SELECT 1,
       p.batch_name,
       p.plot_name,
       p.culled,
       p.has_map,
       p.has_date,
       p.verdict
FROM problems p
WHERE p.verdict IS NOT NULL
ORDER BY sort, batch, plot_on_the_cull_record;

-- WHAT A GOOD RESULT LOOKS LIKE
--   The first row is the summary and says how many records there are and
--   how many need looking at. If it says "nothing to do" and there are no
--   rows under it, every saved 3rd Culling report reads back in full.
--
--   SPELLING rows need nothing urgent — the app matches those now, so the
--   Drone Map and Date boxes are filled again on those batches. They are
--   listed so you can see which batches were hit and tidy the names.
--
--   NO ROW FOR THIS PLOT and the three "never keyed" verdicts are real
--   work: the first is a record on a plot the batch does not have, the
--   others are boxes nobody filled in. Send back the batch and plot for
--   any you cannot place.
--
--   NO ROWS AT ALL — not even the summary — cannot happen; if it does,
--   the query did not run. Send back whatever the editor printed.
