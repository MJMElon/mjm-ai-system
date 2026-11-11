-- ================================================================
-- PROJECT MONITORING SYSTEM  (pms/pms_dashboard.html)
--
-- One paste. Safe to run twice. It ends in ONE result that says what
-- is there, and what a good result looks like is written just above
-- that last query.
--
-- WHAT IT MAKES
--   pms_tasks           one row per task
--   pms_settings        one row, id config: projects, lists, rates and
--                       the tabs opened or closed for one person
--   pms_task_requests   one row per request for a task
--
-- WHO MAY DO WHAT, and the database decides it, not only the screen
--   The login is the MJM AI system own login (shared_profiles), and
--   THERE IS NO TEAM LIST. The people of the module are the staff
--   accounts holding it on the portal User Access page, and what a
--   person holds there is their level on every tab:
--     Admin   may add, edit and delete on every tab
--     Normal  may look at every tab, and request a task
--     none    sees nothing at all, and neither does a customer
--   Settings, User access can then open or close ONE tab for ONE
--   person. Only those differences are stored, by e-mail, in the team
--   column of the settings row. A tab that is not named there follows
--   User Access. A module Admin always keeps Settings, because that is
--   the tab that hands out the rest.
--   The e-mail compared is the one on the signed-in session, never the
--   one on the profile row, because a person can edit their own row.
--
-- NO DATA IS IN THIS FILE
--   It makes the tables and the rules and nothing else. No task, no
--   project and no person is written by it: those are keyed in the
--   module, and a run of this file over a tracker already in use
--   touches none of what is there.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.pms_tasks (
  id             text PRIMARY KEY,
  project        text,
  type           text,
  name           text,
  priority       text,
  status         text,
  assignees      jsonb NOT NULL DEFAULT '[]'::jsonb,
  start_date     date,
  due_date       date,
  end_date       date,
  cancelled_date date,
  link           text,
  notes          text,
  sort_order     numeric,
  modifies       text,
  module         text,
  sub_project    text,
  value          jsonb,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  updated_by     text
);

CREATE TABLE IF NOT EXISTS public.pms_settings (
  id          text PRIMARY KEY,
  projects    jsonb NOT NULL DEFAULT '[]'::jsonb,
  priorities  jsonb NOT NULL DEFAULT '[]'::jsonb,
  types       jsonb NOT NULL DEFAULT '[]'::jsonb,
  team        jsonb NOT NULL DEFAULT '[]'::jsonb,
  value_rate  numeric,
  value_rates jsonb,
  updated_at  timestamptz DEFAULT now(),
  updated_by  text
);

