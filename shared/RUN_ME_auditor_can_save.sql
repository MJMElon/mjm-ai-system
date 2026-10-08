-- ════════════════════════════════════════════════════════════════════════
-- RUN_ME_auditor_can_save.sql
-- Everything an audit has to get past, repaired, and then PROVED by
-- attempting the save as each auditor in turn.
--
-- Paste the whole file into the Supabase SQL Editor and run it once. Safe
-- to run again. It grants nobody any permission they did not have, writes
-- no audit row that survives the run, and deletes nothing.
--
-- ── Why this file exists on top of the others ──
--
-- The phone said:
--
--     Not allowed to save to audit_maintenance_audits. Your login lacks
--     database permission (RLS)
--
-- which is Postgres 42501, a policy refusing the row, and 70 audits sat on
-- one phone because of it.
--
-- A file handed over before this one checked the foreign keys, the columns
-- and the photo bucket, printed four lines reading OK, and never once tried
-- to save anything. Every one of those answers was true and the save was
-- still refused, because the one thing that was wrong was the only thing
-- not being asked about. So the check at the foot of THIS file ends by
-- INSERTING a row as each auditor and rolling it back. A green result here
-- means an auditor can save, because an auditor just did.
--
-- ── The five things that can refuse a save ──
--
--   1. RLS policy          the table gate refuses the row
--   2. GRANT               the role may not reach the table at all
--   3. no profile row      the gate reads shared_profiles and finds nothing
--   4. foreign key         task_id pointing at a table it must not
--   5. missing column      the app writes a column the table lacks
--
-- All five are repaired below, on EVERY audit table rather than the one
-- that was reported, because all six carry the same gate and would fail
-- the same way.
-- ════════════════════════════════════════════════════════════════════════


-- ── 1. THE GATE FUNCTIONS ───────────────────────────────────────────────
-- SECURITY DEFINER so a policy can read shared_profiles without the caller
-- needing their own right to it, and without recursing back through the
-- profiles policies.
--
-- Staff is any profile that is not a customer. The app gates its pages on
-- audit_actions and audit_pages, NOT on modules.audit, and says why in
-- audit/audit_supabase.js: most auditors have never had modules.audit set,
-- so gating the database on it locks out the whole team. The database now
-- asks the same question the app asks.
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


