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
-- when the count is 0: an audit whose plot matches no plot the ledger
-- has anything standing on. Those are invisible to every list in the
-- system. On a healthy database there are none.
--
-- THE PLOT CODE IS PADDED ON BOTH SIDES BEFORE ANYTHING IS COMPARED,
-- and this file did not do it until the padding was found to be the
-- whole of a false finding. The board pads every plot it reads to two
-- digits -- canonPlot in audit/audit_pending.js is the rule -- while the
-- ledger writes B1 and the saved audit writes B01, so comparing them as
-- typed matched NOTHING: every standing batch read as never audited and
-- every real audit read as filed on a plot the ledger does not know.
-- Both answers were false and both looked exactly like a finding. The
-- SQL Editor cannot take a regular expression, so the letters come off
-- with ltrim and the digits are padded with lpad, which does the same
-- work.

WITH allplots AS (
  SELECT upper(btrim(plot_name)) AS raw FROM shared_plot_batch_balance
   WHERE btrim(COALESCE(plot_name, '')) <> ''
  UNION
  SELECT upper(btrim(plot_name)) FROM shared_inventory_logs
   WHERE btrim(COALESCE(plot_name, '')) <> ''
  UNION
  SELECT upper(btrim(plot)) FROM audit_plot_audits
   WHERE btrim(COALESCE(plot, '')) <> ''
  UNION
  SELECT upper(btrim(plot)) FROM audit_height_records
   WHERE btrim(COALESCE(plot, '')) <> ''
),
parts AS (
  SELECT raw,
         left(raw, length(raw) - length(ltrim(raw, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')))      AS alpha,
         split_part(ltrim(raw, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), '-', 1)                   AS digits,
         CASE WHEN position('-' IN ltrim(raw, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')) > 0
              THEN '-' || split_part(ltrim(raw, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), '-', 2)
              ELSE '' END                                        AS suffix,
         length(ltrim(raw, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'))
           - length(replace(ltrim(raw, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), '-', ''))         AS dashes
  FROM   allplots
),
canon AS (
  SELECT raw,
         CASE WHEN alpha = '' OR digits = ''
                OR ltrim(digits, '0123456789') <> ''
                OR dashes > 1
                OR (suffix <> '' AND suffix <> '-R')
              THEN raw
              ELSE alpha
                   || CASE WHEN length(digits) < 2
                           THEN lpad(digits, 2, '0') ELSE digits END
                   || suffix
         END AS plot
  FROM   parts
),
live AS (
  SELECT c.plot, upper(btrim(b.batch_name)) AS batch
  FROM   shared_plot_batch_balance b
  JOIN   canon c ON c.raw = upper(btrim(b.plot_name))
  WHERE  COALESCE(b.qty, 0) > 0
    AND  btrim(COALESCE(b.batch_name, '')) <> ''
  GROUP BY 1, 2
),
standing AS (
  SELECT c.plot, upper(btrim(l.batch_name)) AS batch
  FROM   shared_inventory_logs l
  JOIN   canon c ON c.raw = upper(btrim(l.plot_name))
  WHERE  l.transaction_type IN ('Planted', 'Transplanted',
                                'Transplanted_Premium', 'Transplanted_DoubleTone')
    AND  btrim(COALESCE(l.batch_name, '')) <> ''
  GROUP BY 1, 2
),
work AS (
  SELECT s.plot, s.batch FROM standing s JOIN live v ON v.plot = s.plot AND v.batch = s.batch
),
aud AS (
  SELECT 'Plot Condition'::TEXT AS modul, c.plot,
         upper(btrim(a.batch)) AS batch, max(a.date) AS last_date
  FROM   audit_plot_audits a
  JOIN   canon c ON c.raw = upper(btrim(a.plot))
  WHERE  a.date IS NOT NULL
  GROUP BY 1, 2, 3
  UNION ALL
  SELECT 'Seedling Height'::TEXT, c.plot,
         upper(btrim(h.batch)), max(h.date)
  FROM   audit_height_records h
  JOIN   canon c ON c.raw = upper(btrim(h.plot))
  WHERE  h.date IS NOT NULL
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