CREATE TABLE IF NOT EXISTS public.pms_task_requests (
  id         text PRIMARY KEY,
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- ----------------------------------------------------------------
-- The level this login has on one tab: Admin, Normal or None.
-- The same answer pms_app.js works out for the screen (accessFor).
-- Change one, change the other.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pms_tab_level(p_tab text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  lvl  text;
  mail text;
  v    text;
BEGIN
  SELECT lower(COALESCE(sp.permissions -> 'modules' ->> 'pms', 'none'))
    INTO lvl
    FROM public.shared_profiles sp
   WHERE sp.id = auth.uid()
     AND COALESCE(sp.user_type, 'system') <> 'customer';
  IF NOT FOUND OR lvl NOT IN ('admin', 'normal') THEN RETURN 'None'; END IF;
  IF lvl = 'admin' AND p_tab = 'settings' THEN RETURN 'Admin'; END IF;

  -- one tab opened or closed for this person in Settings, User access
  mail := lower(btrim(COALESCE(auth.jwt() ->> 'email', '')));
  IF mail <> '' THEN
    SELECT m.val -> 'access' ->> p_tab
      INTO v
      FROM public.pms_settings s
      CROSS JOIN LATERAL jsonb_array_elements(
             CASE WHEN jsonb_typeof(s.team) = 'array' THEN s.team ELSE '[]'::jsonb END) AS m(val)
     WHERE s.id = 'config'
       AND lower(btrim(COALESCE(m.val ->> 'email', ''))) = mail
     LIMIT 1;
    IF v IN ('Admin', 'Normal', 'None') THEN RETURN v; END IF;
  END IF;

  -- nothing said about this tab: what they hold on User Access
  IF lvl = 'admin' THEN RETURN 'Admin'; END IF;
  RETURN 'Normal';
END
$fn$;

-- ----------------------------------------------------------------
-- Who is in the module: every staff account holding it on User
-- Access. They are who a task can be assigned to, and the list on
-- Settings, User access. Answered only to a login that may open the
-- module, because not every login may read every profile.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pms_people()
RETURNS TABLE (email text, full_name text, level text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT public.pms_can_open() THEN RETURN; END IF;
  RETURN QUERY
    SELECT lower(btrim(sp.email))::text,
           COALESCE(sp.full_name, '')::text,
           lower(sp.permissions -> 'modules' ->> 'pms')::text
      FROM public.shared_profiles sp
     WHERE COALESCE(sp.user_type, 'system') <> 'customer'
       AND btrim(COALESCE(sp.email, '')) <> ''
       AND lower(COALESCE(sp.permissions -> 'modules' ->> 'pms', 'none')) IN ('admin', 'normal')
     ORDER BY 2, 1;
END
$fn$;

-- May this login open the module at all
CREATE OR REPLACE FUNCTION public.pms_can_open()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.shared_profiles sp
     WHERE sp.id = auth.uid()
       AND COALESCE(sp.user_type, 'system') <> 'customer'
       AND lower(COALESCE(sp.permissions -> 'modules' ->> 'pms', 'none')) IN ('admin', 'normal'))
$fn$;

-- A task is edited from whichever tab it was opened on, an approved
-- request becomes a task, and a rename in Settings moves its tasks. So
-- Admin on any tab may write a task
CREATE OR REPLACE FUNCTION public.pms_can_edit_tasks()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT 'Admin' IN (public.pms_tab_level('overview'), public.pms_tab_level('board'),
                     public.pms_tab_level('timeline'), public.pms_tab_level('list'),
                     public.pms_tab_level('requests'), public.pms_tab_level('value'),
                     public.pms_tab_level('settings'))
$fn$;

REVOKE ALL ON FUNCTION public.pms_tab_level(text)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pms_can_open()        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pms_can_edit_tasks()  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pms_people()          FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pms_tab_level(text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_can_open()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_can_edit_tasks() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_people()         TO authenticated;

-- ----------------------------------------------------------------
-- The settings row is saved whole, by the Settings tab and by the
-- Value analysis tab alike. Which tabs are opened or closed for a
-- person is the Settings tab alone, so a save that moves one of them
-- is refused unless the saver is Admin on Settings.
-- A row with no e-mail is from when this column was a list of names.
-- It ties to no login and the page drops it on its next save, so it
-- is left out of the comparison, or that save would be refused to
-- somebody who changed nothing about anybody.
-- A run from the SQL Editor has no login and is let through.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pms_team_access_of(p_team jsonb)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_array(
                    lower(btrim(COALESCE(m.val ->> 'email', ''))), m.val -> 'access')
                  ORDER BY lower(btrim(COALESCE(m.val ->> 'email', ''))), (m.val -> 'access')::text),
                  '[]'::jsonb)
    FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(p_team) = 'array' THEN p_team ELSE '[]'::jsonb END) AS m(val)
   WHERE btrim(COALESCE(m.val ->> 'email', '')) <> ''
$fn$;

CREATE OR REPLACE FUNCTION public.pms_guard_team()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE'
     AND public.pms_team_access_of(NEW.team) = public.pms_team_access_of(OLD.team) THEN
    RETURN NEW;
  END IF;
  IF public.pms_tab_level('settings') <> 'Admin' THEN
    RAISE EXCEPTION 'Only an Admin on Settings may change what a person can open'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS pms_guard_team ON public.pms_settings;
CREATE TRIGGER pms_guard_team
  BEFORE INSERT OR UPDATE ON public.pms_settings
  FOR EACH ROW EXECUTE FUNCTION public.pms_guard_team();

-- ----------------------------------------------------------------
-- Row level security
-- ----------------------------------------------------------------
ALTER TABLE public.pms_tasks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_task_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pms_tasks, public.pms_settings, public.pms_task_requests FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_tasks, public.pms_settings, public.pms_task_requests TO authenticated;

DROP POLICY IF EXISTS pms_tasks_read   ON public.pms_tasks;
DROP POLICY IF EXISTS pms_tasks_insert ON public.pms_tasks;
DROP POLICY IF EXISTS pms_tasks_update ON public.pms_tasks;
DROP POLICY IF EXISTS pms_tasks_delete ON public.pms_tasks;
CREATE POLICY pms_tasks_read   ON public.pms_tasks FOR SELECT TO authenticated USING (public.pms_can_open());
CREATE POLICY pms_tasks_insert ON public.pms_tasks FOR INSERT TO authenticated WITH CHECK (public.pms_can_edit_tasks());
CREATE POLICY pms_tasks_update ON public.pms_tasks FOR UPDATE TO authenticated USING (public.pms_can_edit_tasks()) WITH CHECK (public.pms_can_edit_tasks());
CREATE POLICY pms_tasks_delete ON public.pms_tasks FOR DELETE TO authenticated USING (public.pms_can_edit_tasks());

DROP POLICY IF EXISTS pms_settings_read   ON public.pms_settings;
DROP POLICY IF EXISTS pms_settings_insert ON public.pms_settings;
DROP POLICY IF EXISTS pms_settings_update ON public.pms_settings;
CREATE POLICY pms_settings_read   ON public.pms_settings FOR SELECT TO authenticated USING (public.pms_can_open());
CREATE POLICY pms_settings_insert ON public.pms_settings FOR INSERT TO authenticated
  WITH CHECK ('Admin' IN (public.pms_tab_level('settings'), public.pms_tab_level('value')));
