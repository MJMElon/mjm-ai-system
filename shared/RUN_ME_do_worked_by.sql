-- Who loaded a collection trip, and a lock on that answer once set.
--
-- A DO record has never carried who collected it. The office asked for a
-- picker on the phone after signing (skippable, reachable again from the
-- DO list afterward) and for that answer to lock once saved, admin-only to
-- change from then on.
--
-- worked_by_by_nursery is JSONB rather than a single list because a DO
-- items can span more than one nursery (plot_1..plot_5 each carry their own
-- nursery) and the piece-rate money has to split by nursery, not by trip -
-- { "BNN": ["Name One","Name Two"], "UNN2": ["Name Three"] }. The lock is
-- two real columns (who, when) rather than a tag inside remark - remark on
-- this table already carries the customer name from the Mobile save path,
-- and a second table on this project already shows what a remark tag
-- shared with other meanings costs to parse back out.
--
-- Safe to run twice.

ALTER TABLE shared_do_records
  ADD COLUMN IF NOT EXISTS worked_by_by_nursery JSONB,
  ADD COLUMN IF NOT EXISTS worked_by_locked_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS worked_by_locked_by  TEXT;

NOTIFY pgrst, 'reload schema';

-- Check: the three columns exist, with the right types, and todays row
-- count is undisturbed (adding a column never drops a row). A good result
-- shows exactly 3 rows below, types jsonb / timestamp with time zone / text.
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_name = 'shared_do_records'
   AND column_name IN ('worked_by_by_nursery', 'worked_by_locked_at', 'worked_by_locked_by')
 ORDER BY column_name;
