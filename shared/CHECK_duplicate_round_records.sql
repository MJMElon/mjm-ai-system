-- ════════════════════════════════════════════════════════════════════════
-- TWO WORK RECORDS SHOWING THE SAME ROUND
--
-- The round number is not stored on its own - it is the front of the
-- chemical text, put there by the schedule when it generates the row. So
-- two rows reading "Round 3" means two records exist for that round, and
-- there are only two ways that happens:
--
--   from the schedule   the row carries the slot it came from, written as
--                       program|round|chemical|plot. One slot, one row.
--   on its own          a row somebody added by hand, or one the FC Portal
--                       sent in, carries NO slot. The schedule never
--                       touches it, so it sits beside the scheduled one
--                       with whatever chemical text was typed or copied.
--
-- Read the "where it came from" column. A pair where one says "the
-- schedule" and the other says "added by hand" is the second case: the work
-- was recorded twice, once against the plan and once outside it.
--
-- Two rows both naming the SAME slot would be a fault, and the last column
-- counts them - it should be 1 on every row.
--
-- Reads only. Changes nothing.
-- ════════════════════════════════════════════════════════════════════════
WITH rec AS (
  SELECT r.value AS j
  FROM   nops_maint_records t
  CROSS  JOIN LATERAL jsonb_array_elements(t.records) AS r(value)
  WHERE  t.id = 1
),
flat AS (
  SELECT j ->> 'plot'   AS plot,
         j ->> 'jenis'  AS work,
         j ->> 'racun'  AS chemical,
         j ->> 'tarikh' AS work_date,
         coalesce(j ->> '_src', '') AS slot,
         split_part(j ->> 'racun', ':', 1) AS round_label
  FROM   rec
),
dupes AS (
  SELECT plot, work, round_label
  FROM   flat
  WHERE  round_label LIKE 'Round %'
  GROUP  BY plot, work, round_label
  HAVING count(*) > 1
)
SELECT f.plot, f.work, f.round_label AS round, f.work_date, f.chemical,
       CASE WHEN f.slot = '' THEN 'added by hand - no slot, the schedule leaves it alone'
            ELSE 'the schedule - slot ' || f.slot END AS where_it_came_from,
       (SELECT count(*) FROM flat x
        WHERE x.slot <> '' AND x.slot = f.slot) AS rows_on_this_slot
FROM   flat f
JOIN   dupes d ON d.plot = f.plot AND d.work = f.work AND d.round_label = f.round_label
ORDER  BY f.plot, f.work, f.round_label, f.work_date;
