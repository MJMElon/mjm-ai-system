-- ================================================================
-- PROJECT MONITORING SYSTEM  (pms/pms_dashboard.html)
--
-- One paste. Safe to run twice. It ends in ONE result that says what
-- is there, and what a good result looks like is written just above
-- that last query.
--
-- WHAT IT MAKES
--   pms_tasks           one row per task
--   pms_settings        one row, id config: projects, team, lists, rates
--   pms_task_requests   one row per request for a task
--
-- WHO MAY DO WHAT, and the database decides it, not only the screen
--   The login is the MJM AI system own login (shared_profiles). The
--   module is opened to a person on the portal User Access page:
--     Admin   is Admin on every tab
--     Normal  gets the level set against their row in Settings, Team,
--             where the row is tied to the login by e-mail. A person
--             nobody has linked there can look, and request a task
--     none    sees nothing at all, and neither does a customer
--   The e-mail compared is the one on the signed-in session, never the
--   one on the profile row, because a person can edit their own row.
--
-- THE SEED
--   The 54 tasks and the settings of the old tracker go in ONCE, on the
--   run that finds no settings row. A second run seeds nothing, so a
--   task somebody deleted does not come back.
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
-- The same answer pms_app.js works out for the screen (applyAccess).
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
  acc  jsonb;
  v    text;
