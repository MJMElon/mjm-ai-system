-- ================================================================
-- Super admin, for real -- and a module Admin can now save their
-- own Module Assess Control.
--
-- super_admin has been a UI convention only: a greyed-out Save
-- button. Nothing in the database has ever asked who holds it, so
-- anybody holding manage_users could set super_admin:true on any
-- row, their own included, with one API call that never touched
-- the screen. This file closes that, in both directions, and gives
-- a second account the power the first already has in the UI: to
-- save their own module page and action ticks for somebody else
-- without holding manage_users.
--
-- Safe to run twice. Nothing here is destructive.
-- ================================================================

-- 1. Is the CURRENT caller a super admin. Bypasses RLS to answer,
--    the same shape as current_user_can_manage_users() already has.
CREATE OR REPLACE FUNCTION public.current_user_is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((permissions ->> 'super_admin')::boolean, false)
    FROM public.shared_profiles
   WHERE id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.current_user_is_super_admin() TO authenticated;

-- 2. The one account the whole system is rooted on. Seeded as both
--    super_admin and manage_users (a super admin with no manage_users
--    could not open or save User Access at all under the existing
--    database rule, which would make the seed useless). Only touches
--    the row when something is not already right, so a second run
--    finds nothing to do.
UPDATE public.shared_profiles
   SET permissions = COALESCE(permissions, '{}'::jsonb)
                      || jsonb_build_object('super_admin', true, 'manage_users', true)
 WHERE lower(email) = lower('nursery.mjsb@gmail.com')
   AND (COALESCE((permissions ->> 'super_admin')::boolean, false) IS DISTINCT FROM true
        OR COALESCE((permissions ->> 'manage_users')::boolean, false) IS DISTINCT FROM true);

-- 3. The guard. Fires on every insert and update of shared_profiles,
--    and is a no-op for every one of them except the two things it
--    exists to stop:
--      a) nursery.mjsb@gmail.com losing super_admin or manage_users,
--         by anyone, through any door, and
--      b) super_admin being granted or taken away from ANY row by
--         somebody who is not already a super admin -- which is the
--         gap this file closes, because nothing asked this before.
CREATE OR REPLACE FUNCTION public.shared_profiles_guard_super_admin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  old_super boolean := CASE WHEN TG_OP = 'INSERT' THEN false
                             ELSE COALESCE((OLD.permissions ->> 'super_admin')::boolean, false) END;
  new_super boolean := COALESCE((NEW.permissions ->> 'super_admin')::boolean, false);
  old_mu    boolean := CASE WHEN TG_OP = 'INSERT' THEN false
                             ELSE COALESCE((OLD.permissions ->> 'manage_users')::boolean, false) END;
  new_mu    boolean := COALESCE((NEW.permissions ->> 'manage_users')::boolean, false);
BEGIN
  IF TG_OP = 'UPDATE' AND lower(OLD.email) = lower('nursery.mjsb@gmail.com') THEN
    IF new_super IS DISTINCT FROM true OR new_mu IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'nursery.mjsb@gmail.com is the permanent super admin and cannot lose super_admin or manage_users';
    END IF;
  END IF;

  IF new_super IS DISTINCT FROM old_super AND NOT public.current_user_is_super_admin() THEN
    RAISE EXCEPTION 'Only a super admin may grant or revoke super_admin';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shared_profiles_guard_super_admin ON public.shared_profiles;
CREATE TRIGGER shared_profiles_guard_super_admin
  BEFORE INSERT OR UPDATE ON public.shared_profiles
  FOR EACH ROW EXECUTE FUNCTION public.shared_profiles_guard_super_admin();

