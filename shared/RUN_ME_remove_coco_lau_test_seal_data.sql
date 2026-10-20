-- Removes a test consent and its scan records that are now blocking real
-- seal scans. "Coco Lau (Testing, ignore me)" is production data somebody
-- keyed in to try out the seal scanner, not a real customer order -- but
-- the seals counted under it are now refused on every real order a
-- conductor tries to scan them onto, because the scanner correctly treats
-- a seal counted once as spoken for (see "Seal 035190 belongs to Coco Lau
-- ... -- not counted").
--
-- Safe to run twice: both DELETEs match on the exact test label, so a
-- second run finds the row already gone and deletes nothing -- the check
-- below says so plainly rather than returning no rows.
--
-- mobile_consent_records carries its own seal_drop_consent trigger
-- (AFTER DELETE), which clears seal_allocations for the consent on its
-- own -- this file does not touch that table directly.
WITH test_consents AS (
  SELECT id::text AS consent_id
    FROM public.mobile_consent_records
   WHERE customer_name = 'Coco Lau (Testing, ignore me)'
     AND al_number = 'ABWST0'
),
deleted_scans AS (
  DELETE FROM public.fcportal_scan_records
   WHERE consent_id IN (SELECT consent_id FROM test_consents)
  RETURNING barcode
),
deleted_consents AS (
  DELETE FROM public.mobile_consent_records
   WHERE id::text IN (SELECT consent_id FROM test_consents)
  RETURNING id
)
SELECT 'deleted scan record ' || barcode AS result FROM deleted_scans
UNION ALL
SELECT 'deleted the test consent -- OK' AS result FROM deleted_consents
UNION ALL
SELECT 'nothing matched -- the test consent is already gone, which is also OK' AS result
 WHERE NOT EXISTS (SELECT 1 FROM deleted_consents);
