-- ============================================================================
-- CHECK_who_is_on_the_pre_nursery_sheet.sql
--
-- Seed Planting (Worker Activity, Pre Nursery) takes a column for every
-- General Worker filed under section PN on the worker register. When it
-- says no general worker is on the register for this nursery, nobody
-- active is filed under PN as a General Worker.
--
-- This reads only. It prints every section of the register, by role and
-- by active or inactive, with the names in it -- so it shows where the
-- Pre Nursery workers are actually filed.
--
-- WHAT TO LOOK FOR: a row with section PN, role General Worker and active
-- true. If there is none, the Pre Nursery workers are filed under another
-- section (often UNN1) or carry another role. Move them on the 555 Worker
-- Portal, Manage page, and the Seed Planting sheet picks them up.
-- ============================================================================

SELECT COALESCE(NULLIF(to_jsonb(w) ->> 'section', ''), to_jsonb(w) ->> 'nursery', '(no section)') AS section,
       COALESCE(NULLIF(to_jsonb(w) ->> 'role', ''), to_jsonb(w) ->> 'job_title', '(no role)')     AS role,
       COALESCE(to_jsonb(w) ->> 'active', 'true')                                                 AS active,
       count(*)                                                                                    AS workers,
       string_agg(COALESCE(to_jsonb(w) ->> 'full_name', '?'), ', ' ORDER BY to_jsonb(w) ->> 'full_name') AS names
  FROM public.mjmnpayroll_workers w
 GROUP BY 1, 2, 3
 ORDER BY 1, 2, 3;
