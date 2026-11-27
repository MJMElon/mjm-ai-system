/* ═══════════════════════════════════════════════════════════════════════
   RUN_ME_mata_malam_staff.sql

   Mata Malam opens from the FC Portal as the staff account.

   A staff login (an e-mail on the FC Portal) has no row on the Worker
   Namelist and no PIN, so Mata Malam could not tell who it was and asked
   for a Worker Portal sign in. Now the FC Portal asks the database for a
   Mata Malam session of its own:

     mata_malam_staff_session()   called signed in as the staff account.
                                  Refused for a customer. Answers a token.
     mata_malam_who(token)        what every mata_malam function now asks.
                                  A worker PIN token is the worker as it
                                  always was. A staff token is the staff
                                  account, with a NEGATIVE id so it can never
                                  be taken for a register row.
     mata_malam_whoami(token)     what the app asks on opening.

   A staff account reads the FC Portal column of System Setting, Portal View
   and Function, Mata Malam, whatever job it has, and sees every location.
   A worker still reads the column of their role, exactly as before.

   Its check-ins carry the staff name and the negative id, so they are one
   person in History and Report like any worker.

   Safe to run twice. Nothing is deleted. Run after RUN_ME_mata_malam.sql,
   RUN_ME_worker_jobs.sql and RUN_ME_mata_malam_own_location.sql.

   What a good result looks like, every line OK:
     1  table mata_malam_staff               OK
     2  table mata_malam_staff_sessions      OK
     3  mata_malam_staff_session callable    OK
     4  mata_malam_who                       OK
     5  photo ticket takes a staff upload    OK
     6  staff read the column                fc
═══════════════════════════════════════════════════════════════════════ */


