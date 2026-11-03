-- ============================================================================
-- CHECK_palms_stage_with_no_name.sql
--
-- The PALMS board drew a row as Stage 12 rather than a stage name. A stage
-- is shown by its NUMBER only when no stage in the office list has that
-- number any more. This answers which numbers that is, on every plot, and
-- what the office list holds today.
--
-- Read only. Nothing is changed.
--
-- WHAT THE RESULT LOOKS LIKE, one result set:
--   section 1  the office stage list as it stands: number, name, ideal days
--   section 2  every stage number used in a plot log that has NO stage in
--              that list, with how many entries, on how many plots, which
--              plots, who keyed them, the first and the last day, and the
--              ideal days the phone wrote on them. The ideal days are the
--              clue to what the stage was called on the phone that keyed it.
--   A section 2 with no rows means every plot log names a stage the office
--   still has, and the board will show a name everywhere.
-- ============================================================================

SELECT 1 AS section, s.sort_order::int AS stage_no, s.name AS what,
       'ideal ' || COALESCE(s.ideal_days::text, '-') || ' days' AS detail,
       NULL::text AS plots, NULL::text AS keyed_by, NULL::text AS days
  FROM public.nops_plot_status_stages s
UNION ALL
SELECT 2, l.act_n::int,
       count(*)::text || ' entries on ' || count(DISTINCT l.plot_name)::text || ' plots, '
         || count(*) FILTER (WHERE l.end_date IS NULL)::text || ' still open -- NO STAGE HAS THIS NUMBER',
       'ideal days written on them: ' || COALESCE(string_agg(DISTINCT l.ideal_days::text, ', '), '-'),
       string_agg(DISTINCT l.plot_name, ', '),
       string_agg(DISTINCT COALESCE(l.recorded_by, '?'), ', '),
       min(l.start_date)::text || ' to ' || COALESCE(max(l.end_date)::text, 'open')
  FROM public.fcportal_palms_plot_logs l
 WHERE NOT EXISTS (SELECT 1 FROM public.nops_plot_status_stages s WHERE s.sort_order = l.act_n)
 GROUP BY l.act_n
ORDER BY 1, 2;