BEGIN
  SELECT lower(COALESCE(sp.permissions -> 'modules' ->> 'pms', 'none'))
    INTO lvl
    FROM public.shared_profiles sp
   WHERE sp.id = auth.uid()
     AND COALESCE(sp.user_type, 'system') <> 'customer';
  IF NOT FOUND OR lvl NOT IN ('admin', 'normal') THEN RETURN 'None'; END IF;
  IF lvl = 'admin' THEN RETURN 'Admin'; END IF;

  mail := lower(btrim(COALESCE(auth.jwt() ->> 'email', '')));
  IF mail <> '' THEN
    SELECT m.val -> 'access'
      INTO acc
      FROM public.pms_settings s
      CROSS JOIN LATERAL jsonb_array_elements(
             CASE WHEN jsonb_typeof(s.team) = 'array' THEN s.team ELSE '[]'::jsonb END) AS m(val)
     WHERE s.id = 'config'
       AND lower(btrim(COALESCE(m.val ->> 'email', ''))) = mail
     LIMIT 1;
    IF FOUND THEN
      v := acc ->> p_tab;
      IF v IN ('Admin', 'Normal', 'None') THEN RETURN v; END IF;
      RETURN 'Normal';
    END IF;
  END IF;

  -- let into the module, linked to no row in Team: may look and may request
  IF p_tab = 'settings' THEN RETURN 'None'; END IF;
  RETURN 'Normal';
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
GRANT EXECUTE ON FUNCTION public.pms_tab_level(text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_can_open()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.pms_can_edit_tasks() TO authenticated;

-- ----------------------------------------------------------------
-- The settings row is saved whole, by the Settings tab and by the
-- Value analysis tab alike. Who is in the team and what each of them
-- may do is the Settings tab alone, so a save that moves a login or a
-- level is refused unless the saver is Admin on Settings.
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
    RAISE EXCEPTION 'Only an Admin on Settings may change who is in the team or their access'
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

-- ----------------------------------------------------------------
-- The seed, once: only on the run that finds no settings row
-- ----------------------------------------------------------------
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM public.pms_settings WHERE id = 'config') THEN RETURN; END IF;

  INSERT INTO public.pms_settings (id, projects, priorities, types, team, updated_by)
  VALUES ('config',
    '[{"id": "p1", "name": "Nursery", "code": "N", "start": "2026-03-22", "duration": 365, "actualEnd": "", "modules": [{"name": "Customer Order Management", "status": "Upcoming", "value": {}, "subs": []}, {"name": "Batch Records", "status": "Upcoming", "value": {}, "subs": []}, {"name": "Seed Management", "status": "Upcoming", "value": {}, "subs": []}, {"name": "Monthly Maintenance Work Schedule", "status": "Upcoming", "value": {}, "subs": []}, {"name": "Monthly Maintenance Work Record", "status": "Upcoming", "value": {}, "subs": []}, {"name": "Sales Web - Admin Portal", "status": "Upcoming", "value": {}, "subs": []}, {"name": "Sales Web", "status": "Upcoming", "value": {}, "subs": []}, {"name": "Payroll System", "status": "Upcoming", "value": {}, "subs": []}, {"name": "Worker Portal - FC Portal", "status": "Upcoming", "value": {}, "subs": []}, {"name": "Worker Portal - Worker Portal", "status": "Upcoming", "value": {}, "subs": []}, {"name": "Audit System", "status": "Upcoming", "value": {}, "subs": []}], "baForm": true, "expenses": []}, {"id": "p2", "name": "Machinery", "code": "M", "start": "2026-05-18", "duration": 180, "actualEnd": "", "modules": [], "baForm": false, "expenses": []}, {"id": "p3", "name": "NASA", "code": "NA", "start": "", "duration": 180, "actualEnd": "", "modules": [], "baForm": false, "expenses": []}, {"id": "p4", "name": "DIA", "code": "D", "start": "2026-05-18", "duration": 180, "actualEnd": "", "modules": [], "baForm": false, "expenses": []}, {"id": "p5", "name": "Others", "code": "Z", "start": "", "duration": 180, "actualEnd": "", "modules": [], "baForm": false, "expenses": []}]'::jsonb,
    '["High", "Medium", "Low"]'::jsonb,
    '["Mobile", "Web", "Mobile & Web"]'::jsonb,
    '[{"id": "m1", "name": "Coco Lau", "email": "", "access": {"overview": "Normal", "board": "Normal", "timeline": "Normal", "list": "Normal", "requests": "Normal", "value": "Normal", "settings": "Normal"}}, {"id": "m2", "name": "Joyce Yii", "email": "", "access": {"overview": "Normal", "board": "Normal", "timeline": "Normal", "list": "Normal", "requests": "Normal", "value": "Normal", "settings": "Normal"}}, {"id": "m3", "name": "Esther Wong", "email": "", "access": {"overview": "Normal", "board": "Normal", "timeline": "Normal", "list": "Normal", "requests": "Normal", "value": "Normal", "settings": "Normal"}}, {"id": "m4", "name": "Ruth Wong", "email": "", "access": {"overview": "Normal", "board": "Normal", "timeline": "Normal", "list": "Normal", "requests": "Normal", "value": "Normal", "settings": "Normal"}}, {"id": "m5", "name": "Ken Tan", "email": "", "access": {"overview": "Normal", "board": "Normal", "timeline": "Normal", "list": "Normal", "requests": "Normal", "value": "Normal", "settings": "Normal"}}, {"id": "m6", "name": "Ms Chai", "email": "", "access": {"overview": "Normal", "board": "Normal", "timeline": "Normal", "list": "Normal", "requests": "Normal", "value": "Normal", "settings": "Normal"}}]'::jsonb,
    'Seed');

  INSERT INTO public.pms_tasks
    (id, project, type, name, priority, status, assignees, start_date, due_date, end_date, link, notes, sort_order)
  VALUES
    ('t001', 'Nursery', 'Web', 'Modify - Batch Report ver 2.0', 'High', 'Complete', '["Esther Wong"]'::jsonb, DATE '2026-09-10', DATE '2026-09-15', DATE '2026-09-19', '', '', 1),
    ('t002', 'Nursery', 'Web', 'Batch Report Checklist', 'Low', 'Complete', '["Esther Wong"]'::jsonb, DATE '2026-09-19', DATE '2026-09-24', DATE '2026-09-19', '', '', 2),
    ('t003', 'Nursery', 'Mobile', 'Modify - Nursery FC view ver 3.0 (PALMS)', 'High', 'Complete', '["Esther Wong"]'::jsonb, DATE '2026-09-10', DATE '2026-09-15', DATE '2026-09-15', '', '', 3),
    ('t004', 'Nursery', 'Mobile', 'FC Portal - Scanner', 'High', 'In Progress', '["Joyce Yii"]'::jsonb, DATE '2026-09-11', DATE '2026-09-16', NULL, '', '', 4),
    ('t005', 'Nursery', 'Web', 'Nursery Payroll System ver 2.0 (Maintenance & Transplanting)', 'High', 'Complete', '["Ruth Wong"]'::jsonb, DATE '2026-09-28', DATE '2026-10-03', DATE '2026-09-30', '', '', 5),
    ('t006', 'Nursery', 'Web', 'Customer Order Management', 'Low', 'Complete', '["Coco Lau", "Joyce Yii"]'::jsonb, DATE '2026-03-22', DATE '2026-03-27', DATE '2026-03-26', 'https://mjmelon.github.io/MJMNurseryAI/', '', 6),
    ('t007', 'Nursery', 'Web', 'Batch Record', 'Low', 'Complete', '["Coco Lau", "Ruth Wong"]'::jsonb, DATE '2026-03-30', DATE '2026-04-04', DATE '2026-04-08', 'https://ai.mjmnursery.com/index.html', '', 7),
    ('t008', 'Nursery', 'Web', 'Customer Collection DO generate & Signature', 'Low', 'Complete', '["Coco Lau", "Joyce Yii"]'::jsonb, DATE '2026-04-09', DATE '2026-04-14', DATE '2026-04-10', 'https://mobile.mjmnursery.com/', '', 8),
    ('t009', 'Nursery', 'Web', 'Customer Consent Signature', 'Low', 'Complete', '["Coco Lau", "Joyce Yii"]'::jsonb, DATE '2026-04-10', DATE '2026-04-15', DATE '2026-04-11', 'https://mobile.mjmnursery.com/', '', 9),
    ('t010', 'Nursery', 'Mobile & Web', 'Collection Time Slot Booking (For Internal and External)', 'Low', 'Complete', '["Coco Lau", "Joyce Yii"]'::jsonb, DATE '2026-04-11', DATE '2026-04-16', DATE '2026-04-11', 'For External : https://collect.mjmnursery.com/' || chr(10) || 'For Internal : https://mobile.mjmnursery.com/', '', 10),
    ('t011', 'Nursery', 'Web', 'MJM Nursery Sales Website (Full stack)', 'Low', 'Complete', '["Coco Lau", "Joyce Yii"]'::jsonb, DATE '2026-04-11', DATE '2026-04-16', DATE '2026-04-15', 'https://www.mjmnursery.com/', '', 11),
    ('t012', 'Nursery', 'Web', 'MJM Nursery Sales Website (User Interface)', 'Low', 'Complete', '["Coco Lau", "Joyce Yii"]'::jsonb, DATE '2026-04-17', DATE '2026-04-22', DATE '2026-04-18', 'https://www.mjmnursery.com/', '', 12),
    ('t013', 'Nursery', 'Web', 'Customer Portal', 'Low', 'Complete', '["Coco Lau", "Joyce Yii"]'::jsonb, DATE '2026-04-14', DATE '2026-04-19', DATE '2026-04-15', 'https://www.mjmnursery.com/', '', 13),
    ('t014', 'Nursery', 'Web', 'Admin Portal', 'Low', 'Complete', '["Coco Lau", "Joyce Yii"]'::jsonb, DATE '2026-04-14', DATE '2026-04-19', DATE '2026-04-15', 'https://www.mjmnursery.com/admin.html', '', 14),
    ('t015', 'Nursery', 'Web', 'Points System', 'Low', 'Complete', '["Coco Lau", "Joyce Yii"]'::jsonb, DATE '2026-04-15', DATE '2026-04-20', DATE '2026-04-15', 'https://www.mjmnursery.com/', '', 15),
    ('t016', 'Nursery', 'Web', 'Payment Gateway', 'Low', 'Complete', '["Coco Lau", "Joyce Yii"]'::jsonb, DATE '2026-04-14', DATE '2026-04-19', DATE '2026-04-15', 'https://www.mjmnursery.com/', '', 16),
    ('t017', 'Nursery', 'Mobile & Web', 'Audit System (Seedling condition & height)', 'Low', 'Complete', '["Ruth Wong"]'::jsonb, DATE '2026-04-14', DATE '2026-04-19', DATE '2026-04-16', 'https://ai.mjmnursery.com/audit/audit_home.html', '', 17),
    ('t018', 'Nursery', 'Mobile & Web', 'Siram Go! (watering)', 'Low', 'Complete', '["Ken Tan"]'::jsonb, DATE '2026-04-14', DATE '2026-04-19', DATE '2026-04-20', 'https://mjmelon.github.io/watering-log/', '', 18),
    ('t019', 'Nursery', 'Mobile & Web', 'Stock Inventory', 'Low', 'On Hold', '["Esther Wong", "Ruth Wong"]'::jsonb, NULL, NULL, NULL, '', '', 19),
    ('t020', 'Nursery', 'Web', 'Nursery Plot Manitenance System', 'High', 'Complete', '["Ruth Wong"]'::jsonb, DATE '2026-07-27', DATE '2026-08-01', DATE '2026-07-30', 'https://ai.mjmnursery.com/nursery_ops/nursery_ops_maintenance.html', '', 20),
    ('t021', 'Nursery', 'Web', 'Nursery Payroll System (Structure of system)', 'Low', 'Complete', '["Ruth Wong"]'::jsonb, DATE '2026-08-05', DATE '2026-08-10', DATE '2026-08-08', '', '', 21),
    ('t022', 'Nursery', 'Mobile', 'Nursery Plot Manitenance - Worker Portal', 'High', 'Complete', '["Ruth Wong"]'::jsonb, DATE '2026-08-24', DATE '2026-08-29', DATE '2026-08-28', 'https://ai.mjmnursery.com/scan/scan_admin.html', '', 22),
    ('t023', 'Nursery', 'Mobile', 'Nursery FC view (Barcode Scanner (Seal System)/DO)', 'High', 'Complete', '["Coco Lau"]'::jsonb, DATE '2026-07-13', DATE '2026-07-18', DATE '2026-07-17', 'https://scan.mjmnursery.com/?cb=1788487942212#/dashboard', '', 23),
    ('t024', 'Nursery', 'Mobile', 'Nursery FC view (PALMS/culling calculator)', 'High', 'Complete', '["Esther Wong"]'::jsonb, DATE '2026-08-17', DATE '2026-08-22', DATE '2026-08-21', 'https://scan.mjmnursery.com/?cb=1788487942212#/dashboard', '', 24),
    ('t025', 'Nursery', 'Mobile', 'Nursery FC view (Stock Taken)', 'Low', 'Not Started', '["Esther Wong"]'::jsonb, NULL, NULL, NULL, '', '', 25),
    ('t026', 'Nursery', 'Mobile', 'Nursery FC view (Plot Maintenance)', 'High', 'Complete', '["Ruth Wong"]'::jsonb, DATE '2026-08-17', DATE '2026-08-22', DATE '2026-08-20', 'https://scan.mjmnursery.com/?cb=1788487942212#/dashboard', '', 26),
    ('t027', 'Nursery', 'Web', 'Nursery Seedlings Counting', 'Medium', 'Not Started', '["Esther Wong", "Coco Lau"]'::jsonb, NULL, NULL, NULL, '', '', 27),
    ('t028', 'Nursery', 'Web', 'R&D', 'Low', 'Not Started', '["Esther Wong", "Coco Lau"]'::jsonb, NULL, NULL, NULL, '', '', 28),
    ('t029', 'Nursery', 'Web', 'Nursery Bible', 'Low', 'On Hold', '["Coco Lau", "Ruth Wong"]'::jsonb, DATE '2026-06-07', DATE '2026-06-12', DATE '2026-06-08', '', '', 29),
    ('t030', 'Nursery', 'Mobile', 'Use phone number as signup', 'Low', 'In Progress', '["Coco Lau"]'::jsonb, DATE '2026-08-10', DATE '2026-08-15', NULL, '', '', 30),
    ('t031', 'Nursery', 'Web', 'Nursery Seedlings Stock Summary (Batch record & DO record complete & correct)', 'High', 'Complete', '["Joyce Yii", "Ruth Wong"]'::jsonb, DATE '2026-08-17', DATE '2026-08-22', DATE '2026-09-19', '', '', 31),
    ('t032', 'NASA', 'Mobile & Web', 'Night watchman', 'Low', 'In Progress', '["Ms Chai", "Ruth Wong"]'::jsonb, DATE '2026-08-21', DATE '2026-08-26', NULL, '', '', 32),
    ('t033', 'Nursery', 'Mobile & Web', 'Modify - Audit System', 'High', 'Complete', '["Joyce Yii"]'::jsonb, DATE '2026-08-17', DATE '2026-08-22', DATE '2026-08-22', 'https://ai.mjmnursery.com/audit/audit_home.html', '', 33),
    ('t034', 'NASA', 'Web', 'NASA system', 'Low', 'Not Started', '[]'::jsonb, NULL, NULL, NULL, '', '', 34),
    ('t035', 'NASA', 'Web', 'Piece rate monitoring', 'Low', 'Not Started', '[]'::jsonb, NULL, NULL, NULL, '', '', 35),
    ('t036', 'DIA', 'Web', 'Vibe Tracker', 'Low', 'Complete', '["Ken Tan"]'::jsonb, DATE '2026-04-15', DATE '2026-04-20', DATE '2026-04-18', '', '', 36),
    ('t037', 'DIA', 'Web', 'DIA system', 'Low', 'Not Started', '[]'::jsonb, NULL, NULL, NULL, '', '', 37),
    ('t038', 'DIA', 'Mobile & Web', 'Dronedeploy - Palm Counting', 'Low', 'Not Started', '["Coco Lau"]'::jsonb, NULL, NULL, NULL, '', '', 38),
    ('t039', 'Machinery', 'Web', 'Work Maintenance Record + Payroll Form', 'Low', 'Complete', '["Ken Tan"]'::jsonb, NULL, NULL, NULL, '', '', 39),
    ('t040', 'Machinery', 'Mobile & Web', 'Service request system', 'High', 'In Progress', '["Ken Tan"]'::jsonb, NULL, NULL, NULL, '', '', 40),
    ('t041', 'Machinery', 'Mobile & Web', 'Diesel record', 'Low', 'Not Started', '[]'::jsonb, NULL, NULL, NULL, '', '', 41),
    ('t042', 'Machinery', 'Mobile & Web', 'Machinery CMMS - machinery registration', 'High', 'In Progress', '["Ken Tan"]'::jsonb, DATE '2026-08-24', DATE '2026-08-29', NULL, '', '', 42),
    ('t043', 'Others', 'Web', 'Leadership Training', 'Low', 'In Progress', '["Coco Lau"]'::jsonb, NULL, NULL, NULL, '', '', 43),
    ('t044', 'Machinery', 'Mobile', 'GAIA system for maintenance record', 'Medium', 'Complete', '["Ken Tan"]'::jsonb, DATE '2026-08-12', DATE '2026-08-17', DATE '2026-08-14', 'https://mjmelon.github.io/MachTrek/#/login', '', 44),
    ('t045', 'Machinery', 'Mobile & Web', 'Machinery CMMS - monthly SMU record', 'Low', 'In Progress', '["Ken Tan"]'::jsonb, DATE '2026-08-24', DATE '2026-08-28', NULL, '', '', 45),
    ('t046', 'Nursery', 'Mobile & Web', 'Nursery Carlos System (Neslo)', 'High', 'Complete', '["Coco Lau"]'::jsonb, DATE '2026-08-24', DATE '2026-08-28', DATE '2026-08-27', 'https://ai.mjmnursery.com/nelos/nelos_dashboard.html', '', 46),
    ('t047', 'Nursery', 'Web', 'Nursery Audit - User Setting / System Setting', 'High', 'Complete', '["Ruth Wong"]'::jsonb, DATE '2026-08-24', DATE '2026-08-28', DATE '2026-08-25', 'https://ai.mjmnursery.com/audit/audit_home.html', '', 47),
    ('t048', 'Nursery', 'Mobile', 'Modify - Nursery FC view (Plot Maintenance)', 'High', 'Complete', '["Ruth Wong"]'::jsonb, DATE '2026-08-24', DATE '2026-08-28', DATE '2026-08-27', 'https://scan.mjmnursery.com/?cb=1788487942212#/dashboard', '', 48),
    ('t049', 'Nursery', 'Mobile', 'Modify - Nursery FC view (PALMS/culling calculator)', 'High', 'Complete', '["Esther Wong"]'::jsonb, DATE '2026-08-24', DATE '2026-08-28', DATE '2026-08-28', 'https://scan.mjmnursery.com/?cb=1788487942212#/dashboard', '', 49),
    ('t050', 'Nursery', 'Mobile & Web', 'Modify - Audit System ver 2.0', 'High', 'Complete', '["Joyce Yii"]'::jsonb, DATE '2026-08-24', DATE '2026-08-28', DATE '2026-08-28', 'https://ai.mjmnursery.com/audit/audit_home.html', '', 50),
    ('t051', 'Nursery', 'Mobile', 'Modify - Nursery Plot Manitenance (Worker Portal) ver. 2.0', 'High', 'Complete', '["Ruth Wong"]'::jsonb, DATE '2026-08-28', DATE '2026-09-01', DATE '2026-08-30', 'https://scan.mjmnursery.com/?cb=1788487963839#/worker', '', 51),
    ('t052', 'Nursery', 'Mobile & Web', 'Audit System Offline function', 'High', 'Complete', '["Joyce Yii"]'::jsonb, DATE '2026-08-28', DATE '2026-09-01', DATE '2026-08-31', 'https://ai.mjmnursery.com/audit/audit_home.html', '', 52),
    ('t053', 'Nursery', 'Mobile', 'Modify - Nursery FC view (Plot Maintenance) ver 2.0', 'High', 'Complete', '["Ruth Wong"]'::jsonb, DATE '2026-08-28', DATE '2026-09-01', DATE '2026-08-29', 'https://scan.mjmnursery.com/?cb=1788487942212#/dashboard', '', 53),
    ('t054', 'Nursery', 'Mobile', 'Modify - Nursery FC view ver 2.0 (PALMS/culling calculator)', 'High', 'Complete', '["Esther Wong", "Coco Lau"]'::jsonb, DATE '2026-08-28', DATE '2026-09-01', DATE '2026-08-31', 'https://scan.mjmnursery.com/?cb=1788487942212#/dashboard', '', 54)
  ON CONFLICT (id) DO NOTHING;
