-- ════════════════════════════════════════════════════════════════════════
-- WHY THE CLAIM CARD AND THE WORKER RECORD TOTAL DISAGREE
-- shared/CHECK_claim_vs_worker_record.sql
--
-- Read-only. Nothing is created, changed or deleted. Run the whole file.
-- Set the nursery, the month and the job on the three lines marked below.
--
-- THE TWO FIGURES ARE NOT THE SAME QUESTION
--
-- The big number on the claim card is Total Workdone: EVERY checked record
-- of that job and nursery, whether or not anybody is ticked on it. It is
-- what was done.
--
-- The TOTAL (CAPACITY) at the foot of the Worker Record is the sum of the
-- worker columns, and a row is only in a column if somebody is ticked on it.
-- It is what is being paid.
--
-- So the claim card is the larger of the two whenever a row has nobody
-- ticked, and THE DIFFERENCE IS WORK NOBODY IS BEING PAID FOR. That is not a
-- rounding gap or a display quirk: it is a row the sheet is carrying and the
-- payroll is not.
--
-- WHAT EACH SECTION SAYS
--
-- 1 NO TICK   every checked row of this job with NO worker on it, named with
--             its date, its plot and what it is worth. These are the gap.
-- 2 UNCHECKED rows not ticked Checked, so they are held back from the claim
--             entirely -- they are in NEITHER figure, and are listed so a
--             held-back row is never mistaken for a missing one.
-- 3 SUMS      the three totals side by side: what the claim card should read,
--             what the Worker Record foot should read, and the difference.
-- 4 DOUBLE    the same plot and job appearing more often than it should --
--             the usual cause of a card that reads high by one whole row.
--
-- A GOOD RESULT IS SECTION 1 EMPTY and the difference in section 3 at 0.
-- ════════════════════════════════════════════════════════════════════════

WITH params AS (
  SELECT 'UNN1'::text     AS nursery,   -- PN, BNN, UNN1 or UNN2
         'Sep 2026'::text AS month,     -- as the page spells it
         'weeding'::text  AS work_type  -- pd, manuring, weeding or interrow
),

jen(work_type, jenis) AS (VALUES
  ('pd',       'Penyemburan racun kulat dan serangga'),
  ('manuring', 'Membaja'),
  ('weeding',  'Merumput'),
  ('interrow', 'Meracun rumput secara selingan')
),

-- WHICH PLOTS ARE THIS NURSERY.
--
-- A work record names its PLOT and nothing else, and the page resolves it
-- through shared/shared_maint_plots.js, which SQL cannot call. The first
-- letter reproduces that list exactly for the four nurseries -- PN is P,
-- BNN is B, UNN 1 is U, UNN 2 is N -- and a transfer plot keeps the letter
-- of the plot it came from, so U12-R is still UNN 1.
--
-- Plots that already carry a tick are unioned in as well, so a plot added by
-- hand under some other name is not missed. If a fifth nursery is ever added
-- with a different letter, this is the line to change.
letter AS (
  SELECT CASE nursery WHEN 'PN' THEN 'P' WHEN 'BNN' THEN 'B'
                      WHEN 'UNN1' THEN 'U' WHEN 'UNN2' THEN 'N'
                      ELSE '' END AS ch
    FROM params
),
plots AS (
  SELECT DISTINCT btrim(e.rec->>'plot') AS plot
    FROM nops_maint_records m
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.records, '[]'::jsonb)) AS e(rec)
    CROSS JOIN letter l
   WHERE m.id = 1 AND l.ch <> ''
     AND upper(left(btrim(COALESCE(e.rec->>'plot', '')), 1)) = l.ch
  UNION
  SELECT DISTINCT btrim(e.rec->>'plot')
    FROM nops_maint_payroll p
    CROSS JOIN LATERAL jsonb_each(COALESCE(p.data, '{}'::jsonb)) AS c(rec_id, cells)
    JOIN nops_maint_records m ON m.id = 1
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.records, '[]'::jsonb)) AS e(rec)
    CROSS JOIN params pa
   WHERE p.nursery = pa.nursery AND btrim(e.rec->>'id') = c.rec_id
),

