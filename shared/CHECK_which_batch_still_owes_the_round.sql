-- WHICH BATCH IS THE PLOT STILL WAITING ON
--
-- N02 sat on the to-do list owing Plot Condition round 3 while its plot
-- page showed every card green. The to-do list was right: one of the
-- batches on it had not been audited since an earlier round. The plot
-- page said done because it asked whether a batch had EVER been
-- audited, which it had.
--
-- This names every such batch on every plot, so the office can see what
-- the board is actually asking for rather than opening plots one at a
-- time. It changes nothing and is safe to run as often as you like.
--
-- WHAT A GOOD RESULT LOOKS LIKE
-- Row 1 is the count. Under it, one row per batch that is behind its
-- own plot: the plot was audited more recently on another batch, so
-- somebody walked the plot and this batch was not done. Those are the
-- ones that keep a round open. A nursery with nothing behind shows the
-- count at 0 and no rows under it.
--
-- The last rows are a different question and are worth reading even
-- when the count is 0: an audit whose plot spelling matches no plot in
-- the ledger. Those are invisible to every list in the system.

WITH live AS (
  SELECT upper(btrim(plot_name))  AS plot,
         upper(btrim(batch_name)) AS batch
  FROM   shared_plot_batch_balance
  WHERE  COALESCE(qty, 0) > 0
    AND  btrim(COALESCE(plot_name, ''))  <> ''
    AND  btrim(COALESCE(batch_name, '')) <> ''
  GROUP BY 1, 2
),
standing AS (
  SELECT upper(btrim(l.plot_name))  AS plot,
         upper(btrim(l.batch_name)) AS batch
  FROM   shared_inventory_logs l
  WHERE  l.transaction_type IN ('Planted', 'Transplanted',
                                'Transplanted_Premium', 'Transplanted_DoubleTone')
    AND  btrim(COALESCE(l.plot_name, ''))  <> ''
    AND  btrim(COALESCE(l.batch_name, '')) <> ''
  GROUP BY 1, 2
),
work AS (
  SELECT s.plot, s.batch FROM standing s JOIN live v ON v.plot = s.plot AND v.batch = s.batch
),
aud AS (
  SELECT 'Plot Condition'::TEXT AS modul,
         upper(btrim(plot))  AS plot,
         upper(btrim(batch)) AS batch,
         max(date)           AS last_date
  FROM   audit_plot_audits
  WHERE  date IS NOT NULL
  GROUP BY 1, 2, 3
  UNION ALL
  SELECT 'Seedling Height'::TEXT,
         upper(btrim(plot)),
         upper(btrim(batch)),
         max(date)
  FROM   audit_height_records
  WHERE  date IS NOT NULL
  GROUP BY 1, 2, 3
),
moduls AS (
  SELECT 'Plot Condition'::TEXT AS modul
  UNION ALL SELECT 'Seedling Height'
),
grid AS (
  SELECT m.modul, w.plot, w.batch, a.last_date
  FROM   work w
  CROSS JOIN moduls m
  LEFT JOIN aud a ON a.modul = m.modul AND a.plot = w.plot AND a.batch = w.batch
),
plot_last AS (
  SELECT modul, plot, max(last_date) AS plot_date
  FROM   grid
  GROUP BY 1, 2
),
behind AS (
  SELECT g.modul, g.plot, g.batch, g.last_date, p.plot_date
  FROM   grid g
  JOIN   plot_last p ON p.modul = g.modul AND p.plot = g.plot
  WHERE  p.plot_date IS NOT NULL
    AND  (g.last_date IS NULL OR g.last_date < p.plot_date)
),
orphan AS (
  SELECT a.modul, a.plot, count(*)::INT AS n, max(a.last_date) AS last_date
  FROM   aud a
  LEFT JOIN work w ON w.plot = a.plot
  WHERE  w.plot IS NULL
  GROUP BY 1, 2
)
SELECT 1 AS ord, 'COUNT' AS section,
       ''::TEXT AS nursery, ''::TEXT AS plot, ''::TEXT AS batch, ''::TEXT AS modul,
       ''::TEXT AS last_audited, NULL::INT AS days_behind,
       (SELECT count(*) FROM behind)::TEXT || ' batch(es) behind their own plot, on '
         || (SELECT count(DISTINCT plot) FROM behind)::TEXT || ' plot(s)' AS note
UNION ALL
SELECT 2, 'BEHIND',
       CASE left(b.plot, 1) WHEN 'P' THEN 'PN' WHEN 'B' THEN 'BNN'
                            WHEN 'U' THEN 'UNN 1' WHEN 'N' THEN 'UNN 2'
                            ELSE 'unknown' END,
       b.plot, b.batch, b.modul,
       COALESCE(b.last_date::TEXT, 'never'),
       CASE WHEN b.last_date IS NULL THEN NULL
            ELSE (b.plot_date - b.last_date)::INT END,
       'the plot was audited ' || b.plot_date::TEXT || ' on another batch'
FROM   behind b
UNION ALL
SELECT 3, 'PLOT NOT IN LEDGER',
       '', o.plot, '', o.modul, COALESCE(o.last_date::TEXT, 'never'), NULL,
       o.n::TEXT || ' audit(s) on a plot the ledger has nothing standing on'
FROM   orphan o
ORDER  BY 1, 6, 4, 5;
