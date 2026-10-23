-- HAS A PLOT CONDITION AUDIT EVER READ ANYTHING BUT CLEAN
--
-- The alert board has never raised a Plot Condition card. Over the whole
-- history, 0 of the readings match one of its three tests. There are only
-- two things that can mean and they look identical from the screen:
--
--   the nursery really is clean on all three, or
--   the readings land just SHORT of where the tests are set.
--
-- The tests are not set evenly, which is why the second is worth asking:
--
--   tikus       Banyak AND Sedikit     -- both raise a card
--   pest        Banyak only            -- Sedikit raises nothing
--   disease     Banyak only            -- Sedikit raises nothing
--   warna_daun  5 only                 -- a 4, Yellowish, raises nothing
--
-- Disease was on no test at all when this file was written, and the board
-- did not even read the column -- which was the whole answer: 76 readings
-- of Banyak and 40 of Sedikit, 116 of the 142 ever taken, walked to and
-- tapped in and shown to nobody, while rats and pests were genuinely
-- Tidak Ada everywhere. It raises a card on Banyak now. Sedikit as well
-- would be 116 plots, which is the whole nursery and so a board nobody
-- reads, so that one is still a decision for the office rather than a
-- fault.
--
-- This counts every value that has ever been stored in the four, so a
-- reading that is not clean cannot hide behind a test it falls short of.
-- It changes nothing and is safe to run as often as you like.
--
-- WHAT A GOOD RESULT LOOKS LIKE, and what each answer means
--
-- Section 1 is the count, over ALL history:
--
--   readings            every plot condition row with a date on it
--   declined            a culling plot the auditor was not asked to audit.
--                       The form stamps No Audit Required into all four,
--                       which is not a reading of anything, so these are
--                       out of the count below rather than reading as four
--                       faults at once. The first version of this file had
--                       them as the worst rows on the page.
--   not clean on any    rows where at least one of the four is worse than
--                       the best answer. NOUGHT MEANS EVERY READING EVER
--                       TAKEN IS PERFECT ON ALL FOUR, which is the answer
--                       to look at hardest: 142 identical readings is
--                       either a very healthy nursery or a form being
--                       tapped through, and nothing in the data can tell
--                       those apart. Above nought and section 2 says what.
--   flagged by a test   how many of those the board actually raises
--   not clean, not      the gap. EVERY ONE OF THESE IS A READING AN
--   flagged             AUDITOR TOOK AND THE OFFICE HAS NEVER SEEN.
--
-- Section 2 is every distinct value stored in each of the four columns,
-- with what the board does about it. A value marked IGNORED with a count
-- above nought is the second cause, named.
--
-- Section 3 names each reading that is not clean, worst first, so one can
-- be walked back to the plot and the batch it came from.

WITH rows_all AS (
  SELECT a.plot, a.batch, a.nursery, a.pest, a.tikus, a.warna_daun, a.disease,
         a.date
  FROM   audit_plot_audits a
  WHERE  a.date IS NOT NULL
),
graded AS (
  SELECT r.*,
         CASE WHEN COALESCE(r.pest, '') LIKE 'No Audit Required%'
                THEN 1 ELSE 0 END AS declined,
         CASE WHEN COALESCE(r.pest, '') LIKE 'No Audit Required%' THEN 0 ELSE
           CASE WHEN COALESCE(r.tikus,   'Tidak Ada') <> 'Tidak Ada' THEN 1 ELSE 0 END
         + CASE WHEN COALESCE(r.pest,    'Tidak Ada') <> 'Tidak Ada' THEN 1 ELSE 0 END
         + CASE WHEN COALESCE(r.disease, 'Tidak Ada') <> 'Tidak Ada' THEN 1 ELSE 0 END
         + CASE WHEN COALESCE(r.warna_daun, '1')      <> '1'         THEN 1 ELSE 0 END
         END AS dirty,
         CASE WHEN r.tikus IN ('Banyak', 'Sedikit')
                OR r.pest = 'Banyak'
                OR r.disease = 'Banyak'
                OR r.warna_daun = '5' THEN 1 ELSE 0 END AS flag
  FROM   rows_all r
),
census AS (
  SELECT 'tikus'      AS col, COALESCE(tikus,      'NULL') AS val, count(*)::INT AS n FROM rows_all GROUP BY 1, 2
  UNION ALL
  SELECT 'pest',            COALESCE(pest,       'NULL'), count(*)::INT FROM rows_all GROUP BY 1, 2
  UNION ALL
  SELECT 'disease',         COALESCE(disease,    'NULL'), count(*)::INT FROM rows_all GROUP BY 1, 2
  UNION ALL
  SELECT 'warna_daun',      COALESCE(warna_daun, 'NULL'), count(*)::INT FROM rows_all GROUP BY 1, 2
)
SELECT 1 AS ord, 'COUNT' AS section, 'readings' AS label,
       (SELECT count(*) FROM rows_all)::INT AS n,
       'every plot condition row with a date on it' AS note
