-- Transplant Record 2025: the Life of Plot page against the office Excel sheet.
--
-- The page reads the batch report: every Transplanted row, on the day in its
-- remark (Date:), else its transaction_date, else the day it was saved, plus an
-- approved Transplanting stock calibration, which lands in the month of that
-- batch first transplant on the plot. Replant plots (-R) are left out.
-- The sheet figures below are copied from the tab Transplant Record 2025.
--
-- What to look for:
--   section 1  each month, the sheet total against the page total
--   section 2  from March on, in a month whose totals differ, every plot where the two differ, with the batches the
--              page counted (batch, day, quantity) and the other 2025 months the
--              page has for that plot. A plot whose figure sits one month over
--              is a transplant dated differently in the batch report. A plot the
--              page has nothing for is a transplant never keyed in the batch
--              report. A small gap is an approved calibration.
-- January and February are in section 1 only: the page has nothing for them,
-- the batch report holding no transplant dated before March 2025.
-- No rows in section 2 means the page and the sheet agree on every plot.
WITH sheet(plot, ym, qty) AS (VALUES
    ('B1','2025-03',1734),
    ('B1','2025-09',612),
    ('B1','2025-12',1740),
    ('B2','2025-04',3125),
    ('B3','2025-02',5269),
    ('B3','2025-11',5200),
    ('B4','2025-03',3253),
    ('B5','2025-07',6578),
    ('B6','2025-01',7408),
    ('B6','2025-10',6590),
    ('B7','2025-05',3018),
    ('B8','2025-03',4893),
    ('B8','2025-04',260),
    ('B8','2025-05',140),
    ('B9','2025-07',2654),
    ('B10','2025-07',6983),
    ('B11','2025-05',12121),
    ('B12','2025-05',2398),
    ('B13','2025-07',3661),
    ('B14','2025-08',3483),
    ('B14','2025-09',53),
    ('U1','2025-06',2080),
    ('U2','2025-03',8563),
    ('U2','2025-06',598),
    ('U3','2025-05',6429),
    ('U4','2025-01',4323),
    ('U4','2025-12',3913),
    ('U5','2025-10',3476),
    ('U6','2025-02',7937),
    ('U7','2025-03',6385),
    ('U8','2025-02',2711),
    ('U8','2025-08',3954),
    ('U9','2025-07',3920),
    ('U10','2025-04',3642),
    ('U11','2025-08',6150),
    ('U12','2025-09',5333),
    ('U13','2025-08',5931),
    ('U14','2025-10',5957),
    ('U15','2025-11',5269),
    ('U16','2025-07',418),
    ('U16','2025-08',2480),
    ('U17','2025-01',6611),
    ('U18','2025-04',7794),
    ('N1','2025-05',5844),
    ('N2','2025-06',5634),
    ('N3','2025-03',447),
    ('N3','2025-12',6362),
    ('N4','2025-10',5896),
    ('N5','2025-07',4624),
    ('N6','2025-07',4876),
    ('N7','2025-01',7491),
    ('N8','2025-11',7077),
    ('N9','2025-08',5692),
    ('N10','2025-08',5324),
    ('N11','2025-02',1691),
    ('N11','2025-10',3056),
    ('N12','2025-01',3855),
    ('N14','2025-02',5246),
    ('N15','2025-02',3804),
    ('N16','2025-01',5767),
    ('N17','2025-03',4810),
    ('N18','2025-03',2498),
    ('N19','2025-03',6517),
    ('N20','2025-03',2461)
),
k AS (
  SELECT l.*,
         translate(upper(coalesce(l.plot_name, '')), ' -_.()/', '') AS k0,
         CASE WHEN position('Date:' in coalesce(l.remark, '')) > 0
              THEN left(ltrim(substring(l.remark from position('Date:' in l.remark) + 5 for 15)), 10) END AS rdate
  FROM shared_inventory_logs l
  WHERE (l.transaction_type = 'Transplanted'
         OR (l.transaction_type = 'Stock_Calibration' AND l.remark ILIKE 'Report:%Transplanting%' AND l.remark ILIKE '%APPROVED%'))
    AND upper(coalesce(l.plot_name, '')) NOT LIKE '%-R%'
),
k2 AS (
  SELECT k.*,
         CASE WHEN k0 LIKE '_0%' THEN left(k0, 1) || ltrim(substr(k0, 2), '0') ELSE k0 END AS pk,
         CASE WHEN rdate LIKE '____-__-__' THEN rdate
              WHEN transaction_date IS NOT NULL THEN left(transaction_date::text, 10)
              ELSE left(created_at::text, 10) END AS day
  FROM k
),
tr AS (SELECT pk, batch_name, day, quantity_change::numeric AS q FROM k2 WHERE transaction_type = 'Transplanted'),
first_day AS (SELECT pk, batch_name, min(day) AS d FROM tr GROUP BY 1, 2),
cal AS (
  SELECT c.pk, c.batch_name, f.d AS day, sum(c.quantity_change)::numeric AS q
  FROM k2 c JOIN first_day f ON f.pk = c.pk AND f.batch_name = c.batch_name
  WHERE c.transaction_type = 'Stock_Calibration'
  GROUP BY 1, 2, 3
),
moves AS (
  SELECT pk, batch_name, day, q, 'transplant' AS what FROM tr
  UNION ALL SELECT pk, batch_name, day, q, 'calibration' FROM cal
),
sys AS (
  SELECT pk AS plot, left(day, 7) AS ym, sum(q) AS qty,
         string_agg(coalesce(batch_name, '?') || ' ' || what || ' ' || day || ' ' || q::bigint, '; ' ORDER BY day, batch_name) AS detail
  FROM moves WHERE day LIKE '2025-%' GROUP BY 1, 2
),
both_ AS (
  SELECT coalesce(s.plot, y.plot) AS plot, coalesce(s.ym, y.ym) AS ym,
         coalesce(s.qty, 0) AS sheet, coalesce(y.qty, 0) AS page, y.detail
  FROM sheet s FULL JOIN sys y ON y.plot = s.plot AND y.ym = s.ym
),
other_months AS (SELECT plot, string_agg(ym || ' ' || qty::bigint, ', ' ORDER BY ym) AS months FROM sys GROUP BY 1)
SELECT section, month, plot, sheet, page, difference, detail FROM (
  SELECT 1 AS sec, '1 month total' AS section, ym AS month, '' AS plot,
         sum(sheet)::bigint AS sheet, sum(page)::bigint AS page, (sum(page) - sum(sheet))::bigint AS difference,
         CASE WHEN sum(page) = sum(sheet) THEN 'agrees' ELSE 'DIFFERS' END AS detail
  FROM both_ GROUP BY ym
  UNION ALL
  SELECT 2, '2 plot', b.ym, b.plot, b.sheet::bigint, b.page::bigint, (b.page - b.sheet)::bigint,
         'page counted: ' || coalesce(b.detail, 'nothing') || ' | page 2025 for this plot: ' || coalesce(o.months, 'nothing')
  FROM both_ b LEFT JOIN other_months o ON o.plot = b.plot
  WHERE b.page <> b.sheet AND b.ym >= '2025-03'
    AND b.ym IN (SELECT ym FROM both_ GROUP BY ym HAVING sum(page) <> sum(sheet))
) x
ORDER BY sec, month, plot;
