-- WAITING LIST AND PO: FOUR STATUSES
--
-- Seedling Sales Control, Stock Allocation, Waiting List and PO. The office
-- asked for four statuses, in this order: Waiting, Contacted, Confirmed,
-- Cancelled. The table allowed waiting, allocated and cancelled.
--
-- What this does:
--   1. drops the old status rule and puts the four-status one in its place
--   2. moves any record saved as allocated to confirmed, which is what it
--      meant: the customer is settled
-- Nothing else is changed and no record is deleted. Safe to run twice.
--
-- WHAT A GOOD RESULT LOOKS LIKE (one table, read top to bottom):
--   1  status rule                   waiting, contacted, confirmed, cancelled
--   2  records still on allocated    0
--   3..6  one line per status with how many records carry it

ALTER TABLE public.shared_stock_waiting_list DROP CONSTRAINT IF EXISTS shared_stock_waiting_list_status_check;

UPDATE public.shared_stock_waiting_list SET status = 'confirmed' WHERE status = 'allocated';

ALTER TABLE public.shared_stock_waiting_list
  ADD CONSTRAINT shared_stock_waiting_list_status_check
  CHECK (status IN ('waiting', 'contacted', 'confirmed', 'cancelled'));

NOTIFY pgrst, 'reload schema';

SELECT 1 AS n, 'status rule' AS what,
       CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
                          WHERE conname = 'shared_stock_waiting_list_status_check'
                            AND position('contacted' IN pg_get_constraintdef(oid)) > 0
                            AND position('allocated' IN pg_get_constraintdef(oid)) = 0)
            THEN 'waiting, contacted, confirmed, cancelled' ELSE 'NOT SET' END AS detail
UNION ALL
SELECT 2, 'records still on allocated', (SELECT count(*) FROM public.shared_stock_waiting_list WHERE status = 'allocated')::TEXT
UNION ALL
SELECT 3, 'waiting',   (SELECT count(*) FROM public.shared_stock_waiting_list WHERE status = 'waiting')::TEXT
UNION ALL
SELECT 4, 'contacted', (SELECT count(*) FROM public.shared_stock_waiting_list WHERE status = 'contacted')::TEXT
UNION ALL
SELECT 5, 'confirmed', (SELECT count(*) FROM public.shared_stock_waiting_list WHERE status = 'confirmed')::TEXT
UNION ALL
SELECT 6, 'cancelled', (SELECT count(*) FROM public.shared_stock_waiting_list WHERE status = 'cancelled')::TEXT
ORDER BY 1;
