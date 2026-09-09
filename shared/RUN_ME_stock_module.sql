-- ============================================================================
-- MJM AI POWERED SYSTEM — RUN_ME_stock_module.sql
--
-- The Stock Inventory System module.
--
-- NOTHING HERE IS REQUIRED. The module needs no schema change: a person's
-- module access lives in shared_profiles.permissions, which is JSONB, and the
-- new `stock` key is granted from the main portal's User Access screen like
-- every other module. If you are happy to grant it there, you can close this
-- file — the tile appears for whoever you grant it to, and nobody else.
--
-- This file is here for the two things the screen cannot do:
--
--   PART 1  Grant `stock` to several people at once, by email. Useful for the
--           first handful; after that use the screen.
--
--   PART 2  Tell Nelos the module exists, so a case can one day be filed
--           against Stock Inventory System and land in its queue. The
--           module's page already carries a Nelos To-Do list, and without
--           this row that list has no system to belong to. Nothing raises a
--           stock case yet, so this is groundwork, not a fix.
--
-- Safe to run twice. Both parts check for themselves first, and Part 1 only
-- ever adds the one key — everything else on a person's permissions is left
-- exactly as it was.
--
-- Run in Supabase SQL Editor (main project: kibqjztozokohqmhqqqf).
-- ============================================================================

-- ────────────────────────────────────────────────────────────────
-- PART 1 — who may open it
--
-- EDIT THIS LIST. Emails of the people who should have the module, and the
-- level each gets: 'admin' or 'normal'. An email that is not a profile is
-- reported at the end rather than silently doing nothing.
--
-- Leave the list empty to skip Part 1 entirely and grant on the screen.
-- ────────────────────────────────────────────────────────────────
DO $grant$
DECLARE
  -- ↓↓↓ the only lines you should need to change ↓↓↓
  -- The ::TEXT[] cast is not decoration: with every line commented out this
  -- is a bare ARRAY[], and Postgres cannot infer the type of an empty array —
  -- it aborts the block before Part 1 can decide to skip itself.
  people TEXT[] := ARRAY[
    -- 'esther@mjmnursery.com',
    -- 'someone.else@mjmnursery.com'
  ]::TEXT[];
  level  TEXT   := 'admin';
  -- ↑↑↑ ------------------------------------------ ↑↑↑
  n INT;
  missing TEXT;
BEGIN
  IF array_length(people, 1) IS NULL THEN
    RAISE NOTICE 'PART 1 skipped — no emails listed. Grant it on User Access instead.';
    RETURN;
  END IF;
  IF level NOT IN ('admin', 'normal') THEN
    RAISE EXCEPTION 'level must be admin or normal, not %', level;
  END IF;

  /* jsonb_set with create_missing, so a profile whose permissions has no
     `modules` object at all still gets one rather than being skipped. The
     rest of the blob is untouched: this writes ONE key.

     Only where it differs, so a re-run reports 0 rather than churning every
     row and its updated_at. */
  UPDATE public.shared_profiles p
     SET permissions = jsonb_set(
           COALESCE(p.permissions, '{}'::jsonb) ||
             CASE WHEN COALESCE(p.permissions, '{}'::jsonb) ? 'modules'
                  THEN '{}'::jsonb ELSE jsonb_build_object('modules', '{}'::jsonb) END,
           '{modules,stock}', to_jsonb(level), true)
   WHERE lower(p.email) = ANY (SELECT lower(unnest(people)))
     AND COALESCE(p.permissions->'modules'->>'stock', '') IS DISTINCT FROM level;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'PART 1 — granted stock=% to % profile(s).', level, n;

  /* A typo in the list is otherwise indistinguishable from a re-run: both
     report 0 changed, and the person walks away believing somebody has the
     module who does not. */
  SELECT string_agg(e, ', ') INTO missing
    FROM unnest(people) AS e
   WHERE NOT EXISTS (SELECT 1 FROM public.shared_profiles p WHERE lower(p.email) = lower(e));
  IF missing IS NOT NULL THEN
    RAISE NOTICE 'PART 1 — no profile for: %  (check the spelling; nothing was granted to them)', missing;
  END IF;
