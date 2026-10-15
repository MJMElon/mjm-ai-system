-- ============================================================================
-- CHECK_where_seals_are_keyed.sql
--
-- Every seal number on ONE AL, from both places a seal is keyed. Reads only.
--
--   CONSENT RANGE   keyed on the phone Consent page when the consent is
--                   signed (start and end scanned), stored on
--                   mobile_consent_records.seal_ranges. Only consents saved
--                   since the seal page went live on 12 Oct 2026 have one.
--   COLLECTION SCAN scanned seal by seal at collection in the FC Portal,
--                   one row each in fcportal_scan_records.
--
-- Change the AL number in BOTH places it appears, then run. A collection
-- scan is identified by its consent_id and seal together.
-- ============================================================================

SELECT 'CONSENT RANGE'                 AS keyed_where,
       'mobile_consent_records'        AS table_name,
       c.id::TEXT                      AS consent_id,
       c.seal_ranges::TEXT             AS seal,
       c.created_at                    AS keyed_at
  FROM public.mobile_consent_records c
 WHERE c.al_number = 'AL-EDIT-ME'
   AND c.seal_ranges IS NOT NULL
UNION ALL
SELECT 'COLLECTION SCAN',
       'fcportal_scan_records',
       s.consent_id::TEXT,
       s.barcode,
       s.scanned_at
  FROM public.fcportal_scan_records s
 WHERE s.al_number = 'AL-EDIT-ME'
 ORDER BY 1, 5;
