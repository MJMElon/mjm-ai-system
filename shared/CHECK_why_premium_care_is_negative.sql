-- ============================================================================
-- CHECK_why_premium_care_is_negative.sql
--
-- The office, over the Summary Report:  summary report里面为什么premium care
-- 是负数？
--
-- WHAT THE FIGURE IS. Premium Care is a HOLDING tray: nothing is planted into
-- it, seedlings ARRIVE from a numbered tray and leave again for a main plot.
-- So its Balance on the Pre-Nursery section is
--
--     Transfer In  +  Planted  -  1st Culled  -  Transplanted Out
--
-- counted CUMULATIVELY up to the As At date (Seed Damage carries sign 0 there
-- and cannot move it). Every movement column is an absolute figure, so the
-- only cells that can go below nought are B/F and Balance. Below nought means
-- the ledger says more seedlings left the tray than ever entered it.
--
-- THERE ARE EXACTLY TWO WAYS THAT HAPPENS, and they need different repairs:
--
--   THE LEDGER IS SHORT.  Added up over all time the tray still reads below
--       nought. A figure is wrong: the arrival is too small, a transplant out
--       is too big, a transplant NAMES PREMIUM CARE when the seedlings came
--       out of a numbered tray, or the 1st culling is too big.
--
--   THE DATES ARE OUT OF ORDER.  Added up over all time the tray is fine, but
--       a departure is DATED BEFORE the arrival that supplied it. The report
--       is cut off at a date, so every reading cut between those two days
--       reads below nought -- and the B/F column, which is everything
--       strictly before the month started, is the one that shows it most.
--       Nothing is missing. A DATE has to move, not a quantity.
--
-- This check answers which, on every batch, for BOTH holding trays. The
-- Double-Tone tray is read the way the report reads it: where a Double Tone
-- Quantity in Nursery has been keyed, the newest keyed figure REPLACES the
-- arrivals rather than adding to them, so a figure keyed smaller than what
-- has already left that tray takes it below nought on its own.
--
-- THE DATE A ROW LANDS ON is the Summary Report rule: the keyed
-- transaction_date, then a Date in the remark, then created_at -- the day
-- somebody pressed Save, which can be weeks after the work. A created_at
-- fallback is the commonest reason a departure ends up dated before its
-- arrival, so section 2 prints where every date came from and section 3 names
-- the rows this check cannot date as precisely as the report can.
--
-- Read only. Nothing is changed. Safe to run twice.
--
-- WHAT A GOOD RESULT LOOKS LIKE
--   section 0  SUMMARY. nought pairs below nought means no reading of the
--              report, at any As At date, shows a holding tray negative.
--   section 1  one line per holding tray and batch that goes below nought:
--              what went in, what was culled, what left, what that leaves
--              over all time, the WORST the running balance ever gets and the
--              day it first gets there, and the verdict -- LEDGER IS SHORT or
--              DATES ARE OUT OF ORDER.
--   section 2  every movement of those trays in date order, with where its
--              date came from. Read down to find the row to correct.
--   section 3  rows carrying no keyed date at all. The report may date one off
--              a Date in its remark where this check uses the save day, so a
--              tray named in section 1 that also appears here is worth
--              checking on the batch report itself before anything is moved.
--
-- Once a batch is named, CHECK_trays_that_went_negative.sql is the drill-down
-- for the numbered trays of that batch as well.
-- ============================================================================

