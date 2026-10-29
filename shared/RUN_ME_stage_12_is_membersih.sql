-- ============================================================================
-- RUN_ME_stage_12_is_membersih.sql
--
-- The PALMS board shows some entries as Stage 12. Number 12 was Up-keep, the
-- placeholder stage the 31-Aug-2026 report created, which the office named
-- as Membersih. The stage was taken off the Status Stages list by hand, so
-- RUN_ME_upkeep_is_membersih.sql found no Up-keep to repoint and did nothing,
-- and every entry on it was left on a number no stage answers to. Phones
-- still holding the old list went on keying it into October.
--
-- This moves every one of them to MEMBERSIH, on every plot:
--   - plot log entries on stage 12
--   - days of history that recorded stage 12
--
-- It acts ONLY while no stage on the list has the number 12. If the office
-- ever adds a real twelfth stage, a second run touches nothing.
-- Nothing is deleted. Safe to run twice: the second run moves 0.
--
-- WHAT A GOOD RESULT LOOKS LIKE, five rows:
--   1  Membersih is stage ..................... 4 -- OK
--   2  plot log entries moved to Membersih .... the number moved, with the plots
--   3  history days moved to Membersih ........ the number moved
--   4  entries still on a number with no stage  0 -- OK
--   5  plots with Membersih open twice ........ 0 -- OK
-- ============================================================================

DO $do$
DECLARE
  v_mb    SMALLINT;
  n_logs  INT := 0;
  n_hist  INT := 0;
  v_plots TEXT := '';
BEGIN
  SELECT sort_order INTO v_mb
    FROM public.nops_plot_status_stages
   WHERE lower(btrim(name)) = 'membersih'
   ORDER BY sort_order LIMIT 1;

  IF v_mb IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.nops_plot_status_stages WHERE sort_order = 12) THEN

    SELECT COALESCE(string_agg(DISTINCT plot_name, ', '), '')
      INTO v_plots
      FROM public.fcportal_palms_plot_logs WHERE act_n = 12;

    UPDATE public.fcportal_palms_plot_logs
       SET act_n = v_mb, updated_at = now()
     WHERE act_n = 12;
    GET DIAGNOSTICS n_logs = ROW_COUNT;

    -- A day that recorded both comes back holding Membersih once.
    IF to_regclass('public.fcportal_palms_history') IS NOT NULL THEN
      UPDATE public.fcportal_palms_history h
         SET acts = COALESCE((SELECT array_agg(DISTINCT x ORDER BY x)
                                FROM unnest(array_replace(h.acts, 12::smallint, v_mb)) AS x),
                             h.acts),
             updated_at = now()
       WHERE 12 = ANY (h.acts);
      GET DIAGNOSTICS n_hist = ROW_COUNT;
    END IF;
  END IF;

  PERFORM set_config('palms12.mb',    COALESCE(v_mb::text, ''), false);
  PERFORM set_config('palms12.logs',  COALESCE(n_logs, 0)::text, false);
  PERFORM set_config('palms12.plots', COALESCE(v_plots, ''), false);
  PERFORM set_config('palms12.hist',  COALESCE(n_hist, 0)::text, false);
END
$do$;

SELECT 1 AS n, 'Membersih is stage' AS step,
       CASE WHEN current_setting('palms12.mb', true) = ''
            THEN 'NOT FOUND -- nothing moved, there is no stage named Membersih'
            ELSE current_setting('palms12.mb', true) || ' -- OK' END AS result
UNION ALL
SELECT 2, 'plot log entries moved to Membersih',
       current_setting('palms12.logs', true)
       || CASE WHEN current_setting('palms12.plots', true) = '' THEN ''
               ELSE ' (' || current_setting('palms12.plots', true) || ')' END
UNION ALL
SELECT 3, 'history days moved to Membersih', current_setting('palms12.hist', true)
UNION ALL
SELECT 4, 'entries still on a number with no stage',
       (SELECT count(*)::text || CASE WHEN count(*) = 0 THEN ' -- OK' ELSE ' -- NOT OK' END
          FROM public.fcportal_palms_plot_logs l
         WHERE NOT EXISTS (SELECT 1 FROM public.nops_plot_status_stages s WHERE s.sort_order = l.act_n))
UNION ALL
SELECT 5, 'plots with Membersih open twice',
       (SELECT count(*)::text || CASE WHEN count(*) = 0 THEN ' -- OK' ELSE ' -- NOT OK' END
          FROM (SELECT plot_name FROM public.fcportal_palms_plot_logs
                 WHERE end_date IS NULL
                   AND act_n = (SELECT sort_order FROM public.nops_plot_status_stages
                                 WHERE lower(btrim(name)) = 'membersih' ORDER BY sort_order LIMIT 1)
                 GROUP BY plot_name HAVING count(*) > 1) d)
ORDER BY n;