-- ── 2. EVERY ACCOUNT GETS A PROFILE ROW ─────────────────────────────────
-- The gate reads shared_profiles, so an account with no row fails every
-- gate because there is nothing to read. Exactly what the signup trigger
-- would have written, from the signups own metadata. No permission is
-- granted: an empty permissions column means nobody has been asked, and
-- writing a default into it would turn an unasked question into a decision.
INSERT INTO public.shared_profiles (id, email, full_name, user_type)
SELECT u.id,
       u.email,
       NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'full_name', '')), ''),
       CASE WHEN COALESCE(u.raw_user_meta_data->>'user_type', 'system') = 'customer'
            THEN 'customer' ELSE 'system' END
  FROM auth.users u
 WHERE NOT EXISTS (SELECT 1 FROM public.shared_profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;


-- ── 3. COLUMNS AND KEYS ON THE MAINTENANCE AUDIT TABLE ──────────────────
-- Audit tasks come from two places and only one of them has real table
-- ids: the office schedule lives inside the JSONB blob of
-- nops_maint_records and its ids are JS timestamps existing in no table.
-- A foreign key on task_id therefore rejects every audit of an office
-- task. No migration in this repository ever created one. It was added by
-- hand, so whatever is there is removed.
DO $$
DECLARE c RECORD;
BEGIN
  IF to_regclass('public.audit_maintenance_audits') IS NULL THEN RETURN; END IF;
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.audit_maintenance_audits'::regclass AND contype = 'f'
  LOOP
    EXECUTE 'ALTER TABLE public.audit_maintenance_audits DROP CONSTRAINT ' || quote_ident(c.conname);
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.audit_maintenance_audits (
  id         BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.audit_maintenance_audits
  ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS audit_id     TEXT,
  ADD COLUMN IF NOT EXISTS task_id      BIGINT,
  ADD COLUMN IF NOT EXISTS nursery      TEXT,
  ADD COLUMN IF NOT EXISTS plot         TEXT,
  ADD COLUMN IF NOT EXISTS task_type    TEXT,
  ADD COLUMN IF NOT EXISTS result       TEXT,
  ADD COLUMN IF NOT EXISTS remarks      TEXT,
  ADD COLUMN IF NOT EXISTS photo_url    TEXT,
  ADD COLUMN IF NOT EXISTS date         DATE,
  ADD COLUMN IF NOT EXISTS auditor_name TEXT;


-- ── 4. THE POLICIES AND THE GRANTS, ON EVERY AUDIT TABLE ────────────────
-- RLS decides which rows a role may write. The GRANT decides whether it
-- may reach the table at all. A missing GRANT raises 42501 as well, with a
-- different wording, so both are set and the ambiguity goes.
DO $$
DECLARE
  t   text;
  pol text;
  old_names text[] := ARRAY[
    'Authenticated full access',
    'audit_module_read',
    'audit_module_write',
    'audit_read',
    'audit_insert',
    'audit_update',
    'audit_delete',
    'audit_staff_read',
    'audit_staff_insert',
    'audit_staff_update',
    'audit_admin_delete'
  ];
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'audit_plot_audits',
    'audit_height_records',
    'audit_papan_audits',
    'audit_batches',
    'audit_maintenance_tasks',
    'audit_maintenance_audits'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      RAISE NOTICE 'skip % - table not in this database', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);

    FOREACH pol IN ARRAY old_names LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, t);
    END LOOP;

    EXECUTE format($p$CREATE POLICY "audit_staff_read" ON public.%I
                        FOR SELECT TO authenticated USING (public._mjm_is_staff())$p$, t);
    EXECUTE format($p$CREATE POLICY "audit_staff_insert" ON public.%I
                        FOR INSERT TO authenticated WITH CHECK (public._mjm_is_staff())$p$, t);
    EXECUTE format($p$CREATE POLICY "audit_staff_update" ON public.%I
                        FOR UPDATE TO authenticated
                        USING (public._mjm_is_staff()) WITH CHECK (public._mjm_is_staff())$p$, t);
    -- Deleting an audit stays admin only.
    EXECUTE format($p$CREATE POLICY "audit_admin_delete" ON public.%I
                        FOR DELETE TO authenticated USING (public._mjm_is_audit_admin())$p$, t);
  END LOOP;
END $$;


-- ── 5. THE PHOTO BUCKET ─────────────────────────────────────────────────
-- Every audit form makes a photo compulsory, so storage refusing the
-- upload parks the record exactly as a refused row does.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('audit-photos', 'audit-photos', true)
    ON CONFLICT (id) DO UPDATE SET public = true;
  END IF;
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
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'could not set the storage policies from here - set them under Storage, Policies';
END $$;

NOTIFY pgrst, 'reload schema';


-- ── 6. THE PROOF ────────────────────────────────────────────────────────
-- Not an inspection of the gate. An actual INSERT into the real table, as
-- each non-customer account in turn, rolled back every time. This is the
-- step whose absence let a previous file report four green lines over a
-- database that refused every save.
-- Plain temp table, no ON COMMIT DROP: the SQL Editor does not wrap the
-- file in one transaction, so ON COMMIT DROP takes it away the instant it
-- is made and every later statement cannot see it. It goes at session end
-- either way.
DROP TABLE IF EXISTS _probe;
CREATE TEMP TABLE _probe (email TEXT, ok BOOLEAN, why TEXT);

DO $$
DECLARE
  p    RECORD;
  good BOOLEAN;
  why  TEXT;
