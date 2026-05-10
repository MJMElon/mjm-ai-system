-- ================================================================
-- MJM System — Per-module access control + per-tab batch review locks
-- Run in Supabase SQL Editor (main project: kibqjztozokohqmhqqqf)
-- ================================================================
--
-- This migration adds:
--   1. shared_profiles.permissions JSONB — per-module access level for
--      each user (operation/salesweb/audit/mobile = admin|normal|none),
--      plus a manage_users flag that lets that user open the User Access
--      admin page.
--   2. operation_batch_reviews — tracks which stage of a batch has been
--      "reviewed". Once reviewed, the corresponding tab in
--      operation_batch_detail.html locks for non-admin users.
--
-- Run this AFTER migration_fix_signup_trigger.sql.
-- ----------------------------------------------------------------


-- ────────────────────────────────────────────────────────────────
-- PART 1: Per-module access on shared_profiles
-- ────────────────────────────────────────────────────────────────

ALTER TABLE shared_profiles
  ADD COLUMN IF NOT EXISTS permissions JSONB
    DEFAULT '{
      "modules": {
        "operation": "none",
        "salesweb":  "none",
        "audit":     "none",
        "mobile":    "none"
      },
      "manage_users": false
    }'::jsonb;

-- Backfill existing rows that still have NULL.
UPDATE shared_profiles
   SET permissions = '{
         "modules": {
           "operation": "none",
           "salesweb":  "none",
           "audit":     "none",
           "mobile":    "none"
         },
         "manage_users": false
       }'::jsonb
 WHERE permissions IS NULL;

-- Allow each user to read their own permissions (RLS-friendly).
-- Admin-managed updates go through the User Access page; the
-- manage_users check is wrapped in a SECURITY DEFINER helper so the
-- policy USING clause doesn't recurse against shared_profiles itself.
CREATE OR REPLACE FUNCTION public.current_user_can_manage_users()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((permissions->>'manage_users')::boolean, false)
    FROM public.shared_profiles
   WHERE id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.current_user_can_manage_users() TO authenticated;

ALTER TABLE public.shared_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'shared_profiles'
       AND policyname = 'Read own profile'
  ) THEN
    CREATE POLICY "Read own profile" ON shared_profiles
      FOR SELECT TO authenticated
      USING (id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'shared_profiles'
       AND policyname = 'Manage users can read all profiles'
  ) THEN
    CREATE POLICY "Manage users can read all profiles" ON shared_profiles
      FOR SELECT TO authenticated
      USING (public.current_user_can_manage_users());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'shared_profiles'
       AND policyname = 'Manage users can update permissions'
  ) THEN
    CREATE POLICY "Manage users can update permissions" ON shared_profiles
      FOR UPDATE TO authenticated
      USING (public.current_user_can_manage_users())
      WITH CHECK (public.current_user_can_manage_users());
  END IF;
END $$;

-- IMPORTANT — Bootstrap the first super-admin manually after running
-- this migration. Replace the email below with the owner's email and
-- run once. Without this, nobody can open the User Access admin page.
--
--   UPDATE shared_profiles
--      SET permissions = jsonb_set(
--            jsonb_set(
--              COALESCE(permissions, '{}'::jsonb),
--              '{manage_users}', 'true'::jsonb, true),
--            '{modules}', '{"operation":"admin","salesweb":"admin","audit":"admin","mobile":"admin"}'::jsonb, true)
--    WHERE email = 'OWNER_EMAIL_HERE';


-- ────────────────────────────────────────────────────────────────
-- PART 2: Per-tab review locks for batch records
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS operation_batch_reviews (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_name    TEXT NOT NULL,
  stage         TEXT NOT NULL
                CHECK (stage IN (
                  'seeds_in', 'planting', 'transplanting',
                  'cull_1', 'cull_2', 'cull_3'
                )),
  reviewed_by   UUID REFERENCES auth.users(id),
  reviewer_email TEXT,
  reviewer_name  TEXT,
  reviewed_at   TIMESTAMPTZ DEFAULT now(),
  note          TEXT,
  UNIQUE (batch_name, stage)
);

CREATE INDEX IF NOT EXISTS operation_batch_reviews_batch_idx
  ON operation_batch_reviews (batch_name);

ALTER TABLE operation_batch_reviews ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'operation_batch_reviews'
       AND policyname = 'Authenticated read reviews'
  ) THEN
    CREATE POLICY "Authenticated read reviews" ON operation_batch_reviews
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'operation_batch_reviews'
       AND policyname = 'Operation admins write reviews'
  ) THEN
    CREATE POLICY "Operation admins write reviews" ON operation_batch_reviews
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM shared_profiles me
           WHERE me.id = auth.uid()
             AND me.permissions #>> '{modules,operation}' = 'admin'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM shared_profiles me
           WHERE me.id = auth.uid()
             AND me.permissions #>> '{modules,operation}' = 'admin'
        )
      );
  END IF;
END $$;
