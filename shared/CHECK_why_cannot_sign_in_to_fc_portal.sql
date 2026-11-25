-- ============================================================================
-- CHECK_why_cannot_sign_in_to_fc_portal.sql
--
-- Every login, and what the 555 FC Portal (scan.mjmnursery.com) answers when
-- that person signs in. Read only -- nothing is changed.
--
-- The FC Portal lets a person in when ALL of these hold:
--   the account exists, its e-mail is confirmed, it is not banned,
--   it is not a customer (shared_profiles.user_type = customer),
--   and it holds a staff level (admin, normal, view, edit, manage, read,
--   write, full, staff) on ANY module, or manage_users / can_verify_operation.
--
-- WHAT TO READ: the verdict column. Rows that would be refused are sorted
-- FIRST, with the reason. A person reading OK here who still cannot sign in
-- is typing a wrong password, or the phone has no line -- the screen says
-- which: "Login error: Invalid login credentials" is the password.
-- signed_in_last shows when each account last got in.
-- ============================================================================

WITH p AS (
  SELECT u.id,
         u.email,
         u.email_confirmed_at,
         u.banned_until,
         u.last_sign_in_at,
         sp.id AS profile_id,
         lower(trim(coalesce(sp.user_type, ''))) AS user_type,
         coalesce(sp.permissions, '{}'::jsonb) AS perms
    FROM auth.users u
    LEFT JOIN public.shared_profiles sp ON sp.id = u.id
),
v AS (
  SELECT p.*,
         EXISTS (
           SELECT 1
             FROM jsonb_each_text(
                    CASE WHEN jsonb_typeof(p.perms -> 'modules') = 'object'
                         THEN p.perms -> 'modules' ELSE '{}'::jsonb END) m
            WHERE lower(m.value) IN ('admin','normal','view','edit','manage','read','write','full','staff')
         ) AS has_level,
         (coalesce(p.perms ->> 'manage_users', '') IN ('true','1')
          OR coalesce(p.perms ->> 'can_verify_operation', '') IN ('true','1')) AS has_flag,
         (SELECT string_agg(m.key || '=' || m.value, ', ' ORDER BY m.key)
            FROM jsonb_each_text(
                   CASE WHEN jsonb_typeof(p.perms -> 'modules') = 'object'
                        THEN p.perms -> 'modules' ELSE '{}'::jsonb END) m) AS modules_held
    FROM p
)
SELECT CASE
         WHEN email_confirmed_at IS NULL           THEN 'REFUSED -- e-mail never confirmed'
         WHEN banned_until IS NOT NULL
          AND banned_until > now()                 THEN 'REFUSED -- account banned in Supabase Auth'
         WHEN user_type = 'customer'               THEN 'REFUSED -- a customer account'
         WHEN profile_id IS NULL                   THEN 'REFUSED -- no shared_profiles row'
         WHEN NOT has_level AND NOT has_flag       THEN 'REFUSED -- no staff level on any module'
         ELSE 'OK -- the FC Portal lets this one in'
       END AS verdict,
       email,
       to_char(last_sign_in_at AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYY-MM-DD HH24:MI') AS signed_in_last,
       coalesce(nullif(user_type, ''), '-') AS user_type,
       coalesce(modules_held, '(none)') AS modules_held
  FROM v
 ORDER BY (CASE WHEN email_confirmed_at IS NULL
                  OR (banned_until IS NOT NULL AND banned_until > now())
                  OR user_type = 'customer'
                  OR profile_id IS NULL
                  OR (NOT has_level AND NOT has_flag)
                THEN 0 ELSE 1 END),
          last_sign_in_at DESC NULLS LAST;
