-- ================================================================
-- Why a batch reads 0 Seed Accounted on the Seed In Report.
--
-- The Seed In Report lists a batch by the day its seeds ARRIVED, but it
-- counts the planting and the damage only up to the To date of the
-- period picked. A batch that arrived inside the period and was planted
-- after the To date is listed with 0 planted, 0 damaged, and a Variance
-- of minus everything it received. The batch page has no date cut, so
-- it shows the real figure, and the two disagree.
--
-- One row per batch, every batch, newest arrival first. The first
-- columns are what the report reads. The verdict says which batches the
-- monthly report cannot see the planting of, and why.
--
-- The day used is transaction_date, then created_at, which is what the
-- report uses for every Planting row the batch page writes. A Date
-- written only inside a remark is not read here.
--
-- WHAT A GOOD RESULT LOOKS LIKE: batch 268 reads PLANTED AFTER ITS
-- ARRIVAL MONTH with its planted date beside it. A row reading
-- IMPOSSIBLE YEAR or SPELT MORE THAN ONE WAY is a different fault and
-- needs the record corrected on the batch page.
-- ================================================================
WITH l AS (
  SELECT upper(replace(batch_name, ' ', '')) AS bkey,
         batch_name,
         transaction_type AS t,
         COALESCE(left(transaction_date::text, 10), left(created_at::text, 10)) AS d,
         abs(COALESCE(quantity_change, 0)) AS q
    FROM public.shared_inventory_logs
   WHERE transaction_type IN ('Seeds_Received', 'Planted', 'Damaged_Seeds')
     AND batch_name IS NOT NULL
),
b AS (
  SELECT bkey,
         string_agg(DISTINCT '[' || batch_name || ']', ' ') AS spellings,
         count(DISTINCT batch_name) AS n_spellings,
         max(d) FILTER (WHERE t = 'Seeds_Received') AS seeds_in_date,
         sum(q) FILTER (WHERE t = 'Planted') AS planted,
         sum(q) FILTER (WHERE t = 'Damaged_Seeds') AS damaged,
         min(d) FILTER (WHERE t = 'Planted') AS first_planted,
         max(d) FILTER (WHERE t IN ('Planted', 'Damaged_Seeds')) AS last_planted
    FROM l
   GROUP BY bkey
)
SELECT spellings AS batch,
       seeds_in_date,
       COALESCE(planted, 0) AS planted,
       COALESCE(damaged, 0) AS damaged,
       COALESCE(planted, 0) + COALESCE(damaged, 0) AS seed_accounted,
       first_planted,
       last_planted,
       CASE
         WHEN n_spellings > 1 THEN 'SPELT MORE THAN ONE WAY -- rows split between names'
         WHEN seeds_in_date IS NULL THEN 'planting with no seed in record'
         WHEN planted IS NULL THEN 'NO PLANTING RECORDED yet'
         WHEN left(last_planted, 4) < '2000' OR left(last_planted, 4) > '2100'
           THEN 'IMPOSSIBLE YEAR on the planting date'
         WHEN left(last_planted, 7) > left(seeds_in_date, 7)
           THEN 'PLANTED AFTER ITS ARRIVAL MONTH -- a monthly Seed In Report shows 0'
         ELSE 'ok'
       END AS verdict
  FROM b
 ORDER BY seeds_in_date DESC NULLS LAST, spellings;
