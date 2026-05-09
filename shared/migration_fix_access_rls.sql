-- ================================================================
-- MJM System — Fix RLS recursion on shared_profiles
-- Run in Supabase SQL Editor (main project: kibqjztozokohqmhqqqf)
-- ================================================================
--
-- Background:
--   migration_access_and_reviews.sql created two RLS policies on
--   shared_profiles whose USING clauses do a sub-SELECT against
--   shared_profiles itself. Postgres flags that as infinite recursion
--   ("infinite recursion detected in policy for relation
--   shared_profiles") and silently blocks the SELECT — so the
--   dashboard never sees manage_users=true and the User Access card
--   stays hidden even after the JSONB is set correctly.
--
-- Fix:
--   Wrap the manage_users check in a SECURITY DEFINER helper function
--   so it bypasses RLS during the policy check. Recreate the three
--   policies to use the helper. Self-read policy stays simple.
-- ----------------------------------------------------------------

-- Make sure RLS is on (no-op if already enabled).
ALTER TABLE public.shared_profiles ENABLE ROW LEVEL SECURITY;

-- Drop the prior policies — they may be recursive or stale.
DROP POLICY IF EXISTS "Read own profile"                  ON public.shared_profiles;
DROP POLICY IF EXISTS "Manage users can read all profiles" ON public.shared_profiles;
DROP POLICY IF EXISTS "Manage users can update permissions" ON public.shared_profiles;

-- Helper: returns true if the current authenticated user's profile has
-- manage_users = true. SECURITY DEFINER lets it read shared_profiles
-- without re-triggering RLS, so policies that call it don't recurse.
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

-- Anyone authenticated can read THEIR OWN profile row.
CREATE POLICY "Read own profile" ON public.shared_profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Manage-users folks can read every profile (powers the User Access page).
CREATE POLICY "Manage users can read all profiles" ON public.shared_profiles
  FOR SELECT TO authenticated
  USING (public.current_user_can_manage_users());

-- Manage-users folks can update any profile's permissions.
CREATE POLICY "Manage users can update permissions" ON public.shared_profiles
  FOR UPDATE TO authenticated
  USING (public.current_user_can_manage_users())
  WITH CHECK (public.current_user_can_manage_users());
