-- ============================================================================
-- WHICH PLOTS EACH MODULE OFFERS, WHICH ONE LEAVES, AND WHICH IS ON NO PICKER
--
-- A plot is added in ONE place: Seedling Stock Management, System Settings,
-- Add Plot, which inserts a row into shared_plots. The cross on that same
-- page deletes one. Add Row on the Work Maintenance schedule writes the
-- other half, nops_maint_custom_plots.
--
-- Every module reads both. What this file answers is the question that
-- decides whether that is working: WHAT DOES IT ACTUALLY MOVE.
--
-- READ SECTION 4 BEFORE TRUSTING ANY OF IT. The four ranges built into the
-- pickers -- P01 to P52, B01 to B14, U01 to U18, N01 to N20 -- used to be the
-- FLOOR, so a plot was offered whether or not Seedling Stock had a row for
-- it. That is what stopped a deletion biting. They are the FALLBACK now: a
-- nursery Seedling Stock holds plots for is offered exactly those plots, and
-- a nursery it holds none for keeps its whole range, because an absent answer
-- is nobody having been asked. SO A RANGE PLOT THAT WAS NEVER KEYED NOW
-- LEAVES EVERY PICKER, and section 4 is the list of them. If that list holds
-- a plot the office never deleted, shared_plots is short of a row and the
-- answer is to add the plot back on the settings page -- one press, and it
-- returns everywhere.
--
-- WHAT TO LOOK FOR, in the order the result prints it:
--
--   1  how many plots each side holds, and whether the three tables are there
--   2  one line per nursery: how many are keyed, how many are NEW, how many
--      LEAVE, and whether that nursery is narrowed at all
--   3  every NEW plot named. These are the ones the link carries. On a
--      healthy system this is the transfer plots plus anything past the end
--      of a range, and every one of them should now be on the Nelos raise
--      form, the auditor grids and the Work Maintenance schedule.
--   4  every plot that LEAVES, with what if anything puts it back. Three
--      answers: a hand-added row keeps it on the schedule, a saved work
--      record keeps it on the schedule, or it is gone from every picker.
--      NOTHING IS DELETED either way -- the work records stay exactly where
--      they are in nops_maint_records.
--   5  every plot whose nursery is NOT one of the four. THESE ARE ON NO
--      PICKER IN THE SYSTEM and nothing on any screen says so, because
--      there is no tab or column to draw them under. Expect NOUGHT. A row
--      here is either a nursery nobody has told the modules about or a
--      misspelling in shared_plots.
--   6  every nursery spelling seen, with how many plots carry it, so a
--      stray spelling is visible rather than inferred.
--
-- Safe to run twice, creates nothing, changes nothing.
-- ============================================================================

-- All three tables are collected in a DO block and parked in session
-- settings, so the query at the foot names none of them. A query naming a
-- table that is not on the database fails to PARSE however well the branch
-- is guarded, and nops_maint_custom_plots is not on every copy.
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

  -- THE PLOTS A SAVED WORK RECORD NAMES. The schedule puts one of these back
  -- even when Seedling Stock has dropped it, because a row that is saved must
  -- never be a row that cannot be seen. Its own EXCEPTION branch, because the
  -- records column is JSONB on every copy that has it and this file must
  -- still answer on one where it is not.
  part := '[]'::jsonb;
  IF to_regclass('public.nops_maint_records') IS NOT NULL THEN
    BEGIN
      EXECUTE $q$
        SELECT COALESCE(jsonb_agg(DISTINCT e.value ->> 'plot'), '[]'::jsonb)
          FROM public.nops_maint_records m,
               jsonb_array_elements(COALESCE(m.records, '[]'::jsonb)) AS e
         WHERE COALESCE(e.value ->> 'plot', '') <> ''
      $q$ INTO part;
    EXCEPTION WHEN others THEN
      part := '[]'::jsonb;
    END;
  END IF;
  PERFORM set_config('mjm.rowplots', COALESCE(part::text, '[]'), false);

  PERFORM set_config('mjm.has_stock',
    CASE WHEN to_regclass('public.shared_plots') IS NULL THEN 'no' ELSE 'yes' END, false);
  PERFORM set_config('mjm.has_custom',
    CASE WHEN to_regclass('public.nops_maint_custom_plots') IS NULL THEN 'no' ELSE 'yes' END, false);
  PERFORM set_config('mjm.has_records',
    CASE WHEN to_regclass('public.nops_maint_records') IS NULL THEN 'no' ELSE 'yes' END, false);
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
),

