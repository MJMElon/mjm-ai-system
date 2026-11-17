-- ============================================================================
-- WHICH PLOTS EACH MODULE OFFERS, AND WHICH ONE IS ON NO PICKER AT ALL
--
-- A plot is added in ONE place: Seedling Stock Management, System Settings,
-- Add Plot, which inserts a row into shared_plots. Add Row on the Work
-- Maintenance schedule writes the other half, nops_maint_custom_plots.
--
-- Every module now reads both. What this file answers is the question that
-- decides whether that is working: WHAT DOES IT ACTUALLY MOVE.
--
-- Four fixed ranges are built into every picker as the FLOOR, so that a
-- failed read cannot empty one: P01 to P52, B01 to B14, U01 to U18 and N01
-- to N20. A plot inside one of those was always offered everywhere and is
-- not interesting. A plot OUTSIDE one is reachable only through the link,
-- and those are the rows to read.
--
-- WHAT TO LOOK FOR, in the order the result prints it:
--
--   1  how many plots each side holds, and whether the two tables are there
--   2  one line per nursery: inside the ranges, and NEW
--   3  every NEW plot named. These are the ones the link carries. On a
--      healthy system this is the transfer plots plus anything past the end
--      of a range, and every one of them should now be on the Nelos raise
--      form, the auditor grids and the Work Maintenance schedule.
--   4  every plot whose nursery is NOT one of the four. THESE ARE ON NO
--      PICKER IN THE SYSTEM and nothing on any screen says so, because
--      there is no tab or column to draw them under. Expect NOUGHT. A row
--      here is either a nursery nobody has told the modules about or a
--      misspelling in shared_plots.
--   5  every nursery spelling seen, with how many plots carry it, so a
--      stray spelling is visible rather than inferred.
--
-- Safe to run twice, creates nothing, changes nothing.
-- ============================================================================

-- Both tables are collected in a DO block and parked in a session setting,
-- so the query at the foot names neither of them. A query naming a table
-- that is not on the database fails to PARSE however well the branch is
-- guarded, and nops_maint_custom_plots is not on every copy.
DO $collect$
DECLARE
  js   jsonb := '[]'::jsonb;
  part jsonb;
BEGIN
  IF to_regclass('public.shared_plots') IS NOT NULL THEN
    EXECUTE $q$
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'src',  'Seedling Stock',
               'nurs', COALESCE(nursery_name, ''),
               'plot', COALESCE(plot_name, ''))), '[]'::jsonb)
        FROM public.shared_plots
    $q$ INTO part;
    js := js || COALESCE(part, '[]'::jsonb);
  END IF;

  IF to_regclass('public.nops_maint_custom_plots') IS NOT NULL THEN
    EXECUTE $q$
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'src',  'Added by hand',
               'nurs', COALESCE(nursery, ''),
               'plot', COALESCE(plot, ''))), '[]'::jsonb)
        FROM public.nops_maint_custom_plots
    $q$ INTO part;
    js := js || COALESCE(part, '[]'::jsonb);
  END IF;

  -- Every piece COALESCEd: set_config with a NULL value BLANKS the setting,
  -- which would read as a database with no plots on it at all.
  PERFORM set_config('mjm.plots', COALESCE(js::text, '[]'), false);
  PERFORM set_config('mjm.has_stock',
    CASE WHEN to_regclass('public.shared_plots') IS NULL THEN 'no' ELSE 'yes' END, false);
  PERFORM set_config('mjm.has_custom',
    CASE WHEN to_regclass('public.nops_maint_custom_plots') IS NULL THEN 'no' ELSE 'yes' END, false);
END
$collect$;


