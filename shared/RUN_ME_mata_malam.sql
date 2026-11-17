-- ════════════════════════════════════════════════════════════════════════
-- MATA MALAM KEEPS ITS DATA IN THIS DATABASE
--
-- Mata Malam is the night check-in app. Until now everything it knew was
-- kept on the one phone that recorded it, so the office could not see a
-- check-in, a phone that was replaced lost its history, and the locations
-- and their times had to be set again on every phone.
--
-- A guard enters with the PIN on their row of the payroll register, the
-- same door as the 555 Worker Portal, so every check-in carries a name.
-- A guard is anon and reads no table. Everything goes through the
-- mata_malam functions below, each of which turns the token back into a
-- worker before it does anything.
--
-- WHAT THIS ADDS, and it changes no existing table and no existing rule
--   mata_malam_settings   one row. The locations in use, each one with its
--                         own check-in times, and the task timing.
--   mata_malam_logs       one row per check-in, with who, where, when, the
--                         photo link and the road track.
--   five functions        state, save settings, submit, route, photo ticket
--   one storage rule      photos go to documents / mata_malam_photos and
--                         nowhere else, and only with a live ticket
--
-- WHO MAY CHANGE THE SETTINGS
--   Admin, Estate Manager, Field Conductor and Assistant Field Conductor,
--   and anybody the office has given Settings on the Worker Portal.
--   Everybody else reads them.
--
-- THE LOCATIONS are the names in operation_nurseries, which is the list on
-- Operation - Settings. Nothing is copied. A nursery added there turns up
-- in Mata Malam on the next sync.
--
-- Safe to run twice. Nothing is seeded and nothing is backfilled.
--
-- WHAT A GOOD RESULT LOOKS LIKE
--   every line of the result reads OK in its last column
--   the settings line reads   not set yet   until somebody saves them
--   the check-ins line reads  0   until the first phone syncs
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.mata_malam_settings (
  id          INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  settings    JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ,
  updated_by  TEXT
);

