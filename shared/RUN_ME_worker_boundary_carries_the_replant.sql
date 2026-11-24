-- A WORKER BOUNDED TO A PLOT IS BOUNDED TO ITS REPLANT.
--
-- The office: 如果worker做工的那天某plot-R有在 要show出来 … 月头 没有B3-R
-- 结果15号那天B3-R出现 … 如果有做B3-R就按B3-R 如果两边都有做 B3 和 B3-R都
-- 要按. And the reason, which is the whole of why this matters: 可能B3已经
-- 没有苗了 要cull了 但是B3-R没出现 他们就会按B3 结果B3的balance其实是要被
-- cull的.
--
-- A -R plot is MADE mid-month, by a 3rd-culling transfer landing on ground
-- that was not a plot the day before. So a boundary keyed at the start of
-- the month cannot name it, and the office would have to re-key every
-- bounded worker the morning one appears. worker_key() compares on letters
-- and digits, so B3 is B3 and B3-R is B3R -- two different keys, and the
-- replant sat silently outside the boundary for ever.
--
-- WHAT THAT COST: the replant is where the seedlings now are and the parent
-- is the ground about to be culled. A worker handed only the parent ticks
-- the parent, and the morning is recorded against a balance on its way out.
--
-- THIS IS THE DATABASE HALF AND IT IS THE ONE THAT DECIDES. worker_plots()
-- is the single gate: the phone lists what it returns, and
-- worker_submit_maint() refuses a save against anything it does not return.
-- The portal says so in its own words -- a boundary enforced only by what
-- the screen draws is not a boundary -- so the screen fix alone would have
-- shown the plot and then been refused at the save, after the walk.
--
-- IT TRAVELS ONE WAY ONLY. A boundary naming B3 now also opens B3-R,
-- because the replant IS the parent own ground moved. A boundary naming
-- B3-R does NOT open B3: the office put that worker on the replant, and the
-- parent is other seedlings and somebody else morning.
--
-- Naming B3-R by hand still works and still means only B3-R, an EMPTY plot
-- list still means nobody, and a worker with NO plot list is untouched --
-- which is most of them.
--
-- Safe to run twice. Nothing is deleted and no boundary is rewritten: the
-- rule is read at query time, so the day the office narrows somebody it
-- narrows the replant with them.
--
-- WHAT TO LOOK FOR at the end: section 1 names every bounded worker and the
-- -R plots this hands them. "nothing to report" there is a real answer and
-- means no bounded worker is short of a replant today -- the rule is then
-- doing nothing visible, which is not the same as not working, because it
-- answers for the next -R plot that appears. Section 2 is the replants that
-- are still outside every boundary, which is correct wherever the office
-- never gave that worker the parent either.