-- 4. The one door that may now grant or revoke super_admin at all --
--    everything else (the ordinary profile save on User Access) still
--    goes through a plain update, and the trigger above refuses it the
--    moment it touches this one key without the caller holding it.
--    Promoting somebody also grants manage_users, because a super
--    admin who cannot open or save User Access is not actually one.
--    Demoting leaves manage_users exactly as it was, and a super admin
--    has to flip that separately, same as it is today.
CREATE OR REPLACE FUNCTION public.mjm_set_super_admin(target_id uuid, make_super boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.current_user_is_super_admin() THEN
    RAISE EXCEPTION 'Only a super admin may grant or revoke super_admin';
  END IF;

  UPDATE public.shared_profiles
     SET permissions = COALESCE(permissions, '{}'::jsonb)
                        || jsonb_build_object('super_admin', make_super)
                        || CASE WHEN make_super THEN jsonb_build_object('manage_users', true)
                                ELSE '{}'::jsonb END
   WHERE id = target_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mjm_set_super_admin(uuid, boolean) TO authenticated;

-- 5. A module Admin may now save THEIR OWN module page and action
--    ticks for somebody else, without holding manage_users -- the
--    half of "Admin = able to do the Feature Permission Control"
--    that the database never allowed before. Touches ONLY
--    <module>_pages and <module>_actions on the target row.
--    Everything else on their profile -- their module levels,
--    manage_users, super_admin, every OTHER module page and action
--    -- is passed through unchanged.
CREATE OR REPLACE FUNCTION public.mjm_set_module_access(
  target_id uuid,
  p_module text,
  p_pages jsonb DEFAULT NULL,
  p_actions jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_level text;
  caller_mu boolean;
BEGIN
  SELECT permissions -> 'modules' ->> p_module,
         COALESCE((permissions ->> 'manage_users')::boolean, false)
    INTO caller_level, caller_mu
    FROM public.shared_profiles
   WHERE id = auth.uid();

  -- caller_level is NULL for anybody who is not admin of p_module, and
  -- `NULL = 'admin'` is NULL rather than false -- `NOT (false OR NULL)`
  -- is NULL too, and an `IF NULL` skips the RAISE instead of taking it,
  -- which let a plain user or an admin of a DIFFERENT module straight
  -- through. COALESCE pins the comparison to a real boolean first.
  IF NOT (caller_mu OR COALESCE(caller_level = 'admin', false)) THEN
    RAISE EXCEPTION 'Not an admin of % and not Manage Users', p_module;
  END IF;

  UPDATE public.shared_profiles
     SET permissions = COALESCE(permissions, '{}'::jsonb)
                        || jsonb_build_object(
                             p_module || '_pages',
                             COALESCE(p_pages, COALESCE(permissions, '{}'::jsonb) -> (p_module || '_pages'), '{}'::jsonb)
                           )
                        || jsonb_build_object(
                             p_module || '_actions',
                             COALESCE(p_actions, COALESCE(permissions, '{}'::jsonb) -> (p_module || '_actions'), '{}'::jsonb)
                           )
   WHERE id = target_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mjm_set_module_access(uuid, text, jsonb, jsonb) TO authenticated;

-- 6. can_verify_operation is a LEGACY top-level flag, not an
--    operation_actions entry, and the app JS mostly stopped
--    needing it the day a saved operation_actions.batch.view existed
--    (canDoOperation prefers that). It is NOT legacy to the database,
--    though: the RLS policy on operation_batch_verifications, in
--    shared/migration_batch_verifications.sql, reads this exact
--    column directly, with no knowledge of operation_actions at all.
--    So the one caller this exists for is the module-Admin save path
--    in operation_user_access.html -- it cannot reach this column
--    through mjm_set_module_access
--    (which only ever touches <module>_pages/<module>_actions), and
--    without a way to update it the Verify tick would look set in the
--    UI while the database went on refusing the insert underneath it.
CREATE OR REPLACE FUNCTION public.mjm_set_operation_verify(target_id uuid, can_verify boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_level text;
  caller_mu boolean;
BEGIN
  SELECT permissions -> 'modules' ->> 'operation',
         COALESCE((permissions ->> 'manage_users')::boolean, false)
    INTO caller_level, caller_mu
    FROM public.shared_profiles
   WHERE id = auth.uid();

  IF NOT (caller_mu OR COALESCE(caller_level = 'admin', false)) THEN
    RAISE EXCEPTION 'Not an admin of operation and not Manage Users';
  END IF;

  UPDATE public.shared_profiles
     SET permissions = COALESCE(permissions, '{}'::jsonb)
                        || jsonb_build_object('can_verify_operation', can_verify)
   WHERE id = target_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mjm_set_operation_verify(uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ── Check: run this and read the result ──────────────────────────
-- EXPECT ONE ROW: ok = true, with nursery.mjsb@gmail.com carrying
-- both flags and the guard objects all present.
SELECT
  (SELECT COALESCE((permissions->>'super_admin')::boolean,false) FROM public.shared_profiles WHERE lower(email)=lower('nursery.mjsb@gmail.com')) AS anchor_is_super_admin,
  (SELECT COALESCE((permissions->>'manage_users')::boolean,false) FROM public.shared_profiles WHERE lower(email)=lower('nursery.mjsb@gmail.com')) AS anchor_is_manage_users,
  (SELECT count(*) FROM pg_trigger WHERE tgname='shared_profiles_guard_super_admin') AS guard_trigger_installed,
  (SELECT count(*) FROM pg_proc WHERE proname='mjm_set_super_admin') AS promote_function_installed,
  (SELECT count(*) FROM pg_proc WHERE proname='mjm_set_module_access') AS module_access_function_installed,
  (SELECT count(*) FROM pg_proc WHERE proname='mjm_set_operation_verify') AS operation_verify_function_installed,
  (
    (SELECT COALESCE((permissions->>'super_admin')::boolean,false) FROM public.shared_profiles WHERE lower(email)=lower('nursery.mjsb@gmail.com')) = true
    AND (SELECT COALESCE((permissions->>'manage_users')::boolean,false) FROM public.shared_profiles WHERE lower(email)=lower('nursery.mjsb@gmail.com')) = true
    AND (SELECT count(*) FROM pg_trigger WHERE tgname='shared_profiles_guard_super_admin') = 1
    AND (SELECT count(*) FROM pg_proc WHERE proname='mjm_set_super_admin') = 1
    AND (SELECT count(*) FROM pg_proc WHERE proname='mjm_set_module_access') = 1
    AND (SELECT count(*) FROM pg_proc WHERE proname='mjm_set_operation_verify') = 1
  ) AS ok;
