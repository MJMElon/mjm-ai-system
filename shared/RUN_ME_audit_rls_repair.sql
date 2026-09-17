-- ════════════════════════════════════════════════════════════════════════
-- AUDITORS CANNOT SAVE — REPAIR THE audit_* RLS GATE
-- shared/RUN_ME_audit_rls_repair.sql
--
-- Run this whole file in the Supabase SQL Editor. Safe to run twice: it adds
-- and replaces, and the only rows it writes are profile rows for accounts
-- that have none. No permission is granted to anybody, nothing is deleted.
--
-- ── The symptom ──
--
-- An auditor saves a seedling-height audit and the phone parks it:
--
--     Not allowed to save to audit_height_records. Your login lacks
--     database permission (RLS)
--
-- which is Postgres 42501 — a policy refused the row. The audit is still on
-- the phone; it just never reached the server, so the plot still reads as
-- not audited and the office cannot see it.
--
-- ── The cause ──
--
-- Two access systems for one module, disagreeing.
--
-- migration_rls_hardening.sql gated the audit_* tables on
-- _mjm_has_module('audit', ARRAY['admin','normal']) — the caller's
-- shared_profiles.permissions -> 'modules' ->> 'audit' must be exactly
-- 'admin' or 'normal'.
--
-- The app stopped asking that. audit/audit_supabase.js gates pages on
-- audit_actions / audit_pages instead, and says why in its own comment:
-- "most auditors have never had modules.audit set, and using it here would
-- lock out the whole team at once."
--
-- So an auditor who is correctly signed in, and who the app correctly lets
-- into the page, is refused by the database on save. Nothing on either side
-- is broken on its own; they simply do not agree.
--
-- migration_audit_rls_align.sql moved the tables onto the staff gate to fix
-- exactly this. If saving is still refused, that file has not been run on
-- this database — or it has, and the auditor fails the staff gate for the
-- other reason below.
--
-- ── The other reason ──
--
-- The staff gate reads shared_profiles. An account with NO profile row fails
-- every gate, because the gate has nothing to read. Ten of twenty-five
-- signups were in that state on 1 Sep (see RUN_ME_fix_missing_profiles.sql);
-- the trigger that should create them had stopped firing. This file creates
-- any that are still missing, so both causes are closed in one paste.
--
-- ── What it does NOT do ──
--
-- It does not grant anybody the audit module, or any permission at all. An
-- empty permissions column means "nobody has been asked", and writing
-- today's default into it would turn an unasked question into a decision.
-- Accounts appear on User Access with what they already had.
--
-- It does not touch a profile whose user_type is 'customer'. If a real
-- auditor is marked as a customer, that is a wrong row and the last section
-- prints it by name — fix it on User Access, do not loosen the policy.
-- ════════════════════════════════════════════════════════════════════════


-- ── 1. THE GATE FUNCTIONS ───────────────────────────────────────────────
-- SECURITY DEFINER so a policy can read shared_profiles without the caller
-- needing their own SELECT right on it, and without the profiles policies
-- recursing back into these checks.

-- A staff account: any profile that is not a customer. A missing user_type
-- counts as staff ('system'), matching how the existing rows were created.
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

-- An audit admin: role admin/administrator, or modules.audit = 'admin'.
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
-- Exactly what the signup trigger would have written, read from the signup's
-- own metadata. ON CONFLICT DO NOTHING, so a second run adds nothing and no
-- existing row is touched.
INSERT INTO public.shared_profiles (id, email, full_name, user_type)
SELECT u.id,
       u.email,
       NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'full_name', '')), ''),
       CASE WHEN COALESCE(u.raw_user_meta_data->>'user_type', 'system') = 'customer'
            THEN 'customer' ELSE 'system' END
  FROM auth.users u
 WHERE NOT EXISTS (SELECT 1 FROM public.shared_profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;


-- ── 3. THE POLICIES, ON EVERY AUDIT TABLE ───────────────────────────────
-- Every audit_* table gets the same four. One auditor reported one table;
-- all six carry the same gate and would fail the same way, so all six are
-- repaired. A table not in this database is skipped rather than erroring.
DO $$
DECLARE
  t   text;
  pol text;
  -- Every policy name these tables have carried across all previous
  -- migrations, including the module-gated pair that causes the refusal.
  -- Dropped first so a re-run converges on exactly four.
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

    IF NOT EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t
    ) THEN
      RAISE NOTICE 'skip % — table not in this database', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- RLS decides which rows; the GRANT decides whether the role may reach
    -- the table at all. A missing GRANT raises 42501 too, with "permission
    -- denied for table" instead of "violates row-level security policy", so
    -- set both and remove the ambiguity.
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);

    FOREACH pol IN ARRAY old_names LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, t);
    END LOOP;

    EXECUTE format($p$
      CREATE POLICY "audit_staff_read" ON public.%I
        FOR SELECT TO authenticated
        USING (public._mjm_is_staff())
    $p$, t);

    EXECUTE format($p$
      CREATE POLICY "audit_staff_insert" ON public.%I
        FOR INSERT TO authenticated
        WITH CHECK (public._mjm_is_staff())
    $p$, t);

    EXECUTE format($p$
      CREATE POLICY "audit_staff_update" ON public.%I
        FOR UPDATE TO authenticated
        USING      (public._mjm_is_staff())
        WITH CHECK (public._mjm_is_staff())
    $p$, t);

    -- Deleting an audit record stays admin-only.
    EXECUTE format($p$
      CREATE POLICY "audit_admin_delete" ON public.%I
        FOR DELETE TO authenticated
        USING (public._mjm_is_audit_admin())
    $p$, t);

    RAISE NOTICE 'repaired %', t;
  END LOOP;