END
$do$;

NOTIFY pgrst, 'reload schema';

-- ----------------------------------------------------------------
-- THE CHECK. One result, eight lines, and what each should read:
--   1  tables                 3 of 3
--   2  row level security     3 of 3
--   3  policies               11
--   4  team guard trigger     installed
--   5  tasks                  54 on the first run, then whatever is there
--   6  settings row           present, with 5 projects and 6 people on
--                             the first run
--   7  who holds the module   0 Admin and 0 Normal until somebody is
--                             given it on the portal User Access page.
--                             That is correct on the first run, and it
--                             is the next thing to do
--   8  team linked to a login 0 of 6 on the first run. Link each person
--                             in the module, Settings, Team
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
                          || jsonb_array_length(s.team)::text || ' people'
                     FROM public.pms_settings s WHERE s.id = 'config'), 'MISSING')
  UNION ALL
  SELECT 7, 'who holds the module',
         (SELECT count(*) FILTER (WHERE lower(sp.permissions -> 'modules' ->> 'pms') = 'admin')::text || ' Admin, '
              || count(*) FILTER (WHERE lower(sp.permissions -> 'modules' ->> 'pms') = 'normal')::text || ' Normal'
            FROM public.shared_profiles sp WHERE COALESCE(sp.user_type, 'system') <> 'customer')
  UNION ALL
  SELECT 8, 'team linked to a login',
         COALESCE((SELECT count(*) FILTER (WHERE btrim(COALESCE(m.val ->> 'email', '')) <> '')::text
                          || ' of ' || count(*)::text
                     FROM public.pms_settings s
                     CROSS JOIN LATERAL jsonb_array_elements(s.team) AS m(val)
                    WHERE s.id = 'config'), '0 of 0')
) x
ORDER BY n;