-- WHY IS THE ALERT BOARD SHOWING NOTHING BUT PAPAN TANDA
--
-- The back office alert board raises a Plot Condition card only on three
-- exact readings, and it compares the stored text LETTER FOR LETTER:
--
--   Animal Infestation   tikus       is Banyak or Sedikit
--   Pest Infestation     pest        is Banyak
--   Yellow Leaves        warna_daun  is 5
--
-- So an empty board has three possible causes and they look identical from
-- the screen. This tells them apart. It changes nothing and is safe to run
-- as often as you like.
--
-- WHAT A GOOD RESULT LOOKS LIKE, and what each answer means
--
-- Row 1 is the count, for THIS calendar month:
--
--   readings this month       how many plot condition rows were saved. Nought
--                             means no audit reached the database at all, and
--                             nothing else on this page matters.
--   flagged readings          how many of those match one of the three tests
--                             above. NOUGHT MEANS THE MONTH IS GENUINELY
--                             CLEAN and the board is right to be empty.
--   survived the old collapse how many of the flagged ones the board used to
--                             keep. Fewer than the line above it is the fault
--                             that was fixed -- a plot keeps one reading per
--                             BATCH now, where it used to keep one per plot.
--   flagged with no nursery   a row the board cannot group and so never draws.
--                             Should be nought.
--
-- Section 2 is the VALUE CENSUS, and it is the one to read when the flagged
-- count is nought. It lists every distinct value actually stored in the three
-- columns. If it shows BANYAK or banyak where the board wants Banyak, or a
-- warna of 5 stored as something else, then the readings are there and the
-- comparison is what is missing.
--
-- Section 3 names each flagged reading, so a count above nought can be walked
-- back to the plot and batch it came from.

WITH month AS (
  SELECT date_trunc('month', CURRENT_DATE)::date                       AS d1,
         (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month -1 day')::date AS d2
),
rows_now AS (
  SELECT a.*
  FROM   audit_plot_audits a, month m
  WHERE  a.date >= m.d1 AND a.date <= m.d2
),
flagged AS (
  SELECT r.*,
         CASE WHEN r.tikus IN ('Banyak', 'Sedikit') THEN 'Animal Infestation'
              WHEN r.pest = 'Banyak'                THEN 'Pest Infestation'
              ELSE 'Yellow Leaves' END AS kind
  FROM   rows_now r
  WHERE  r.tikus IN ('Banyak', 'Sedikit')
     OR  r.pest = 'Banyak'
     OR  r.warna_daun = '5'
),
old_kept AS (
  SELECT DISTINCT ON (COALESCE(nursery, ''), COALESCE(plot, '')) *
  FROM   rows_now
  ORDER  BY COALESCE(nursery, ''), COALESCE(plot, ''), created_at DESC
),
old_flagged AS (
  SELECT * FROM old_kept
  WHERE  tikus IN ('Banyak', 'Sedikit') OR pest = 'Banyak' OR warna_daun = '5'
),
census AS (
  SELECT 'tikus'      AS col, COALESCE(tikus, 'NULL')      AS val, count(*)::INT AS n FROM rows_now GROUP BY 1, 2
  UNION ALL
  SELECT 'pest',            COALESCE(pest, 'NULL'),            count(*)::INT FROM rows_now GROUP BY 1, 2
  UNION ALL
  SELECT 'warna_daun',      COALESCE(warna_daun, 'NULL'),      count(*)::INT FROM rows_now GROUP BY 1, 2
)
SELECT 1 AS ord, 'COUNT' AS section, 'readings this month' AS label,
       (SELECT count(*) FROM rows_now)::INT AS n,
       (SELECT to_char(d1, 'YYYY-MM-DD') || ' to ' || to_char(d2, 'YYYY-MM-DD') FROM month) AS note
UNION ALL
SELECT 1, 'COUNT', 'flagged readings', (SELECT count(*) FROM flagged)::INT,
       'nought here means the month is genuinely clean and the board is right'
UNION ALL
SELECT 1, 'COUNT', 'survived the old collapse', (SELECT count(*) FROM old_flagged)::INT,
       'fewer than the line above is the fault that was fixed'
UNION ALL
SELECT 1, 'COUNT', 'flagged with no nursery',
       (SELECT count(*) FROM flagged WHERE COALESCE(btrim(nursery), '') = '')::INT,
       'a row the board cannot group, so it never draws it -- should be nought'
UNION ALL
SELECT 2, 'VALUES', c.col || ' = ' || c.val, c.n,
       CASE WHEN c.col = 'tikus'      AND c.val IN ('Banyak', 'Sedikit') THEN 'the board flags this'
            WHEN c.col = 'pest'       AND c.val = 'Banyak'               THEN 'the board flags this'
            WHEN c.col = 'warna_daun' AND c.val = '5'                    THEN 'the board flags this'
            ELSE 'not flagged' END
FROM   census c
UNION ALL
SELECT 3, 'FLAGGED', COALESCE(f.nursery, 'no nursery') || ' ' || COALESCE(f.plot, '?')
         || COALESCE(' · ' || f.batch, ''), 1, f.kind || ' on ' || f.date::TEXT
FROM   flagged f
ORDER  BY 1, 2, 3;
