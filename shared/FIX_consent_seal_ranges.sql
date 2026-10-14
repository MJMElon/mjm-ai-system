-- ============================================================================
-- FIX_consent_seal_ranges.sql
--
-- Corrects the seal numbers on ONE consent, in place. The consent itself is
-- kept, signature and all, so the customer does not have to sign again.
--
-- Edit the two lines marked EDIT:
--   the consent_id, from CHECK_consent_seal_ranges.sql
--   the correct ranges, in the same shape the phone saves:
--     [{"start":"0009001","end":"0009600"}]
--   more than one range is a comma between them:
--     [{"start":"0009001","end":"0009600"},{"start":"0012001","end":"0012100"}]
--   To CLEAR the seals and scan nothing, write null instead of the brackets.
--
-- What happens:
--   1. the seal problems this consent raised are marked resolved, with a
--      line saying the seals were rekeyed
--   2. the ranges are replaced. The trigger then rebuilds seal_allocations
--      from them and checks them again, so if the CORRECT numbers also clash
--      with another customer, a new problem is raised. That is the check
--      working, not this file failing.
--
-- Safe to run twice: the second run writes the same ranges and changes
-- nothing (the trigger only rebuilds when the ranges differ).
--
-- A good result is one row per allocated range, showing the NEW numbers, and
-- open_problems at 0. A NELOS case already opened for the wrong numbers is
-- not closed by this file, so close it in NELOS with a note.
-- ============================================================================

UPDATE public.seal_problems
   SET status      = 'resolved',
       resolution  = 'Seal numbers rekeyed on the consent (wrong key).',
       resolved_by = 'SQL fix',
       resolved_at = now()
 WHERE consent_id = 'CONSENT-ID-EDIT-ME'
   AND status = 'open'
   AND kind IN ('consent_overlap', 'consent_bad_range', 'consent_not_received');

UPDATE public.mobile_consent_records
   SET seal_ranges = '[{"start":"0009001","end":"0009600"}]'::JSONB
 WHERE id::TEXT = 'CONSENT-ID-EDIT-ME';

SELECT c.id::TEXT        AS consent_id,
       c.al_number,
       c.customer_name,
       c.seal_ranges     AS ranges_now,
       a.start_code || ' - ' || a.end_code AS allocated,
       a.qty,
       (SELECT count(*) FROM public.seal_problems p
         WHERE p.consent_id = c.id::TEXT AND p.status = 'open') AS open_problems
  FROM public.mobile_consent_records c
  LEFT JOIN public.seal_allocations a ON a.consent_id = c.id::TEXT
 WHERE c.id::TEXT = 'CONSENT-ID-EDIT-ME'
 ORDER BY a.start_no;
