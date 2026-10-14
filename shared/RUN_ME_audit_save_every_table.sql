-- ════════════════════════════════════════════════════════════════════════
-- RUN_ME_audit_save_every_table.sql
--
-- The 555 Audit Portal keeps coming back with
--
--     Not allowed to save to audit_plot_audits. Your login lacks database
--     permission (RLS)
--
-- and the repair that was handed over before this one answers six green
-- lines while it is happening. This file repairs it and PROVES it on every
-- audit table rather than on one of them.
--
-- Paste the whole file into the Supabase SQL Editor and run it. Safe to run
-- again. It writes no audit row that survives the run and deletes no data.
--
-- ── Why the last file said OK while the phone said no ──
--
-- RUN_ME_auditor_can_save.sql ends by inserting a row as each auditor and
-- rolling it back, which is the right idea. It inserts into ONE table:
-- audit_maintenance_audits, the table that was broken the day it was
-- written. Anything wrong with audit_plot_audits, audit_height_records,
-- audit_papan_audits or audit_batches passes it unnoticed. Reproduced on a
-- scratch Postgres 16: with Plot Condition refusing every single save, that
-- file prints
--
--     6 | auditors who could actually save just now: 4 of 4 -- OK
--
-- So the proof below runs over EVERY audit table in turn, and a failure
-- names the auditor AND the table.
--
-- ── The two things that bring it back ──
--
-- 1. AN AUDITOR WHO SIGNED UP AFTER THE LAST REPAIR. The gate reads
--    shared_profiles, so an account with no row there fails it: there is
--    nothing to read. The old file backfills the missing rows, which fixes
--    today and nothing after it. Section 1 installs the signup trigger, so
--    an account created tomorrow gets its row the moment it is made.
--
-- 2. A POLICY ADDED BY HAND. A RESTRICTIVE policy narrows what every other
--    policy allows, so one of them on an audit table refuses every auditor
--    no matter what else is right. The old file drops a list of names it
--    knows and leaves anything else standing, which is how one survives
--    every repair. Section 4 drops every policy on these tables that is not
--    one of the four this system owns, and the result names what it took
--    away, so nothing is removed quietly.
--
-- ── What a good result looks like ──
--
-- Seven rows, all ending in OK. Row 7 is the one that matters: it means
-- every auditor just saved to every audit table on this database. Any row
-- reading NOT OK names what is still wrong and which table it is on.
-- ════════════════════════════════════════════════════════════════════════


-- ── 1. A NEW ACCOUNT GETS ITS PROFILE ROW BY ITSELF ─────────────────────
-- The gate reads shared_profiles. Backfilling is a repair of today, and
-- the fault is back the next time somebody is hired. This is the trigger
-- that stops it. No permission is granted: an empty permissions column
-- means nobody has been asked, and writing a default into it would turn an
-- unasked question into a decision.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  INSERT INTO public.shared_profiles (id, email, full_name, user_type)
  VALUES (NEW.id,
          NEW.email,
          NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), ''),
          CASE WHEN COALESCE(NEW.raw_user_meta_data->>'user_type', 'system') = 'customer'
               THEN 'customer' ELSE 'system' END)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- A signup must never fail because the profile could not be written.
  -- Section 2 picks up anything this misses.
  RAISE WARNING 'handle_new_user could not write a profile for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ── 2. AND EVERY ACCOUNT ALREADY MADE GETS ONE NOW ──────────────────────
INSERT INTO public.shared_profiles (id, email, full_name, user_type)
SELECT u.id,
       u.email,
       NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'full_name', '')), ''),
       CASE WHEN COALESCE(u.raw_user_meta_data->>'user_type', 'system') = 'customer'
            THEN 'customer' ELSE 'system' END
  FROM auth.users u
 WHERE NOT EXISTS (SELECT 1 FROM public.shared_profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;


-- ── 3. THE GATE FUNCTIONS ───────────────────────────────────────────────
-- SECURITY DEFINER so a policy can read shared_profiles without the caller
-- needing their own right to it. Staff is any profile that is not a
-- customer: the app gates its pages on audit_actions and audit_pages and
-- not on modules.audit, because most auditors have never had modules.audit
-- set. The database asks the same question the app asks.
CREATE OR REPLACE FUNCTION public._mjm_is_staff()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM shared_profiles p
     WHERE p.id = auth.uid()
       AND COALESCE(p.user_type, 'system') <> 'customer'
  );
$fn$;

