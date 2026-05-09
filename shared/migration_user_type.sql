-- ================================================================
-- MJM System — Split shared_profiles into system users vs customers
-- Run in Supabase SQL Editor (main project: kibqjztozokohqmhqqqf)
-- ================================================================
--
-- Background:
--   shared_profiles already mixes staff (operation/audit/mobile signups)
--   with customers (salesweb signups) into one big list. The User
--   Access admin page should only show staff by default; customers are
--   listed separately and pulled in on demand via "Add User".
--
-- This migration:
--   1. Adds shared_profiles.user_type ('system' | 'customer'), default
--      'system' so existing rows are treated as staff (the safe choice
--      for current usage). Customers flagged manually post-rollout, or
--      automatically on future salesweb signups.
--   2. Updates handle_new_user() to honour raw_user_meta_data->>'user_type'
--      from the signup payload — salesweb's signUp() passes 'customer',
--      everything else falls back to 'system'.
-- ----------------------------------------------------------------

-- 1. Column with check constraint
ALTER TABLE public.shared_profiles
  ADD COLUMN IF NOT EXISTS user_type TEXT
    DEFAULT 'system'
    CHECK (user_type IN ('system', 'customer'));

CREATE INDEX IF NOT EXISTS shared_profiles_user_type_idx
  ON public.shared_profiles (user_type);

-- 2. Backfill anything that ended up NULL just in case
UPDATE public.shared_profiles
   SET user_type = 'system'
 WHERE user_type IS NULL;

-- 3. Recreate handle_new_user() so it honours user_type from metadata.
DROP TRIGGER  IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.shared_profiles (id, email, full_name, user_type)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NULL),
    CASE
      WHEN COALESCE(NEW.raw_user_meta_data->>'user_type', 'system') = 'customer'
        THEN 'customer'
      ELSE 'system'
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
