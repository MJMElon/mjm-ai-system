-- ============================================================================
-- CHECK_consent_seal_ranges.sql
--
-- Where a consent keeps its seal numbers. Reads only, changes nothing.
--
-- The seal numbers keyed on a consent are stored ON THE CONSENT ROW, in
-- mobile_consent_records.seal_ranges. The table seal_allocations is built
-- from that column by a trigger, so a row deleted there is put back the next
-- time the consent is saved. Correct the consent, never the allocation.
--
-- Change the AL number on the line marked EDIT, then run. One row per
-- consent on that AL: its id, the ranges as keyed, what the allocation
-- table holds for it, and any open seal problem it has raised. Copy the
-- consent_id of the wrong one into FIX_consent_seal_ranges.sql.
-- ============================================================================

SELECT c.id::TEXT                                   AS consent_id,
       c.al_number,
       c.customer_name,
       c.created_at,
       c.seal_ranges                                AS ranges_as_keyed,
       (SELECT string_agg(a.start_code || ' - ' || a.end_code || ' (' || a.qty || ')', ', ' ORDER BY a.start_no)
          FROM public.seal_allocations a
         WHERE a.consent_id = c.id::TEXT)           AS allocated,
       (SELECT count(*)
          FROM public.seal_problems p
         WHERE p.consent_id = c.id::TEXT
           AND p.status = 'open')                   AS open_problems
  FROM public.mobile_consent_records c
 WHERE c.al_number = 'AL-EDIT-ME'
 ORDER BY c.created_at DESC;