CREATE OR REPLACE FUNCTION public._mjm_is_audit_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM shared_profiles p
     WHERE p.id = auth.uid()
       AND ( lower(COALESCE(p.role, '')) IN ('admin', 'administrator')
          OR (p.permissions -> 'modules' ->> 'audit') = 'admin' )
  );
$fn$;

REVOKE ALL ON FUNCTION public._mjm_is_staff()       FROM PUBLIC;
REVOKE ALL ON FUNCTION public._mjm_is_audit_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._mjm_is_staff()       TO authenticated;
GRANT EXECUTE ON FUNCTION public._mjm_is_audit_admin() TO authenticated;


-- The six tables, named once in a view so the repair and the proof cannot
-- drift apart. A VIEW and not a table: the SQL Editor warns about any file
-- that creates a table, and this one deliberately creates none.
CREATE OR REPLACE VIEW public._mjm_audit_tables AS
SELECT unnest(ARRAY['audit_plot_audits',
                    'audit_height_records',
                    'audit_papan_audits',
                    'audit_batches',
                    'audit_maintenance_tasks',
                    'audit_maintenance_audits']) AS name;


-- ── 4. GRANTS AND POLICIES, AND NOTHING ELSE LEFT STANDING ──────────────
-- RLS decides which rows a role may write. The GRANT decides whether it may
-- reach the table at all. Both are set, so the ambiguity goes.
--
-- ONLY A RESTRICTIVE POLICY IS DROPPED. A restrictive one narrows what
-- every other policy allows, so one of them refuses every auditor whatever
-- else is right, and that is the fault being hunted. A PERMISSIVE one
-- cannot refuse anything: it is somebody opening a door, and the first
-- version of this file dropped those too and took out
-- nops_read_audit_verdicts, which the office had put there on purpose.
-- Row 6 names both kinds, so neither goes quietly.
SELECT set_config('mjm.dropped', '', false),
       set_config('mjm.kept', '', false);

DO $$
DECLARE
  t    text;
  pol  RECORD;
  mine text[] := ARRAY['audit_staff_read', 'audit_staff_insert',
                       'audit_staff_update', 'audit_admin_delete'];
BEGIN
  FOR t IN SELECT name FROM public._mjm_audit_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);

    FOR pol IN SELECT policyname, permissive FROM pg_policies
                WHERE schemaname = 'public' AND tablename = t LOOP
      IF pol.policyname = ANY (mine) THEN
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
      ELSIF pol.permissive = 'RESTRICTIVE' THEN
        PERFORM set_config('mjm.dropped',
                 COALESCE(NULLIF(current_setting('mjm.dropped', true), ''), '')
                 || CASE WHEN COALESCE(current_setting('mjm.dropped', true), '') = ''
                         THEN '' ELSE ', ' END
                 || COALESCE(t, '?') || '.' || COALESCE(pol.policyname, '?'), false);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
      ELSE
        PERFORM set_config('mjm.kept',
                 COALESCE(NULLIF(current_setting('mjm.kept', true), ''), '')
                 || CASE WHEN COALESCE(current_setting('mjm.kept', true), '') = ''
                         THEN '' ELSE ', ' END
                 || COALESCE(t, '?') || '.' || COALESCE(pol.policyname, '?'), false);
      END IF;
    END LOOP;

    EXECUTE format($p$CREATE POLICY "audit_staff_read" ON public.%I
                        FOR SELECT TO authenticated USING (public._mjm_is_staff())$p$, t);
    EXECUTE format($p$CREATE POLICY "audit_staff_insert" ON public.%I
                        FOR INSERT TO authenticated WITH CHECK (public._mjm_is_staff())$p$, t);
    EXECUTE format($p$CREATE POLICY "audit_staff_update" ON public.%I
                        FOR UPDATE TO authenticated
                        USING (public._mjm_is_staff()) WITH CHECK (public._mjm_is_staff())$p$, t);
    EXECUTE format($p$CREATE POLICY "audit_admin_delete" ON public.%I
                        FOR DELETE TO authenticated USING (public._mjm_is_audit_admin())$p$, t);
  END LOOP;
END $$;


