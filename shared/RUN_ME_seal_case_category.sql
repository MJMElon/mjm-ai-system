-- ============================================================================
-- MJM AI POWERED SYSTEM — RUN_ME_seal_case_category.sql
--
-- THE SEAL CATEGORY IS FILED UNDER NO SYSTEM, AND IT IS AUTOMATIC.
--
-- seal_raise_case() opens a case by itself every time a seal check finds a
-- problem -- a range given twice, a range never received, a range that could
-- not be read, a range received twice, a seal collected for another customer,
-- a seal collected on no consent. Six conditions, all of them the database
-- acting on its own, and six cases filed under the title Seal.
--
-- Two things were missing from that title, and each one hides it from a
-- screen the office reads:
--
--   module_key is empty, so it belongs to no system. Both raise forms scope
--   the Work list on the module, so the title is offered nowhere and nobody
--   can raise a seal case by hand to go with the ones the checks raise.
--
--   auto_condition is empty, so Automate Cases leaves it out. That page is
--   the list of what the system opens by itself, and the busiest automatic
--   title in the database was not on it.
--
-- RUN_ME_seal_management.sql inserted the row with neither, which is where
-- this comes from. That file now sets both, so a fresh database does not
-- repeat it, and this one repairs the database already running.
--
-- WHAT THIS DOES NOT CHANGE: where a seal case GOES. seal_raise_case() names
-- the queue itself -- seal_settings.nelos_module, else the system that sees
-- every case, else HQ Operation -- and nelos_route_case() steps aside for a
-- case that already names one. So the blank in the Case Routing column is
-- correct and a rule set there would not be read.
--
-- Safe to re-run. Changes no case and no seal record.
-- Run in Supabase SQL Editor (main project: kibqjztozokohqmhqqqf).
-- ============================================================================

-- Through EXECUTE, because a database that has not had every earlier Nelos
-- migration may be missing module_key or auto_condition, and a plain
-- statement naming a column that is not there fails at PARSE time, before
-- any guard can run.
DO $seal$
DECLARE
  cond     CONSTANT TEXT :=
    'A seal check finds a problem: a range given twice, a range never received, '
    'a range that could not be read, a range received twice, a seal collected '
    'for another customer, or a seal collected on no consent';
  has_cats BOOLEAN := to_regclass('public.nelos_categories') IS NOT NULL;
  has_mod  BOOLEAN := EXISTS (SELECT 1 FROM information_schema.columns
                               WHERE table_schema='public' AND table_name='nelos_categories'
                                 AND column_name='module_key');
  has_auto BOOLEAN := EXISTS (SELECT 1 FROM information_schema.columns
                               WHERE table_schema='public' AND table_name='nelos_categories'
                                 AND column_name='auto_condition');
  has_seal BOOLEAN := false;
  n        INT;
BEGIN
  IF NOT has_cats THEN
    RAISE NOTICE 'SKIPPED -- no nelos_categories table.';
    RETURN;
  END IF;

  IF to_regclass('public.nelos_modules') IS NOT NULL THEN
    EXECUTE $q$ SELECT EXISTS (SELECT 1 FROM public.nelos_modules WHERE key='seal') $q$
      INTO has_seal;
  END IF;

  -- 1. File it under Seal Management.
  --
  -- Only a row that names no system, and only where Seal Management has no
  -- title of its own by that name already -- the unique index is on
  -- (module_key, lower(name)), so moving onto an existing one would fail.
  IF NOT has_mod THEN
    RAISE NOTICE '1. SKIPPED -- nelos_categories has no module_key column.';
  ELSIF NOT has_seal THEN
    RAISE NOTICE '1. SKIPPED -- nelos_modules has no seal row. Run RUN_ME_seal_management.sql first.';
  ELSE
    EXECUTE $q$
      UPDATE public.nelos_categories c
         SET module_key = 'seal'
       WHERE lower(c.name) = 'seal'
         AND COALESCE(c.module_key, '') = ''
         AND NOT EXISTS (SELECT 1 FROM public.nelos_categories c2
                          WHERE c2.module_key = 'seal' AND lower(c2.name) = 'seal')
    $q$;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '1. Seal filed under Seal Management: % row(s) moved.', n;
  END IF;

  -- 2. Say what raises it.
  --
  -- Left alone where somebody has already written one, the same way every
  -- other condition in this system is set once and then owned by the office.
  IF NOT has_auto THEN
    RAISE NOTICE '2. SKIPPED -- nelos_categories has no auto_condition column.';
  ELSE
    EXECUTE format($q$
      UPDATE public.nelos_categories
         SET auto_condition = %L
       WHERE lower(name) = 'seal'
         AND auto_condition IS NULL
    $q$, cond);
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '2. Seal marked as raised by the system: % row(s).', n;
  END IF;
END $seal$;


-- ── WHAT A GOOD RESULT LOOKS LIKE ───────────────────────────────
--
-- The same register CHECK_which_cases_the_system_raises.sql prints. The row
-- to look at is Seal, and after this it should read
--
--   raised_in    Seal Management     -- not (no system)
--   raised_how   by the system -- A seal check finds a problem: ...
--   goes_to      (no rule -- stays with the raiser)
--
-- That last one is right and is not repaired here: seal_raise_case() names
-- the queue on the case itself, so there is no routing rule to read.
--
-- Everything else on the list should read exactly as it did before.
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
