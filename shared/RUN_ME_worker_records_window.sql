-- ════════════════════════════════════════════════════════════════════════
--  THE WORKER BOARD CARRIES THREE MONTHS, NOT FIVE HUNDRED ROWS
--
--  Paste the whole file into the Supabase SQL Editor and press Run. It
--  replaces one read-only function and changes no data. Safe to run twice.
--
--  ── What was wrong ──
--
--  worker_maint_records handed back the newest 500 records and stopped. A
--  COUNT of rows is the wrong unit: at a hundred records a day it is FIVE
--  DAYS, and in a quiet month it is two. Nobody can tell which they are
--  looking at, and nothing on the phone says the list has been cut — a job
--  done last week simply is not there, which reads as a job never done.
--
--  The FC portal's own read had the same fault and is fixed in the app.
--  This is the worker's half of it, and it has to be here because that
--  phone reads nothing directly.
--
--  ── What it does instead ──
--
--  Every record of the last 92 days, plus any with no work date at all —
--  a row nobody has dated is a row somebody has to look at, and hiding it
--  behind a date it does not have is how it stays unlooked-at for ever.
--
--  The row cap stays as a seatbelt rather than the rule: a pathological
--  table must not hang a phone on a nursery road. It is raised to 20,000,
--  far above what three months of this nursery comes to.
--
--  p_days is a parameter with a default, so the app does not have to pass
--  it and a future change of mind is one number here.
--
--  Everything else is unchanged — the same boundary through worker_plots,
--  the same columns, and the TRACK IS STILL NOT AMONG THEM. That is the
--  whole reason this query can afford three months: the walk is fetched one
--  record at a time by worker_maint_track.
--
--  ── WHAT A GOOD RESULT LOOKS LIKE ──
--
--  One row. `window_days` reads 92 and `track_not_returned` reads yes.
--  If window_days is 0 the function did not replace — look for an error
--  above the result rather than at the result.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.worker_maint_records(p_token UUID,
                                                       p_limit INT DEFAULT 2000,
                                                       p_days  INT DEFAULT 92)
RETURNS TABLE (id BIGINT, work_date DATE, nursery_name TEXT, plot_name TEXT,
               work_type TEXT, jenis TEXT, chemical TEXT, qty NUMERIC,
               remark TEXT, reported_by TEXT, batch_name TEXT,
               week_no INT, schedule_month TEXT,
               worked_by TEXT, verified_by TEXT, verified_at TIMESTAMPTZ,
               gps_lat NUMERIC, gps_lng NUMERIC, gps_accuracy NUMERIC,
               gps_points INT, gps_distance_m NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_days INT := GREATEST(1, LEAST(COALESCE(p_days, 92), 400));
BEGIN
  PERFORM public.worker_from_token(p_token);

  RETURN QUERY
    -- Every column cast to what the RETURNS TABLE list above says. qty is
    -- INTEGER on this table and week_no is SMALLINT, and plpgsql wants the
    -- same type, not a convertible one — without the casts this raises
    -- "structure of query does not match function result type" and the
    -- worker's whole board goes red.
    SELECT r.id::BIGINT, r.work_date, r.nursery_name::TEXT, r.plot_name::TEXT,
           r.work_type::TEXT, r.jenis::TEXT, r.chemical::TEXT, r.qty::NUMERIC,
           r.remark::TEXT, r.reported_by::TEXT,
           r.batch_name::TEXT, r.week_no::INT, r.schedule_month::TEXT,
           -- Who the conductor credited the job to, when he keyed it for
           -- somebody whose phone was broken. NULL means reported_by did it.
           r.worked_by::TEXT,
           -- So a worker can see their morning has been checked off. Read
           -- only: verifying is the conductor's signature, and nobody signs
           -- for their own work.
           r.verified_by::TEXT, r.verified_at,
           -- Where the track started, and how far it went. For the people the
           -- office has switched GPS on for; null everywhere else, and the
           -- board simply does not draw the line.
           --
           -- The TRACK ITSELF is deliberately not here, and that is what lets
           -- the window below be three months rather than five hundred rows:
           -- a thousand-point walk on each of them is tens of megabytes down
           -- a nursery's signal to draw a list that only ever shows "820 m".
           -- worker_maint_track fetches the line for the one record somebody
           -- opens.
           r.gps_lat::NUMERIC, r.gps_lng::NUMERIC, r.gps_accuracy::NUMERIC,
           r.gps_points::INT, r.gps_distance_m::NUMERIC
      FROM nops_maint_field_records r
      JOIN public.worker_plots(p_token) wp
        ON public.worker_key(wp.plot_name) = public.worker_key(r.plot_name)
     WHERE r.work_date IS NULL
        OR r.work_date >= current_date - v_days
     ORDER BY r.work_date DESC NULLS FIRST, r.id DESC
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 2000), 20000));
END;
$fn$;

-- CREATE OR REPLACE keeps the grants, but the argument list GAINED a
-- parameter, which makes this a different function to Postgres — so the old
-- two-argument one is still there with its own grants and the new one has
-- none. Granted here, and the old one dropped below so two cannot disagree.
GRANT EXECUTE ON FUNCTION public.worker_maint_records(UUID, INT, INT)
  TO anon, authenticated;
DROP FUNCTION IF EXISTS public.worker_maint_records(UUID, INT);

NOTIFY pgrst, 'reload schema';

SELECT 92                                              AS window_days_expected,
       COALESCE((SELECT 'yes' FROM pg_proc p
                  WHERE p.proname = 'worker_maint_records'
                    AND pg_get_functiondef(p.oid) LIKE '%current_date - v_days%'
                  LIMIT 1), 'no')                      AS window_in_place,
       COALESCE((SELECT 'yes' FROM pg_proc p
                  WHERE p.proname = 'worker_maint_records'
                    AND pg_get_functiondef(p.oid) NOT LIKE '%r.gps_track%'
                  LIMIT 1), 'no')                      AS track_not_returned,
       (SELECT count(*) FROM pg_proc p
         WHERE p.proname = 'worker_maint_records')     AS copies_of_the_function;
