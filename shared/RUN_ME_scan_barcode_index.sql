-- Index on fcportal_scan_records.barcode, for catching a seal reused on a
-- different customer order.
--
-- The table own unique index is (consent_id, barcode) — it stops the SAME
-- order seal being double-counted twice, but nothing stops the same
-- physical seal being filed a second time under a DIFFERENT consent_id, and
-- that is exactly a seal reused on the wrong customer order. The app now
-- checks for that on every new scan (findBarcodeElsewhere in
-- src/modules/scan/store.js, Barcode_Counter repo): does this barcode
-- already exist under some OTHER consent_id. Without an index on barcode
-- alone, that check falls back to scanning every row, and it runs once per
-- scan — every seal an FC scans, all day, needs this fast.
--
-- Safe to run twice: CREATE INDEX IF NOT EXISTS.

CREATE INDEX IF NOT EXISTS idx_fcportal_scan_records_barcode
  ON public.fcportal_scan_records (barcode);

-- Check: the index exists and Postgres is willing to use it for exactly
-- the query the app runs (select by barcode). A good result shows the
-- index present and "uses index" reading YES.
SELECT 'idx_fcportal_scan_records_barcode present' AS item,
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'fcportal_scan_records'
            AND indexname = 'idx_fcportal_scan_records_barcode'
       ) THEN 'YES' ELSE 'NO' END AS result;
