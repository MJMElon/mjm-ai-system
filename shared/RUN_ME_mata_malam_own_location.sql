-- MATA MALAM: A WORKER SEES ONLY THE LOCATION THEY ARE FILED UNDER
--
-- The Worker Namelist gives every worker a location (BNN, UNN1, UNN2, PN,
-- UNE, Others). Mata Malam ignored it, so a BNN worker saw the check-ins of
-- UNN 1 and UNN 2 as well. After this file
--   a worker filed under a nursery sees and checks in at that nursery only
--   a worker filed under Others, or under no location, sees every location
--   a worker filed under a nursery Mata Malam does not patrol (UNE today)
--     sees nothing to do, because that nursery has no check-ins
-- The location is matched on letters and digits, so UNN1 is UNN 1.
--
-- The phone hides the other locations, and the database refuses a check-in
-- at a location that is not the worker own, because a hidden button is not
-- a gate. Nothing is deleted and no row is written. Safe to run twice.
--
-- This file also carries the newest mata_malam_submit, the one in
-- RUN_ME_worker_jobs.sql, so the Mata Malam tick on the worker record is
-- obeyed as well once this is run.
--
-- What a good result looks like, one line per location on the Worker
-- Namelist with how many active workers are filed there and what they see.
--   BNN      9 workers   sees BNN
--   OTHERS   6 workers   sees every location


-- 1. Which locations this worker may see. NULL means every location.
CREATE OR REPLACE FUNCTION public.mata_malam_my_locations(w public.mjmnpayroll_workers)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN EXISTS (
                SELECT 1 FROM public.operation_nurseries n
                 WHERE upper(replace(replace(COALESCE(n.name::TEXT, ''), ' ', ''), '-', ''))
                     = upper(replace(replace(COALESCE(w.section, ''), ' ', ''), '-', ''))
                   AND btrim(COALESCE(w.section, '')) <> '')
              THEN jsonb_build_array(upper(replace(replace(w.section, ' ', ''), '-', '')))
              ELSE NULL END
$$;

REVOKE ALL ON FUNCTION public.mata_malam_my_locations(public.mjmnpayroll_workers) FROM PUBLIC, anon, authenticated;


-- 2. The phone is told
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


-- 3. A check-in at another location is refused
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
  w := public.worker_from_token(p_token);

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

NOTIFY pgrst, 'reload schema';

-- The check
SELECT filed_under, count(*) AS workers, sees
  FROM (SELECT COALESCE(NULLIF(btrim(w.section), ''), 'not allocated') AS filed_under,
               COALESCE((SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(public.mata_malam_my_locations(w)) x),
                        'every location') AS sees
          FROM public.mjmnpayroll_workers w
         WHERE w.active IS NOT FALSE) t
 GROUP BY filed_under, sees
 ORDER BY filed_under;