-- ── The parent of a replant plot, as a worker_key, or NULL ──────────────
-- B3-R is B3, B4-R2 is B4, and a split area B4-R#A is judged by its plot.
-- No regular expression: the SQL Editor has choked on one, and split_part
-- with position and translate do the same work.
CREATE OR REPLACE FUNCTION public.worker_replant_parent(s TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  WITH n AS (
    SELECT upper(btrim(split_part(COALESCE(s, ''), '#', 1))) AS v
  ), p AS (
    SELECT v,
           position('-R' in v)            AS at,
           split_part(v, '-R', 1)         AS head,
           substr(v, position('-R' in v) + 2) AS tail
      FROM n
  )
  SELECT CASE
           WHEN at > 1
            AND btrim(head) <> ''
            AND (tail = '' OR translate(tail, '0123456789', '') = '')
           THEN public.worker_key(head)
           ELSE NULL
         END
    FROM p;
$$;

-- ── The plots this worker may record against ────────────────────────────
-- Unchanged but for the one OR: a plot whose REPLANT PARENT is on the list
-- is on the list. NULL IN (...) is never TRUE, so an ordinary plot simply
-- does not match that branch.
CREATE OR REPLACE FUNCTION public.worker_plots(p_token UUID)
RETURNS TABLE (nursery_name TEXT, plot_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w   mjmnpayroll_workers;
  b   JSONB;
  nur JSONB;
  plt JSONB;
BEGIN
  w   := public.worker_from_token(p_token);
  b   := public.worker_portal(w) -> 'boundary';
  nur := b -> 'nurseries';
  plt := b -> 'plots';

  -- Cast to the declared type rather than trusting the column to be it.
  -- plpgsql compares the querys types to the RETURNS TABLE list exactly —
  -- not "can this be converted", the same type — and raises "structure of
  -- query does not match function result type" when they differ. A column
  -- somebody once declared VARCHAR, or an INTEGER where this says NUMERIC,
  -- then breaks the whole board rather than one field. The casts cost
  -- nothing and make these functions independent of the tables spelling.
  RETURN QUERY
    SELECT p.nursery_name::TEXT, p.plot_name::TEXT
      FROM shared_plots p
     WHERE (jsonb_typeof(nur) <> 'array'
            OR public.worker_key(p.nursery_name) IN (
                 SELECT public.worker_key(x) FROM jsonb_array_elements_text(nur) AS x))
       AND (jsonb_typeof(plt) <> 'array'
            OR public.worker_key(p.plot_name) IN (
                 SELECT public.worker_key(x) FROM jsonb_array_elements_text(plt) AS x)
            OR public.worker_replant_parent(p.plot_name) IN (
                 SELECT public.worker_key(x) FROM jsonb_array_elements_text(plt) AS x))
     ORDER BY p.nursery_name, p.plot_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.worker_replant_parent(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.worker_plots(UUID)          TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

WITH bounded AS (
  SELECT w.id,
         COALESCE(NULLIF(btrim(w.full_name), ''), 'worker ' || w.id::text) AS who,
         public.worker_portal(w) -> 'boundary' -> 'plots' AS plt,
         public.worker_portal(w) -> 'boundary' -> 'nurseries' AS nur
    FROM mjmnpayroll_workers w
),
listed AS (
  SELECT id, who, plt, nur FROM bounded WHERE jsonb_typeof(plt) = 'array'
),
replants AS (
  SELECT p.nursery_name AS nur_name, p.plot_name,
         public.worker_replant_parent(p.plot_name) AS parent
    FROM shared_plots p
   WHERE public.worker_replant_parent(p.plot_name) IS NOT NULL
),
gained AS (
  SELECT l.id, l.who, r.nur_name, r.plot_name, r.parent
    FROM listed l
    JOIN replants r
      ON r.parent IN (SELECT public.worker_key(x)
                        FROM jsonb_array_elements_text(l.plt) AS x)
     AND public.worker_key(r.plot_name) NOT IN (SELECT public.worker_key(x)
                        FROM jsonb_array_elements_text(l.plt) AS x)
     AND (jsonb_typeof(l.nur) <> 'array'
          OR public.worker_key(r.nur_name) IN (SELECT public.worker_key(x)
                        FROM jsonb_array_elements_text(l.nur) AS x))
),
-- A replant nobody gains is one of TWO things, and they have different
-- fixes: no boundary names its parent at all, or one does and that worker is
-- narrowed to another nursery. The second is the office own scoping working,
-- and it is the one somebody would otherwise report as this change failing.
orphan AS (
  SELECT r.nur_name, r.plot_name, r.parent,
         EXISTS (SELECT 1
                   FROM listed l
                  WHERE r.parent IN (SELECT public.worker_key(x)
                                       FROM jsonb_array_elements_text(l.plt) AS x))
           AS named
    FROM replants r
   WHERE NOT EXISTS (SELECT 1 FROM gained g WHERE g.plot_name = r.plot_name)
),
out0 AS (
  SELECT 0 AS sec, 0 AS sub, '' AS k1, '' AS k2,
         'WHAT THIS HANDS OVER' AS c1,
         (SELECT count(*)::text FROM listed) AS c2,
         (SELECT count(*)::text FROM replants) AS c3,
         (SELECT count(*)::text FROM gained) AS c4
),
out1 AS (
  SELECT 1 AS sec, 0 AS sub, g.who AS k1, g.plot_name AS k2,
         g.who AS c1, g.nur_name AS c2, g.plot_name AS c3,
         'the boundary names ' || g.parent || ', so this replant comes with it' AS c4
    FROM gained g
),
out2 AS (
  SELECT 2 AS sec, 0 AS sub, o.plot_name AS k1, '' AS k2,
         o.nur_name AS c1, o.plot_name AS c2, o.parent AS c3,
         CASE WHEN o.named
              THEN 'a boundary names ' || o.parent
                   || ', but that worker is narrowed to another nursery'
              ELSE 'no bounded worker is given ' || o.parent || ' either'
         END AS c4
    FROM orphan o
),
hdr AS (
  SELECT 0 AS sec, -1 AS sub, '' AS k1, '' AS k2,
         '== SECTION 0 ==' AS c1, 'workers bounded to plots' AS c2,
         '-R plots in Seedling Stock' AS c3, 'worker and replant pairs gained' AS c4
  UNION ALL SELECT 1, -1, '', '', '== SECTION 1 ==  who gains what',
         'nursery', 'replant plot', 'why'
  UNION ALL SELECT 2, -1, '', '', '== SECTION 2 ==  still outside every boundary',
         'replant plot', 'its parent', 'why'
),
nil AS (
  SELECT 1 AS sec, 1 AS sub, 'zzz' AS k1, 'zzz' AS k2,
         'nothing to report' AS c1,
         'no bounded worker is short of a replant today' AS c2, '-' AS c3, '-' AS c4
   WHERE NOT EXISTS (SELECT 1 FROM gained)
  UNION ALL SELECT 2, 1, 'zzz', 'zzz', 'nothing to report',
         'every replant reaches a bounded worker', '-', '-'
   WHERE NOT EXISTS (SELECT 1 FROM orphan)
)
SELECT c1 AS "Worker", c2 AS "Nursery", c3 AS "Plot", c4 AS "Reading"
  FROM (
    SELECT * FROM hdr
    UNION ALL SELECT * FROM out0
    UNION ALL SELECT * FROM out1
    UNION ALL SELECT * FROM out2
    UNION ALL SELECT * FROM nil
  ) z
 ORDER BY sec, sub, k1, k2;
