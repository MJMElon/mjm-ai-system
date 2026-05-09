-- ================================================================
-- MJM System — Fix "Database error saving new user" on signup
-- Run in Supabase SQL Editor (main project: kibqjztozokohqmhqqqf)
-- ================================================================
--
-- Background:
--   Supabase auth.signUp() was returning "Database error saving new user"
--   for every signup attempt (audit, salesweb, mobile).
--
--   Root cause: an `on_auth_user_created` trigger on auth.users calls a
--   `handle_new_user()` function that did `INSERT INTO public.profiles ...`.
--   migration_rename_and_new_tables.sql renamed `profiles` to
--   `shared_profiles`, so the trigger started failing on every signup,
--   which caused Supabase to roll back the auth.users insert and surface
--   the generic "Database error saving new user" message.
--
-- Fix:
--   Recreate handle_new_user() so it inserts into shared_profiles, and
--   reattach the trigger. The function uses ON CONFLICT DO NOTHING so the
--   per-app upsert (which sets full_name and role) still wins.
-- ----------------------------------------------------------------

-- Drop the old trigger and function if they exist (idempotent).
DROP TRIGGER  IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Recreate the function pointing at shared_profiles.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.shared_profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NULL)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Reattach the trigger to auth.users.
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
