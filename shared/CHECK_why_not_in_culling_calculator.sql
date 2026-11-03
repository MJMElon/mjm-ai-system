-- ============================================================================
-- CHECK_why_not_in_culling_calculator.sql
--
-- Why a plot is, or is not, on the FC Portal Culling Calculator.
-- Reads only. Changes nothing.
--
-- The calculator lists a plot and batch (a block) when ALL of these hold,
-- the same rules as loadPlots in FC-Portal src/modules/palms/cullingSource.js
--   1  PALMS has the PLOT open at Pengambilan or Saringan Anak Bibit
--   2  the Batch Report has a Transplanted row for that plot and batch
--   3  the batch is 224 or later
--   4  its 3rd Culling row carries no drone MapQty yet (a MapQty ends it)
--   5  the plot is not a -R replant plot
-- and the phone only shows the nurseries that login is allowed.
--
-- ONE ROW PER PLOT, for every plot with a batch of 224 or later ever
-- transplanted into it, or open at a collecting stage today. Columns
--   open_stages       what PALMS has running on the plot right now
--   live_batches      batches that pass rules 2 to 4
--   finished_batches  batches ended by a MapQty on the 3rd Culling
--   on_calculator     YES, or the rule that keeps it off
-- Look for the plot asked about, N16 for example, and read on_calculator.
-- ============================================================================

WITH st AS (
  SELECT sort_order, name,
         upper(replace(replace(name, ' ', ''), '-', '')) AS k
    FROM public.nops_plot_status_stages
),
open_logs AS (
  SELECT upper(trim(split_part(l.plot_name, '#', 1))) AS plot,
         string_agg(DISTINCT COALESCE(st.name, 'stage ' || l.act_n::text), ', ') AS stages,
         bool_or(st.k IN ('PENGAMBILAN', 'SARINGANANAKBIBIT')) AS collecting
    FROM public.fcportal_palms_plot_logs l
    LEFT JOIN st ON st.sort_order = l.act_n
   WHERE l.end_date IS NULL
   GROUP BY 1
),
tr AS (
  SELECT upper(trim(plot_name)) AS plot,
         ltrim(translate(batch_name, translate(batch_name, '0123456789', ''), ''), '0') AS batch,
         sum(abs(quantity_change)) AS qty
    FROM public.shared_inventory_logs
   WHERE transaction_type IN ('Transplanted', 'Transplanted_Premium', 'Transplanted_DoubleTone')
     AND COALESCE(quantity_change, 0) <> 0
   GROUP BY 1, 2
),
fin AS (
  SELECT DISTINCT upper(trim(plot_name)) AS plot,
         ltrim(translate(batch_name, translate(batch_name, '0123456789', ''), ''), '0') AS batch
    FROM public.shared_inventory_logs
   WHERE transaction_type = '3rd_Culling'
     AND position('MapQty:' IN COALESCE(remark, '')) > 0
     AND COALESCE(NULLIF(ltrim(translate(
           split_part(ltrim(split_part(remark, 'MapQty:', 2)), ' ', 1),
           translate(split_part(ltrim(split_part(remark, 'MapQty:', 2)), ' ', 1), '0123456789', ''),
           ''), '0'), ''), '0') <> '0'
),
blk AS (
  SELECT tr.plot, tr.batch, tr.qty,
         (fin.plot IS NOT NULL) AS finished
    FROM tr
    LEFT JOIN fin ON fin.plot = tr.plot AND fin.batch = tr.batch
   WHERE tr.batch <> '' AND tr.batch::bigint >= 224
),
per_plot AS (
  SELECT plot,
         string_agg(batch, ', ' ORDER BY batch::bigint) FILTER (WHERE NOT finished) AS live_batches,
         string_agg(batch, ', ' ORDER BY batch::bigint) FILTER (WHERE finished) AS finished_batches
    FROM blk
   GROUP BY plot
),
plots AS (
  SELECT plot FROM per_plot
  UNION
  SELECT plot FROM open_logs WHERE collecting
)
SELECT p.plot,
       COALESCE(o.stages, '(nothing open in PALMS)') AS open_stages,
       COALESCE(pp.live_batches, '-') AS live_batches,
       COALESCE(pp.finished_batches, '-') AS finished_batches,
       CASE
         WHEN p.plot LIKE '%-R%' THEN 'NO -- a -R replant plot is never listed'
         WHEN COALESCE(o.collecting, false) AND pp.live_batches IS NOT NULL THEN 'YES'
         WHEN pp.live_batches IS NOT NULL
           THEN 'NO -- PALMS does not have it at Pengambilan or Saringan Anak Bibit'
         WHEN pp.finished_batches IS NOT NULL
           THEN 'NO -- at a collecting stage but every batch has a MapQty on its 3rd Culling'
         ELSE 'NO -- at a collecting stage but no batch 224 or later was transplanted into it'
       END AS on_calculator
  FROM plots p
  LEFT JOIN open_logs o ON o.plot = p.plot
  LEFT JOIN per_plot pp ON pp.plot = p.plot
 ORDER BY CASE WHEN p.plot LIKE 'N%' THEN 1 WHEN p.plot LIKE 'U%' THEN 2 WHEN p.plot LIKE 'V%' THEN 3 ELSE 4 END,
          left(p.plot, 1),
          COALESCE(NULLIF(translate(p.plot, translate(p.plot, '0123456789', ''), ''), ''), '0')::bigint,
          p.plot;