END $grant$;

-- ────────────────────────────────────────────────────────────────
-- PART 2 — Nelos knows the module exists
--
-- Through EXECUTE because a database without the Nelos migrations has no
-- such table, and a plain INSERT naming it is rejected when this file is
-- PARSED — before any guard could help.
-- ────────────────────────────────────────────────────────────────
DO $nelos$
DECLARE n INT; next_sort INT;
BEGIN
  IF to_regclass('public.nelos_modules') IS NULL THEN
    RAISE NOTICE 'PART 2 skipped — no nelos_modules table. Run migration_nelos_all.sql if you want Nelos.';
    RETURN;
  END IF;

  EXECUTE 'SELECT COALESCE(MAX(sort_order), 0) + 10 FROM public.nelos_modules' INTO next_sort;
  EXECUTE format($q$
    INSERT INTO public.nelos_modules (key, label, icon, href, sort_order, active)
    SELECT 'stock', 'Stock Inventory System', '📦', '../stock/stock_dashboard.html', %s, true
     WHERE NOT EXISTS (SELECT 1 FROM public.nelos_modules WHERE key = 'stock')
  $q$, next_sort);
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'PART 2 — Nelos system row: % added.', n;
END $nelos$;

-- ────────────────────────────────────────────────────────────────
-- CHECK — one result set, because the SQL Editor shows only the last
-- statement's. Three lines, and what each should say:
--
--   who holds the module   the people you listed, one row each, with their
--                          level. Nobody listed → "nobody yet — grant it on
--                          User Access", which is fine.
--   Nelos knows it         yes
--   the tile               always "shown to whoever holds it" — the hub reads
--                          the same key this file writes, so there is nothing
--                          separate to switch on.
-- ────────────────────────────────────────────────────────────────
-- Collected into a temp table rather than written as one SELECT, because a
-- SELECT naming nelos_modules is PARSED whether or not the table is there —
-- so on a database with no Nelos the check itself failed, right after Part 2
-- had correctly skipped for that exact reason. Inside a block it can be
-- asked dynamically.
DROP TABLE IF EXISTS _stock_check;
CREATE TEMP TABLE _stock_check (ord INT, item TEXT, result TEXT);

DO $report$
DECLARE v TEXT;
BEGIN
  INSERT INTO _stock_check
  SELECT 1, 'who holds the module',
         COALESCE(
           (SELECT string_agg(COALESCE(NULLIF(p.full_name, ''), p.email) || ' — ' ||
                              (p.permissions->'modules'->>'stock'), ', ' ORDER BY p.email)
              FROM public.shared_profiles p
             WHERE p.permissions->'modules'->>'stock' IS NOT NULL
               AND p.permissions->'modules'->>'stock' <> 'none'),
           'nobody yet — grant it on User Access');

  IF to_regclass('public.nelos_modules') IS NULL THEN
    v := 'no Nelos on this database — nothing to do unless you want it';
  ELSE
    EXECUTE $q$ SELECT CASE WHEN EXISTS (SELECT 1 FROM public.nelos_modules WHERE key = 'stock')
                            THEN 'yes' ELSE 'NO — Part 2 did not run' END $q$ INTO v;
  END IF;
  INSERT INTO _stock_check VALUES (2, 'Nelos knows it', v);

  INSERT INTO _stock_check VALUES
    (3, 'the tile', 'shown to whoever holds it — the hub reads this same key');
END $report$;

SELECT ord, item, result FROM _stock_check ORDER BY ord;

-- ── Rollback ────────────────────────────────────────────────────
--   UPDATE shared_profiles SET permissions = permissions #- '{modules,stock}'
--    WHERE permissions->'modules' ? 'stock';
--   DELETE FROM nelos_modules WHERE key = 'stock';
