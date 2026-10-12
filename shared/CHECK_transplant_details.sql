-- =====================================================================
--  THE TRANSPLANT AND 1ST CULLED SPLITS, PER BATCH
--  Paste into the Supabase SQL Editor and press Run. Read-only: it
--  changes nothing, so it is safe to run as often as you like.
--
--  Life of Seedlings carries three columns under Transplant Details,
--  and they are the batch report allocation engine cards, not a sum
--  Life of Seedlings works out for itself:
--
--    Total Transplant Qty   every main-plot transplant this batch has
--                           made
--    Transplant Qty         the Main Plot card: out of an ordinary
--                           pre-nursery tray
--    Double Tone            the Main Plot (D-Tone) card: out of the
--                           DOUBLE-TONE tray, so a seedling that had
--                           the treatment on its way
--
--  The last two are DISJOINT halves of the first, so they add up to
--  it. The tray a row came out of is written in its remark by the
--  save, as: Transplanted from tray [DOUBLE-TONE] to Main Plot [U3].
--
--  The page matches that tray on letters and digits, so any spelling
--  of it is one tray. The SQL Editor cannot take a regular expression,
--  so this file matches three spellings instead, and the gap between
--  the two rules is not silent: a fourth spelling lands in neither
--  half, total_transplant stops equalling main_plot plus double_tone,
--  and the do not split count in the ALL row goes above nought.
--
--  1st Culled splits the same way and for the same reason. A 1st
--  culling happens in a TRAY and its row is keyed against the tray it
--  happened in, so the DOUBLE-TONE tray has its own share:
--
--    Total 1st Culled Qty         every 1st culling
--    1st Culled Qty               in an ordinary pre-nursery tray
--    Double Tone 1st Culled Qty   in the DOUBLE-TONE tray
--
--  Total Culled (1st + 3rd) goes on taking the WHOLE 1st culling.
--
--  A FOURTH NUMBER also wears the name Double Tone and is NOT any of
--  these: DTone_Nursery_Qty, the box an admin keys with how many
--  double-tone seedlings are STANDING in the nursery. It is listed
--  here as keyed_in_nursery so the two can be told apart. It can be
--  above nought on a batch that has transplanted nothing, which is
--  exactly what went wrong: batch 276 had 3 keyed and nothing
--  transplanted, and the report read a Total Transplant Qty of 3.
--
--  WHAT A GOOD RESULT LOOKS LIKE
--    The ALL row first with the totals, then one row per batch that
--    has any of these figures.
--
--    total_transplant   should always equal main_plot + double_tone.
--                       The ALL row counts any batch where it does
--                       not, and that count should be 0. Anything
--                       else is a transplant row whose remark does
--                       not say which tray it came out of.
--    cull1 / cull1_plain / cull1_dtone
--                       the same split on the 1st culling, and
--                       cull1 should likewise be the other two added.
--    keyed_in_nursery   the Quantity in Nursery box. Not a column.
--    was_showing        what Total Transplant Qty read before:
--                       transplant qty plus the keyed box.
--
--    A batch where total_transplant is nought and keyed_in_nursery is
--    above nought is one the report was overstating. Batch 276 should
--    read 0, 0, 0 with keyed_in_nursery 3 and was_showing 3.
-- =====================================================================
WITH tx AS (
  SELECT btrim(l.batch_name)                       AS batch_name,
         abs(COALESCE(l.quantity_change, 0))       AS qty,
         CASE WHEN position('from tray [DOUBLE-TONE]' in COALESCE(l.remark, '')) > 0
                OR position('from tray [Double Tone]' in COALESCE(l.remark, '')) > 0
                OR position('from tray [DOUBLE TONE]' in COALESCE(l.remark, '')) > 0
              THEN 1 ELSE 0 END                    AS from_dtone
  FROM shared_inventory_logs l
  WHERE l.transaction_type = 'Transplanted'
    AND COALESCE(btrim(l.batch_name), '') <> ''
),
moved AS (
  SELECT batch_name,
         sum(qty)                                        AS total_transplant,
         sum(CASE WHEN from_dtone = 0 THEN qty ELSE 0 END) AS main_plot,
         sum(CASE WHEN from_dtone = 1 THEN qty ELSE 0 END) AS double_tone
  FROM tx
  GROUP BY batch_name
),
cull AS (
  SELECT btrim(l.batch_name)                 AS batch_name,
         sum(abs(COALESCE(l.quantity_change, 0)))                     AS cull1,
         sum(CASE WHEN upper(btrim(COALESCE(l.plot_name, ''))) IN
                       ('DOUBLE-TONE', 'DOUBLE TONE', 'DOUBLETONE')
                  THEN abs(COALESCE(l.quantity_change, 0)) ELSE 0 END) AS cull1_dtone
  FROM shared_inventory_logs l
  WHERE l.transaction_type = '1st_Culling'
    AND COALESCE(btrim(l.batch_name), '') <> ''
  GROUP BY btrim(l.batch_name)
),
keyed AS (
  SELECT batch_name, quantity_change,
         row_number() OVER (PARTITION BY batch_name
                            ORDER BY created_at DESC, id DESC) AS newest_first
  FROM shared_inventory_logs
  WHERE transaction_type = 'DTone_Nursery_Qty'
    AND COALESCE(btrim(batch_name), '') <> ''
),
newest AS (
  SELECT btrim(batch_name) AS batch_name,
         COALESCE(quantity_change, 0) AS keyed_in_nursery
  FROM keyed
  WHERE newest_first = 1
),
named AS (
  SELECT batch_name FROM moved
  UNION
  SELECT batch_name FROM newest
  UNION
  SELECT batch_name FROM cull
),
paired AS (
  SELECT b.batch_name,
         COALESCE(m.total_transplant, 0)      AS total_transplant,
         COALESCE(m.main_plot, 0)             AS main_plot,
         COALESCE(m.double_tone, 0)           AS double_tone,
         COALESCE(c.cull1, 0)                 AS cull1,
         COALESCE(c.cull1, 0)
           - COALESCE(c.cull1_dtone, 0)       AS cull1_plain,
         COALESCE(c.cull1_dtone, 0)           AS cull1_dtone,
         COALESCE(n.keyed_in_nursery, 0)      AS keyed_in_nursery,
         COALESCE(m.total_transplant, 0)
           + COALESCE(n.keyed_in_nursery, 0)  AS was_showing
  FROM named b
  LEFT JOIN moved  m ON m.batch_name = b.batch_name
  LEFT JOIN newest n ON n.batch_name = b.batch_name
  LEFT JOIN cull   c ON c.batch_name = b.batch_name
)
SELECT batch, total_transplant, main_plot, double_tone,
       cull1, cull1_plain, cull1_dtone,
       keyed_in_nursery, was_showing
FROM (
  SELECT 0                                                        AS sort_first,
         0                                                        AS sort_size,
         'ALL — ' || count(*) || ' batches, '
           || count(*) FILTER (WHERE total_transplant <> main_plot + double_tone
                                  OR cull1 <> cull1_plain + cull1_dtone)
           || ' do not split (should be 0), '
           || count(*) FILTER (WHERE total_transplant = 0 AND keyed_in_nursery > 0)
           || ' were overstated'                                  AS batch,
         sum(total_transplant) AS total_transplant,
         sum(main_plot)        AS main_plot,
         sum(double_tone)      AS double_tone,
         sum(cull1)            AS cull1,
         sum(cull1_plain)      AS cull1_plain,
         sum(cull1_dtone)      AS cull1_dtone,
         sum(keyed_in_nursery) AS keyed_in_nursery,
         sum(was_showing)      AS was_showing
  FROM paired
  UNION ALL
  SELECT 1, was_showing - total_transplant,
         batch_name, total_transplant, main_plot, double_tone,
         cull1, cull1_plain, cull1_dtone,
         keyed_in_nursery, was_showing
  FROM paired
) q
ORDER BY sort_first, sort_size DESC, batch;
