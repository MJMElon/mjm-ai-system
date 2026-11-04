-- ============================================================================
-- CHECK_which_nurseries_each_job_is_on.sql
--
-- Work Maintenance, Settings, Where Each Job Is Done: which nurseries each of
-- the eight Worker Activity jobs is done in. Dragging a job onto a row writes
-- one nops_maint_config row per job, keyed job_scope:<job>, carrying pre,
-- main or both in txt_value. The nursery circles above a sheet are drawn from
-- it.
--
-- NOTHING TO RUN for that setting -- nops_maint_config was made in a shape
-- that holds the next such setting without another migration, and txt_value
-- is one of its original columns. This file only READS. It changes nothing.
--
-- What it answers: what the office has keyed, which jobs are still falling
-- through to where they have always been, and whether anything is stored
-- under a job or a value the page does not read.
--
-- WHAT A GOOD RESULT LOOKS LIKE
--   Row 0 says whether txt_value is there. Without it the page cannot store a
--   scope at all and every job below reads its default -- run
--   shared/RUN_ME_nops_maint_config.sql once if it says MISSING.
--
--   Rows 1 to 8 are the eight jobs. "source" is the one to read:
--     keyed       -- the office has dragged this one, and the circles obey it
--     never asked -- no row, so the job is where it has always been. That is
--                    the right answer on a database nobody has keyed yet, and
--                    all eight read it before the first Save.
--     NOT A ROW   -- a row is stored whose value is none of pre, main, both.
--                    The page ignores it and falls back, so the setting the
--                    office believes they keyed is not the one in force.
--     NO VALUE    -- the row is there and says nothing, which is also what a
--                    database with no txt_value column reads as. Row 0 tells
--                    the two apart.
--
--   Rows 20 and up name job_scope rows whose job is not one of the eight.
--   Nothing reads those. None is normal.
-- ============================================================================

WITH cfg AS (
  SELECT c.key AS k,
         lower(btrim(COALESCE(to_jsonb(c) ->> 'txt_value', ''))) AS v
    FROM public.nops_maint_config c
   WHERE left(c.key, 10) = 'job_scope:'
),
jobs(n, job, was) AS (
  VALUES (1, 'pd',                'main'),
         (2, 'manuring',          'main'),
         (3, 'weeding',           'main'),
         (4, 'interrow',          'main'),
         (5, 'loading_seedlings', 'main'),
         (6, 'transplanting',     'main'),
         (7, 'cull_incentive',    'main'),
         (8, 'seed_planting',     'pre')
),
joined AS (
  SELECT j.n, j.job, j.was, cfg.v,
         CASE WHEN cfg.k IS NULL                              THEN j.was
              WHEN cfg.v IN ('pre', 'main', 'both')           THEN cfg.v
              ELSE j.was END AS in_force,
         CASE WHEN cfg.k IS NULL                              THEN 'never asked'
              WHEN cfg.v IN ('pre', 'main', 'both')           THEN 'keyed'
              WHEN COALESCE(cfg.v, '') = ''                   THEN 'NO VALUE -- see row 0'
              ELSE 'NOT A ROW: ' || cfg.v END AS source
    FROM jobs j
    LEFT JOIN cfg ON cfg.k = 'job_scope:' || j.job
)
SELECT 0 AS n,
       'txt_value on nops_maint_config' AS job,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema = 'public'
                            AND table_name = 'nops_maint_config'
                            AND column_name = 'txt_value')
            THEN 'present -- OK'
            ELSE 'MISSING -- run shared/RUN_ME_nops_maint_config.sql' END AS in_force,
       '' AS circles,
       '' AS source
UNION ALL
SELECT j.n, j.job, j.in_force,
       CASE j.in_force WHEN 'pre'  THEN 'PN'
                       WHEN 'both' THEN 'PN, BNN, UNN 1, UNN 2'
                       ELSE 'BNN, UNN 1, UNN 2' END,
       j.source
  FROM joined j
UNION ALL
SELECT 20 + row_number() OVER (ORDER BY cfg.k),
       cfg.k,
       COALESCE(NULLIF(cfg.v, ''), 'empty'),
       'nothing shows it',
       'NOT A JOB -- the page reads none of this row'
  FROM cfg
 WHERE substr(cfg.k, 11) NOT IN ('pd', 'manuring', 'weeding', 'interrow',
                                 'loading_seedlings', 'transplanting',
                                 'cull_incentive', 'seed_planting')
UNION ALL
SELECT 19, 'no job_scope row the page cannot place', '', '', 'nothing to report'
 WHERE NOT EXISTS (
   SELECT 1 FROM cfg
    WHERE substr(cfg.k, 11) NOT IN ('pd', 'manuring', 'weeding', 'interrow',
                                    'loading_seedlings', 'transplanting',
                                    'cull_incentive', 'seed_planting'))
ORDER BY n;
