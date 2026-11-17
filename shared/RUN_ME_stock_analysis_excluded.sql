-- ============================================================================
-- RUN_ME_stock_analysis_excluded.sql
--
-- Seedling Sales Control, Inventory Map, Stock Analysis Dashboard.
-- Pressing Actual Order lists every order still owed, each with a tick.
-- Unticking an order (an overdue customer the office no longer expects)
-- takes it out of Actual Order, the gap and the collection forecast, for
-- every login. This is the table that remembers which orders are unticked.
--
-- One row per unticked order, keyed on the order number with everything
-- but letters and digits taken out, upper case (the key Customer Order
-- Management matches orders on). Ticking it again deletes the row.
-- Nothing about the order itself is read or changed here.
--
-- Safe to run twice: everything is IF NOT EXISTS, and the policies are
-- dropped by name and made again.
--
-- WHAT A GOOD RESULT LOOKS LIKE -- four rows:
--   1  the table ............................ present -- OK
--   2  policies on it ....................... 2 -- OK
--   3  row level security .................. on -- OK
--   4  orders unticked just now ............ a number, 0 on the first run
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.operation_stock_analysis_excluded (
  order_key      TEXT PRIMARY KEY,
  order_number   TEXT,
  customer_name  TEXT,
  excluded_by    TEXT,
  excluded_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.operation_stock_analysis_excluded ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read stock analysis excluded" ON public.operation_stock_analysis_excluded;
DROP POLICY IF EXISTS "Authenticated write stock analysis excluded" ON public.operation_stock_analysis_excluded;
CREATE POLICY "Authenticated read stock analysis excluded" ON public.operation_stock_analysis_excluded
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write stock analysis excluded" ON public.operation_stock_analysis_excluded
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.operation_stock_analysis_excluded TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT 1 AS n, 'the table' AS what,
       CASE WHEN to_regclass('public.operation_stock_analysis_excluded') IS NOT NULL
            THEN 'present -- OK' ELSE 'MISSING -- NOT OK' END AS result
UNION ALL
SELECT 2, 'policies on it',
       (SELECT count(*) FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'operation_stock_analysis_excluded')::text
       || CASE WHEN (SELECT count(*) FROM pg_policies
                      WHERE schemaname = 'public' AND tablename = 'operation_stock_analysis_excluded') >= 2
               THEN ' -- OK' ELSE ' -- NOT OK' END
UNION ALL
SELECT 3, 'row level security',
       CASE WHEN (SELECT relrowsecurity FROM pg_class
                   WHERE oid = 'public.operation_stock_analysis_excluded'::regclass)
            THEN 'on -- OK' ELSE 'off -- NOT OK' END
UNION ALL
SELECT 4, 'orders unticked just now',
       (SELECT count(*) FROM public.operation_stock_analysis_excluded)::text
ORDER BY 1;
