-- WHAT IS KEEPING AN OVERDUE ROUND ON THE BOARD FOR EVER
--
-- An overdue round is cleared by the WORK and never by the calendar: once
-- its window has closed, the board takes the batch latest audit whenever it
-- was done. So one audit today clears every overdue round that batch has
-- accrued, all at once.
--
-- The one thing that rule still refuses is a batch with NO audit at all.
-- There is nothing to clear it with, so its round shows under August, and
-- again under September, and again under October, and nothing an auditor
-- does anywhere else will ever take those rows off.
--
-- This names every one of them, on every plot and both modules. It changes
-- nothing and is safe to run as often as you like.
--
-- THE PLOT CODE IS PADDED ON BOTH SIDES BEFORE ANYTHING IS COMPARED, and
-- the first version of this file was not. The board pads every plot it
-- reads to two digits -- canonPlot in audit/audit_pending.js is the rule --
-- while the ledger writes B1 and the saved audit writes B01, so comparing
-- them as typed matched NOTHING: every standing batch read as never
-- audited and every real audit read as filed on a plot the ledger does not
-- know. Both answers were false and both looked exactly like a finding.
-- The SQL Editor cannot take a regular expression, so the letters come off
-- with ltrim and the digits are padded with lpad, which does the same work.
--
-- WHAT A GOOD RESULT LOOKS LIKE
-- Row 1 is the count. Nought means every standing batch has been audited at
-- least once and no row on the board is stuck.
--
-- Under it, one row per batch that has never been audited. Read the note:
--
--   never walked at all   nobody has audited this plot on ANY batch for
--                         this module. One visit clears the whole stack of
--                         overdue rows under it. This is the usual answer
--                         when the same plot is showing under three months.
--
--   walked, this batch missed
--                         somebody HAS been to the plot and audited another
--                         batch standing in it. The round stays open for
--                         this one alone, which is the hardest kind to
--                         spot from the board -- the plot looks visited.
--                         CHECK_which_batch_still_owes_the_round.sql is the
--                         drill-down for that case and dates it.
--
-- The last two sections are a different question, and they were ONE until
-- the first real run cried wolf over twenty-five pre-nursery trays:
--
--   NOTHING STANDING NOW   the ledger HAS placed a batch on this plot and
--                          nothing is standing on it now. For a MAIN plot
--                          that is a batch which has finished -- culled
--                          out, transferred or sold -- so an audit dated
--                          after it is somebody walking an empty plot. For
--                          a PRE-NURSERY tray it means nothing at all: the
--                          balance view is the MAIN nursery movement and
--                          Planted takes no part in it, so EVERY PN plot
--                          reads this way whatever anybody did. The note
--                          says which of the two you are looking at.
--
--   PLOT NOT IN LEDGER     nothing has ever been placed on this plot and an
--                          audit was filed against it anyway. THAT is the
--                          one that is invisible to every list in the
--                          system, and on a healthy database there are
--                          none.

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
plot_seen AS (
  SELECT modul, plot, max(last_date) AS plot_date
  FROM   grid
  GROUP BY 1, 2
),
never AS (
  SELECT g.modul, g.plot, g.batch, p.plot_date
  FROM   grid g
  JOIN   plot_seen p ON p.modul = g.modul AND p.plot = g.plot
  WHERE  g.last_date IS NULL
),
in_ledger AS (
  SELECT DISTINCT plot FROM standing
),
orphan AS (
  SELECT a.modul, a.plot, count(*)::INT AS n, max(a.last_date) AS last_date,
         (s.plot IS NOT NULL) AS known
  FROM   aud a
  LEFT JOIN work w ON w.plot = a.plot
  LEFT JOIN in_ledger s ON s.plot = a.plot
  WHERE  w.plot IS NULL
  GROUP BY 1, 2, 5
)
SELECT 1 AS ord, 'COUNT' AS section,
       ''::TEXT AS nursery, ''::TEXT AS plot, ''::TEXT AS batch, ''::TEXT AS modul,
       ''::TEXT AS plot_last_audited,
       (SELECT count(*) FROM never)::TEXT || ' batch(es) never audited, on '
         || (SELECT count(DISTINCT plot) FROM never)::TEXT || ' plot(s) -- of which '
         || (SELECT count(DISTINCT plot) FROM never WHERE plot_date IS NULL)::TEXT
         || ' have never been walked at all' AS note
UNION ALL
SELECT 2, 'NEVER AUDITED',
       CASE left(n.plot, 1) WHEN 'P' THEN 'PN' WHEN 'B' THEN 'BNN'
                            WHEN 'U' THEN 'UNN 1' WHEN 'N' THEN 'UNN 2'
                            ELSE 'unknown' END,
       n.plot, n.batch, n.modul,
       COALESCE(n.plot_date::TEXT, 'never'),
       CASE WHEN n.plot_date IS NULL
            THEN 'never walked at all -- one visit clears every overdue round under it'
            ELSE 'walked, this batch missed -- the plot looks visited and the round stays open'
       END
FROM   never n
UNION ALL
SELECT 3, 'NOTHING STANDING NOW',
       CASE left(o.plot, 1) WHEN 'P' THEN 'PN' WHEN 'B' THEN 'BNN'
                            WHEN 'U' THEN 'UNN 1' WHEN 'N' THEN 'UNN 2'
                            ELSE 'unknown' END,
       o.plot, '', o.modul, COALESCE(o.last_date::TEXT, 'never'),
       o.n::TEXT || ' audit(s), and '
         || CASE WHEN left(o.plot, 1) = 'P'
                 THEN 'this is a PRE-NURSERY tray -- the balance view does not carry those, so every PN plot reads this way and it says nothing about the work'
                 ELSE 'the batch standing here has since finished -- culled out, transferred or sold, which drops its row from the balance view' END
FROM   orphan o WHERE o.known
UNION ALL
SELECT 4, 'PLOT NOT IN LEDGER',
       '', o.plot, '', o.modul, COALESCE(o.last_date::TEXT, 'never'),
       o.n::TEXT || ' audit(s) on a plot NOTHING has ever been placed on -- invisible to every list in the system'
FROM   orphan o WHERE NOT o.known
ORDER  BY 1, 6, 4, 5;