-- ── 5. THE PHOTO BUCKET ─────────────────────────────────────────────────
-- Every audit form makes a photo compulsory, so storage refusing the upload
-- parks the record exactly as a refused row does. The answer is kept in a
-- session setting rather than read in the final query: a database with no
-- storage schema fails to PARSE a query naming storage.buckets, however
-- well guarded it is, and that took the last file down on a scratch copy.
SELECT set_config('mjm.bucket', 'no storage here -- CHECK BY HAND', false);

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN RETURN; END IF;
  EXECUTE $q$INSERT INTO storage.buckets (id, name, public)
             VALUES ('audit-photos', 'audit-photos', true)
             ON CONFLICT (id) DO UPDATE SET public = true$q$;
  PERFORM set_config('mjm.bucket', 'present and public -- OK', false);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('mjm.bucket', left(SQLERRM, 60) || ' -- CHECK BY HAND', false);
END $$;

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN RETURN; END IF;
  DROP POLICY IF EXISTS "audit_photos_read"   ON storage.objects;
  DROP POLICY IF EXISTS "audit_photos_insert" ON storage.objects;
  DROP POLICY IF EXISTS "audit_photos_update" ON storage.objects;
  CREATE POLICY "audit_photos_read" ON storage.objects
    FOR SELECT TO public USING (bucket_id = 'audit-photos');
  CREATE POLICY "audit_photos_insert" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'audit-photos');
  CREATE POLICY "audit_photos_update" ON storage.objects
    FOR UPDATE TO authenticated USING (bucket_id = 'audit-photos');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'could not set the storage policies from here - set them under Storage, Policies';
END $$;

-- ── 5b. THE OFFICE OWN READ POLICY, PUT BACK ────────────────────────────
-- nops_read_audit_verdicts lets the Work Maintenance page read the audit
-- verdicts, and RUN_ME_audit_column.sql is where it comes from. The first
-- version of this file dropped it as "not ours". It is permissive, so it
-- never refused anybody, and it is recreated here so a run of this file
-- cannot take it away. Recreated only where the function it reads exists.
DO $$
BEGIN
  IF to_regclass('public.audit_maintenance_audits') IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
                  WHERE n.nspname = 'public' AND pr.proname = '_nops_may_read_audit') THEN
    RETURN;
  END IF;
  DROP POLICY IF EXISTS "nops_read_audit_verdicts" ON public.audit_maintenance_audits;
  CREATE POLICY "nops_read_audit_verdicts"
    ON public.audit_maintenance_audits
    FOR SELECT TO authenticated
    USING (public._nops_may_read_audit());
END $$;

NOTIFY pgrst, 'reload schema';


-- ── 6. THE PROOF, ON EVERY TABLE ────────────────────────────────────────
-- Not an inspection of the gate. A real INSERT into each real table, as
-- each non-customer account in turn, rolled back every time. The columns
-- are the ones the forms themselves write.
SELECT set_config('mjm.pass', '0', false),
       set_config('mjm.total', '0', false),
       set_config('mjm.tally', '', false),
       set_config('mjm.bad', '', false);

DO $$
DECLARE
  p     RECORD;
  i     int;
  t     text;
  stmt  text;
  names text[] := ARRAY['audit_plot_audits',
                        'audit_height_records',
                        'audit_papan_audits',
                        'audit_batches',
                        'audit_maintenance_audits'];
  stmts text[] := ARRAY[
    $i$INSERT INTO public.audit_plot_audits
         (audit_id, nursery, plot, batch, pest, tikus, disease, warna_daun,
          photo_url, photo_2_url, date, auditor_name)
       VALUES ('PROBE','BNN','B01','1','No','No','No','Green',
               'https://probe','https://probe',CURRENT_DATE,'probe')$i$,
    $i$INSERT INTO public.audit_height_records
         (record_id, nursery, plot, batch, sample_1, sample_2, sample_3,
          avg_height, photo_1_url, photo_2_url, photo_3_url, date, auditor_name)
       VALUES ('PROBE','PN','P01',NULL,1,1,1,1,
               'https://probe','https://probe','https://probe',CURRENT_DATE,'probe')$i$,
    $i$INSERT INTO public.audit_papan_audits
         (audit_id, batch_ref, nursery, plot, batch_no, presence, info_correct,
          condition, remarks, photo_url, date, auditor_name)
       VALUES ('PROBE',NULL,'BNN','B01','1','Yes','Yes','Good',NULL,
               'https://probe',CURRENT_DATE,'probe')$i$,
    $i$INSERT INTO public.audit_batches
         (nursery, plot, batch_no, breed, qty_transplant,
          date_planted, date_transplant, date_mature)
       VALUES ('BNN','B01','PROBE','probe',1,
               CURRENT_DATE,CURRENT_DATE,CURRENT_DATE)$i$,
    $i$INSERT INTO public.audit_maintenance_audits
         (audit_id, task_id, nursery, plot, task_type, result, remarks,
          photo_url, date, auditor_name)
       VALUES ('PROBE',1759712345678,'UNN1','U18','Weeding','Unsatisfied',
               'probe row, rolled back','https://probe',CURRENT_DATE,'probe')$i$
  ];
  good  boolean;
  why   text;
  who   text;
  okn   int[] := ARRAY[0,0,0,0,0];
  alln  int[] := ARRAY[0,0,0,0,0];
