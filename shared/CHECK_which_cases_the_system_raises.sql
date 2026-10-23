-- ============================================================================
-- MJM AI POWERED SYSTEM — CHECK_which_cases_the_system_raises.sql
--
-- WHICH CASE TITLES THE SYSTEM OPENS BY ITSELF, AND WHERE EACH ONE GOES.
--
-- Automate Cases shows exactly the titles carrying an auto_condition. Those
-- words are the module code decision, written into the database by a
-- migration and read by that page, never set there. So a title the office
-- expected to see on Automate Cases and cannot is one of two things, and
-- this answers which:
--
--   raised_how = by the system   the condition is recorded, the page shows it
--   raised_how = by hand         nothing opens it on its own, so it is
--                                correctly absent from Automate Cases. It is
--                                still offered in the Work list of the system
--                                named under raised_in.
--
-- A title reading by hand that somebody believes is automatic is a feature
-- that was never built, or a condition nobody recorded. Check the app code
-- before adding one: a condition on a title nothing raises puts a promise on
-- the page that the system does not keep.
--
-- Read-only. Safe to run as often as you like.
-- Run in Supabase SQL Editor (main project: kibqjztozokohqmhqqqf).
-- ============================================================================

-- WHAT TO LOOK FOR
--
-- One row per case title, the automatic ones first within each system.
--   raised_in      the system the title is filed under, which is the system
--                  whose Nelos dock offers it
--   goes_to        the Case Routing rule, with the seat or the PIC where one
--                  is named. No rule means the case stays with the raiser
--   cases_so_far   how many have ever been filed under that exact wording.
--                  A title renamed without carrying its cases across reads 0
--                  here while the old wording still holds them
--   state          RETIRED where the title has been taken off both forms
SELECT
  COALESCE(m.label, c.module_key, '(no system)')                 AS raised_in,
  c.name                                                         AS work,
  CASE WHEN c.auto_condition IS NULL THEN 'by hand'
       ELSE 'by the system -- ' || c.auto_condition END          AS raised_how,
  CASE WHEN r.to_module IS NULL THEN '(no rule -- stays with the raiser)'
       ELSE COALESCE(tm.label, r.to_module)
            || COALESCE(' - seat ' || r.to_seat_no::TEXT, '')
            || COALESCE(' - ' || r.to_user_name, '') END         AS goes_to,
  (SELECT count(*) FROM nelos_cases k WHERE k.category = c.name) AS cases_so_far,
  CASE WHEN c.active THEN '' ELSE 'RETIRED' END                  AS state
FROM nelos_categories c
LEFT JOIN nelos_modules m  ON m.key  = c.module_key
LEFT JOIN nelos_routes  r  ON r.source_module = c.module_key AND r.category = c.name
LEFT JOIN nelos_modules tm ON tm.key = r.to_module
ORDER BY raised_in, (c.auto_condition IS NULL), c.name;