WITH tx AS (
  SELECT coalesce(batch_name, '-')              AS batch,
         transaction_type                       AS t,
         coalesce(plot_name, '-')               AS plot,
         abs(coalesce(quantity_change, 0))      AS qty,
         coalesce(remark, '')                   AS remark,
         transaction_date,
         created_at,
         coalesce(transaction_date, created_at::date) AS happened,
         CASE WHEN transaction_date IS NOT NULL
                THEN 'keyed date'
              WHEN position('Date: ' in coalesce(remark, '')) > 0
                THEN 'NO KEYED DATE -- the report reads the Date in the remark, this check uses the save day'
              ELSE 'NO KEYED DATE -- the day somebody pressed Save'
         END                                    AS date_from
  FROM   shared_inventory_logs
),
-- The one keyed Double Tone Quantity in Nursery per batch, newest row winning,
-- exactly as loadDtoneNurseryQty and the Summary Report both read it.
dtone_keyed AS (
  SELECT batch, qty, happened, date_from
    FROM (SELECT batch, qty, happened, date_from,
                 row_number() OVER (PARTITION BY batch ORDER BY created_at DESC) AS rn
            FROM tx
           WHERE t = 'DTone_Nursery_Qty') x
   WHERE rn = 1
),
-- Every movement of a holding tray, as one list of signed deltas.
lines AS (
  -- Arrivals. The destination tray is the row own plot_name.
  SELECT batch, plot AS tray, happened, date_from,
         'arrived from a planting tray' AS kind, qty AS delta
    FROM tx
   WHERE t IN ('Transplanted_Premium', 'Transplanted_DoubleTone')
     -- A batch with a keyed Double-Tone figure does not count its arrivals
     -- as well, or the tray is filled twice.
     AND NOT (plot = 'DOUBLE-TONE'
              AND EXISTS (SELECT 1 FROM dtone_keyed d WHERE d.batch = tx.batch))
  UNION ALL
  SELECT batch, 'DOUBLE-TONE', happened, date_from,
         'the keyed Double Tone Quantity in Nursery', qty
    FROM dtone_keyed
  UNION ALL
  -- Anything genuinely planted straight into a holding tray.
  SELECT batch, plot, happened, date_from, 'planted in', qty
    FROM tx
   WHERE t = 'Planted' AND plot IN ('PREMIUM CARE', 'DOUBLE-TONE')
  UNION ALL
  -- Departures. The tray is the one the remark names, letter for letter, which
  -- is what srcTrayOf reads on the report.
  SELECT batch,
         btrim(split_part(split_part(remark, 'from tray [', 2), ']', 1)) AS tray,
         happened, date_from,
         'went out to ' || plot, -qty
    FROM tx
   WHERE t IN ('Transplanted', 'Transplanted_Premium', 'Transplanted_DoubleTone')
     AND position('from tray [' in remark) > 0
  UNION ALL
  SELECT batch, plot, happened, date_from, '1st culled', -qty
    FROM tx
   WHERE t = '1st_Culling' AND plot IN ('PREMIUM CARE', 'DOUBLE-TONE')
),
held AS (
  SELECT * FROM lines WHERE tray IN ('PREMIUM CARE', 'DOUBLE-TONE')
),
-- BY DAY, never by row. The report is cut off at a DATE, so an arrival and a
-- departure on the same day are both in the figure whatever order they were
-- keyed in -- and a running balance worked out row by row would report a dip
-- that no reading of the report can ever show.
by_day AS (
  SELECT batch, tray, happened, sum(delta) AS delta
    FROM held
   GROUP BY batch, tray, happened
),
run AS (
  SELECT batch, tray, happened, delta,
         sum(delta) OVER (PARTITION BY batch, tray ORDER BY happened) AS running
    FROM by_day
),
tot AS (
  SELECT h.batch, h.tray,
         sum(CASE WHEN h.kind IN ('arrived from a planting tray', 'planted in',
                                  'the keyed Double Tone Quantity in Nursery')
                  THEN h.delta ELSE 0 END)                        AS went_in,
         sum(CASE WHEN h.kind = '1st culled' THEN h.delta ELSE 0 END) AS culled,
         sum(CASE WHEN h.kind NOT IN ('arrived from a planting tray', 'planted in',
                                      'the keyed Double Tone Quantity in Nursery',
                                      '1st culled')
                  THEN h.delta ELSE 0 END)                        AS moved_out,
         sum(h.delta)                                             AS ever,
         (SELECT min(r.running) FROM run r WHERE r.batch = h.batch AND r.tray = h.tray) AS worst,
         (SELECT min(r.happened) FROM run r
           WHERE r.batch = h.batch AND r.tray = h.tray
             AND r.running = (SELECT min(r2.running) FROM run r2
                               WHERE r2.batch = h.batch AND r2.tray = h.tray)) AS worst_on
    FROM held h
   GROUP BY h.batch, h.tray
),
bad AS (
  SELECT * FROM tot WHERE worst < 0
)