-- ONE result set. The SQL Editor shows only the last statement, so every
-- section is UNION ALLed and `sort` is what keeps them in order.
WITH raw AS (
  SELECT r.value ->> 'src'  AS src,
         r.value ->> 'nurs' AS nurs_raw,
         btrim(COALESCE(r.value ->> 'plot', '')) AS plot_raw
    FROM jsonb_array_elements(COALESCE(current_setting('mjm.plots', true), '[]')::jsonb) AS r
),
-- Letters and digits, upper-cased, done with translate rather than a
-- regular expression: the SQL Editor has choked on one. The characters
-- listed are the ones a nursery or a plot name realistically carries.
keyed AS (
  SELECT src, nurs_raw, plot_raw,
         translate(upper(COALESCE(nurs_raw, '')), ' -_./()', '') AS nurs_key,
         translate(upper(plot_raw),               ' -_./()', '') AS plot_key
    FROM raw
   WHERE plot_raw <> ''
),
ranges(code, letter, n) AS (
            SELECT 'PN',   'P', 52
  UNION ALL SELECT 'BNN',  'B', 14
  UNION ALL SELECT 'UNN1', 'U', 18
  UNION ALL SELECT 'UNN2', 'N', 20
),
-- BOTH spellings of every plot in the four fixed ranges, because the ranges
-- are written padded in the pickers and the office types them plain, and
-- `canon` is the one of the two every line is reported under. Without it
-- B4 and B04 are two plots on this result and ONE plot on every picker,
-- which is the kind of disagreement a check exists to not have.
fixed AS (
  SELECT r.code AS nursery, r.letter || lpad(g::text, 2, '0') AS code_key,
         r.letter || g::text AS canon
    FROM ranges r, generate_series(1, r.n) AS g
  UNION
  SELECT r.code, r.letter || g::text, r.letter || g::text
    FROM ranges r, generate_series(1, r.n) AS g
),
placed AS (
  SELECT k.*,
         CASE WHEN EXISTS (SELECT 1 FROM ranges rr WHERE rr.code = k.nurs_key)
              THEN k.nurs_key END AS nursery,
         (SELECT f.canon FROM fixed f
           WHERE f.nursery = k.nurs_key AND f.code_key = k.plot_key) AS range_canon
    FROM keyed k
),
-- One row per plot per nursery, so a plot keyed on both sides, or keyed
-- padded on one and plain on the other, is counted once. The lowest source
-- name is kept only so the line has one to print.
one AS (
  SELECT nursery, nurs_raw,
         COALESCE(range_canon, plot_key) AS dedupe_key,
         (range_canon IS NOT NULL)       AS in_range,
         min(plot_raw) AS plot_raw,
         min(src)      AS src
    FROM placed
   WHERE nursery IS NOT NULL
   GROUP BY nursery, nurs_raw, COALESCE(range_canon, plot_key), (range_canon IS NOT NULL)
),
orphan AS (
  SELECT nurs_raw, plot_raw, src FROM placed WHERE nursery IS NULL
)

SELECT 1 AS sort, 'TABLES' AS section,
       'shared_plots: ' || COALESCE(current_setting('mjm.has_stock',  true), 'no')
       || ', nops_maint_custom_plots: '
       || COALESCE(current_setting('mjm.has_custom', true), 'no') AS nursery,
       (SELECT count(*)::text FROM keyed) || ' plot rows read' AS plot,
       '' AS source,
       CASE WHEN COALESCE(current_setting('mjm.has_stock', true), 'no') = 'no'
            THEN 'shared_plots is NOT on this database -- nothing below means anything'
            WHEN COALESCE(current_setting('mjm.has_custom', true), 'no') = 'no'
            THEN 'the hand-added plots table is not here, so only Seedling Stock was read'
            ELSE 'both sides read' END AS note

UNION ALL
SELECT 2, 'BY NURSERY', o.nursery,
       count(*)::text || CASE WHEN count(*) = 1 THEN ' plot' ELSE ' plots' END,
       sum(CASE WHEN o.in_range THEN 1 ELSE 0 END)::text || ' inside the fixed ranges',
       sum(CASE WHEN o.in_range THEN 0 ELSE 1 END)::text
         || ' NEW -- offered only because every module reads Seedling Stock'
  FROM one o
 GROUP BY o.nursery

UNION ALL
SELECT 3, 'NEW PLOT', o.nursery, o.plot_raw, o.src,
       'outside the fixed ranges, so this is the one the link carries'
  FROM one o
 WHERE NOT o.in_range

UNION ALL
SELECT 3, 'NEW PLOT', 'none', '-', '-',
       'nothing to report -- every plot keyed is inside the four fixed ranges'
 WHERE NOT EXISTS (SELECT 1 FROM one WHERE NOT in_range)

UNION ALL
SELECT 4, 'ON NO PICKER', COALESCE(NULLIF(x.nurs_raw, ''), 'no nursery keyed'),
       x.plot_raw, x.src,
       'its nursery is not one of the four, so NO module can offer it'
  FROM orphan x

UNION ALL
SELECT 4, 'ON NO PICKER', 'none', '-', '-',
       'nothing to report -- every plot sits under one of the four nurseries'
 WHERE NOT EXISTS (SELECT 1 FROM orphan)

UNION ALL
SELECT 5, 'SPELLING', COALESCE(NULLIF(k.nurs_raw, ''), 'no nursery keyed'),
       count(*)::text || CASE WHEN count(*) = 1 THEN ' plot' ELSE ' plots' END, '',
       CASE WHEN EXISTS (SELECT 1 FROM ranges rr WHERE rr.code = k.nurs_key)
            THEN 'reads as ' || k.nurs_key
            ELSE 'matches none of the four -- every plot under it is on no picker' END
  FROM keyed k
 GROUP BY k.nurs_raw, k.nurs_key

 ORDER BY 1, 3, 4;
