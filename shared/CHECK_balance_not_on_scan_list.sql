-- ============================================================================
-- CHECK_balance_not_on_scan_list.sql
--
-- Every order with a balance still to collect, and whether the FC Portal
-- scan list can show it. Reads only, changes nothing.
--
-- The scan list is built from SIGNED CONSENTS, not from the AL balance. So
-- the quantity it can scan is what has been consented minus what has gone
-- out on a DO. An order can have a balance on the AL list and nothing left
-- to scan, because the customer has not signed for the rest yet.
--
-- Cancelled DOs are left out, the same way the AL list leaves them out.
--
-- What the verdict means:
--   NEEDS A NEW CONSENT   everything consented has been collected. The
--                         balance only reaches the scan list once the
--                         customer signs a consent for it on Mobile Consent.
--   ON THE SCAN LIST      consent is left to scan. If the FC Portal does not
--                         show it, press Sync on the phone once the fix of
--                         15 Oct 2026 has reached it.
--
-- Sorted with the newest order first.
-- ============================================================================

WITH dos AS (
  SELECT al_number, sum(COALESCE(total_qty, 0)) AS collected
    FROM public.shared_do_records
   WHERE COALESCE(status, '') <> 'Cancelled'
     AND position('[CANCELLED]' IN COALESCE(remark, '')) = 0
   GROUP BY al_number
),
cons AS (
  SELECT al_number, count(*) AS consents, sum(COALESCE(consent_qty, 0)) AS consented
    FROM public.mobile_consent_records
   GROUP BY al_number
)
SELECT a.al_number,
       a.customer_name,
       a.order_date,
       a.quantity_ordered                                        AS ordered,
       COALESCE(d.collected, 0)                                  AS collected,
       a.quantity_ordered - COALESCE(d.collected, 0)             AS balance,
       COALESCE(c.consents, 0)                                   AS consents,
       COALESCE(c.consented, 0)                                  AS consented,
       GREATEST(COALESCE(c.consented, 0) - COALESCE(d.collected, 0), 0) AS left_to_scan,
       CASE WHEN COALESCE(c.consented, 0) - COALESCE(d.collected, 0) > 0
            THEN 'ON THE SCAN LIST'
            ELSE 'NEEDS A NEW CONSENT for ' || (a.quantity_ordered - COALESCE(d.collected, 0))
       END                                                       AS verdict
  FROM public.shared_al_orders a
  LEFT JOIN dos d  ON d.al_number = a.al_number
  LEFT JOIN cons c ON c.al_number = a.al_number
 WHERE a.quantity_ordered - COALESCE(d.collected, 0) > 0
   AND COALESCE(a.status, '') NOT IN ('Cancelled', 'Rejected')
 ORDER BY a.order_date DESC NULLS LAST, a.al_number;
