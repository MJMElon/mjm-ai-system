-- ═══════════════════════════════════════════════════════════════
-- UP-KEEP IS MEMBERSIH, AND ONE STAGE OPEN TWICE IS NOT TWO STAGES
--
-- Two things, both answers to what the office asked on the PALMS board.
--
-- 1. UP-KEEP WAS A PLACEHOLDER. The plot status report of 31-Aug-2026 had a
--    stage called Up-keep on it, which was not one of the eleven, so
--    seed_palms_from_report_2026_08_31.sql created a twelfth and said in as
--    many words that it was a guess: "If Up-keep is really something else in
--    your system, map it above to the stage you mean and delete this block."
--    The office has now said which: it is MEMBERSIH. So every plot log, every
--    day of history and every daily status entry on Up-keep is repointed at
--    Membersih and the placeholder stage goes.
--
--    Removing it moves nothing else. It was added at the END of the list on
--    purpose, so every other stage keeps the sort_order the plot logs already
--    store and no history is silently re-read.
--
-- 2. THE BOARD READ "2 running: Membesar" — one job, reported as two. That is
--    a plot with two log entries OPEN on the same stage, which is one stage
--    logged twice and not a plot doing the work twice. The pages have been
--    fixed to count stages rather than rows. This closes the rows underneath,
--    so the board stops needing to explain itself:
--
--      - an exact COPY (same plot, same stage, same start day, both open) is
--        deleted, keeping the lowest id. It is the same entry twice.
--      - two open entries on one stage with DIFFERENT start days are two
--        statements about the plot, so neither is deleted: the older one is
--        CLOSED on the day the newer one began, which is what happened.
--
--    A plot genuinely running two DIFFERENT stages is left exactly alone.
--    PALMS allows two at once and that is not this.
--
-- Safe to run twice. The second run finds nothing and every count reads 0.
-- ═══════════════════════════════════════════════════════════════

DO $do$
DECLARE
  v_up_id    BIGINT;
  v_up_n     SMALLINT;
  v_mb_id    BIGINT;
  v_mb_n     SMALLINT;
  n_logs     INT := 0;
  n_hist     INT := 0;
  n_entries  INT := 0;
  n_stage    INT := 0;
  n_copies   INT := 0;
  n_closed   INT := 0;
  v_note     TEXT := 'ok';