-- 1. Who a staff account is in Mata Malam. One number each, kept for good,
-- so the check-ins of one person stay one person.
CREATE TABLE IF NOT EXISTS public.mata_malam_staff (
  id       BIGSERIAL PRIMARY KEY,
  user_id  UUID NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mata_malam_staff ENABLE ROW LEVEL SECURITY;

-- 2. The sessions. No policies: only the functions below reach them.
CREATE TABLE IF NOT EXISTS public.mata_malam_staff_sessions (
  token        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id     BIGINT NOT NULL REFERENCES public.mata_malam_staff(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '60 days'
);
CREATE INDEX IF NOT EXISTS mata_malam_staff_sessions_staff
  ON public.mata_malam_staff_sessions (staff_id);
ALTER TABLE public.mata_malam_staff_sessions ENABLE ROW LEVEL SECURITY;

-- A photo ticket of a staff account has no register row behind it
ALTER TABLE public.mjmnpayroll_worker_photo_tickets ALTER COLUMN worker_id DROP NOT NULL;


-- 3. Called by the FC Portal, signed in as the staff account
CREATE OR REPLACE FUNCTION public.mata_malam_staff_session()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_staff BIGINT;
  v_tok   UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '28000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shared_profiles p
                  WHERE p.id = v_uid
                    AND COALESCE(p.user_type, 'system') <> 'customer') THEN
    RAISE EXCEPTION 'this account is not staff' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.mata_malam_staff (user_id) VALUES (v_uid)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT id INTO v_staff FROM public.mata_malam_staff WHERE user_id = v_uid;

  DELETE FROM public.mata_malam_staff_sessions
   WHERE staff_id = v_staff AND expires_at <= now();
  INSERT INTO public.mata_malam_staff_sessions (staff_id) VALUES (v_staff)
  RETURNING token INTO v_tok;
  RETURN v_tok;
END;
$$;

REVOKE ALL ON FUNCTION public.mata_malam_staff_session() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mata_malam_staff_session() TO authenticated;


-- 4. The person behind a Mata Malam token. A worker token first, exactly as
-- before. A staff token is shaped as a register row with a negative id, no
-- section (every location) and no portal switches of its own. It ends when
-- the account becomes a customer or its profile is removed.
CREATE OR REPLACE FUNCTION public.mata_malam_who(p_token UUID)
RETURNS public.mjmnpayroll_workers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w    public.mjmnpayroll_workers;
  v_id BIGINT;
  v_nm TEXT;
BEGIN
  BEGIN
    RETURN public.worker_from_token(p_token);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  SELECT st.id, COALESCE(NULLIF(btrim(p.full_name), ''), p.email::TEXT, 'Staff')
    INTO v_id, v_nm
    FROM public.mata_malam_staff_sessions s
    JOIN public.mata_malam_staff st ON st.id = s.staff_id
    JOIN public.shared_profiles p ON p.id = st.user_id
   WHERE s.token = p_token
     AND s.expires_at > now()
     AND COALESCE(p.user_type, 'system') <> 'customer';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '28000';
  END IF;

  UPDATE public.mata_malam_staff_sessions
     SET expires_at = now() + INTERVAL '60 days'
   WHERE token = p_token;

  w.id        := -v_id;
  w.full_name := v_nm;
  w.role      := 'FC Portal';
  w.active    := true;
  RETURN w;
END;
$$;

REVOKE ALL ON FUNCTION public.mata_malam_who(UUID) FROM PUBLIC, anon, authenticated;


-- 5. What the app asks on opening. NULL is signed out, not an error.
CREATE OR REPLACE FUNCTION public.mata_malam_whoami(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE w public.mjmnpayroll_workers;
BEGIN
  BEGIN
    w := public.mata_malam_who(p_token);
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  RETURN jsonb_build_object(
    'token',  p_token,
    'staff',  (w.id < 0),
    'worker', jsonb_build_object('id', w.id, 'name', w.full_name, 'role', w.role));
END;
$$;

REVOKE ALL ON FUNCTION public.mata_malam_whoami(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mata_malam_whoami(UUID) TO anon, authenticated;


-- 6. A staff account reads the FC Portal column
CREATE OR REPLACE FUNCTION public.mata_malam_access(w public.mjmnpayroll_workers)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_portal TEXT := CASE WHEN COALESCE(w.id, 0) < 0
                          OR upper(replace(COALESCE(w.role, ''), ' ', '')) IN
                             ('ADMIN', 'ESTATEMANAGER', 'FIELDCONDUCTOR', 'ASSISTANTFIELDCONDUCTOR')
                        THEN 'fc' ELSE 'worker' END;
  v_mod  JSONB;
  v_act  JSONB;
  v_mine BOOLEAN := COALESCE((w.portal #> '{modules,mata_malam}')::boolean, true);
BEGIN
  BEGIN
    IF to_regclass('public.shared_portal_settings') IS NOT NULL THEN
      EXECUTE 'SELECT modules, actions FROM public.shared_portal_settings WHERE portal = $1'
         INTO v_mod, v_act USING v_portal;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_mod := NULL;
    v_act := NULL;
  END;
  RETURN jsonb_build_object(
    'portal', v_portal,
    'on', (COALESCE(v_mod -> 'mata_malam', 'true'::jsonb) <> 'false'::jsonb) AND v_mine,
    'mine', v_mine,
    'fn', CASE WHEN jsonb_typeof(v_act -> 'mata_malam') = 'object'
               THEN v_act -> 'mata_malam' ELSE '{}'::jsonb END);
END;
$$;

REVOKE ALL ON FUNCTION public.mata_malam_access(public.mjmnpayroll_workers) FROM PUBLIC, anon, authenticated;


-- 7. Every mata_malam function asks mata_malam_who now
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
  w := public.mata_malam_who(p_token);
  SELECT * INTO v_set FROM public.mata_malam_settings WHERE id = 1;

  RETURN jsonb_build_object(
    'worker', jsonb_build_object('id', w.id, 'name', w.full_name, 'role', w.role),
    'can_edit', public.mata_malam_can_edit(w),
    'access', public.mata_malam_access(w),
    'my_locations', public.mata_malam_my_locations(w),
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
               'point',         COALESCE(l.point, ''),
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

REVOKE ALL ON FUNCTION public.mata_malam_state(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mata_malam_state(UUID, DATE) TO anon, authenticated;


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
  v_mine  JSONB;
BEGIN
  w := public.mata_malam_who(p_token);

  IF NOT COALESCE((w.portal #> '{modules,mata_malam}')::boolean, true) THEN
    RAISE EXCEPTION 'Mata Malam is not open for this account' USING ERRCODE = '42501';
  END IF;

  -- A worker filed under a Mata Malam location checks in there and nowhere else
  v_mine := public.mata_malam_my_locations(w);
  IF v_mine IS NOT NULL AND v_loc <> '' AND NOT (v_mine ? upper(replace(replace(v_loc, ' ', ''), '-', ''))) THEN
    RAISE EXCEPTION 'this location is not yours on the Worker Namelist' USING ERRCODE = '42501';
  END IF;

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
    (client_uid, worker_id, worker_name, location, point, shift_date, slot, status,
     coordinates, submitted_at, photo_url, patrol_open, route, route_distance, route_duration)
  VALUES
    (v_uid, w.id, w.full_name, v_loc, NULLIF(left(btrim(COALESCE(p_log ->> 'point', '')), 80), ''), v_date, v_slot, 'completed',
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

REVOKE ALL ON FUNCTION public.mata_malam_submit(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mata_malam_submit(UUID, JSONB) TO anon, authenticated;


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
  w := public.mata_malam_who(p_token);
  SELECT l.route INTO v FROM public.mata_malam_logs l WHERE l.client_uid = p_uid;
  RETURN COALESCE(v, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.mata_malam_route(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mata_malam_route(UUID, TEXT) TO anon, authenticated;


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
  w := public.mata_malam_who(p_token);
  DELETE FROM public.mjmnpayroll_worker_photo_tickets WHERE expires_at < now();
  INSERT INTO public.mjmnpayroll_worker_photo_tickets (worker_id, kind)
  VALUES (CASE WHEN w.id > 0 THEN w.id END, 'mata_malam')
  RETURNING ticket INTO v_ticket;
  RETURN v_ticket;
END;
$$;

REVOKE ALL ON FUNCTION public.mata_malam_photo_ticket(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mata_malam_photo_ticket(UUID) TO anon, authenticated;


CREATE OR REPLACE FUNCTION public.mata_malam_boundaries(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w public.mjmnpayroll_workers;
  v JSONB;
BEGIN
  w := public.mata_malam_who(p_token);
  IF to_regclass('public.shared_site_boundary') IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  EXECUTE $q$
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'nursery', b.nursery, 'geojson', b.geojson, 'updated_at', b.updated_at)
             ORDER BY b.nursery), '[]'::jsonb)
      FROM public.shared_site_boundary b
     WHERE b.geojson IS NOT NULL $q$ INTO v;
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.mata_malam_boundaries(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mata_malam_boundaries(UUID) TO anon, authenticated;


NOTIFY pgrst, 'reload schema';

-- The check
SELECT 1 AS n, 'table mata_malam_staff' AS item,
       CASE WHEN to_regclass('public.mata_malam_staff') IS NOT NULL THEN 'OK' ELSE 'NOT OK -- missing' END AS result
UNION ALL
SELECT 2, 'table mata_malam_staff_sessions',
       CASE WHEN to_regclass('public.mata_malam_staff_sessions') IS NOT NULL THEN 'OK' ELSE 'NOT OK -- missing' END
UNION ALL
SELECT 3, 'mata_malam_staff_session callable',
       CASE WHEN has_function_privilege('authenticated', 'public.mata_malam_staff_session()', 'EXECUTE') THEN 'OK' ELSE 'NOT OK' END
UNION ALL
SELECT 4, 'mata_malam_who',
       CASE WHEN to_regprocedure('public.mata_malam_who(uuid)') IS NOT NULL THEN 'OK' ELSE 'NOT OK -- missing' END
UNION ALL
SELECT 5, 'photo ticket takes a staff upload',
       CASE WHEN (SELECT a.attnotnull FROM pg_attribute a
                   WHERE a.attrelid = 'public.mjmnpayroll_worker_photo_tickets'::regclass
                     AND a.attname = 'worker_id') THEN 'NOT OK' ELSE 'OK' END
UNION ALL
SELECT 6, 'staff read the column',
       public.mata_malam_access(jsonb_populate_record(NULL::public.mjmnpayroll_workers, '{"id": -1}'::jsonb)) ->> 'portal';