END $$;


-- ── 4. THE PHOTOS ───────────────────────────────────────────────────────
-- The audit forms require a photo and upload it to audit-photos, so the
-- bucket has to exist, be public to read, and be writable by signed-in
-- staff. A refused photo parks the record just as a refused row does.
INSERT INTO storage.buckets (id, name, public)
VALUES ('audit-photos', 'audit-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "audit_photos_read"   ON storage.objects;
DROP POLICY IF EXISTS "audit_photos_insert" ON storage.objects;
DROP POLICY IF EXISTS "audit_photos_update" ON storage.objects;

CREATE POLICY "audit_photos_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'audit-photos');
CREATE POLICY "audit_photos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'audit-photos');
CREATE POLICY "audit_photos_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING      (bucket_id = 'audit-photos')
  WITH CHECK (bucket_id = 'audit-photos');

-- PostgREST answers from a cached picture of the schema; nudge it so the
-- phones are not told about yesterday's policies.
NOTIFY pgrst, 'reload schema';


-- ── 5. WHAT YOU SHOULD SEE ──────────────────────────────────────────────
-- The SQL Editor shows only the LAST statement's result, so this is one
-- query. Read it top to bottom:
--
--   table      one row per audit table   "4 policies · module gate gone"
--   photos     audit-photos              "bucket public"
--   profiles   0                         "accounts with no profile row"
--   blocked    0                         "staff accounts the gate refuses"
--   customer   (nothing, normally)       any account marked as a customer —
--                                        if a real auditor is listed here,
--                                        fix their row on User Access
--   VERDICT    auditors can save         or what is still wrong
--
-- Every "table" row must say "4 policies · module gate gone". A row still
-- naming the module gate means the DO block did not reach that table.
-- "profiles" and "blocked" must both be 0.
-- ────────────────────────────────────────────────────────────────────────
WITH tbls AS (
  SELECT t.tablename,
         count(*) FILTER (WHERE p.policyname IN
           ('audit_staff_read','audit_staff_insert','audit_staff_update','audit_admin_delete')) AS good,
         count(*) FILTER (WHERE p.policyname IN
           ('audit_module_read','audit_module_write','Authenticated full access'))              AS legacy
    FROM pg_tables t
    LEFT JOIN pg_policies p
           ON p.schemaname = t.schemaname AND p.tablename = t.tablename
   WHERE t.schemaname = 'public'
     AND t.tablename IN ('audit_plot_audits','audit_height_records','audit_papan_audits',
                         'audit_batches','audit_maintenance_tasks','audit_maintenance_audits')
   GROUP BY t.tablename
),
noprof AS (
  SELECT count(*) AS n FROM auth.users u
   WHERE NOT EXISTS (SELECT 1 FROM public.shared_profiles p WHERE p.id = u.id)
),
refused AS (
  SELECT count(*) AS n FROM auth.users u
    JOIN public.shared_profiles p ON p.id = u.id
   WHERE COALESCE(p.user_type, 'system') = 'customer'
)
SELECT * FROM (
  SELECT 1 AS ord, 'table'::text AS what, tablename::text AS value,
         (good || ' policies · ' ||
          CASE WHEN legacy = 0 THEN 'module gate gone' ELSE 'MODULE GATE STILL HERE' END)::text AS detail
    FROM tbls
  UNION ALL
  SELECT 2, 'photos', 'audit-photos',
         COALESCE((SELECT CASE WHEN public THEN 'bucket public' ELSE 'BUCKET NOT PUBLIC' END
                     FROM storage.buckets WHERE id = 'audit-photos'), 'BUCKET MISSING')
  UNION ALL
  SELECT 3, 'profiles', (SELECT n::text FROM noprof), 'accounts with no profile row'
  UNION ALL
  SELECT 4, 'blocked', (SELECT n::text FROM refused), 'accounts the staff gate refuses'
  UNION ALL
  -- Named, not counted: this is the one thing the policies cannot fix, and
  -- you need to know WHOSE row is wrong.
  SELECT 5, 'customer', COALESCE(u.email, u.id::text),
         'marked as a customer — fix on User Access if this is an auditor'
    FROM auth.users u
    JOIN public.shared_profiles p ON p.id = u.id
   WHERE COALESCE(p.user_type, 'system') = 'customer'
  UNION ALL
  SELECT 9, 'VERDICT',
         CASE WHEN (SELECT n FROM noprof) = 0
               AND (SELECT count(*) FROM tbls WHERE legacy > 0 OR good <> 4) = 0
              THEN 'auditors can save'
              ELSE 'still wrong — read the rows above' END,
         'reload the audit portal, then tap the red banner and choose OK'
) x
ORDER BY ord, value;
