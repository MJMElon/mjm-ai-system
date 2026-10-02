-- ════════════════════════════════════════════════════════════════════════
-- WHY IS THIS PAYROLL MONTH STILL OPEN
--
-- A month closes by itself on the lock day of the FOLLOWING month, unless
-- somebody has clicked it on the Lock Controls calendar. This says which of
-- those is in force for every month the calendar knows about, plus the one
-- on screen.
--
-- Read the "reading" column:
--   held open by hand        somebody clicked it open; the date does not
--                            apply and it stays open until clicked again
--   shut by hand             clicked shut early
--   auto - locked            nobody has touched it and its day has passed
--   auto - still open        nobody has touched it and its day has not
--
-- The lock day is the SECOND block: the default is the 2nd of the following
-- month, and a row there moves it from that point onward.
--
-- Reads only. Changes nothing.
-- ════════════════════════════════════════════════════════════════════════
WITH day_in_force AS (
  SELECT y.year, m.month,
         coalesce((SELECT d.lock_day FROM mjmnpayroll_lock_days d
                   WHERE (d.effective_year * 12 + d.effective_month) <= (y.year * 12 + m.month)
                   ORDER BY d.effective_year DESC, d.effective_month DESC
                   LIMIT 1), 2) AS lock_day
  FROM (SELECT generate_series(2025, 2027) AS year) y
  CROSS JOIN (SELECT generate_series(1, 12) AS month) m
)
SELECT to_char(make_date(f.year, f.month, 1), 'Mon YYYY') AS payroll_month,
       f.lock_day                                          AS locks_on_day,
       to_char(make_date(f.year, f.month, 1) + interval '1 month'
               + ((f.lock_day - 1) * interval '1 day'), 'DD Mon YYYY') AS auto_lock_date,
       CASE WHEN l.manual_override IS TRUE  THEN 'shut by hand'
            WHEN l.manual_override IS FALSE THEN 'held open by hand'
            WHEN now() >= (make_date(f.year, f.month, 1) + interval '1 month'
                           + ((f.lock_day - 1) * interval '1 day'))
                 THEN 'auto - locked'
            ELSE 'auto - still open' END                   AS reading,
       coalesce(l.updated_by, '')                          AS set_by,
       coalesce(to_char(l.updated_at, 'DD Mon YYYY'), '')  AS set_on,
       (SELECT count(*) FROM mjmnpayroll_verifications v
        WHERE v.month = to_char(make_date(f.year, f.month, 1), 'YYYY-MM')) AS sheets_verified
FROM   day_in_force f
LEFT   JOIN mjmnpayroll_month_locks l ON l.year = f.year AND l.month = f.month
WHERE  l.id IS NOT NULL
   OR  make_date(f.year, f.month, 1)
         BETWEEN (date_trunc('month', now())::date - interval '3 months')
             AND  date_trunc('month', now())::date
ORDER  BY f.year, f.month;
