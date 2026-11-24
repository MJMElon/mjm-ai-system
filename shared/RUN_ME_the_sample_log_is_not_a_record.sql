-- ============================================================================
-- RUN_ME_the_sample_log_is_not_a_record.sql
--
-- Takes the FC Portal own sample plot log off the server, so no PALMS board
-- row reads Contoh as the person who last updated a plot.
--
-- Contoh is the author a fresh install of the 555 FC Portal stamps on the
-- made-up log it seeds itself with, so there is something on screen before
-- anybody has recorded a day. For such a row the honest answer to who last
-- updated this plot is NOBODY. The app marks every seeded entry and every
-- seeded daily report and refuses to send either, but the flag was added
-- AFTER the first version that synced, so a device that pushed before it
-- carries its sample log on the server to this day.
--
-- RUN CHECK_why_a_plot_still_reads_contoh.sql FIRST and read it. It names
-- every plot, says whether the Contoh comes from a log entry or a daily
-- report, and prints what each plot would read once these rows went.
--
-- IT REFUSES UNLESS THE DELETE WOULD BE PERMANENT, which is the one thing
-- this repair turns on. migration_palms_no_takebacks.sql puts an AFTER DELETE
-- trigger on the plot log that leaves the client_uid in
-- fcportal_palms_tombstones, and a tombstoned entry can never be inserted
-- again by any phone, an old build included. Without it, sync pushes every
-- local entry the server has not got -- so a phone holding its sample log
-- would put every row back within hours and this file would be a repair of
-- today. If that is the answer you get, run that migration (it is safe to run
-- twice and changes no data) and then run this again.
--
-- IT IS A DELETE AND NOT A MARK, which is the one place in this system that
-- is the right answer. Everywhere else a decision is recorded rather than
-- removed, because a row is somebody saying something. These rows are not: no
-- person keyed them, they say nothing about any plot, and there is nothing to
-- keep a record OF.
--
-- WHAT IT COSTS, and it is named rather than buried: a plot whose ONLY log
-- entry is a sample one LEAVES THE BOARD ENTIRELY. The board draws a plot
-- from its log, so with no entry there is no line -- which is the truth,
-- nobody ever recorded a stage for that plot. The result names every one, so
-- a plot going quiet is expected rather than reported as this repair breaking
-- the board. It comes back the moment somebody records a stage on it.
--
-- WHAT IT DOES NOT CLOSE: the daily report table carries no tombstone, so a
-- phone running a build from before the flag could in principle push a sample
-- report again. Section 4 of the check is how you tell -- a created_at from
-- the last few weeks means a device is still sending them, and clearing that
-- device sample data (PALMS, Settings) is the rest of the answer.
--
-- Safe to run twice. A second run deletes nothing and says so.
-- Run in the Supabase SQL Editor (main project: kibqjztozokohqmhqqqf).
--
-- WHAT A GOOD RESULT LOOKS LIKE, one result set:
--   row 1  was the delete permanent -- this has to say YES, or nothing ran
--   row 2  how many rows went, from each table
--   row 3  nought left on both tables
--   row 4  the plots that LEAVE THE BOARD, which is expected
--   row 5  every plot that was carrying a sample row
-- ============================================================================

DO $$
DECLARE
  guard      boolean;
  n_log      integer;
  n_hist     integer;
  gone       text;
  touched    text;
  left_log   integer;
  left_hist  integer;
