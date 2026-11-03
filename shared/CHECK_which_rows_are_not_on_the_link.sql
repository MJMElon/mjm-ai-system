-- WHICH WORK ROWS CARRY A STORED QUANTITY, AND WHO PUT IT THERE
--
-- The office opened an October record, read "your 2,353 overrides it", and
-- asked whether it was last month. It was not: October rows are built fresh
-- by the schedule sync, and a figure keyed into September cannot ride into
-- October. But the screen could not say WHOSE the figure was, and opening
-- rows one at a time to find out is the wrong shape of answer.
--
-- So this names every row of every month whose quantity is NOT the live link,
-- and which of the three put it there:
--
--   keyed by hand  -- somebody typed it, and it stands
--   from the field -- a worker own verified record filled the empty cell
--   saved earlier  -- stored before either mark existed, so nothing knows
--
-- A row with no stored quantity is on the link and is not listed.
--
-- WHAT A GOOD RESULT LOOKS LIKE: row 1 counts the whole list. Under it, the
-- rows that are not live, newest month first. A month you expected to be
-- fresh and which shows a run of "from the field" rows is the field doing its
-- job: those figures are a worker own count. A run of "saved earlier" in a
-- recent month is the one worth opening, because nothing recorded who keyed
-- it. Press Use the linked amount on any row that should be live again.
--
-- Read-only. It creates nothing and changes nothing.

WITH every_row AS (
  SELECT r
  FROM nops_maint_records m
  CROSS JOIN LATERAL jsonb_array_elements(m.records) AS r
  WHERE m.id = 1
),
flagged AS (
  SELECT
    COALESCE(r ->> '_month', 'no month') AS mth,
    COALESCE(r ->> 'plot', '?')          AS plot,
    COALESCE(r ->> 'jenis', '?')         AS jenis,
    COALESCE(r ->> 'racun', '')          AS racun,
    COALESCE(r ->> 'tarikh', '-')        AS tarikh,
    COALESCE(r ->> 'batch', '')          AS batch,
    (r ->> 'qty')                        AS qty,
    CASE
      WHEN COALESCE(r ->> '_qtyByHand', '') <> ''    THEN 'keyed by hand'
      WHEN COALESCE(r ->> '_fromFieldQty', '') <> '' THEN 'from the field'
      ELSE 'saved earlier'
    END AS whose
  FROM every_row
  WHERE COALESCE(r ->> 'qty', '') <> ''
),
-- A month is stored as "Oct 2026", which sorts alphabetically and so would
-- put September above October. Turned into a real date it sorts the way a
-- reader expects. A row with no month at all sorts last rather than failing
-- the whole paste.
dated AS (
  SELECT f.*,
         CASE WHEN f.mth = 'no month' THEN DATE '1900-01-01'
              ELSE to_date(f.mth, 'Mon YYYY') END AS mkey
  FROM flagged f
)
SELECT 0 AS block, DATE '9999-12-31' AS month_key, '' AS plot_key,
       'ALL MONTHS' AS month_on_the_row,
       'rows carrying a stored quantity: ' || COUNT(*)::text
         || '  (keyed by hand ' || COUNT(*) FILTER (WHERE whose = 'keyed by hand')::text
         || ', from the field ' || COUNT(*) FILTER (WHERE whose = 'from the field')::text
         || ', saved earlier ' || COUNT(*) FILTER (WHERE whose = 'saved earlier')::text
         || ')' AS plot_and_job,
       '' AS stored_quantity,
       '' AS put_there_by
FROM dated
UNION ALL
SELECT 1, mkey, plot,
       mth,
       plot || '  ' || jenis
            || CASE WHEN racun = '' THEN '' ELSE '  --  ' || racun END
            || CASE WHEN batch = '' THEN '' ELSE '  --  batch ' || batch END
            || '  --  ' || tarikh,
       qty,
       whose
FROM dated
ORDER BY block, month_key DESC, plot_key, plot_and_job;