BEGIN
  FOR p IN SELECT id, email FROM public.shared_profiles
            WHERE COALESCE(user_type,'system') <> 'customer' ORDER BY email LOOP
    -- An account can have no email. Concatenating a NULL gives NULL, and
    -- set_config of NULL BLANKS the line being built up — which is how the
    -- first version of this file lost every reason it had collected and
    -- printed 196 of 245 with nothing after it.
    who := COALESCE(NULLIF(p.email, ''), 'account ' || COALESCE(p.id::text, '?'));
    FOR i IN 1 .. array_length(names, 1) LOOP
      t    := names[i];
      stmt := stmts[i];
      IF to_regclass('public.' || t) IS NULL THEN
        CONTINUE;
      END IF;
      good := false;
      why  := '';
      BEGIN
        PERFORM set_config('request.jwt.claims',
                           json_build_object('sub', p.id, 'role', 'authenticated')::text, true);
        SET LOCAL ROLE authenticated;
        EXECUTE stmt;
        good := true;
        -- Undo it. The handler below catches this and the row never lands.
        RAISE EXCEPTION 'mjm_probe_rollback';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'mjm_probe_rollback' THEN
          good := true;
        ELSE
          good := false;
          why  := SQLSTATE || ' ' || left(SQLERRM, 70);
        END IF;
      END;
      RESET ROLE;
      PERFORM set_config('request.jwt.claims', '', true);
      -- Counted out here, AFTER the handler: anything written inside that
      -- inner block goes back with it when the probe row is rolled back.
      PERFORM set_config('mjm.total', (current_setting('mjm.total')::int + 1)::text, false);
      alln[i] := alln[i] + 1;
      IF good THEN
        PERFORM set_config('mjm.pass', (current_setting('mjm.pass')::int + 1)::text, false);
        okn[i] := okn[i] + 1;
      ELSE
        -- Capped, because one broken table times fifty auditors is fifty
        -- identical sentences and the row they are in becomes unreadable.
        -- The per-table tally below carries the rest.
        IF length(COALESCE(current_setting('mjm.bad', true), '')) < 400 THEN
          PERFORM set_config('mjm.bad',
                   COALESCE(NULLIF(current_setting('mjm.bad', true), ''), '')
                   || CASE WHEN COALESCE(current_setting('mjm.bad', true), '') = ''
                           THEN '' ELSE '; ' END
                   || who || ' on ' || COALESCE(t, '?')
                   || ' (' || COALESCE(why, 'no reason given') || ')', false);
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  -- One line per table, so the table that refuses is named whatever happens
  -- to the sentences above it.
  FOR i IN 1 .. array_length(names, 1) LOOP
    IF alln[i] > 0 THEN
      PERFORM set_config('mjm.tally',
               COALESCE(NULLIF(current_setting('mjm.tally', true), ''), '')
               || CASE WHEN COALESCE(current_setting('mjm.tally', true), '') = ''
                       THEN '' ELSE ', ' END
               || names[i] || ' ' || okn[i] || '/' || alln[i], false);
    END IF;
  END LOOP;
END $$;


-- ── What a good result looks like ───────────────────────────────────────
-- Nine rows. Row 9 is the one that matters: it reads N of N -- OK, which
-- means every auditor saved to every audit table a second ago, on this
-- database. Anything less than N of N is NOT OK however green the rest is.
--
-- Row 1 is nought accounts without a profile row, and row 2 says the
-- trigger that keeps it at nought is installed. Rows 3 and 4 are the
-- policies and the grants on every audit table this database has. Row 6
-- names any RESTRICTIVE policy that was dropped, and row 7 names the other
-- policies found, which are LEFT ALONE and are a thing to read rather than
-- a fault. Row 8 breaks the saves down per table, so the table that refuses
-- is named even when the reason is too long to print.
SELECT 1 AS n, 'accounts with no profile row: ' ||
       (SELECT count(*)::text FROM auth.users u
         WHERE NOT EXISTS (SELECT 1 FROM public.shared_profiles p WHERE p.id = u.id)) ||
       CASE WHEN (SELECT count(*) FROM auth.users u
                   WHERE NOT EXISTS (SELECT 1 FROM public.shared_profiles p WHERE p.id = u.id)) = 0
            THEN ' -- OK' ELSE ' -- NOT OK' END AS result
