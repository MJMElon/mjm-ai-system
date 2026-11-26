-- WHICH JOBS A WORKER DOES, ticked on their record on the Worker Namelist
--
-- The Jobs box on a worker record has three ticks: Work Maintenance,
-- Siram Go and Mata Malam. Work Maintenance is the maint_general column, as
-- it always was. Siram Go and Mata Malam are kept on the same row, in
-- portal.modules, beside the Maintenance and Settings switches the Worker
-- Portal Settings screen already writes there.
--
-- A tick nobody has set is ON, which is what every worker has today, so
-- running this file takes nothing away from anybody. Only an untick on a
-- record closes the door for that person.
--
-- What this file changes
--   1. worker_portal hands siram_go and mata_malam to the phone, so the
--      Worker Portal shows the two buttons only to a worker who has them.
--   2. mata_malam_access answers OFF for a worker whose Mata Malam tick is
--      off, so the Mata Malam app says it is not open for that account.
--   3. mata_malam_submit refuses a check-in from that worker, because a
--      hidden button is not a gate.
--
-- Safe to run twice. Nothing is deleted and no row is written.
--
-- What a good result looks like, the last query prints one line per tick
--   Siram Go     on N   off N
--   Mata Malam   on N   off N
-- with off at 0 the first time it is run, because nobody has been unticked.


-- 1. The phone is told about the two jobs
CREATE OR REPLACE FUNCTION public.worker_portal(w mjmnpayroll_workers)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT jsonb_build_object(
    'modules', CASE WHEN public.worker_pending(w)
      THEN jsonb_build_object('maintenance', false, 'settings', false,
                              'siram_go', false, 'mata_malam', false)
      ELSE jsonb_build_object(
        'maintenance', COALESCE((w.portal #> '{modules,maintenance}')::boolean, true),
        'settings',    COALESCE((w.portal #> '{modules,settings}')::boolean,    false),
        'siram_go',    COALESCE((w.portal #> '{modules,siram_go}')::boolean,    true),
        'mata_malam',  COALESCE((w.portal #> '{modules,mata_malam}')::boolean,  true))
    END,
    'actions', CASE
      WHEN jsonb_typeof(w.portal -> 'actions') = 'object' THEN w.portal -> 'actions'
      ELSE '{}'::jsonb END,
    'boundary', jsonb_build_object(
      'nurseries', CASE
        WHEN public.worker_pending(w) THEN '[]'::jsonb
        WHEN w.portal #> '{boundary,nurseries}' IS NOT NULL
             AND jsonb_typeof(w.portal #> '{boundary,nurseries}') = 'array'
          THEN w.portal #> '{boundary,nurseries}'
        WHEN w.nursery IS NOT NULL AND btrim(w.nursery) <> ''
          THEN jsonb_build_array(w.nursery)
        ELSE 'null'::jsonb END,
      'plots', CASE
        WHEN public.worker_pending(w) THEN '[]'::jsonb
        WHEN w.portal #> '{boundary,plots}' IS NOT NULL
             AND jsonb_typeof(w.portal #> '{boundary,plots}') = 'array'
          THEN w.portal #> '{boundary,plots}'
        ELSE 'null'::jsonb END));
$function$;


-- 2. Mata Malam is closed for a worker whose tick is off.
-- The company switch on Portal View and Function still closes it for
-- everybody, and the person tick closes it for one.
CREATE OR REPLACE FUNCTION public.mata_malam_access(w public.mjmnpayroll_workers)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_portal TEXT := CASE WHEN upper(replace(COALESCE(w.role, ''), ' ', '')) IN
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


-- 3. A check-in from a worker it is closed for is refused
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

  IF NOT COALESCE((w.portal #> '{modules,mata_malam}')::boolean, true) THEN
    RAISE EXCEPTION 'Mata Malam is not open for this account' USING ERRCODE = '42501';
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

-- The check. Active workers only, by what their record answers.
SELECT 'Siram Go' AS job,
       count(*) FILTER (WHERE COALESCE((portal #> '{modules,siram_go}')::boolean, true))     AS ticked_on,
       count(*) FILTER (WHERE NOT COALESCE((portal #> '{modules,siram_go}')::boolean, true)) AS ticked_off
  FROM public.mjmnpayroll_workers WHERE active IS NOT FALSE
UNION ALL
SELECT 'Mata Malam',
       count(*) FILTER (WHERE COALESCE((portal #> '{modules,mata_malam}')::boolean, true)),
       count(*) FILTER (WHERE NOT COALESCE((portal #> '{modules,mata_malam}')::boolean, true))
  FROM public.mjmnpayroll_workers WHERE active IS NOT FALSE;