row_ AS (
  SELECT btrim(COALESCE(e.rec->>'id', ''))     AS rec_id,
         btrim(COALESCE(e.rec->>'plot', ''))   AS plot,
         btrim(COALESCE(e.rec->>'jenis', ''))  AS jenis,
         btrim(COALESCE(e.rec->>'tarikh', '')) AS tarikh,
         btrim(COALESCE(e.rec->>'_src', ''))   AS slot,
         CASE WHEN COALESCE(e.rec->>'checked', '0') IN ('1', 'true') THEN 1 ELSE 0 END AS checked,
         CASE WHEN btrim(COALESCE(e.rec->>'qty', '')) <> ''
                   AND translate(btrim(e.rec->>'qty'), '0123456789', '') = ''
                THEN btrim(e.rec->>'qty')::numeric
              WHEN btrim(COALESCE(e.rec->>'qtyFrozen', '')) <> ''
                   AND translate(btrim(e.rec->>'qtyFrozen'), '0123456789', '') = ''
                THEN btrim(e.rec->>'qtyFrozen')::numeric
              ELSE 0 END AS cap
    FROM nops_maint_records m
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.records, '[]'::jsonb)) AS e(rec)
    CROSS JOIN params pa
    JOIN jen j ON j.work_type = pa.work_type
   WHERE m.id = 1
     AND btrim(COALESCE(e.rec->>'_month', '')) = pa.month
     AND btrim(COALESCE(e.rec->>'jenis', ''))  = j.jenis
     AND btrim(COALESCE(e.rec->>'plot', '')) IN (SELECT plot FROM plots)
),

tick AS (
  SELECT c.rec_id,
         (SELECT count(*) FROM jsonb_object_keys(COALESCE(c.cells, '{}'::jsonb))) AS n
    FROM nops_maint_payroll p
    CROSS JOIN LATERAL jsonb_each(COALESCE(p.data, '{}'::jsonb)) AS c(rec_id, cells)
    CROSS JOIN params pa
   WHERE p.nursery = pa.nursery AND p.month = pa.month AND p.work_type = pa.work_type
),

joined AS (
  SELECT r.*, COALESCE(t.n, 0) AS ticks
    FROM row_ r LEFT JOIN tick t ON t.rec_id = r.rec_id
)

SELECT * FROM (
  SELECT 1 AS ord, '1 NO TICK'::text AS section,
         (j.plot || '  ' || CASE WHEN j.tarikh = '' OR j.tarikh = '-'
                                 THEN 'no date' ELSE j.tarikh END)::text AS item,
         to_char(j.cap, 'FM999G999G999') AS n,
         ('checked, but nobody is ticked on it -- in the claim card and NOT in the '
          || 'Worker Record total.  slot ' || CASE WHEN j.slot = '' THEN 'none (added by hand)'
                                                   ELSE j.slot END
          || ', id ' || j.rec_id)::text AS detail
    FROM joined j
   WHERE j.checked = 1 AND j.ticks = 0

  UNION ALL
  SELECT 2, '2 UNCHECKED',
         (j.plot || '  ' || CASE WHEN j.tarikh = '' OR j.tarikh = '-'
                                 THEN 'no date' ELSE j.tarikh END)::text,
         to_char(j.cap, 'FM999G999G999'),
         'not Checked, so it is held back from the claim and is in NEITHER figure'
    FROM joined j
   WHERE j.checked = 0

  UNION ALL
  SELECT 3, '3 SUMS', 'claim card (Total Workdone)',
         to_char(COALESCE((SELECT sum(cap) FROM joined WHERE checked = 1), 0), 'FM999G999G999'),
         'every checked row, ticked or not'
  UNION ALL
  SELECT 3, '3 SUMS', 'Worker Record foot',
         to_char(COALESCE((SELECT sum(cap) FROM joined WHERE checked = 1 AND ticks > 0), 0), 'FM999G999G999'),
         'only the rows somebody is ticked on'
  UNION ALL
  SELECT 3, '3 SUMS', 'difference',
         to_char(COALESCE((SELECT sum(cap) FROM joined WHERE checked = 1 AND ticks = 0), 0), 'FM999G999G999'),
         'work nobody is being paid for -- should be 0'

  UNION ALL
  SELECT 4, '4 DOUBLE', (x.plot)::text, x.n::text,
         ('this plot has ' || x.n::text || ' rows of this job in this month')::text
    FROM (SELECT plot, count(*) AS n FROM joined GROUP BY plot) x
   WHERE x.n > 3
) z
ORDER BY ord, item, n;