BEGIN
  guard := EXISTS (SELECT 1 FROM pg_trigger
                    WHERE tgname = 'palms_log_bury'
                      AND tgrelid = to_regclass('public.fcportal_palms_plot_logs'));

  SELECT count(*) INTO n_log  FROM public.fcportal_palms_plot_logs WHERE recorded_by = 'Contoh';
  SELECT count(*) INTO n_hist FROM public.fcportal_palms_history   WHERE recorded_by = 'Contoh';

  -- COLLECTED BEFORE THE DELETE, because afterwards the rows are gone and
  -- there is nothing left to work either answer out from.
  SELECT coalesce(string_agg(k, ', ' ORDER BY k), '') INTO gone
    FROM (SELECT plot_name AS k
            FROM public.fcportal_palms_plot_logs
           GROUP BY plot_name
          HAVING count(*) FILTER (WHERE recorded_by = 'Contoh') > 0
             AND count(*) FILTER (WHERE recorded_by IS DISTINCT FROM 'Contoh') = 0) x;

  SELECT coalesce(string_agg(k, ', ' ORDER BY k), '') INTO touched
    FROM (SELECT DISTINCT plot_name AS k FROM public.fcportal_palms_plot_logs
           WHERE recorded_by = 'Contoh'
          UNION
          SELECT DISTINCT unit_key FROM public.fcportal_palms_history
           WHERE recorded_by = 'Contoh') y;

  IF guard THEN
    -- Only exactly Contoh. Not a LIKE and not case-insensitive: a real person
    -- called something similar must never be caught by a tidy-up.
    DELETE FROM public.fcportal_palms_plot_logs WHERE recorded_by = 'Contoh';
    DELETE FROM public.fcportal_palms_history   WHERE recorded_by = 'Contoh';
  END IF;

  -- THE PROOF IS READ AFTER THE WRITE, inside this block. A final SELECT in
  -- the same statement as the delete reads the snapshot from BEFORE it and
  -- would report every row it had just removed as still there.
  SELECT count(*) INTO left_log  FROM public.fcportal_palms_plot_logs WHERE recorded_by = 'Contoh';
  SELECT count(*) INTO left_hist FROM public.fcportal_palms_history   WHERE recorded_by = 'Contoh';

  -- Every piece coalesced: set_config with a NULL blanks the setting, which
  -- would wipe an answer rather than report it.
  PERFORM set_config('mjm.guard',     CASE WHEN guard THEN 'YES' ELSE 'NO' END, false);
  PERFORM set_config('mjm.n_log',     coalesce(n_log::text, '0'), false);
  PERFORM set_config('mjm.n_hist',    coalesce(n_hist::text, '0'), false);
  PERFORM set_config('mjm.left_log',  coalesce(left_log::text, '0'), false);
  PERFORM set_config('mjm.left_hist', coalesce(left_hist::text, '0'), false);
  PERFORM set_config('mjm.gone',      coalesce(nullif(gone, ''), 'none'), false);
  PERFORM set_config('mjm.touched',   coalesce(nullif(touched, ''), 'none'), false);
END
$$;

SELECT 1 AS row_no,
       'was the delete permanent' AS what,
       coalesce(current_setting('mjm.guard', true), '?') AS answer,
       CASE WHEN coalesce(current_setting('mjm.guard', true), 'NO') = 'YES'
            THEN 'the tombstone trigger is installed, so a deleted entry can never be inserted again'
            ELSE 'NOTHING WAS DELETED. Run migration_palms_no_takebacks.sql, then run this file again'
       END AS note
UNION ALL
SELECT 2, 'sample rows found',
       coalesce(current_setting('mjm.n_log', true), '0') || ' in the plot log, '
         || coalesce(current_setting('mjm.n_hist', true), '0') || ' in the daily report',
       CASE WHEN coalesce(current_setting('mjm.n_log', true), '0') = '0'
             AND coalesce(current_setting('mjm.n_hist', true), '0') = '0'
            THEN 'nothing to do -- no row on either table is recorded_by Contoh'
            ELSE 'these are the rows this file removes'
       END
UNION ALL
SELECT 3, 'left behind',
       coalesce(current_setting('mjm.left_log', true), '0') || ' in the plot log, '
         || coalesce(current_setting('mjm.left_hist', true), '0') || ' in the daily report',
       CASE WHEN coalesce(current_setting('mjm.left_log', true), '0') = '0'
             AND coalesce(current_setting('mjm.left_hist', true), '0') = '0'
            THEN 'OK -- no board row can read Contoh any more'
            ELSE 'NOT OK -- something refused the delete, read the first row'
       END
UNION ALL
SELECT 4, 'plots that LEAVE THE BOARD',
       coalesce(current_setting('mjm.gone', true), 'none'),
       'expected -- their only log entry was generated, so nobody has recorded a stage for them. Each comes back the moment somebody does'
UNION ALL
SELECT 5, 'plots that were carrying a sample row',
       coalesce(current_setting('mjm.touched', true), 'none'),
       'the rest of these keep their line and now name the person who really last updated them'
ORDER BY 1;
