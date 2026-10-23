-- ═══════════════════════════════════════════════════════════════
-- WHERE A TRAY FIGURE COMES FROM, ON EVERY TRAY AND EVERY BATCH
--
-- Tray Status read P3 · 230 (81) over a batch with nothing standing in P3.
-- This is the arithmetic behind every one of those cells, laid out term by
-- term, so a figure nobody believes can be read rather than argued about.
--
-- The page works a batch out the way Life of Seedlings does:
--
--     standing = planted - 1st culling - transplanted out
--                - sold out of a tray + approved tray calibration
--
-- and it was missing the last two, which is what this names. A batch whose
-- OLD standing is bigger than its NEW one was holding trays it had already
-- emptied, and the difference had to be parked on some tray.
--
-- Nothing is changed. Read only.
--
-- WHAT A GOOD RESULT LOOKS LIKE
--
-- Row 0 is the summary: how many batches move and by how much between them.
-- A nought there means this fault is not on your database.
--
-- Under it, ONE ROW PER BATCH that moves, newest first, with every term.
-- Read `was_standing` against `now_standing`: the gap is what the trays
-- were holding and the batch did not have. `tray_now` is what each of its
-- trays is left holding, which is what Tray Status will draw.
--
-- A batch whose gap is NOT its sold plus its calibration is the interesting
-- one: something else is keeping seedlings in a tray, and the three term
-- columns say which of them is doing it.
-- ═══════════════════════════════════════════════════════════════

WITH trays AS (
  SELECT tray_name FROM public.operation_trays
),
planted AS (
  SELECT l.batch_name AS batch, l.plot_name AS tray,
         sum(abs(l.quantity_change)) AS qty
    FROM public.shared_inventory_logs l
    JOIN trays t ON t.tray_name = l.plot_name
   WHERE l.transaction_type = 'Planted'
   GROUP BY 1, 2
),
cull1 AS (
  SELECT l.batch_name AS batch, sum(abs(l.quantity_change)) AS qty
    FROM public.shared_inventory_logs l
   WHERE l.transaction_type = '1st_Culling'
   GROUP BY 1
),
moved AS (
  SELECT l.batch_name AS batch, sum(abs(l.quantity_change)) AS qty
    FROM public.shared_inventory_logs l
   WHERE l.transaction_type IN ('Transplanted', 'Transplanted_Premium', 'Transplanted_DoubleTone')
   GROUP BY 1
),
-- Every delivery line, flattened. A cancelled order sells nothing.
do_lines AS (
  SELECT d.batch_1 AS batch, d.plot_1 AS plot, d.qty_1 AS qty FROM public.shared_do_records d
   WHERE coalesce(d.status, '') <> 'Cancelled' AND position('[CANCELLED]' in coalesce(d.remark, '')) = 0
  UNION ALL
  SELECT d.batch_2, d.plot_2, d.qty_2 FROM public.shared_do_records d
   WHERE coalesce(d.status, '') <> 'Cancelled' AND position('[CANCELLED]' in coalesce(d.remark, '')) = 0
  UNION ALL
  SELECT d.batch_3, d.plot_3, d.qty_3 FROM public.shared_do_records d
   WHERE coalesce(d.status, '') <> 'Cancelled' AND position('[CANCELLED]' in coalesce(d.remark, '')) = 0
  UNION ALL
  SELECT d.batch_4, d.plot_4, d.qty_4 FROM public.shared_do_records d
   WHERE coalesce(d.status, '') <> 'Cancelled' AND position('[CANCELLED]' in coalesce(d.remark, '')) = 0
  UNION ALL
  SELECT d.batch_5, d.plot_5, d.qty_5 FROM public.shared_do_records d
   WHERE coalesce(d.status, '') <> 'Cancelled' AND position('[CANCELLED]' in coalesce(d.remark, '')) = 0
),
sold_tray AS (
  SELECT dl.batch AS batch, sum(abs(dl.qty)) AS qty
    FROM do_lines dl
    JOIN trays t ON t.tray_name = dl.plot
   WHERE dl.batch IS NOT NULL AND coalesce(dl.qty, 0) <> 0
   GROUP BY 1
),
-- Approved only, and only the ones keyed against a tray.
cal_tray AS (
  SELECT l.batch_name AS batch, sum(l.quantity_change) AS qty
    FROM public.shared_inventory_logs l
    JOIN trays t ON t.tray_name = l.plot_name
   WHERE l.transaction_type = 'Stock_Calibration'
     AND position('[APPROVED by ' in coalesce(l.remark, '')) > 0
   GROUP BY 1
),
per_batch AS (
  SELECT p.batch,
         sum(p.qty)                               AS planted,
         coalesce(max(c1.qty), 0)                 AS culled_1st,
         coalesce(max(mv.qty), 0)                 AS moved_out,
         coalesce(max(sd.qty), 0)                 AS sold_from_tray,
         coalesce(max(cl.qty), 0)                 AS tray_calibration
    FROM planted p
    LEFT JOIN cull1     c1 ON c1.batch = p.batch
    LEFT JOIN moved     mv ON mv.batch = p.batch
    LEFT JOIN sold_tray sd ON sd.batch = p.batch
    LEFT JOIN cal_tray  cl ON cl.batch = p.batch
   GROUP BY p.batch
),
standing AS (
  SELECT b.*,
         greatest(0, b.planted - b.culled_1st - b.moved_out) AS was_standing,
         greatest(0, b.planted - b.culled_1st - b.moved_out
                     - b.sold_from_tray + b.tray_calibration) AS now_standing
    FROM per_batch b
),
moves AS (
  SELECT * FROM standing WHERE was_standing <> now_standing
),
-- What each of its trays is left holding, so the row says which cell moves.
tray_now AS (
  SELECT p.batch,
         string_agg(p.tray || ' ' || p.qty::text, ', ' ORDER BY p.tray) AS trays
    FROM planted p
    JOIN moves m ON m.batch = p.batch
   GROUP BY p.batch
)
SELECT 0 AS n, 'SUMMARY' AS batch,
       (SELECT count(*) FROM moves)::text                         AS planted,
       (SELECT coalesce(sum(was_standing - now_standing), 0) FROM moves)::text AS culled_1st,
       'batches move, seedlings between them'                     AS moved_out,
       ''::text AS sold_from_tray, ''::text AS tray_calibration,
       ''::text AS was_standing, ''::text AS now_standing, ''::text AS tray_now
UNION ALL
SELECT 1, m.batch,
       m.planted::text, m.culled_1st::text, m.moved_out::text,
       m.sold_from_tray::text, m.tray_calibration::text,
       m.was_standing::text, m.now_standing::text,
       coalesce(t.trays, 'none')
  FROM moves m
  LEFT JOIN tray_now t ON t.batch = m.batch
ORDER BY n, batch DESC;
