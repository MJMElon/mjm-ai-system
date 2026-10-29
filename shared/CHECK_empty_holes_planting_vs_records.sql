-- ============================================================================
-- CHECK_empty_holes_planting_vs_records.sql
--
-- Seed Planting shows an Empty Holes box on every tray. From batch 276 on,
-- that box is COUNTED from the Empty Hole tab wherever the tray has records
-- there, and otherwise shows the figure saved with the planting row
-- (EmptyHoles: in its remark). This lists, for every tray of every batch
-- from 276 on, the two figures side by side and who last touched each.
--
-- Read only. Nothing is changed.
--
-- WHAT THE COLUMNS SAY
--   saved_on_planting   the EmptyHoles figure saved with the planting row
--   records_now         how many Empty_Hole records the tray has right now
--   box_shows           what the planting screen shows in the box today
--   planting_saved_by / planting_saved_at   last save of the planting row
--   records_saved_by / records_saved_at     last save of the empty holes
--   state               AGREE, or what differs
--
-- A good result is every row reading AGREE. A row reading DIFFERS is a
-- tray whose saved planting figure is not the count of its records.
-- Batch 279 is listed first.
-- ============================================================================

WITH planted AS (
  SELECT l.batch_name, l.plot_name AS tray,
         NULLIF(split_part(split_part(COALESCE(l.remark, ''), 'EmptyHoles:', 2), '.', 1), '') AS eh_txt,
         COALESCE(to_jsonb(l) ->> 'last_edited_by', to_jsonb(l) ->> 'created_by') AS saved_by,
         COALESCE(to_jsonb(l) ->> 'last_edited_at', l.created_at::text) AS saved_at
    FROM public.shared_inventory_logs l
   WHERE l.transaction_type = 'Planted'
), holes AS (
  SELECT h.batch_name, upper(trim(h.plot_name)) AS tray_key, count(*) AS n,
         max(COALESCE(to_jsonb(h) ->> 'last_edited_by', to_jsonb(h) ->> 'created_by')) AS saved_by,
         max(h.created_at)::text AS saved_at
    FROM public.shared_inventory_logs h
   WHERE h.transaction_type = 'Empty_Hole'
   GROUP BY 1, 2
), joined AS (
  SELECT p.batch_name, p.tray,
         CASE WHEN length(p.eh_txt) BETWEEN 1 AND 9 AND translate(p.eh_txt, '0123456789', '') = ''
              THEN p.eh_txt::int END AS saved_on_planting,
         COALESCE(h.n, 0) AS records_now,
         p.saved_by AS planting_saved_by, left(p.saved_at, 16) AS planting_saved_at,
         h.saved_by AS records_saved_by, left(h.saved_at, 16) AS records_saved_at
    FROM planted p
    LEFT JOIN holes h ON h.batch_name = p.batch_name AND h.tray_key = upper(trim(p.tray))
   WHERE CASE WHEN length(left(p.batch_name, 3)) = 3
                   AND translate(left(p.batch_name, 3), '0123456789', '') = ''
              THEN left(p.batch_name, 3)::int >= 276 ELSE false END
)
SELECT batch_name, tray, saved_on_planting, records_now,
       CASE WHEN records_now > 0 THEN records_now ELSE COALESCE(saved_on_planting, 0) END AS box_shows,
       planting_saved_by, planting_saved_at, records_saved_by, records_saved_at,
       CASE WHEN COALESCE(saved_on_planting, 0) = records_now THEN 'AGREE'
            WHEN records_now = 0 THEN 'DIFFERS -- planting row says ' || COALESCE(saved_on_planting, 0) || ', no records'
            ELSE 'DIFFERS -- planting row says ' || COALESCE(saved_on_planting, 0) || ', records say ' || records_now
       END AS state
  FROM joined
 ORDER BY (batch_name = '279') DESC, (COALESCE(saved_on_planting, 0) = records_now), batch_name, tray;