UNION ALL
SELECT 1, 'COUNT', 'not clean on any of the four',
       (SELECT count(*) FROM graded WHERE dirty > 0)::INT,
       'nought means every reading ever taken is perfect on all four'
UNION ALL
SELECT 1, 'COUNT', 'declined, no audit required',
       (SELECT count(*) FROM graded WHERE declined = 1)::INT,
       'a culling plot nobody was asked to audit, which is not a reading'
UNION ALL
SELECT 1, 'COUNT', 'flagged by a test',
       (SELECT count(*) FROM graded WHERE flag = 1)::INT,
       'how many of them the board actually raises a card for'
UNION ALL
SELECT 1, 'COUNT', 'not clean, not flagged',
       (SELECT count(*) FROM graded WHERE dirty > 0 AND flag = 0)::INT,
       'a reading an auditor took that the office has never seen'
UNION ALL
SELECT 2, 'VALUES', c.col || ' = ' || c.val, c.n,
       CASE WHEN c.col = 'tikus'      AND c.val IN ('Banyak', 'Sedikit') THEN 'raises a card'
            WHEN c.col = 'pest'       AND c.val = 'Banyak'               THEN 'raises a card'
            WHEN c.col = 'disease'    AND c.val = 'Banyak'               THEN 'raises a card'
            WHEN c.col = 'warna_daun' AND c.val = '5'                    THEN 'raises a card'
            WHEN c.val LIKE 'No Audit Required%'                         THEN 'declined audit, not a reading'
            WHEN c.col = 'disease'    AND c.val <> 'Tidak Ada'           THEN 'IGNORED -- disease flags Banyak only'
            WHEN c.col = 'tikus'      AND c.val <> 'Tidak Ada'           THEN 'IGNORED'
            WHEN c.col = 'pest'       AND c.val <> 'Tidak Ada'           THEN 'IGNORED -- pest flags Banyak only'
            WHEN c.col = 'warna_daun' AND c.val <> '1'                   THEN 'IGNORED -- warna flags 5 only'
            ELSE 'clean' END
FROM   census c
UNION ALL
SELECT 3, 'NOT CLEAN', COALESCE(g.nursery, 'no nursery') || ' ' || COALESCE(g.plot, '?')
         || COALESCE(' b' || g.batch, ''), g.dirty,
       'tikus ' || COALESCE(g.tikus, 'NULL')
         || ', pest ' || COALESCE(g.pest, 'NULL')
         || ', disease ' || COALESCE(g.disease, 'NULL')
         || ', warna ' || COALESCE(g.warna_daun, 'NULL')
         || ' on ' || g.date::TEXT
         || CASE WHEN g.flag = 1 THEN ' -- on the board' ELSE ' -- NOT on the board' END
FROM   graded g
WHERE  g.dirty > 0
ORDER  BY 1, 4 DESC, 2, 3;
