-- IS THE MONTHLY AUDIT REPORT SHOWING WHAT THE AUDITORS SAVED
--
-- The report reads the auditor tables themselves -- there is no second
-- copy and no sync, so a record saved on a phone is on the report as soon
-- as it reaches the database. What it then does is CUT, twice, and both
-- cuts are silent:
--
--   the DATE must fall inside the month picked, and
--   the NURSERY must be exactly PN, BNN, UNN1 or UNN2, letter for letter.
--
-- A row that fails either is in the table and on no report, with nothing
-- anywhere saying so. This counts them. It changes nothing and is safe to
-- run as often as you like.
--
-- WHAT A GOOD RESULT LOOKS LIKE, and what each answer means
--
-- Section 1 is one line per module for THIS calendar month:
--
--   saved this month   rows the auditors put in the table
--   on the report      how many of those the report counts and draws
--   NOT on the report  the gap. NOUGHT ON EVERY LINE IS THE ANSWER YOU
--                      WANT -- it means the report and the table agree
--                      record for record, which is the question being
--                      asked. Anything above nought is named in section 2.
--
-- Section 2 names every row the report leaves out and says which cut did
-- it. Empty is correct.
--
-- Section 3 splits the maintenance records by WHO DID THEM -- an auditor
-- who walked the plot, or an admin who closed a cold task off the to-do
-- board. Both are real rows in the same table, which is why the report now
-- has a Done By filter, and this is the size of each.
--
-- Section 4 is that same split month by month over the whole history, so
-- the filter can be judged on any month and not only this one.

WITH month AS (
  SELECT date_trunc('month', CURRENT_DATE)::date                           AS d1,
         (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month -1 day')::date AS d2
),
every_row AS (
  SELECT 'Plot Condition' AS modu, a.nursery, a.plot, a.date,
         a.auditor_name, NULL::TEXT AS result
  FROM   audit_plot_audits a
  UNION ALL
  SELECT 'Seedling Height', h.nursery, h.plot, h.date, h.auditor_name, NULL
  FROM   audit_height_records h
  UNION ALL
  SELECT 'Papan Tanda', p.nursery, p.plot, p.date, p.auditor_name, NULL
  FROM   audit_papan_audits p
  UNION ALL
  SELECT 'Maintenance', m.nursery, m.plot, m.date, m.auditor_name, m.result
  FROM   audit_maintenance_audits m
),
this_month AS (
  SELECT e.*
  FROM   every_row e, month mo
  WHERE  e.date IS NOT NULL AND e.date >= mo.d1 AND e.date <= mo.d2
),
judged AS (
  SELECT t.*,
         CASE WHEN COALESCE(t.nursery, '') IN ('PN', 'BNN', 'UNN1', 'UNN2')
              THEN 1 ELSE 0 END AS drawn
  FROM   this_month t
),
undated AS (
  SELECT e.modu, count(*)::INT AS n
  FROM   every_row e
  WHERE  e.date IS NULL
  GROUP  BY e.modu
),
per_mod AS (
  SELECT j.modu,
         count(*)::INT                                  AS saved,
         sum(j.drawn)::INT                              AS drawn,
         (count(*) - sum(j.drawn))::INT                 AS missing
  FROM   judged j
  GROUP  BY j.modu
),
by_who AS (
  SELECT CASE WHEN j.result = 'Closed by admin' THEN 'closed by admin'
              ELSE 'audited by auditor' END AS kind,
         COALESCE(NULLIF(btrim(j.auditor_name), ''), 'no name') AS who,
         count(*)::INT AS n
  FROM   judged j
  WHERE  j.modu = 'Maintenance'
  GROUP  BY 1, 2
),
by_month AS (
  SELECT to_char(e.date, 'YYYY-MM') AS ym,
         count(*)::INT AS total,
         sum(CASE WHEN e.result = 'Closed by admin' THEN 0 ELSE 1 END)::INT AS by_auditor,
         sum(CASE WHEN e.result = 'Closed by admin' THEN 1 ELSE 0 END)::INT AS by_admin
  FROM   every_row e
  WHERE  e.modu = 'Maintenance' AND e.date IS NOT NULL
  GROUP  BY 1
)
SELECT 1 AS ord, 'LINKED' AS section, p.modu AS label,
       p.saved AS n,
       'saved ' || p.saved || ', on the report ' || p.drawn
         || ', NOT on the report ' || p.missing
         || CASE WHEN p.missing = 0 THEN ' -- agrees record for record'
                 ELSE ' -- see section 2' END AS note
FROM   per_mod p
UNION ALL
SELECT 1, 'LINKED', 'the month being counted',
       (SELECT count(*) FROM this_month)::INT,
       (SELECT to_char(d1, 'YYYY-MM-DD') || ' to ' || to_char(d2, 'YYYY-MM-DD') FROM month)
UNION ALL
SELECT 1, 'LINKED', u.modu || ' rows with NO DATE AT ALL', u.n,
       'on no report of any month, whatever is picked'
FROM   undated u
UNION ALL
SELECT 2, 'LEFT OUT', j.modu || ' ' || COALESCE(j.plot, 'no plot'), 1,
       'nursery reads ' || COALESCE(NULLIF(btrim(j.nursery), ''), 'EMPTY')
         || ', which is not one of the four the report draws -- '
         || COALESCE(j.auditor_name, 'nobody named') || ' on ' || j.date::TEXT
FROM   judged j
WHERE  j.drawn = 0
UNION ALL
SELECT 3, 'WHO', w.kind || ' -- ' || w.who, w.n,
       'maintenance records this month'
FROM   by_who w
UNION ALL
SELECT 4, 'BY MONTH', b.ym, b.total,
       'auditor ' || b.by_auditor || ', admin closures ' || b.by_admin
FROM   by_month b
ORDER  BY 1, 2, 4 DESC, 3;
