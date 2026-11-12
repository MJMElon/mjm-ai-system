-- ================================================================
-- A seal typed on the FC Portal Add dialog is marked as typed.
--
-- fcportal_scan_records carried no way to tell a seal the camera read
-- from one somebody keyed by hand, so Seal Manage could not show the
-- two apart. keyed_by_hand is that mark. The FC Portal writes it TRUE
-- for a typed seal and sends nothing for a scanned one, so every row
-- already in the table, and every scan, reads FALSE.
--
-- Nothing is backfilled. Seals keyed before this ran carry no mark and
-- show as scanned, because nothing recorded which they were.
--
-- Safe to run twice.
--
-- WHAT A GOOD RESULT LOOKS LIKE: one row, column_installed = true,
-- and typed_rows = 0 on the first run (it climbs as seals are keyed).
-- ================================================================
ALTER TABLE public.fcportal_scan_records
  ADD COLUMN IF NOT EXISTS keyed_by_hand BOOLEAN NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';

SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'fcportal_scan_records'
             AND column_name = 'keyed_by_hand') AS column_installed,
  (SELECT count(*) FROM public.fcportal_scan_records) AS all_rows,
  (SELECT count(*) FROM public.fcportal_scan_records WHERE keyed_by_hand) AS typed_rows;