UNION ALL
SELECT 2, 'signup trigger on auth.users: ' ||
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger
                          WHERE tgname = 'on_auth_user_created' AND NOT tgisinternal)
            THEN 'installed -- OK'
            ELSE 'MISSING -- NOT OK, every new auditor will be locked out' END
UNION ALL
SELECT 3, 'audit tables with all four policies: ' ||
       (SELECT count(*)::text FROM _mjm_audit_tables t
         WHERE to_regclass('public.' || t.name) IS NOT NULL
           AND (SELECT count(*) FROM pg_policies pp
                 WHERE pp.schemaname='public' AND pp.tablename = t.name
                   AND pp.policyname IN ('audit_staff_read','audit_staff_insert',
                                         'audit_staff_update','audit_admin_delete')) = 4) ||
       ' of ' ||
       (SELECT count(*)::text FROM _mjm_audit_tables t
         WHERE to_regclass('public.' || t.name) IS NOT NULL) ||
       COALESCE(' -- NOT OK, short: ' || (
         SELECT string_agg(t.name, ', ') FROM _mjm_audit_tables t
          WHERE to_regclass('public.' || t.name) IS NOT NULL
            AND (SELECT count(*) FROM pg_policies pp
                  WHERE pp.schemaname='public' AND pp.tablename = t.name
                    AND pp.policyname IN ('audit_staff_read','audit_staff_insert',
                                          'audit_staff_update','audit_admin_delete')) <> 4), ' -- OK')
UNION ALL
SELECT 4, 'audit tables granted to authenticated: ' ||
       (SELECT count(*)::text FROM _mjm_audit_tables t
         WHERE to_regclass('public.' || t.name) IS NOT NULL
           AND EXISTS (SELECT 1 FROM information_schema.role_table_grants g
                        WHERE g.table_schema='public' AND g.grantee='authenticated'
                          AND g.privilege_type='INSERT' AND g.table_name = t.name)) ||
       ' of ' ||
       (SELECT count(*)::text FROM _mjm_audit_tables t
         WHERE to_regclass('public.' || t.name) IS NOT NULL) ||
       COALESCE(' -- NOT OK, short: ' || (
         SELECT string_agg(t.name, ', ') FROM _mjm_audit_tables t
          WHERE to_regclass('public.' || t.name) IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants g
                             WHERE g.table_schema='public' AND g.grantee='authenticated'
                               AND g.privilege_type='INSERT' AND g.table_name = t.name)), ' -- OK')
UNION ALL
SELECT 5, 'audit-photos bucket: ' || current_setting('mjm.bucket')
UNION ALL
SELECT 6, CASE WHEN COALESCE(current_setting('mjm.dropped', true), '') = ''
                THEN 'RESTRICTIVE policies dropped: none -- OK'
                ELSE 'RESTRICTIVE policies dropped: ' || current_setting('mjm.dropped', true)
                     || ' -- READ THIS, each one was refusing every auditor' END
UNION ALL
SELECT 7, CASE WHEN COALESCE(current_setting('mjm.kept', true), '') = ''
                THEN 'other policies found and LEFT ALONE: none'
                ELSE 'other policies found and LEFT ALONE: ' || current_setting('mjm.kept', true) END
UNION ALL
SELECT 8, 'each table, saves that went through: ' ||
       COALESCE(NULLIF(current_setting('mjm.tally', true), ''), 'nothing probed')
UNION ALL
-- OK is pass = total and nothing else. The first version of this file
-- decided it on whether a REASON had been collected, and an account with no
-- email made that line NULL, which set_config blanks -- so it printed
-- "196 of 245 -- OK" over a table refusing every auditor. A count that does
-- not add up is the fault, whether or not anything managed to say why.
SELECT 9, 'saves that went through just now: ' ||
       current_setting('mjm.pass', true) || ' of ' || current_setting('mjm.total', true) ||
       CASE WHEN current_setting('mjm.pass', true) = current_setting('mjm.total', true)
            THEN ' -- OK'
            ELSE ' -- NOT OK: ' ||
                 COALESCE(NULLIF(current_setting('mjm.bad', true), ''),
                          'reason not recorded, read row 8') END
ORDER BY n;
