-- WHAT THE PER-BATCH ALERT FIX ACTUALLY MOVES, MONTH BY MONTH
--
-- The back office alert board keeps only the LATEST Plot Condition reading
-- of each thing, and the thing is a plot AND A BATCH: a main-nursery plot
-- holds several batches and each one is its own audit. It used to collapse
-- on the plot alone, so six of every seven readings on a plot were thrown
-- away before any alert test ran -- and which one survived was decided by
-- created_at, which differs by milliseconds because a plot goes up in one
-- insert. Whichever alert you got was effectively arbitrary.
--
-- CHECK_why_no_plot_condition_alert.sql answers this for the current month.
-- This one answers it for every month there has ever been a reading, so a
-- month that is simply clean cannot be mistaken for the fix doing nothing.
-- It changes nothing and is safe to run as often as you like.
--
-- WHAT A GOOD RESULT LOOKS LIKE
--
-- One row per month, newest first, and the last row is the whole history.
--
--   readings      plot condition rows saved that month
--   flagged       how many of them the board raises a card for NOW
--   old kept      how many it would have raised BEFORE the fix
--   hidden        flagged minus old kept -- READINGS THE OLD BOARD LOST.
--                 Above nought on any month is the fault, and that month
--                 had an alert the office was never shown.
--   plots         distinct plots behind the flagged readings, which is what
--                 the card counts
--
-- A month reading 0 / 0 / 0 is a clean month and says nothing either way.
-- The TOTAL row is the one to read: if its hidden is nought over the whole
-- history, the fault had simply never bitten yet.

WITH rows_all AS (
  SELECT a.plot, a.batch, a.nursery, a.pest, a.tikus, a.warna_daun,
         a.date, a.created_at,
         to_char(a.date, 'YYYY-MM') AS ym
  FROM   audit_plot_audits a
  WHERE  a.date IS NOT NULL
),
is_flagged AS (
  SELECT r.*,
         CASE WHEN r.tikus IN ('Banyak', 'Sedikit')
                OR r.pest = 'Banyak'
                OR r.warna_daun = '5' THEN 1 ELSE 0 END AS flag
  FROM   rows_all r
),
new_kept AS (
  SELECT DISTINCT ON (ym, COALESCE(nursery, ''), COALESCE(plot, ''), COALESCE(batch, '')) *
  FROM   is_flagged
  ORDER  BY ym, COALESCE(nursery, ''), COALESCE(plot, ''), COALESCE(batch, ''),
            created_at DESC
),
old_kept AS (
  SELECT DISTINCT ON (ym, COALESCE(nursery, ''), COALESCE(plot, '')) *
  FROM   is_flagged
  ORDER  BY ym, COALESCE(nursery, ''), COALESCE(plot, ''), created_at DESC
),
per_month AS (
  SELECT r.ym,
         count(*)::INT AS readings,
         (SELECT count(*)::INT FROM new_kept n WHERE n.ym = r.ym AND n.flag = 1) AS flagged,
         (SELECT count(*)::INT FROM old_kept o WHERE o.ym = r.ym AND o.flag = 1) AS old_kept,
         (SELECT count(DISTINCT COALESCE(n.nursery, '') || ' ' || COALESCE(n.plot, ''))::INT
            FROM new_kept n WHERE n.ym = r.ym AND n.flag = 1) AS plots
  FROM   rows_all r
  GROUP  BY r.ym
)
SELECT 1 AS ord, p.ym AS month, p.readings, p.flagged, p.old_kept,
       (p.flagged - p.old_kept) AS hidden, p.plots,
       CASE WHEN p.flagged - p.old_kept > 0
              THEN 'the old board lost an alert this month'
            WHEN p.flagged = 0 THEN 'clean month, says nothing either way'
            ELSE 'same answer before and after' END AS note
FROM   per_month p
UNION ALL
SELECT 2, 'TOTAL', sum(p.readings)::INT, sum(p.flagged)::INT, sum(p.old_kept)::INT,
       sum(p.flagged - p.old_kept)::INT, sum(p.plots)::INT,
       CASE WHEN sum(p.flagged - p.old_kept) > 0
              THEN 'readings the old board threw away, over the whole history'
            ELSE 'the fault had never bitten yet, and the fix is still right' END
FROM   per_month p
ORDER  BY 1, 2 DESC;