CREATE TABLE IF NOT EXISTS public.mata_malam_logs (
  id              BIGSERIAL PRIMARY KEY,
  client_uid      TEXT NOT NULL,
  worker_id       BIGINT,
  worker_name     TEXT,
  location        TEXT NOT NULL,
  shift_date      DATE NOT NULL,
  slot            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'completed',
  coordinates     TEXT,
  submitted_at    TIMESTAMPTZ,
  photo_url       TEXT,
  patrol_open     BOOLEAN NOT NULL DEFAULT false,
  route           JSONB,
  route_distance  NUMERIC,
  route_duration  NUMERIC,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS mata_malam_logs_client_uid
  ON public.mata_malam_logs (client_uid);
CREATE INDEX IF NOT EXISTS mata_malam_logs_shift
  ON public.mata_malam_logs (shift_date, location);

-- No policies, like the worker sessions table. Nothing reaches these two
-- except the functions below, which run as their owner.
ALTER TABLE public.mata_malam_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mata_malam_logs     ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mata_malam_settings FROM anon;
REVOKE ALL ON public.mata_malam_logs     FROM anon;


-- May this worker change the locations and the times
CREATE OR REPLACE FUNCTION public.mata_malam_can_edit(w public.mjmnpayroll_workers)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE((w.portal #> '{modules,settings}')::boolean, false)
      OR upper(replace(COALESCE(w.role, ''), ' ', '')) IN
         ('ADMIN', 'ESTATEMANAGER', 'FIELDCONDUCTOR', 'ASSISTANTFIELDCONDUCTOR')
$$;


-- Everything the phone needs in one round trip
CREATE OR REPLACE FUNCTION public.mata_malam_state(p_token UUID, p_from DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w       public.mjmnpayroll_workers;
  v_from  DATE := COALESCE(p_from, current_date - 35);
  v_set   public.mata_malam_settings;
BEGIN
  w := public.worker_from_token(p_token);
  SELECT * INTO v_set FROM public.mata_malam_settings WHERE id = 1;

  RETURN jsonb_build_object(
    'worker', jsonb_build_object('id', w.id, 'name', w.full_name, 'role', w.role),
    'can_edit', public.mata_malam_can_edit(w),
    'locations', COALESCE((
      SELECT jsonb_agg(n.name::TEXT ORDER BY n.name::TEXT)
        FROM public.operation_nurseries n
       WHERE n.name IS NOT NULL AND btrim(n.name::TEXT) <> ''), '[]'::jsonb),
    'settings', COALESCE(v_set.settings, '{}'::jsonb),
    'settings_at', v_set.updated_at,
    'settings_by', v_set.updated_by,
    'logs', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id',            l.client_uid,
               'location',      l.location,
               'date',          to_char(l.shift_date, 'YYYY-MM-DD'),
               'time',          l.slot,
               'status',        l.status,
               'coordinates',   l.coordinates,
               'submittedAt',   l.submitted_at,
               'photoUrl',      l.photo_url,
               'patrolOpen',    l.patrol_open,
               'hasRoute',      (l.route IS NOT NULL),
               'routeDistance', l.route_distance,
               'routeDuration', l.route_duration,
               'workerId',      l.worker_id,
               'workerName',    l.worker_name
             ) ORDER BY l.shift_date, l.id)
        FROM public.mata_malam_logs l
       WHERE l.shift_date >= v_from), '[]'::jsonb)
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.mata_malam_save_settings(p_token UUID, p_settings JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w public.mjmnpayroll_workers;
  v_at TIMESTAMPTZ := now();
BEGIN
  w := public.worker_from_token(p_token);
  IF NOT public.mata_malam_can_edit(w) THEN
    RAISE EXCEPTION 'you may not change the Mata Malam settings' USING ERRCODE = '42501';
  END IF;
  IF p_settings IS NULL OR jsonb_typeof(p_settings) <> 'object' THEN
    RAISE EXCEPTION 'settings must be an object' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.mata_malam_settings (id, settings, updated_at, updated_by)
  VALUES (1, p_settings, v_at, w.full_name)
  ON CONFLICT (id) DO UPDATE
    SET settings = EXCLUDED.settings,
        updated_at = EXCLUDED.updated_at,
        updated_by = EXCLUDED.updated_by;

  RETURN jsonb_build_object('settings_at', v_at, 'settings_by', w.full_name);
END;
$$;


-- One check-in. Sent again when its road track is finished, and again by a
-- phone that never heard the first answer, so it is an upsert on the id the
-- phone gave it. Only the worker who made a check-in may change it.
CREATE OR REPLACE FUNCTION public.mata_malam_submit(p_token UUID, p_log JSONB)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w       public.mjmnpayroll_workers;
  v_uid   TEXT := btrim(COALESCE(p_log ->> 'id', ''));
  v_loc   TEXT := btrim(COALESCE(p_log ->> 'location', ''));
  v_slot  TEXT := btrim(COALESCE(p_log ->> 'time', ''));
  v_date  DATE;
  v_url   TEXT := NULLIF(btrim(COALESCE(p_log ->> 'photoUrl', '')), '');
  v_route JSONB := p_log -> 'route';
  v_id    BIGINT;
BEGIN
  w := public.worker_from_token(p_token);

  IF v_uid = '' OR length(v_uid) > 80 OR v_loc = '' OR length(v_loc) > 40
     OR v_slot = '' OR length(v_slot) > 12 THEN
    RAISE EXCEPTION 'this check-in is missing its id, location or time' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_date := (p_log ->> 'date')::DATE;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'this check-in has no valid date' USING ERRCODE = '22023';
  END;
  IF v_date IS NULL THEN
    RAISE EXCEPTION 'this check-in has no valid date' USING ERRCODE = '22023';
  END IF;

  -- The link is checked rather than trusted. It has to be a public link to
  -- a file under mata_malam_photos in the documents bucket of this project.
  IF v_url IS NOT NULL AND (
       left(v_url, 8) <> 'https://'
       OR position('/storage/v1/object/public/documents/mata_malam_photos/' IN v_url) = 0
       OR length(v_url) > 400) THEN
    RAISE EXCEPTION 'that is not a Mata Malam photo link' USING ERRCODE = '22023';
  END IF;
  IF v_route IS NOT NULL AND jsonb_typeof(v_route) <> 'array' THEN
    v_route := NULL;
  END IF;

  INSERT INTO public.mata_malam_logs AS l
    (client_uid, worker_id, worker_name, location, shift_date, slot, status,
     coordinates, submitted_at, photo_url, patrol_open, route, route_distance, route_duration)
  VALUES
    (v_uid, w.id, w.full_name, v_loc, v_date, v_slot, 'completed',
     left(p_log ->> 'coordinates', 120),
     COALESCE((p_log ->> 'submittedAt')::TIMESTAMPTZ, now()),
     v_url,
     COALESCE((p_log ->> 'patrolOpen')::BOOLEAN, false),
     v_route,
     (p_log ->> 'routeDistance')::NUMERIC,
     (p_log ->> 'routeDuration')::NUMERIC)
  ON CONFLICT (client_uid) DO UPDATE
    SET coordinates    = EXCLUDED.coordinates,
        photo_url      = COALESCE(EXCLUDED.photo_url, l.photo_url),
        patrol_open    = EXCLUDED.patrol_open,
        route          = COALESCE(EXCLUDED.route, l.route),
        route_distance = COALESCE(EXCLUDED.route_distance, l.route_distance),
        route_duration = COALESCE(EXCLUDED.route_duration, l.route_duration),
        updated_at     = now()
    WHERE l.worker_id = w.id
  RETURNING l.id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'this check-in belongs to somebody else' USING ERRCODE = '42501';
  END IF;
  RETURN v_id;
END;
$$;


-- The road track of one check-in, fetched only when somebody opens its map
CREATE OR REPLACE FUNCTION public.mata_malam_route(p_token UUID, p_uid TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w public.mjmnpayroll_workers;
  v JSONB;
BEGIN
  w := public.worker_from_token(p_token);
  SELECT l.route INTO v FROM public.mata_malam_logs l WHERE l.client_uid = p_uid;
  RETURN COALESCE(v, '[]'::jsonb);
END;
$$;


-- A ticket to upload one check-in photo with. Good for ten minutes and for
-- one folder, mata_malam_photos / the ticket, and burnt by worker_photo_done
-- straight after the upload.
CREATE OR REPLACE FUNCTION public.mata_malam_photo_ticket(p_token UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w        public.mjmnpayroll_workers;
  v_ticket UUID;
BEGIN
  w := public.worker_from_token(p_token);
  DELETE FROM public.mjmnpayroll_worker_photo_tickets WHERE expires_at < now();
  INSERT INTO public.mjmnpayroll_worker_photo_tickets (worker_id, kind)
  VALUES (w.id, 'mata_malam')
  RETURNING ticket INTO v_ticket;
  RETURN v_ticket;
END;
$$;


REVOKE ALL ON FUNCTION public.mata_malam_state(UUID, DATE)          FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mata_malam_save_settings(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mata_malam_submit(UUID, JSONB)        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mata_malam_route(UUID, TEXT)          FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mata_malam_photo_ticket(UUID)         FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mata_malam_state(UUID, DATE)          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mata_malam_save_settings(UUID, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mata_malam_submit(UUID, JSONB)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mata_malam_route(UUID, TEXT)          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mata_malam_photo_ticket(UUID)         TO anon, authenticated;


-- The storage rule. A policy of its own, so the Worker Portal rule beside
-- it is not touched. Guarded and EXECUTEd, because a scratch Postgres has no
-- storage schema and a plain reference to it fails when the file is planned.
DO $do$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'no storage schema here, skipping the upload rule';
    RETURN;
  END IF;
  EXECUTE $p$DROP POLICY IF EXISTS "documents bucket - mata malam photo upload" ON storage.objects$p$;
  EXECUTE $p$
    CREATE POLICY "documents bucket - mata malam photo upload"
    ON storage.objects FOR INSERT
    TO anon
    WITH CHECK (
      bucket_id = 'documents'
      AND right(name, 4) = '.jpg'
      AND (storage.foldername(name))[1] = 'mata_malam_photos'
      AND public.worker_photo_ticket_live((storage.foldername(name))[2], 'mata_malam')
    )
  $p$;
END
$do$;

NOTIFY pgrst, 'reload schema';

SELECT 1 AS n, 'table mata_malam_settings' AS item,
       CASE WHEN to_regclass('public.mata_malam_settings') IS NOT NULL THEN 'OK' ELSE 'NOT OK -- missing' END AS result
UNION ALL
SELECT 2, 'table mata_malam_logs',
       CASE WHEN to_regclass('public.mata_malam_logs') IS NOT NULL THEN 'OK' ELSE 'NOT OK -- missing' END
UNION ALL
SELECT 3, 'a guard cannot read the tables directly',
       CASE WHEN has_table_privilege('anon', 'public.mata_malam_logs', 'SELECT')
              OR has_table_privilege('anon', 'public.mata_malam_settings', 'SELECT')
            THEN 'NOT OK -- anon holds a grant' ELSE 'OK' END
UNION ALL
SELECT 4, 'the five functions answer a guard',
       CASE WHEN has_function_privilege('anon', 'public.mata_malam_state(uuid, date)', 'EXECUTE')
             AND has_function_privilege('anon', 'public.mata_malam_save_settings(uuid, jsonb)', 'EXECUTE')
             AND has_function_privilege('anon', 'public.mata_malam_submit(uuid, jsonb)', 'EXECUTE')
             AND has_function_privilege('anon', 'public.mata_malam_route(uuid, text)', 'EXECUTE')
             AND has_function_privilege('anon', 'public.mata_malam_photo_ticket(uuid)', 'EXECUTE')
            THEN 'OK' ELSE 'NOT OK -- a grant is missing' END
UNION ALL
SELECT 5, 'photo upload rule',
       CASE WHEN to_regclass('storage.objects') IS NULL THEN 'OK (no storage here)'
            WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname = 'storage' AND tablename = 'objects'
                            AND policyname = 'documents bucket - mata malam photo upload')
            THEN 'OK' ELSE 'NOT OK -- the rule is missing' END
UNION ALL
SELECT 6, 'locations offered: ' || COALESCE((SELECT string_agg(n.name::TEXT, ', ' ORDER BY n.name::TEXT)
                                               FROM public.operation_nurseries n
                                              WHERE n.name IS NOT NULL AND btrim(n.name::TEXT) <> ''), 'none'),
       CASE WHEN EXISTS (SELECT 1 FROM public.operation_nurseries) THEN 'OK' ELSE 'NOT OK -- no nursery listed' END
UNION ALL
SELECT 7, 'who may change the settings: ' || (SELECT count(*) FROM public.mjmnpayroll_workers w
                                               WHERE w.active AND public.mata_malam_can_edit(w))::TEXT || ' active workers',
       CASE WHEN EXISTS (SELECT 1 FROM public.mjmnpayroll_workers w WHERE w.active AND public.mata_malam_can_edit(w))
            THEN 'OK' ELSE 'NOT OK -- nobody can' END
UNION ALL
SELECT 8, 'settings: ' || COALESCE((SELECT 'saved by ' || COALESCE(s.updated_by, 'unknown')
                                      FROM public.mata_malam_settings s WHERE s.id = 1), 'not set yet'), 'OK'
UNION ALL
SELECT 9, 'check-ins stored: ' || (SELECT count(*) FROM public.mata_malam_logs)::TEXT, 'OK'
ORDER BY n;
