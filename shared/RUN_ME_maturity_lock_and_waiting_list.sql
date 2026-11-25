-- MONTHLY MATURITY ALLOCATION: THE ROW LOCK, AND THE WAITING LIST AND PO
--
-- Two things for Seedling Sales Control, Stock Allocation:
--   1. Three columns on shared_plot_allocations (locked, locked_by,
--      locked_at). A locked row keeps its customer reservation: nothing is
--      moved off it, removed from it or dropped on it until it is unlocked.
--      Every row reads unlocked until somebody presses Lock.
--   2. A new table, shared_stock_waiting_list, for demand with no AL yet:
--      the day, the customer, the PO, the breed, the quantity, the month
--      it is wanted in, a remark, and a status (waiting, contacted,
--      confirmed, cancelled). Read and written by the same office staff test as
--      shared_plot_allocations (_mjm_ops_staff).
--
-- Nothing already stored is changed. Safe to run twice.
--
-- WHAT A GOOD RESULT LOOKS LIKE (one table, read top to bottom):
--   1  lock columns on shared_plot_allocations   3 of 3
--   2  rows locked                               0 the first time
--   3  waiting list table                        yes
--   4  waiting list row security                 on, 1 policy
--   5  waiting list records                      0 the first time

ALTER TABLE public.shared_plot_allocations ADD COLUMN IF NOT EXISTS locked    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.shared_plot_allocations ADD COLUMN IF NOT EXISTS locked_by TEXT;
ALTER TABLE public.shared_plot_allocations ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.shared_stock_waiting_list (
  id            BIGSERIAL PRIMARY KEY,
  entry_date    DATE,
  customer_name TEXT NOT NULL,
  po_number     TEXT,
  breed         TEXT,
  qty           INTEGER NOT NULL CHECK (qty > 0),
  wanted_month  TEXT,
  remark        TEXT,
  status        TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'contacted', 'confirmed', 'cancelled')),
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shared_stock_waiting_list_month ON public.shared_stock_waiting_list (wanted_month, status);

ALTER TABLE public.shared_stock_waiting_list ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Office staff full access" ON public.shared_stock_waiting_list;
CREATE POLICY "Office staff full access" ON public.shared_stock_waiting_list
  FOR ALL USING ((SELECT public._mjm_ops_staff())) WITH CHECK ((SELECT public._mjm_ops_staff()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_stock_waiting_list TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.shared_stock_waiting_list_id_seq TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT 1 AS n, 'lock columns on shared_plot_allocations' AS what,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'shared_plot_allocations'
           AND column_name IN ('locked', 'locked_by', 'locked_at'))::TEXT || ' of 3' AS detail
UNION ALL
SELECT 2, 'rows locked', (SELECT count(*) FROM public.shared_plot_allocations WHERE locked)::TEXT
UNION ALL
SELECT 3, 'waiting list table', CASE WHEN to_regclass('public.shared_stock_waiting_list') IS NOT NULL THEN 'yes' ELSE 'NO' END
UNION ALL
SELECT 4, 'waiting list row security',
       CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.shared_stock_waiting_list'::regclass) THEN 'on' ELSE 'OFF' END
       || ', ' || (SELECT count(*) FROM pg_policies WHERE tablename = 'shared_stock_waiting_list')::TEXT || ' policy'
UNION ALL
SELECT 5, 'waiting list records', (SELECT count(*) FROM public.shared_stock_waiting_list)::TEXT
ORDER BY 1;
