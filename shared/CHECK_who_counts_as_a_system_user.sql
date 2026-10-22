-- CHECK — who is on the System Users tab of User Access, and why
--
-- The System Users tab shows every shared_profiles row whose user_type is
-- the word system OR is empty -- an empty answer counts as system on
-- purpose, so staff from before the column existed did not vanish off the
-- access screen the day it was added.
--
-- What fills the tab with strangers is the signup side: the
-- on_auth_user_created trigger writes a profile row for EVERY new account,
-- and it files the account as system unless the signup itself said
-- customer in the auth metadata. Only the Salesweb signup says that. An
-- account made any other way -- an old Salesweb signup from before the
-- metadata was written, an auditor account, somebody who created a login
-- at any sign-in screen -- lands on the staff tab with no name and no
-- access.
--
-- Such an account holds NO office module (an empty permissions column
-- means nobody has been asked, and the main portal modules default to
-- none), so this is clutter rather than access -- but the FC Portal
-- deliberately fails open for unconfigured logins, so the list is still
-- worth tidying.
--
-- This file classifies every account the tab shows:
--   STRAY SIGNUP      no name, no module opened, nobody has configured it
--                     -- almost certainly a customer or a test account.
--                     Move to customer from the Edit Access drawer, or ask
--                     for a RUN_ME naming the ones to move in one go
--   NO MODULES        has a name but nothing opened -- ask before moving,
--                     it could be a new hire waiting for access
--   CONFIGURED STAFF  holds at least one module or can manage users
--
-- Good result: the SUMMARY line on top, then the strays first. Each one
-- moved to customer on the User Access screen leaves this list on the
-- next run.

WITH prof AS (
  SELECT p.id,
         COALESCE(NULLIF(trim(COALESCE(p.email, '')), ''), u.email, p.id::text) AS who,
         NULLIF(trim(COALESCE(p.full_name, '')), '') AS full_name,
         COALESCE(to_jsonb(p) ->> 'user_type', '') AS stored_type,
         CASE WHEN jsonb_typeof(to_jsonb(p) -> 'permissions') = 'object'
              THEN to_jsonb(p) -> 'permissions' ELSE '{}'::jsonb END AS perms,
         left(u.created_at::text, 10) AS signed_up,
         left(u.last_sign_in_at::text, 10) AS last_sign_in,
         COALESCE(u.raw_user_meta_data ->> 'user_type', '') AS signup_said
  FROM public.shared_profiles p
  LEFT JOIN auth.users u ON u.id = p.id
),
sys AS (
  SELECT * FROM prof WHERE stored_type <> 'customer'
),
graded AS (
  SELECT s.*,
         COALESCE((SELECT string_agg(m.k, ', ' ORDER BY m.k)
                     FROM jsonb_each_text(COALESCE(s.perms -> 'modules', '{}'::jsonb)) AS m(k, v)
                    WHERE m.v IN ('admin', 'normal')), '') AS modules_open,
         COALESCE((s.perms ->> 'manage_users') = 'true', false) AS can_manage_users
  FROM sys s
),
verdicts AS (
  SELECT g.*,
         CASE
           WHEN g.modules_open <> '' OR g.can_manage_users THEN 'CONFIGURED STAFF'
           WHEN g.full_name IS NULL THEN 'STRAY SIGNUP - no name, nothing opened'
           ELSE 'NO MODULES - has a name, ask before moving'
         END AS verdict,
         CASE
           WHEN g.modules_open <> '' OR g.can_manage_users THEN 2
           WHEN g.full_name IS NULL THEN 0
           ELSE 1
         END AS rank
  FROM graded g
)
SELECT 0 AS sort_first,
       '== SUMMARY =='                                            AS who,
       ''                                                         AS name,
       count(*) FILTER (WHERE rank = 0) || ' stray, '
         || count(*) FILTER (WHERE rank = 1) || ' unconfigured with a name, '
         || count(*) FILTER (WHERE rank = 2) || ' configured staff'
         || ' of ' || count(*) || ' on the System Users tab'      AS verdict,
       ''                                                         AS stored_type,
       ''                                                         AS modules_open,
       ''                                                         AS signed_up,
       ''                                                         AS last_sign_in
FROM verdicts
UNION ALL
SELECT rank + 1, who,
       COALESCE(full_name, '(no name)'),
       verdict,
       CASE WHEN stored_type = '' THEN '(never set)' ELSE stored_type END,
       modules_open,
       COALESCE(signed_up, '(no auth row)'),
       COALESCE(last_sign_in, 'never')
FROM verdicts
ORDER BY sort_first, verdict, signed_up DESC, who;
