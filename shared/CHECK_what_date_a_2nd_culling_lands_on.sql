-- WHICH DAY EACH 2ND CULLING COUNTS ON, AND WHERE THAT DAY CAME FROM
--
-- The office looked at a P & D Spraying row and said the 2nd culling was not
-- being considered. Every job but interrow takes the 2nd culling OFF the
-- linked quantity, and it does -- but only a culling dated ON OR BEFORE the
-- work day. One dated after had not happened when somebody sprayed, so those
-- seedlings were standing and the figure is right to leave it out.
--
-- So the question is never "does it subtract", it is "WHAT DAY is this
-- culling on". shared_plot_movement reads that day in this order:
--
--   1. transaction_date
--   2. CullDate: in the remark, where it is a plain YYYY-MM-DD
--   3. created_at -- THE DAY SOMEBODY PRESSED SAVE
--
-- The third is the one that bites. Tab 5 saves a row as soon as a Dead figure
-- is keyed and does NOT require the Cull Date, so a row saved with that box
-- empty counts on the day it was keyed -- which can be weeks after the work.
-- A spraying row dated before that day then reads high, correctly, and
-- nothing on either screen used to say why.
--
-- WHAT A GOOD RESULT LOOKS LIKE: row 1 counts the lot. Any row whose
-- day_comes_from reads "created_at -- NO CULL DATE" is one to look at: open
-- that batch on Tab 5 and key the Cull Date, and every quantity on that plot
-- settles onto the right day by itself. The rest are correct however they
-- read.
--
-- Read-only. It creates nothing and changes nothing.

WITH c2 AS (
  SELECT
    l.plot_name,
    l.batch_name,
    ABS(COALESCE(l.quantity_change, 0))      AS culled,
    l.transaction_date::text                 AS d_keyed,
    l.created_at::date::text                 AS d_saved,
    CASE WHEN position('CullDate:' in COALESCE(l.remark, '')) > 0
         THEN btrim(substring(COALESCE(l.remark, '')
                              from position('CullDate:' in COALESCE(l.remark, '')) + 9
                              for 11))
         ELSE '' END                         AS d_remark_raw
  FROM shared_inventory_logs l
  WHERE l.transaction_type = '2nd_Culling'
),
-- A remark date counts only where it is a plain YYYY-MM-DD. Checked by SHAPE
-- rather than by a pattern, because the SQL Editor has choked on a regular
-- expression before and this file has to survive a paste.
shaped AS (
  SELECT c2.*,
         CASE WHEN length(d_remark_raw) >= 10
                   AND substring(d_remark_raw from 5 for 1) = '-'
                   AND substring(d_remark_raw from 8 for 1) = '-'
              THEN left(d_remark_raw, 10) ELSE '' END AS d_remark
  FROM c2
),
dated AS (
  SELECT shaped.*,
         CASE WHEN d_keyed IS NOT NULL AND d_keyed <> '' THEN d_keyed
              WHEN d_remark <> ''                        THEN d_remark
              ELSE d_saved END AS day_used,
         CASE WHEN d_keyed IS NOT NULL AND d_keyed <> '' THEN 'transaction_date'
              WHEN d_remark <> ''                        THEN 'CullDate in the remark'
              ELSE 'created_at -- NO CULL DATE' END AS day_from
  FROM shaped
)
SELECT 0 AS block, '' AS plot_key, '' AS batch_key,
       'ALL PLOTS' AS plot,
       '2nd culling rows: ' || COUNT(*)::text
         || '  (dated by transaction_date ' || COUNT(*) FILTER (WHERE day_from = 'transaction_date')::text
         || ', by the remark ' || COUNT(*) FILTER (WHERE day_from = 'CullDate in the remark')::text
         || ', BY THE DAY IT WAS SAVED ' || COUNT(*) FILTER (WHERE day_from = 'created_at -- NO CULL DATE')::text
         || ')' AS batch,
       '' AS culled, '' AS counts_on, '' AS day_comes_from
FROM dated
UNION ALL
SELECT 1,
       -- The rows that fall back to the save day first, since those are the
       -- only ones that can sit on a day nobody chose.
       CASE WHEN day_from = 'created_at -- NO CULL DATE' THEN '1' ELSE '2' END
         || COALESCE(plot_name, ''),
       COALESCE(batch_name, ''),
       COALESCE(plot_name, '(no plot)'),
       COALESCE(batch_name, '(no batch)'),
       culled::text,
       COALESCE(day_used, '(none)'),
       day_from
FROM dated
ORDER BY block, plot_key, batch_key;