-- ── WHAT DECIDES A DELETION ────────────────────────────────────────────────
-- SEEDLING STOCK ALONE narrows a picker. A hand-added plot is appended on
-- top of whichever list won, so it can never be the thing that triggers the
-- narrowing -- which is why this is asked of src rather than of `one`.
stock_nurs AS (
  SELECT DISTINCT nursery FROM placed
   WHERE nursery IS NOT NULL AND src = 'Seedling Stock'
),
stock_in_range AS (
  SELECT DISTINCT nursery, range_canon FROM placed
   WHERE nursery IS NOT NULL AND src = 'Seedling Stock' AND range_canon IS NOT NULL
),
custom_in_range AS (
  SELECT DISTINCT nursery, range_canon FROM placed
   WHERE nursery IS NOT NULL AND src = 'Added by hand' AND range_canon IS NOT NULL
),
-- A saved work record names a PLOT and no nursery, so the range is what says
-- whose plot it is -- the same evidence _narrowToStock uses when it puts one
-- back. Matched against both spellings through `fixed`.
row_in_range AS (
  SELECT DISTINCT f.nursery, f.canon AS range_canon
    FROM jsonb_array_elements_text(
           COALESCE(current_setting('mjm.rowplots', true), '[]')::jsonb) AS rp
    JOIN fixed f
      ON f.code_key = translate(upper(btrim(rp.value)), ' -_./()', '')
),
leaving AS (
  SELECT f.nursery, f.canon,
         EXISTS (SELECT 1 FROM custom_in_range c
                  WHERE c.nursery = f.nursery AND c.range_canon = f.canon) AS by_hand,
         EXISTS (SELECT 1 FROM row_in_range w
                  WHERE w.nursery = f.nursery AND w.range_canon = f.canon) AS has_row
    FROM (SELECT DISTINCT nursery, canon FROM fixed) f
    JOIN stock_nurs sn ON sn.nursery = f.nursery
   WHERE NOT EXISTS (SELECT 1 FROM stock_in_range s
                      WHERE s.nursery = f.nursery AND s.range_canon = f.canon)
)

SELECT 1 AS sort, 'TABLES' AS section,
       'shared_plots: ' || COALESCE(current_setting('mjm.has_stock',  true), 'no')
       || ', hand-added: ' || COALESCE(current_setting('mjm.has_custom', true), 'no')
       || ', work records: ' || COALESCE(current_setting('mjm.has_records', true), 'no') AS nursery,
       (SELECT count(*)::text FROM keyed) || ' plot rows read' AS plot,
       (SELECT count(*)::text FROM jsonb_array_elements_text(
          COALESCE(current_setting('mjm.rowplots', true), '[]')::jsonb))
         || ' plots named by a saved record' AS source,
       CASE WHEN COALESCE(current_setting('mjm.has_stock', true), 'no') = 'no'
            THEN 'shared_plots is NOT on this database -- nothing below means anything'
            WHEN COALESCE(current_setting('mjm.has_custom', true), 'no') = 'no'
            THEN 'the hand-added plots table is not here, so only Seedling Stock was read'
            ELSE 'both sides read' END AS note

UNION ALL
SELECT 2, 'BY NURSERY', o.nursery,
       count(*)::text || CASE WHEN count(*) = 1 THEN ' plot' ELSE ' plots' END,
       sum(CASE WHEN o.in_range THEN 0 ELSE 1 END)::text || ' NEW',
       CASE WHEN NOT EXISTS (SELECT 1 FROM stock_nurs sn WHERE sn.nursery = o.nursery)
            THEN 'NOT narrowed -- Seedling Stock holds no plot here, so the whole range stands'
            ELSE (SELECT count(*)::text FROM leaving l WHERE l.nursery = o.nursery)
                 || ' range plots LEAVE -- see section 4' END
  FROM one o
 GROUP BY o.nursery

-- A nursery with no plot on either side is on no line above, and it is the
-- one most worth saying out loud: it keeps its whole range and is narrowed
-- by nothing.
UNION ALL
SELECT 2, 'BY NURSERY', r.code, '0 plots keyed', '0 NEW',
       'NOT narrowed -- nothing keyed at all, so the whole range stands'
  FROM ranges r
 WHERE NOT EXISTS (SELECT 1 FROM one o WHERE o.nursery = r.code)

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
SELECT 4, 'LEAVES', l.nursery, l.canon,
       CASE WHEN l.by_hand THEN 'Added by hand'
            WHEN l.has_row THEN 'A saved work record'
            ELSE 'nothing' END,
       CASE WHEN l.by_hand
            THEN 'off the pickers, kept on the schedule by its hand-added row'
            WHEN l.has_row
            THEN 'off the pickers, kept on the schedule because a saved record names it'
            ELSE 'GONE from every picker -- if the office never deleted it, add it back'
            END
  FROM leaving l

UNION ALL
SELECT 4, 'LEAVES', 'none', '-', '-',
       'nothing to report -- every range plot of a keyed nursery is in Seedling Stock'
 WHERE NOT EXISTS (SELECT 1 FROM leaving)

UNION ALL
SELECT 5, 'ON NO PICKER', COALESCE(NULLIF(x.nurs_raw, ''), 'no nursery keyed'),
       x.plot_raw, x.src,
       'its nursery is not one of the four, so NO module can offer it'
  FROM orphan x

UNION ALL
SELECT 5, 'ON NO PICKER', 'none', '-', '-',
       'nothing to report -- every plot sits under one of the four nurseries'
 WHERE NOT EXISTS (SELECT 1 FROM orphan)

UNION ALL
SELECT 6, 'SPELLING', COALESCE(NULLIF(k.nurs_raw, ''), 'no nursery keyed'),
       count(*)::text || CASE WHEN count(*) = 1 THEN ' plot' ELSE ' plots' END, '',
       CASE WHEN EXISTS (SELECT 1 FROM ranges rr WHERE rr.code = k.nurs_key)
            THEN 'reads as ' || k.nurs_key
            ELSE 'matches none of the four -- every plot under it is on no picker' END
  FROM keyed k
 GROUP BY k.nurs_raw, k.nurs_key

 ORDER BY 1, 3, 4;
