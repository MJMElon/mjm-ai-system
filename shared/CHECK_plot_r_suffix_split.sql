-- ════════════════════════════════════════════════════════════════════════
-- IS A PLOT'S STOCK SPLIT ACROSS "N5" AND "N5-R"?
--
-- mjm_plot_key keeps the -R suffix on purpose, so N5 and N5-R are two
-- different plots to every app that reads the ledger. That is right where
-- the -R really is its own plot, and wrong where the SAME plot has been
-- written both ways — the intake lands on one spelling and the cullings
-- and sales on the other, which leaves one side negative and the other
-- side too high by about the same amount.
--
-- One row per batch that appears under both spellings. Reads only.
--
-- HOW TO READ IT: a pair where one side is negative and `together` is a
-- sensible positive number is a batch written two ways — the two belong
-- to one plot. A pair where BOTH sides are sensible positives is two real
-- plots and wants nothing done.
-- ════════════════════════════════════════════════════════════════════════
WITH b AS (
  SELECT plot_key, batch_key, plot_name, batch_name, qty FROM shared_plot_batch_balance
),
pairs AS (
  SELECT r.plot_name  AS r_plot,  r.qty AS r_qty,
         p.plot_name  AS base_plot, p.qty AS base_qty,
         r.batch_name AS batch, r.batch_key
  FROM   b r
  JOIN   b p ON p.batch_key = r.batch_key
            AND p.plot_key  = left(r.plot_key, length(r.plot_key) - 2)
  WHERE  r.plot_key LIKE '%-R'
)
SELECT base_plot, r_plot, batch, base_qty, r_qty,
       base_qty + r_qty AS together,
       CASE
         WHEN r_qty < 0 AND base_qty + r_qty >= 0
           THEN 'ONE PLOT WRITTEN TWO WAYS - the -R side is short by what the base side is long'
         WHEN r_qty < 0 OR base_qty < 0
           THEN 'still negative even added together - not just a spelling split'
         ELSE 'both sides stand on their own - two real plots, nothing to do'
       END AS reading
FROM   pairs
ORDER  BY r_qty;