SELECT 0 AS section, 'SUMMARY' AS batch, '-' AS tray,
       (SELECT count(*) FROM bad)::text || ' holding tray and batch pairs read below nought' AS figures,
       (SELECT count(*) FROM bad WHERE ever <  0)::text || ' the LEDGER IS SHORT, '
         || (SELECT count(*) FROM bad WHERE ever >= 0)::text || ' the DATES ARE OUT OF ORDER' AS dates,
       CASE WHEN (SELECT count(*) FROM bad) = 0
            THEN 'nothing to report -- no As At date makes a holding tray negative'
            ELSE 'lines next, then every movement of those trays in date order'
       END AS verdict

UNION ALL
SELECT 1, b.batch, b.tray,
       'in ' || b.went_in::text || ', culled ' || abs(b.culled)::text
         || ', out ' || abs(b.moved_out)::text || ', leaves ' || b.ever::text,
       'worst it ever reads is ' || b.worst::text || ' on ' || to_char(b.worst_on, 'DD Mon YYYY'),
       CASE WHEN b.ever >= 0
            THEN 'DATES ARE OUT OF ORDER -- it adds up to ' || b.ever::text
                 || ' over all time, so nothing is missing and a DATE has to move'
            -- A keyed Double Tone Quantity in Nursery REPLACES the arrivals, so
            -- on that tray the figure to look at first is the keyed one and not
            -- a transplant.
            WHEN b.tray = 'DOUBLE-TONE'
             AND EXISTS (SELECT 1 FROM dtone_keyed d WHERE d.batch = b.batch)
            THEN 'LEDGER IS SHORT by ' || abs(b.ever)::text
                 || ' -- the keyed Double Tone Quantity in Nursery is smaller than what has already left this tray, and it replaces the arrivals'
            ELSE 'LEDGER IS SHORT by ' || abs(b.ever)::text
                 || ' -- a quantity is wrong, or a transplant names this tray and should name a numbered one'
       END
  FROM bad b

UNION ALL
-- The day is printed ISO here so the lines sort into the order they happened.
-- DD Mon YYYY is read as text in a UNION, which puts 02 Apr after 01 Jun.
SELECT 2, h.batch, '   ' || h.tray,
       CASE WHEN h.delta > 0 THEN '+' || h.delta::text ELSE h.delta::text END,
       h.happened::text,
       h.kind || ' (' || h.date_from || ')'
  FROM held h
  JOIN bad b ON b.batch = h.batch AND b.tray = h.tray

UNION ALL
SELECT 3, t.batch, t.plot,
       abs(t.qty)::text || ' on ' || t.t,
       t.happened::text,
       t.date_from
  FROM tx t
 WHERE t.transaction_date IS NULL
   AND (t.plot IN ('PREMIUM CARE', 'DOUBLE-TONE')
        OR position('from tray [PREMIUM CARE]' in t.remark) > 0
        OR position('from tray [DOUBLE-TONE]'  in t.remark) > 0)

UNION ALL
SELECT 3, 'nothing to report', '-',
       'every holding tray row carries a keyed date', '-',
       'so this check dates them exactly as the report does'
 WHERE NOT EXISTS (
   SELECT 1 FROM tx t
    WHERE t.transaction_date IS NULL
      AND (t.plot IN ('PREMIUM CARE', 'DOUBLE-TONE')
           OR position('from tray [PREMIUM CARE]' in t.remark) > 0
           OR position('from tray [DOUBLE-TONE]'  in t.remark) > 0))

ORDER BY 1, 2, 3, 5, 4;