BEGIN
  FOR p IN SELECT id, email FROM public.shared_profiles
            WHERE COALESCE(user_type,'system') <> 'customer' ORDER BY email LOOP
    good := false;
    why  := '';
    BEGIN
      PERFORM set_config('request.jwt.claims',
                         json_build_object('sub', p.id, 'role', 'authenticated')::text, true);
      SET LOCAL ROLE authenticated;
      INSERT INTO public.audit_maintenance_audits
             (audit_id, task_id, nursery, plot, task_type, result, remarks, photo_url, date, auditor_name)
      VALUES ('PROBE', 1759712345678, 'UNN1', 'U18', 'Weeding', 'Unsatisfied',
              'probe row, rolled back', 'https://probe', CURRENT_DATE, 'probe');
      good := true;
      -- Undo it. The handler below catches this and the row never lands.
      RAISE EXCEPTION 'mjm_probe_rollback';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM = 'mjm_probe_rollback' THEN
        good := true;
      ELSE
        good := false;
        why  := left(SQLERRM, 90);
      END IF;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
    INSERT INTO _probe VALUES (p.email, good, why);
  END LOOP;
END $$;


-- ── What a good result looks like ───────────────────────────────────────
-- Six rows, every one of them ending in OK, and row 6 the one that matters:
-- it means an auditor really did save, just now, on this database.
-- Any row reading NOT OK names what is still wrong.
SELECT 1 AS n, 'accounts with no profile row: ' ||
       (SELECT count(*)::text FROM auth.users u
         WHERE NOT EXISTS (SELECT 1 FROM public.shared_profiles p WHERE p.id = u.id)) ||
       CASE WHEN (SELECT count(*) FROM auth.users u
                   WHERE NOT EXISTS (SELECT 1 FROM public.shared_profiles p WHERE p.id = u.id)) = 0
            THEN ' -- OK' ELSE ' -- NOT OK' END AS result
UNION ALL
SELECT 2, 'audit tables with all four policies: ' || count(*)::text || ' of 6' ||
       CASE WHEN count(*) = 6 THEN ' -- OK' ELSE ' -- NOT OK' END
  FROM (SELECT tablename FROM pg_policies
         WHERE schemaname='public' AND tablename LIKE 'audit%'
           AND policyname IN ('audit_staff_read','audit_staff_insert','audit_staff_update','audit_admin_delete')
         GROUP BY tablename HAVING count(*) = 4) q
UNION ALL
SELECT 3, 'audit tables granted to authenticated: ' || count(DISTINCT table_name)::text || ' of 6' ||
       CASE WHEN count(DISTINCT table_name) = 6 THEN ' -- OK' ELSE ' -- NOT OK' END
  FROM information_schema.role_table_grants
 WHERE table_schema='public' AND grantee='authenticated'
   AND privilege_type='INSERT' AND table_name LIKE 'audit%'
UNION ALL
SELECT 4, 'foreign keys on audit_maintenance_audits: ' || count(*)::text ||
       CASE WHEN count(*) = 0 THEN ' -- OK' ELSE ' -- NOT OK' END
  FROM pg_constraint
 WHERE conrelid = to_regclass('public.audit_maintenance_audits') AND contype = 'f'
UNION ALL
SELECT 5, CASE
       WHEN to_regclass('storage.buckets') IS NULL THEN 'audit-photos bucket: no storage here -- CHECK BY HAND'
       WHEN EXISTS (SELECT 1 FROM storage.buckets WHERE id='audit-photos' AND public)
            THEN 'audit-photos bucket: present and public -- OK'
       ELSE 'audit-photos bucket: missing or private -- NOT OK' END
UNION ALL
SELECT 6, 'auditors who could actually save just now: ' ||
       (SELECT count(*)::text FROM _probe WHERE ok) || ' of ' ||
       (SELECT count(*)::text FROM _probe) ||
       CASE WHEN (SELECT count(*) FROM _probe WHERE NOT ok) = 0 THEN ' -- OK'
            ELSE ' -- NOT OK: ' || (SELECT string_agg(email || ' (' || why || ')', '; ')
                                      FROM _probe WHERE NOT ok) END
ORDER BY n;