BEGIN
  SELECT id, sort_order INTO v_up_id, v_up_n
    FROM public.nops_plot_status_stages
   WHERE lower(btrim(name)) IN ('up-keep', 'upkeep', 'up keep')
   ORDER BY sort_order LIMIT 1;

  SELECT id, sort_order INTO v_mb_id, v_mb_n
    FROM public.nops_plot_status_stages
   WHERE lower(btrim(name)) = 'membersih'
   ORDER BY sort_order LIMIT 1;

  IF v_up_id IS NULL THEN
    v_note := 'no Up-keep stage - already done, or this database never had one';
  ELSIF v_mb_id IS NULL THEN
    -- Never guess. Repointing at a stage that is not there would leave the
    -- logs on a number no stage answers to, which reads as a blank status.
    v_note := 'NOT DONE - there is no stage named Membersih to point it at';
  ELSE
    UPDATE public.fcportal_palms_plot_logs
       SET act_n = v_mb_n, updated_at = now()
     WHERE act_n = v_up_n;
    GET DIAGNOSTICS n_logs = ROW_COUNT;

    -- A day that recorded Up-keep AND Membersih would come back holding the
    -- same number twice, so the list is rebuilt distinct and in order.
    UPDATE public.fcportal_palms_history h
       SET acts = COALESCE((SELECT array_agg(DISTINCT x ORDER BY x)
                              FROM unnest(array_replace(h.acts, v_up_n, v_mb_n)) AS x),
                           h.acts),
           updated_at = now()
     WHERE v_up_n = ANY (h.acts);
    GET DIAGNOSTICS n_hist = ROW_COUNT;

    -- The daily status table is older than PALMS and is not on every
    -- database, so it is named only once it is known to be there.
    IF to_regclass('public.nops_plot_status_entries') IS NOT NULL THEN
      EXECUTE 'UPDATE public.nops_plot_status_entries
                  SET stage_id = $1, stage_name = $2, updated_at = now()
                WHERE stage_id = $3
                   OR lower(btrim(stage_name)) IN (''up-keep'', ''upkeep'', ''up keep'')'
        USING v_mb_id, (SELECT name FROM public.nops_plot_status_stages WHERE id = v_mb_id), v_up_id;
      GET DIAGNOSTICS n_entries = ROW_COUNT;
    END IF;

    DELETE FROM public.nops_plot_status_stages WHERE id = v_up_id;
    GET DIAGNOSTICS n_stage = ROW_COUNT;
  END IF;

  -- ── the same entry twice ──
  WITH ranked AS (
    SELECT id,
           row_number() OVER (PARTITION BY plot_name, act_n, start_date
                                  ORDER BY id) AS copy_no
      FROM public.fcportal_palms_plot_logs
     WHERE end_date IS NULL)
  DELETE FROM public.fcportal_palms_plot_logs l
   USING ranked r
   WHERE l.id = r.id AND r.copy_no > 1;
  GET DIAGNOSTICS n_copies = ROW_COUNT;

  -- ── one stage, two start days: the older one ended when the newer began ──
  WITH ranked AS (
    SELECT id, start_date,
           max(start_date) OVER (PARTITION BY plot_name, act_n) AS keep_start
      FROM public.fcportal_palms_plot_logs
     WHERE end_date IS NULL)
  UPDATE public.fcportal_palms_plot_logs l
     SET end_date = r.keep_start, updated_at = now()
    FROM ranked r
   WHERE l.id = r.id AND r.start_date < r.keep_start;
  GET DIAGNOSTICS n_closed = ROW_COUNT;

  -- Every piece COALESCEd: one NULL in a set_config blanks the whole value,
  -- and a count that disappeared would read as nothing having happened.
  PERFORM set_config('palms.note',    COALESCE(v_note, '?'),              false);
  PERFORM set_config('palms.logs',    COALESCE(n_logs, 0)::text,          false);
  PERFORM set_config('palms.hist',    COALESCE(n_hist, 0)::text,          false);
  PERFORM set_config('palms.entries', COALESCE(n_entries, 0)::text,       false);
  PERFORM set_config('palms.stage',   COALESCE(n_stage, 0)::text,         false);
  PERFORM set_config('palms.copies',  COALESCE(n_copies, 0)::text,        false);
  PERFORM set_config('palms.closed',  COALESCE(n_closed, 0)::text,        false);
END
$do$;


-- WHAT A GOOD RESULT LOOKS LIKE
--
-- Row 1 says ok. Rows 2 to 5 are the Up-keep mapping and will be 0 on a
-- second run. Rows 6 and 7 are the duplicate open entries.
--
-- Row 8 is the one that matters: "plots still on one stage twice" must read
-- 0 - OK. Anything else means an open entry survived the repair and the
-- board will go on saying 2 running over one job.
--
-- Row 9 is not a fault. Those plots really are on two DIFFERENT stages,
-- which PALMS allows, and the board shows them as "2 running: A + B".
SELECT 1 AS n, 'Up-keep to Membersih'          AS step, current_setting('palms.note', true)    AS result
UNION ALL
SELECT 2, 'plot log entries repointed',   current_setting('palms.logs', true)
UNION ALL
SELECT 3, 'history days repointed',       current_setting('palms.hist', true)
UNION ALL
SELECT 4, 'daily status rows renamed',    current_setting('palms.entries', true)
UNION ALL
SELECT 5, 'the Up-keep stage removed',    current_setting('palms.stage', true)
UNION ALL
SELECT 6, 'duplicate open copies deleted', current_setting('palms.copies', true)
UNION ALL
SELECT 7, 'older open entries closed',    current_setting('palms.closed', true)
UNION ALL
SELECT 8, 'plots still on one stage twice',
       (SELECT count(*)::text || CASE WHEN count(*) = 0 THEN ' - OK' ELSE ' - NOT OK' END
          FROM (SELECT plot_name, act_n
                  FROM public.fcportal_palms_plot_logs
                 WHERE end_date IS NULL
                 GROUP BY plot_name, act_n
                HAVING count(*) > 1) d)
UNION ALL
SELECT 9, 'plots on two different stages, which is allowed',
       (SELECT COALESCE(string_agg(plot_name, ', ' ORDER BY plot_name), 'none')
          FROM (SELECT plot_name
                  FROM public.fcportal_palms_plot_logs
                 WHERE end_date IS NULL
                 GROUP BY plot_name
                HAVING count(DISTINCT act_n) > 1) t)
ORDER BY n;