CREATE POLICY pms_settings_update ON public.pms_settings FOR UPDATE TO authenticated
  USING ('Admin' IN (public.pms_tab_level('settings'), public.pms_tab_level('value')))
  WITH CHECK ('Admin' IN (public.pms_tab_level('settings'), public.pms_tab_level('value')));

DROP POLICY IF EXISTS pms_requests_read   ON public.pms_task_requests;
DROP POLICY IF EXISTS pms_requests_insert ON public.pms_task_requests;
DROP POLICY IF EXISTS pms_requests_update ON public.pms_task_requests;
DROP POLICY IF EXISTS pms_requests_delete ON public.pms_task_requests;
CREATE POLICY pms_requests_read   ON public.pms_task_requests FOR SELECT TO authenticated USING (public.pms_can_open());
CREATE POLICY pms_requests_insert ON public.pms_task_requests FOR INSERT TO authenticated WITH CHECK (public.pms_tab_level('requests') <> 'None');
CREATE POLICY pms_requests_update ON public.pms_task_requests FOR UPDATE TO authenticated
  USING (public.pms_tab_level('requests') <> 'None') WITH CHECK (public.pms_tab_level('requests') <> 'None');
CREATE POLICY pms_requests_delete ON public.pms_task_requests FOR DELETE TO authenticated USING (public.pms_tab_level('requests') = 'Admin');

-- ----------------------------------------------------------------
-- Live updates: another person change arrives without a reload.
-- The page also re-reads after its own saves, so this is a comfort
-- and not a dependency.
-- ----------------------------------------------------------------
DO $do$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['pms_tasks', 'pms_settings', 'pms_task_requests'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END
$do$;

NOTIFY pgrst, 'reload schema';

-- ----------------------------------------------------------------
-- THE CHECK. One result, nine lines, and what each should read:
--   1  tables                 3 of 3
--   2  row level security     3 of 3
--   3  policies               11
--   4  team guard trigger     installed
--   5  tasks                  whatever is there. This file adds none
--   6  settings row           present once Settings has been saved in
--                             the module, and "not saved yet" before
--   7  who holds the module   who was given it on the portal User
--                             Access page. These are the people of
--                             the module and who a task is assigned to
--   8  tabs changed in        how many people have a tab opened or
--      Settings               closed differently from User Access.
--                             0 is a good answer: everybody follows
--                             what they hold there
--   9  people function        installed
-- ----------------------------------------------------------------
SELECT n AS "#", item, result FROM (
  SELECT 1 AS n, 'tables' AS item,
         (SELECT count(*) FROM information_schema.tables
           WHERE table_schema = 'public'
             AND table_name IN ('pms_tasks', 'pms_settings', 'pms_task_requests'))::text || ' of 3' AS result
  UNION ALL
  SELECT 2, 'row level security',
         (SELECT count(*) FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
           WHERE ns.nspname = 'public' AND c.relrowsecurity
             AND c.relname IN ('pms_tasks', 'pms_settings', 'pms_task_requests'))::text || ' of 3'
  UNION ALL
  SELECT 3, 'policies',
         (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
             AND tablename IN ('pms_tasks', 'pms_settings', 'pms_task_requests'))::text
  UNION ALL
  SELECT 4, 'team guard trigger',
         CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'pms_guard_team' AND NOT tgisinternal)
              THEN 'installed' ELSE 'MISSING' END
  UNION ALL
  SELECT 5, 'tasks', (SELECT count(*) FROM public.pms_tasks)::text
  UNION ALL
  SELECT 6, 'settings row',
         COALESCE((SELECT 'present, ' || jsonb_array_length(s.projects)::text || ' projects, '
                          || jsonb_array_length(s.priorities)::text || ' priorities, '
                          || jsonb_array_length(s.types)::text || ' types'
                     FROM public.pms_settings s WHERE s.id = 'config'), 'not saved yet')
  UNION ALL
  SELECT 7, 'who holds the module',
         (SELECT count(*) FILTER (WHERE lower(sp.permissions -> 'modules' ->> 'pms') = 'admin')::text || ' Admin, '
              || count(*) FILTER (WHERE lower(sp.permissions -> 'modules' ->> 'pms') = 'normal')::text || ' Normal'
            FROM public.shared_profiles sp WHERE COALESCE(sp.user_type, 'system') <> 'customer')
  UNION ALL
  SELECT 8, 'tabs changed in Settings',
         COALESCE((SELECT count(*) FILTER (WHERE btrim(COALESCE(m.val ->> 'email', '')) <> '')::text || ' people'
                     FROM public.pms_settings s
                     CROSS JOIN LATERAL jsonb_array_elements(
                            CASE WHEN jsonb_typeof(s.team) = 'array' THEN s.team ELSE '[]'::jsonb END) AS m(val)
                    WHERE s.id = 'config'), '0 people')
  UNION ALL
  SELECT 9, 'people function',
         CASE WHEN to_regprocedure('public.pms_people()') IS NOT NULL THEN 'installed' ELSE 'MISSING' END
) x
ORDER BY n;